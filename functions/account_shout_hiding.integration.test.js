import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { hideRequestedAccountShoutsPage as hide, hideDeletedAuthAccountShoutsPage as hideAfterAuth } from './account_shout_hiding.js';
import { handleAccountDeletionRequestCreated as handleEvent } from './account_deletion_event.js';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { encodeGeohash } from './create_shout.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'account-hide-index-tests') : null;
const db = app ? getFirestore(app) : null, namespaces = [], requests = [];
after(async () => {
  if (!app) return;
  for (const namespace of namespaces) await db.recursiveDelete(db.collection('feedIndexLab').doc(namespace));
  for (const ref of requests) await ref.delete();
  await db.terminate(); await deleteApp(app);
});
async function fixture() {
  const uid = randomUUID(), namespace = `account-${randomUUID().slice(0, 8)}`; namespaces.push(namespace);
  const location = { latitude: 50.08, longitude: 14.44 };
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r-${i}`, authorId: i < 3 ? uid : 'another',
    status: 'active', location, geohash: encodeGeohash(location.latitude, location.longitude),
    createdAt: 0, expiresAt: 10000, likesCount: 0, dislikesCount: 0, categories: ['Dotaz'] }));
  const lab = createLabBlockIndex(db, { namespace }); await lab.seed(rows);
  const requestRef = db.doc(`accountDeletionRequests/${uid}`); requests.push(requestRef);
  await requestRef.set({ userId: uid, status: 'pending' });
  const scoped = { projectId: db.projectId, runTransaction: db.runTransaction.bind(db), doc: db.doc.bind(db),
    collection: name => name === 'shouts' ? lab.base.collection('source') : db.collection(name) };
  return { uid, lab, db: scoped, requestRef, options: { indexWriter: lab } };
}
test('account hiding drains bounded pages, preserves source and foreign content, and retries without new history', { skip: !enabled }, async () => {
  const f = await fixture();
  const original = (await f.lab.base.collection('source').doc('r-0').get()).data();
  const first = await hide(f.db, f.uid, { ...f.options, pageSize: 2 });
  assert.equal(first.hidden, 2); assert.equal(first.needsAnotherPage, true);
  const last = await hide(f.db, f.uid, { ...f.options, pageSize: 2 });
  assert.equal(last.hidden, 1); assert.equal(last.needsAnotherPage, false);
  assert.deepEqual((await f.lab.base.collection('source').doc('r-0').get()).data(), { ...original, status: 'deleted' });
  assert.equal((await f.lab.audit()).activeMetadata, 2);
  const archives = (await f.lab.base.collection('retiredRoots').get()).size;
  assert.equal((await hide(f.db, f.uid, f.options)).hidden, 0);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, archives);
});
test('revoked or mismatched deletion request fences every source transaction', { skip: !enabled }, async () => {
  for (const revoke of ['missing', 'cancelled', 'other-user']) {
    const f = await fixture();
    await assert.rejects(hide(f.db, f.uid, { ...f.options, async beforeTransaction() {
      if (revoke === 'missing') await f.requestRef.delete();
      else await f.requestRef.update(revoke === 'cancelled' ? { status: 'cancelled' } : { userId: 'other' });
    } }), /account-deletion-request-not-pending/);
    assert.equal((await f.lab.audit()).activeMetadata, 5);
  }
});
test('partial worker failure can restart without losing updates within the same index cell', { skip: !enabled }, async () => {
  const f = await fixture(); let calls = 0;
  await assert.rejects(hide(f.db, f.uid, { ...f.options, beforeTransaction() {
    if (++calls === 2) throw new Error('interrupted-worker');
  } }), /interrupted-worker/);
  assert.equal((await f.lab.audit()).activeMetadata, 4);
  assert.equal((await hide(f.db, f.uid, f.options)).hidden, 2);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 3);
});
test('invalid worker input is rejected before database access', async () => {
  for (const [uid, options] of [['../victim', {}], ['actor', { pageSize: 51 }], ['actor', { pageSize: 0 }]]) {
    await assert.rejects(hide({}, uid, options), /invalid-account-hide-page/);
  }
});

test('recreated pending request fences the old page and a fresh run can continue', { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(hide(f.db, f.uid, { ...f.options, async beforeTransaction() {
    await f.requestRef.delete();
    await f.requestRef.set({ userId: f.uid, status: 'pending' });
  } }), /account-deletion-request-replaced/);
  assert.equal((await f.lab.audit()).activeMetadata, 5);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 0);
  assert.equal((await hide(f.db, f.uid, f.options)).hidden, 3);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
});

test('updates to the same pending request do not invalidate the page', { skip: !enabled }, async () => {
  const f = await fixture();
  const result = await hide(f.db, f.uid, { ...f.options, async beforeTransaction() {
    await f.requestRef.update({ workerNote: 'same-request' });
  } });
  assert.equal(result.hidden, 3);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
});

test('index apply failure rolls back its source and history while keeping prior completed work', { skip: !enabled }, async () => {
  const f = await fixture(); let planned = 0;
  const indexWriter = { async prepare(...args) {
    const plan = await f.lab.prepare(...args), fail = ++planned === 2;
    return { apply() { plan.apply(); if (fail) throw new Error('injected-account-index-failure'); } };
  } };
  await assert.rejects(hide(f.db, f.uid, { indexWriter }), /injected-account-index-failure/);
  const sources = (await f.lab.base.collection('source').get()).docs.map(doc => doc.data());
  assert.equal(sources.filter(row => row.status === 'deleted').length, 1);
  assert.equal((await f.lab.audit()).activeMetadata, 4);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 1);
  assert.equal((await hide(f.db, f.uid, f.options)).hidden, 2);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 3);
});

const authNotFound = () => { throw Object.assign(new Error('no-such-auth-user'), { code: 'auth/user-not-found' }); };

test('Auth gate waits for an existing user and propagates verification failures without hiding', { skip: !enabled }, async () => {
  const f = await fixture();
  assert.deepEqual(await hideAfterAuth(f.db, { getUser: async uid => ({ uid }) }, f.uid, f.options),
    { state: 'waiting-for-auth-deletion' });
  const failure = Object.assign(new Error('Auth unavailable'), { code: 'auth/internal-error' });
  await assert.rejects(hideAfterAuth(f.db, { getUser: async () => { throw failure; } }, f.uid, f.options), error => error === failure);
  assert.equal((await f.lab.audit()).activeMetadata, 5);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 0);
});

test('confirmed missing Auth user allows bounded hiding and replay after completion', { skip: !enabled }, async () => {
  const f = await fixture(), auth = { getUser: authNotFound };
  const first = await hideAfterAuth(f.db, auth, f.uid, { ...f.options, pageSize: 2 });
  assert.equal(first.state, 'hiding'); assert.equal(first.hidden, 2);
  const last = await hideAfterAuth(f.db, auth, f.uid, { ...f.options, pageSize: 2 });
  assert.equal(last.state, 'shouts-hidden'); assert.equal(last.hidden, 1);
  const replay = await hideAfterAuth(f.db, auth, f.uid, f.options);
  assert.equal(replay.state, 'shouts-hidden'); assert.equal(replay.hidden, 0);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 3);
});

test('request cancellation or recreation while Auth is checked prevents hiding', { skip: !enabled }, async () => {
  for (const replace of [false, true]) {
    const f = await fixture();
    const auth = { async getUser(uid) {
      assert.equal(uid, f.uid);
      await f.requestRef.delete();
      if (replace) await f.requestRef.set({ userId: uid, status: 'pending' });
      authNotFound();
    } };
    await assert.rejects(hideAfterAuth(f.db, auth, f.uid, f.options),
      replace ? /account-deletion-request-replaced/ : /account-deletion-request-not-pending/);
    assert.equal((await f.lab.audit()).activeMetadata, 5);
    assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 0);
  }
});

test('Auth gate rejects missing requests and invalid input before calling Auth', { skip: !enabled }, async () => {
  const f = await fixture(), auth = { getUser() { assert.fail('Auth must not be called'); } };
  await f.requestRef.delete();
  await assert.rejects(hideAfterAuth(f.db, auth, f.uid, f.options), /account-deletion-request-not-pending/);
  await assert.rejects(hideAfterAuth({}, auth, '../victim'), /invalid-account-hide-page/);
});

test('continuation keeps the original request identity across page calls', { skip: !enabled }, async () => {
  const f = await fixture(), expectedRequestCreateTime = (await f.requestRef.get()).createTime;
  const options = { ...f.options, pageSize: 1, expectedRequestCreateTime };
  const first = await hideAfterAuth(f.db, { getUser: authNotFound }, f.uid, options);
  assert.equal(first.hidden, 1);
  const second = await hideAfterAuth(f.db, { getUser: authNotFound }, f.uid, options);
  assert.equal(second.hidden, 1);
  await f.requestRef.delete();
  await f.requestRef.set({ userId: f.uid, status: 'pending' });
  await assert.rejects(hideAfterAuth(f.db, { getUser() { assert.fail('stale worker must stop before Auth'); } },
    f.uid, options), /account-deletion-request-replaced/);
  assert.equal((await f.lab.audit()).activeMetadata, 3);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 2);
  assert.equal((await hideAfterAuth(f.db, { getUser: authNotFound }, f.uid, f.options)).hidden, 1);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
});

test('concurrent page workers hide each source once and can drain the remaining page', { skip: !enabled }, async () => {
  const f = await fixture(), expectedRequestCreateTime = (await f.requestRef.get()).createTime;
  const options = { ...f.options, pageSize: 2, expectedRequestCreateTime }, auth = { getUser: authNotFound };
  const results = await Promise.all([
    hideAfterAuth(f.db, auth, f.uid, options), hideAfterAuth(f.db, auth, f.uid, options),
  ]);
  const hidden = results.reduce((sum, result) => sum + result.hidden, 0);
  assert(hidden >= 2 && hidden <= 3);
  assert.equal((await f.lab.audit()).activeMetadata, 5 - hidden);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, hidden);
  const remainder = await hideAfterAuth(f.db, auth, f.uid, { ...f.options, expectedRequestCreateTime });
  assert.equal(hidden + remainder.hidden, 3);
  assert.equal(remainder.state, 'shouts-hidden');
  assert.equal((await f.lab.audit()).activeMetadata, 2);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 3);
});

test('creation event waits for Auth deletion, drains pages, and handles redelivery without new history', { skip: !enabled }, async () => {
  const f = await fixture(), event = { params: { userId: f.uid }, data: await f.requestRef.get() };
  assert.deepEqual(await handleEvent(event, f.db, { getUser: async uid => ({ uid }) }, f.options),
    { state: 'retry-required', reason: 'auth-user-present' });
  assert.equal((await f.lab.audit()).activeMetadata, 5);
  const auth = { getUser: authNotFound }, options = { ...f.options, pageSize: 2 };
  const first = await handleEvent(event, f.db, auth, options);
  assert.equal(first.state, 'retry-required'); assert.equal(first.reason, 'more-shouts'); assert.equal(first.hidden, 2);
  const last = await handleEvent(event, f.db, auth, options);
  assert.equal(last.state, 'shouts-hidden'); assert.equal(last.hidden, 1);
  assert.equal((await handleEvent(event, f.db, auth, options)).hidden, 0);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 3);
});

test('cancelled and replaced creation events are ignored before Auth access', { skip: !enabled }, async () => {
  for (const replace of [false, true]) {
    const f = await fixture(), event = { params: { userId: f.uid }, data: await f.requestRef.get() };
    await f.requestRef.delete();
    if (replace) await f.requestRef.set({ userId: f.uid, status: 'pending' });
    assert.deepEqual(await handleEvent(event, f.db, { getUser() { assert.fail('stale event must not access Auth'); } }, f.options),
      { state: 'ignored', reason: replace ? 'replaced' : 'not-pending' });
    assert.equal((await f.lab.audit()).activeMetadata, 5);
    assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 0);
  }
});

test('event adapter propagates Auth and index failures instead of acknowledging success', { skip: !enabled }, async () => {
  const f = await fixture(), event = { params: { userId: f.uid }, data: await f.requestRef.get() };
  const failure = Object.assign(new Error('unavailable'), { code: 'auth/internal-error' });
  await assert.rejects(handleEvent(event, f.db, { getUser: async () => { throw failure; } }, f.options), error => error === failure);
  // A plain index error with a similar message must not be mistaken for a stale request.
  const indexWriter = { prepare() { throw new Error('account-deletion-request-replaced'); } };
  await assert.rejects(handleEvent(event, f.db, { getUser: authNotFound }, { indexWriter }), /account-deletion-request-replaced/);
  assert.equal((await f.lab.audit()).activeMetadata, 5);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 0);
});

test('event adapter rejects mismatched paths, projects and source payloads', { skip: !enabled }, async () => {
  const f = await fixture(), snapshot = await f.requestRef.get();
  const auth = { getUser() { assert.fail('invalid event must not access Auth'); } };
  for (const event of [
    { params: { userId: 'different' }, data: snapshot },
    { params: { userId: f.uid }, data: { exists: true, ref: snapshot.ref, createTime: snapshot.createTime, data: () => ({ userId: f.uid, status: 'done' }) } },
  ]) await assert.rejects(handleEvent(event, f.db, auth), /invalid-account-deletion-event/);
  await assert.rejects(handleEvent({ params: { userId: f.uid }, data: snapshot }, { projectId: 'other-project' }, auth), /invalid-account-deletion-event/);
  assert.equal((await f.lab.audit()).activeMetadata, 5);
});

test('invalid event envelope is rejected without database access', async () => {
  for (const event of [null, {}, { params: { userId: '../victim' } }]) {
    await assert.rejects(handleEvent(event, {}, {}), /invalid-account-deletion-event/);
  }
});
