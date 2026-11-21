import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { planNewsPilot, publishNewsFixture, adoptNewsClientFixture, cleanupNewsPilot, prepareNewsControlChange } from './feed_news_pilot.js';
import { createFeedRuntime } from './feed_runtime.js';
import { encodeGeohash } from './geohash.js';
import { syncReadBatchOperation } from './read_sync.js';
import { readContentHash } from './read_sync_blocks.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'news-pilot') : null, db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t) {
  const nonce = randomUUID().slice(0, 8), control = db.doc('feedIndexControl/current'), marker = db.doc('feedIndexGenerations/feed-v3');
  const original = db.doc(`shouts/news-original-${nonce}`), pending = db.doc(`accountDeletionRequests/news-original-${nonce}`);
  const actors = ['Bright_Otter_182', 'TestBusiness'].map((nickname, i) => ({ nickname, uid: `news-pilot-${nonce}-${i}` }));
  const roots = [control, marker, original, pending, db.doc('feedNewsControl/current'), ...actors.map(a => db.doc(`users/${a.uid}`))];
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  await control.create({ schemaVersion: 2, revision: 11, mode: 'active', readGenerationId: 'feed-v3', writeGenerationIds: ['feed-v3'], cardReadGenerationId: 'feed-v3', cardWriteGenerationIds: ['feed-v3'] });
  await marker.create({ schemaVersion: 1, v: 2, cardReady: true, cardProjection: 1, accountRetention: true, readIdentity: 1, erasureRevision: 0, prunedThrough: -1 });
  await original.create({ untouched: true, authorId: actors[0].uid, title: 'Other', text: 'History', status: 'active', expiresAt: Timestamp.fromMillis(Date.now() + 86400000) }); await pending.create({ untouched: true });
  for (const actor of actors) { await db.doc(`users/${actor.uid}`).create({ nickname: actor.nickname }); await db.doc(`users/${actor.uid}/legal/acceptance_2026_07_25`).create({}); }
  const plan = await planNewsPilot(db, actors, `mvp-b4b-${nonce}`, { expectedSources: 1 });
  await db.runTransaction(async tx => { (await prepareNewsControlChange(tx, db, { v: 1, revision: 1, mode: 'active', generation: 'feed-v3', incarnation: plan.incarnation })).apply(); });
  roots.push(...plan.slots.filter(s => s.id).map(s => db.doc(`shouts/${s.id}`)));
  return { plan, original, pending, roots, actors };
}
test('three slots enforce real-client B, idempotent A/C and scoped cleanup with original read history preserved', { skip: !enabled }, async t => {
  const f = await fixture(t), createdAt = Date.now();
  assert.equal((await publishNewsFixture(db, f.plan, 'A', createdAt)).created, true);
  assert.equal((await publishNewsFixture(db, f.plan, 'A', createdAt)).created, false);
  await assert.rejects(publishNewsFixture(db, f.plan, 'B', createdAt), /real-client/);
  await publishNewsFixture(db, f.plan, 'C', createdAt);
  const b = f.plan.slots[1], client = db.doc(`shouts/client-${randomUUID()}`); f.roots.push(client);
  const body = { title: b.title, text: b.text, authorId: b.authorId, authorNickname: 'TestBusiness', createdAt: Timestamp.fromMillis(createdAt),
    expiresAt: Timestamp.fromMillis(createdAt + b.duration), status: 'active', categories: ['Dotaz'], likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0,
    location: new GeoPoint(50.53, 14.13), geohash: encodeGeohash(50.53, 14.13) };
  const runtime = createFeedRuntime(db, { getUser() {} }, { newsRuntimeEnabled: true });
  await runtime.database.runTransaction(async tx => { (await runtime.indexWriter.prepare(tx, client.id, null, body, { publication: true })).apply(); tx.create(client, body); });
  const bindings = { B: await adoptNewsClientFixture(db, f.plan) };
  for (const label of ['A', 'C']) { const slot = f.plan.slots.find(s => s.label === label); bindings[label] = { id: slot.id, createdAt, expiresAt: createdAt + slot.duration }; }
  const uid = f.actors[0].uid;
  const input = { auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'test' }, data: { expectedUserId: uid, items: [
    { shoutId: bindings.A.id, contentHash: readContentHash(f.plan.slots[0].title, f.plan.slots[0].text), expiresAt: bindings.A.expiresAt },
    { shoutId: f.original.id, contentHash: readContentHash('Other', 'History'), expiresAt: (await f.original.get()).get('expiresAt').toMillis() },
  ] } };
  assert((await syncReadBatchOperation(input, db)).items.every(item => item.status === 'accepted'));
  const result = await cleanupNewsPilot(db, f.plan, bindings); assert.equal(result.removed, 3); assert.equal(result.readKeys, 1);
  assert.equal((await cleanupNewsPilot(db, f.plan, bindings)).removed, 0);
  const remaining = (await db.collection(`users/${uid}/readBuckets`).get()).docs.flatMap(d => Object.values(d.get('entries') ?? {}));
  assert(remaining.some(r => r.shoutId === f.original.id)); assert(!remaining.some(r => r.shoutId === bindings.A.id));
  assert.equal((await f.original.get()).get('untouched'), true); assert.equal((await f.pending.get()).get('untouched'), true);
  assert.equal((await db.doc('feedIndexGenerations/feed-v3/publicationHeads/_control').get()).exists, true);
});
test('fixture rejects changed originals, duplicate client adoption and foreign descendants without deleting source', { skip: !enabled }, async t => {
  const f = await fixture(t), createdAt = Date.now(); await publishNewsFixture(db, f.plan, 'A', createdAt);
  await assert.rejects(adoptNewsClientFixture(db, f.plan), /one-client-publication/);
  for (const suffix of ['one', 'two']) {
    const ref = db.doc(`shouts/duplicate-client-${suffix}`), b = f.plan.slots[1]; f.roots.push(ref);
    await ref.create({ title: b.title, text: b.text, authorId: b.authorId });
  }
  await assert.rejects(adoptNewsClientFixture(db, f.plan), /one-client-publication/);
  const slot = f.plan.slots[0], child = db.doc(`shouts/${slot.id}/comments/foreign`); await child.create({ authorId: 'foreign' });
  const bindings = { A: { id: slot.id, expiresAt: createdAt + slot.duration } };
  await assert.rejects(cleanupNewsPilot(db, f.plan, bindings), /unexpected-conversation/); assert((await child.parent.parent.get()).exists);
  await f.pending.update({ untouched: false }); await assert.rejects(publishNewsFixture(db, f.plan, 'C', createdAt), /original-drift/);
  assert.equal((await db.doc(`shouts/${f.plan.slots[2].id}`).get()).exists, false);
});
