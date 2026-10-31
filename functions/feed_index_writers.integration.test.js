import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { createShoutOperation as create } from './create_shout.js';
import { toggleShoutReactionOperation as react } from './toggle_shout_reaction.js';
import { deleteShoutOperation as remove } from './delete_shout.js';
import { operationTestKey } from './test_helpers.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'index-writer-tests') : null;
const db = app ? getFirestore(app) : null, namespaces = [];
const now = new Date('2026-10-31T12:00:00Z'), point = { latitude: 50.08, longitude: 14.44 };
const clock = (offset = 0) => () => new Date(now.getTime() + offset);
const key = label => operationTestKey(label, now);
after(async () => {
  if (!app) return;
  for (const namespace of namespaces) await db.recursiveDelete(db.collection('feedIndexLab').doc(namespace));
  await db.terminate(); await deleteApp(app);
});
async function fixture() {
  const namespace = `writers-${randomUUID().slice(0, 8)}`; namespaces.push(namespace);
  const lab = createLabBlockIndex(db, { namespace }); await lab.seed([]);
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set({ nickname: 'Writer', avatarId: 'avatar_01', avatarBackgroundStart: 1,
    avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  // Only target Shouts are redirected into this fixture's source collection.
  // Real operation/auth/rate/receipt code and the real transaction API are used.
  const scopedDb = { runTransaction: db.runTransaction.bind(db), doc(path) {
    return path.startsWith('shouts/') ? lab.base.collection('source').doc(path.slice(7)) : db.doc(path);
  } };
  const request = data => ({ auth: { uid, token: { email: 'writer@example.test', email_verified: true } },
    app: { appId: 'web' }, data: { expectedUserId: uid, ...data } });
  const publication = request({ title: 'Full source title', text: 'Body must survive index changes',
    categories: ['Dotaz'], durationMinutes: 120, location: point, idempotencyKey: key('create') });
  const writers = { indexWriter: lab };
  return { uid, lab, db: scopedDb, request, publication, writers };
}
async function page(lab, offset = 0) {
  const view = await lab.open({ point, radiusKm: 20, now: now.getTime() + offset });
  return (await view.page(view.first)).rows;
}
const failingWriter = lab => ({ async prepare(...args) {
  const plan = await lab.prepare(...args);
  return { apply() { plan.apply(); throw new Error('injected-index-failure'); } };
} });

test('real publication, reaction and deletion keep index, full source and receipts atomic', { skip: !enabled }, async () => {
  const f = await fixture();
  const [created, replay] = await Promise.all([create(f.publication, f.db, clock(), f.writers), create(f.publication, f.db, clock(), f.writers)]);
  assert.deepEqual(created, replay);
  assert.equal((await page(f.lab)).length, 1); assert.equal((await f.lab.audit()).activeMetadata, 1);
  const source = f.lab.base.collection('source').doc(created.shoutId);
  const original = (await source.get()).data();
  const reaction = f.request({ shoutId: source.id, button: 'like', idempotencyKey: key('reaction') });
  await Promise.all([react(reaction, f.db, clock(2000), f.writers), react(reaction, f.db, clock(2000), f.writers)]);
  assert.equal((await page(f.lab, 2000))[0].likesCount, 1);
  assert.deepEqual((await source.get()).data(), { ...original, likesCount: 1 });
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 1);
  const deletion = f.request({ shoutId: source.id, idempotencyKey: key('delete') });
  await Promise.all([remove(deletion, f.db, clock(4000), f.writers), remove(deletion, f.db, clock(4000), f.writers)]);
  assert.equal((await page(f.lab, 4000)).length, 0);
  assert.deepEqual((await source.get()).data(), { ...original, likesCount: 1, status: 'deleted' });
  assert.equal((await f.lab.audit()).activeMetadata, 0);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 2);
  await react(reaction, f.db, clock(6000), f.writers); // Historical replay cannot reinsert.
  await remove(deletion, f.db, clock(6000), f.writers);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 2);
});

test('index failures roll back creation and reaction including receipts, rates and notifications', { skip: !enabled }, async () => {
  const f = await fixture(), failure = { indexWriter: failingWriter(f.lab) };
  await assert.rejects(create(f.publication, f.db, clock(), failure), /injected-index-failure/);
  assert.equal((await f.lab.base.collection('source').get()).size, 0);
  assert.equal((await f.lab.inspect()).retainedNodes, 0);
  assert.equal((await db.collection('serverOperations').where('userId', '==', f.uid).get()).size, 0);
  assert.equal((await db.doc(`rateLimits/${f.uid}/actions/shout`).get()).exists, false);
  const { shoutId } = await create(f.publication, f.db, clock(), f.writers);
  const reaction = f.request({ shoutId, button: 'like', idempotencyKey: key('reaction') });
  await assert.rejects(react(reaction, f.db, clock(2000), failure), /injected-index-failure/);
  assert.equal((await page(f.lab, 2000))[0].likesCount, 0);
  assert.equal((await f.lab.base.collection('source').doc(shoutId).get()).data().likesCount, 0);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 0);
  assert.equal((await db.doc(`rateLimits/${f.uid}/actions/interaction`).get()).exists, false);
  assert.equal((await db.collection('serverOperations').where('userId', '==', f.uid).get()).size, 1);
  await assert.rejects(remove(f.request({ shoutId, idempotencyKey: key('delete') }), f.db, clock(2000), failure), /injected-index-failure/);
  assert.equal((await f.lab.base.collection('source').doc(shoutId).get()).data().status, 'active');
  assert.equal((await f.lab.audit()).activeMetadata, 1);
});

test('expired pruned source accepts real reactions without reentering the active index', { skip: !enabled }, async () => {
  const f = await fixture();
  const { shoutId } = await create(f.publication, f.db, clock(), f.writers);
  const source = f.lab.base.collection('source').doc(shoutId), before = (await source.get()).data();
  const cutoff = before.expiresAt.toMillis(), cell = before.geohash.slice(0, 4);
  const prune = await f.lab.beginExpiryPrune(cell, cutoff);
  let result; do { result = await prune.step(); } while (result.state !== 'done');
  assert.equal(result.metrics.sourceWrites, 0);
  await react(f.request({ shoutId, button: 'like', idempotencyKey: key('expired-reaction') }),
    f.db, () => Timestamp.fromMillis(cutoff + 1).toDate(), f.writers);
  assert.equal((await source.get()).data().likesCount, 1);
  assert.equal((await f.lab.audit()).activeMetadata, 0);
  assert.equal((await f.lab.base.collection('cells').get()).size, 0);
});
