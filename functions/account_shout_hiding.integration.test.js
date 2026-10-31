import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { hideRequestedAccountShoutsPage as hide } from './account_shout_hiding.js';
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
  const scoped = { runTransaction: db.runTransaction.bind(db), doc: db.doc.bind(db),
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
