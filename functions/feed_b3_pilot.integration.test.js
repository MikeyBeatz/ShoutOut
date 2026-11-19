import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { planB3Pilot, seedB3Pilot, seedB3PilotReads, cleanupB3Pilot, verifyB3Pilot } from './feed_b3_pilot.js';
import { createFeedRuntime, createFeedGenerationStore } from './feed_runtime.js';
import { encodeGeohash } from './geohash.js';
import { syncReadBatchOperation } from './read_sync.js';
import { readContentHash, readKey, planReadBlocks, readRetentionMillis } from './read_sync_blocks.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'b3-pilot-tests') : null, db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t) {
  const nonce = randomUUID().slice(0, 8), actors = ['Bright_Otter_182', 'TestBusiness'].map((nickname, i) => ({ nickname, uid: `pilot-${nonce}-${i}` }));
  const control = db.doc('feedIndexControl/current'), bases = ['feed-v1', 'feed-v2'].map(id => db.doc(`feedIndexGenerations/${id}`));
  const roots = [control, ...bases, ...actors.map(a => db.doc(`users/${a.uid}`))];
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  await control.create({ schemaVersion: 1, revision: 3, mode: 'active', readGenerationId: 'feed-v2', writeGenerationIds: ['feed-v1', 'feed-v2'] });
  for (const [i, base] of bases.entries()) await base.create({ schemaVersion: 1, v: 1, accountRetention: true, erasureRevision: 0,
    prunedThrough: -1, ...(i ? { readIdentity: 1 } : {}) });
  for (const actor of actors) {
    await db.doc(`users/${actor.uid}`).create({ nickname: actor.nickname });
    await db.doc(`users/${actor.uid}/legal/acceptance_2026_07_25`).create({});
  }
  const originalRef = db.doc(`shouts/original-${nonce}`); roots.push(originalRef);
  const point = { latitude: 49, longitude: 14 }, now = Date.now();
  const original = { authorId: actors[0].uid, authorNickname: 'Original', title: 'Preserve', text: 'Original content',
    location: point, geohash: encodeGeohash(point.latitude, point.longitude), categories: ['Dotaz'], status: 'active',
    createdAt: Timestamp.fromMillis(now - 1000), expiresAt: Timestamp.fromMillis(now + 86400000), likesCount: 0, dislikesCount: 0 };
  const runtime = createFeedRuntime(db, { getUser() { throw Error('Auth forbidden'); } }, { compatibleGenerations: true });
  await runtime.database.runTransaction(async tx => {
    const plan = await runtime.indexWriter.prepare(tx, originalRef.id, null, original); plan.apply(); tx.create(originalRef, original);
  });
  const plan = await planB3Pilot(db, actors, { runId: `mvp-b3-${nonce}`, baselineCount: 1, createdAt: now });
  roots.push(...plan.rows.map(row => db.doc(`shouts/${row.id}`)));
  return { plan, actors, original, originalRef, control, roots };
}
test('pilot creates 120 exactly once in both generations, seeds reads and cleans only its own data', { skip: !enabled }, async t => {
  const f = await fixture(t), original = await f.originalRef.get();
  const request = { auth: { uid: f.actors[0].uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { expectedUserId: f.actors[0].uid, items: [{ shoutId: f.originalRef.id, contentHash: readContentHash(f.original.title, f.original.text), expiresAt: f.original.expiresAt.toMillis() }] } };
  await syncReadBatchOperation(request, db);
  const foreign = Array.from({ length: 150 }, (_, i) => ({ shoutId: `foreign-${i}`, contentHash: readContentHash('History', `${i}`),
    expiresAt: f.plan.expiresAt, retainUntil: f.plan.expiresAt + readRetentionMillis, confirmedAt: Date.now() - 1 }));
  await db.runTransaction(async tx => {
    const meta = db.doc(`users/${f.actors[0].uid}/readState/current`), revision = (await tx.get(meta)).get('revision') + 1;
    const planned = await planReadBlocks(foreign, async id => (await tx.get(db.doc(`users/${f.actors[0].uid}/readBuckets/${id}`))).data(), { revision });
    for (const [id, node] of planned.writes) tx.set(db.doc(`users/${f.actors[0].uid}/readBuckets/${id}`), node);
    tx.set(meta, { v: 1, revision });
  });
  assert.equal((await seedB3Pilot(db, f.plan)).created, 120); assert.equal((await seedB3Pilot(db, f.plan)).created, 0);
  await seedB3PilotReads(db, f.plan); await seedB3PilotReads(db, f.plan);
  const verified = await verifyB3Pilot(db, f.plan, randomBytes(32)); assert.equal(verified.results.length, 4);
  const beforeReads = await db.collection(`users/${f.actors[0].uid}/readBuckets`).get();
  const originalKey = readKey(f.originalRef.id, request.data.items[0].contentHash);
  const originalRecord = beforeReads.docs.map(doc => doc.get('entries')?.[originalKey]).find(Boolean); assert(originalRecord);
  const sample = f.plan.rows[80]; await db.doc(`shouts/${sample.id}/saves/${f.actors[0].uid}`).create({ userId: f.actors[0].uid, createdAt: Timestamp.now() });
  await db.doc(`shouts/${sample.id}/reactions/${f.actors[1].uid}`).create({ userId: f.actors[1].uid, type: 'like' });
  const receipt = db.doc(`serverOperations/pilot-${randomUUID()}`); f.roots.push(receipt);
  await receipt.create({ shoutId: sample.id, userId: f.actors[1].uid });
  const result = await cleanupB3Pilot(db, f.plan); assert.equal(result.fixtureSourcesRemoved, 120); assert.equal(result.fixtureReadKeysRemoved, 90);
  assert.equal((await cleanupB3Pilot(db, f.plan)).fixtureSourcesRemoved, 0);
  assert((await f.originalRef.get()).updateTime.isEqual(original.updateTime));
  const afterReads = await db.collection(`users/${f.actors[0].uid}/readBuckets`).get();
  assert.deepEqual(afterReads.docs.map(doc => doc.get('entries')?.[originalKey]).find(Boolean), originalRecord);
  const remaining = afterReads.docs.flatMap(doc => Object.values(doc.get('entries') ?? {}));
  for (const row of foreign) assert.deepEqual(remaining.find(value => value.shoutId === row.shoutId), row);
  assert.equal((await receipt.get()).exists, false);
  for (const [i, generation] of ['feed-v1', 'feed-v2'].entries()) {
    const store = createFeedGenerationStore(db, generation, { contentIdentity: i === 1 });
    const view = await store.open({ uid: f.actors[0].uid, point: f.original.location, radiusKm: 5, now: Date.now() });
    assert.deepEqual((await view.page(view.first)).rows.map(row => row.id), [f.originalRef.id]);
  }
});
test('pilot refuses wrong project, tampering, a changed baseline and foreign descendants', { skip: !enabled }, async t => {
  await assert.rejects(planB3Pilot({ projectId: 'shoutout-production-a1b34' }, []), /dev-only/);
  const f = await fixture(t);
  await assert.rejects(seedB3Pilot(db, { ...f.plan, expiresAt: f.plan.expiresAt + 1 }));
  await f.originalRef.update({ text: 'Changed by another user' });
  await assert.rejects(seedB3Pilot(db, f.plan), /unrelated-source-changed/);
  // A separate fixture is used rather than accepting a new baseline silently.
});
test('pilot cleanup preserves an unexpected foreign child and stops before removing that source', { skip: !enabled }, async t => {
  const f = await fixture(t); await seedB3Pilot(db, f.plan);
  const row = f.plan.rows[0], child = db.doc(`shouts/${row.id}/saves/foreign-user`);
  await child.create({ userId: 'foreign-user' });
  await assert.rejects(cleanupB3Pilot(db, f.plan), /foreign-pilot-descendant/);
  assert.equal((await child.get()).exists, true); assert.equal((await db.doc(`shouts/${row.id}`).get()).exists, true);
});
