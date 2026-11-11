import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import console from 'node:console';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { syncReadBatchOperation as upload, getReadStatePageOperation as download } from './read_sync.js';
import { readContentHash, readRetentionMillis } from './read_sync_blocks.js';
import { cleanupAccountPrivatePage } from './account_private_cleanup.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'read-sync-tests') : null;
const db = app ? getFirestore(app) : null, roots = [], key = new Uint8Array(32).fill(7);
after(async () => { if (db) { for (const ref of roots) await db.recursiveDelete(ref); await db.terminate(); await deleteApp(app); } });
async function fixture(count = 2) {
  const uid = randomUUID(), user = db.doc(`users/${uid}`), now = Date.now(), expiresAt = now + 86400000;
  const requestRef = db.doc(`accountDeletionRequests/${uid}`); roots.push(user, requestRef);
  await user.set({ nickname: 'Fixture' }); await user.collection('legal').doc('acceptance_2026_07_25').set({});
  const items = [], batch = db.batch();
  for (let i = 0; i < count; i++) {
    const ref = db.collection('shouts').doc(); roots.push(ref);
    const title = `Text ${i}`, text = 'Příspěvek\ncelý';
    batch.set(ref, { authorId: uid, title, text, expiresAt: Timestamp.fromMillis(expiresAt), status: 'active' });
    items.push({ shoutId: ref.id, contentHash: readContentHash(title, text), expiresAt });
  }
  await batch.commit();
  const request = data => ({ auth: { uid, token: { email_verified: true, email: 'fixture@example.test' } },
    app: { appId: 'fixture' }, data: { expectedUserId: uid, ...data } });
  return { uid, user, requestRef, items, request, now };
}
test('read sync merges concurrent devices and replay has zero writes or retention extension', { skip: !enabled }, async () => {
  const f = await fixture(), metrics = [];
  const opts = { onMetrics: m => metrics.push(m) };
  await Promise.all(f.items.map(row => upload(f.request({ items: [row] }), db, opts)));
  const meta = await f.user.collection('readState').doc('current').get();
  assert.equal(meta.get('revision'), 2);
  const before = await f.user.collection('readBuckets').get();
  const result = await upload(f.request({ items: f.items }), db, opts);
  assert(result.items.every(r => r.status === 'accepted')); assert.equal(result.revision, 2);
  assert.equal(metrics.at(-1).writes, 0);
  const after = await f.user.collection('readBuckets').get();
  assert(before.docs[0].updateTime.isEqual(after.docs[0].updateTime));
  const page = await download(f.request({}), db, { key }); assert.equal(page.items.length, 2);
  assert(page.items.every(r => r.retainUntil === r.expiresAt + readRetentionMillis));
  assert.equal(page.next, null);
  const unchanged = await download(f.request({ knownRevision: page.revision }), db, { key });
  assert.equal(unchanged.unchanged, true); assert.deepEqual(unchanged.items, []);
  console.log('READ_SYNC_REPLAY_OPERATIONS ' + JSON.stringify(metrics.at(-1)));
});
test('split snapshot includes empty non-final pages and stays pinned across another device upload', { skip: !enabled }, async () => {
  const f = await fixture(132);
  for (let i = 0; i < 129; i += 32) await upload(f.request({ items: f.items.slice(i, Math.min(129, i + 32)) }), db);
  const first = await download(f.request({}), db, { key, pageSize: 1 });
  assert.equal(first.items.length, 0); assert(first.next);
  await upload(f.request({ items: f.items.slice(129) }), db);
  const ids = [], seen = new Set(); let cursor = first.next;
  while (cursor) {
    assert(!seen.has(cursor)); seen.add(cursor);
    const page = await download(f.request({ cursor }), db, { key, pageSize: 1 });
    assert.equal(page.revision, first.revision); ids.push(...page.items.map(r => r.shoutId)); cursor = page.next;
  }
  assert.equal(ids.length, 129); assert.equal(new Set(ids).size, 129);
  const delta = await download(f.request({ knownRevision: first.revision }), db, { key });
  assert(delta.items.some(r => r.shoutId === f.items[129].shoutId));
  assert(delta.items.some(r => r.shoutId === f.items[131].shoutId));
  await assert.rejects(download(f.request({ cursor: first.next + 'x' }), db, { key }), e => e.code === 'failed-precondition');
  const other = await fixture();
  await assert.rejects(download(other.request({ cursor: first.next }), db, { key }), e => e.code === 'failed-precondition');
});
test('snapshot expiry and malformed or future revisions fail without creating metadata', { skip: !enabled }, async () => {
  const f = await fixture(129);
  for (let i = 0; i < f.items.length; i += 32) await upload(f.request({ items: f.items.slice(i, i + 32) }), db);
  const first = await download(f.request({}), db, { key, pageSize: 1 });
  await assert.rejects(download(f.request({ cursor: first.next }), db,
    { key, clock: () => new Date(Date.now() + 3600001) }), e => e.code === 'failed-precondition');
  await assert.rejects(download(f.request({ knownRevision: 999 }), db, { key }), e => e.code === 'failed-precondition');
  await assert.rejects(download(f.request({ cursor: first.next, knownRevision: 0 }), db, { key }), e => e.code === 'invalid-argument');
});
test('malformed batch, stale content, retention boundary and deferred content do not block valid rows', { skip: !enabled }, async () => {
  const f = await fixture(3);
  await db.doc(`shouts/${f.items[1].shoutId}`).update({ status: 'hidden' });
  await db.doc(`shouts/${f.items[2].shoutId}`).update({ text: 'updated' });
  const result = await upload(f.request({ items: f.items }), db);
  assert.deepEqual(result.items.map(r => r.status), ['accepted', 'deferred', 'obsolete']);
  await assert.rejects(upload(f.request({ items: Array(33).fill(f.items[0]) }), db), e => e.code === 'invalid-argument');
  await assert.rejects(upload(f.request({ items: f.items, expectedUserId: 'other' }), db), e => e.code === 'invalid-argument');
  await assert.rejects(upload({ ...f.request({ items: f.items }), app: null }, db), e => e.code === 'unauthenticated');
  const expired = await upload(f.request({ items: [f.items[0]] }), db,
    { clock: () => new Date(f.items[0].expiresAt + readRetentionMillis) });
  assert.equal(expired.items[0].status, 'obsolete');
});
test('transaction failure rolls back, deletion fences upload/download and account cleanup removes only own read branches', { skip: !enabled }, async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(upload(f.request({ items: f.items }), db, { beforeCommit: () => { throw Error('injected'); } }), /injected/);
  assert.equal((await f.user.collection('readBuckets').get()).size, 0);
  await upload(f.request({ items: f.items }), db); await upload(other.request({ items: other.items }), db);
  await f.requestRef.set({ userId: f.uid, status: 'pending' });
  await assert.rejects(upload(f.request({ items: f.items }), db), e => e.code === 'failed-precondition');
  await assert.rejects(download(f.request({}), db, { key }), e => e.code === 'failed-precondition');
  const identity = { userId: f.uid, projectId: db.projectId, requestCreateTime: (await f.requestRef.get()).createTime };
  const missing = { getUser() { throw Object.assign(Error('missing'), { code: 'auth/user-not-found' }); } };
  const guard = async tx => { assert((await tx.get(f.requestRef)).createTime.isEqual(identity.requestCreateTime)); return () => {}; };
  let result;
  do { result = await cleanupAccountPrivatePage(identity, db, missing, { pageSize: 1, transactionGuard: guard, readSyncEnabled: true }); }
  while (result.needsAnotherPage);
  assert.equal((await f.user.collection('readBuckets').get()).size, 0);
  assert.equal((await f.user.collection('readState').get()).size, 0);
  assert((await other.user.collection('readBuckets').get()).size > 0);
});
test('account deletion arriving during page assembly prevents returning private records', { skip: !enabled }, async () => {
  const f = await fixture(); await upload(f.request({ items: f.items }), db);
  await assert.rejects(download(f.request({}), db, { key,
    afterRead: () => f.requestRef.set({ userId: f.uid, status: 'pending' }) }), e => e.code === 'failed-precondition');
});

test('hidden, missing and blocked sources never disclose a hash match; offline peer marks still sync after expiry', { skip: !enabled }, async () => {
  const author = await fixture(), reader = await fixture();
  const row = author.items[0];
  const status = async candidate => (await upload(reader.request({ items: [candidate] }), db)).items[0].status;
  for (const sourceStatus of ['hidden', 'deleted']) {
    await db.doc(`shouts/${row.shoutId}`).update({ status: sourceStatus });
    assert.equal(await status(row), 'deferred');
    assert.equal(await status({ ...row, contentHash: '0'.repeat(64) }), 'deferred');
  }
  await db.doc(`shouts/${row.shoutId}`).update({ status: 'active' });
  await reader.user.collection('blocked').doc(author.uid).set({});
  assert.equal(await status(row), 'deferred');
  assert.equal(await status({ ...row, contentHash: '0'.repeat(64) }), 'deferred');
  await reader.user.collection('blocked').doc(author.uid).delete();
  const peerExpired = await upload(reader.request({ items: [row] }), db, { clock: () => new Date(row.expiresAt + 1) });
  assert.equal(peerExpired.items[0].status, 'accepted');
  await db.doc(`shouts/${row.shoutId}`).delete();
  assert.equal(await status(row), 'deferred');
  assert.equal(await status({ ...row, contentHash: '0'.repeat(64) }), 'deferred');
});
