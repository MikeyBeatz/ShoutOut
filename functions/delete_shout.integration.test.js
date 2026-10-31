import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { deleteShoutOperation as remove } from './delete_shout.js';
import { operationTestKey } from './test_helpers.js';
import { receiptMayBePurged } from './cleanup_operation_receipts.js';
import { operationRetryWindowMillis as week } from './operation_retention.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'shout-deletion-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-10-31T12:00:00Z');
const at = (ms = 0) => () => new Date(now.getTime() + ms);
const key = label => operationTestKey(label, now);
const errorCode = code => error => error.code === code;
async function actor() {
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set({ nickname: 'Deletion actor' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  return uid;
}
async function fixture() {
  const uid = await actor(), shout = db.doc(`shouts/${randomUUID()}`);
  const original = { authorId: uid, title: 'Retained Shout', text: 'Keep source', status: 'active',
    expiresAt: Timestamp.fromMillis(0), likesCount: 2, dislikesCount: 1, commentsCount: 3, savesCount: 5 };
  await shout.set(original);
  const request = { auth: { uid, token: { email: 'actor@example.test', email_verified: true } }, app: { appId: 'web' },
    data: { shoutId: shout.id, expectedUserId: uid, idempotencyKey: key('first') } };
  const receipt = db.doc(`serverOperations/${createHash('sha256').update(`${uid}\ndeleteShout\n${key('first')}`).digest('hex')}`);
  return { uid, shout, original, request, receipt };
}
const retry = (request, label) => ({ ...request, data: { ...request.data, idempotencyKey: key(label) } });

test('personal and Business authors soft-delete without modifying source, children or rate buckets', { skip: !enabled }, async () => {
  for (const business of [false, true]) {
    const f = await fixture();
    if (business) await db.doc(`accountRoles/${f.uid}`).set({ level: 2 });
    const child = f.shout.collection('comments').doc('kept'); await child.set({ text: 'Keep child' });
    assert.deepEqual(await remove(f.request, db, at()), { deleted: true });
    assert.deepEqual((await f.shout.get()).data(), { ...f.original, status: 'deleted' });
    assert.equal((await child.get()).exists, true);
    assert.equal((await db.collection(`rateLimits/${f.uid}/actions`).get()).size, 0);
    const saved = (await f.receipt.get()).data();
    assert.equal(saved.action, 'deleteShout'); assert.equal(saved.keyVersion, 1);
    assert.equal(saved.expiresAt.toMillis(), now.getTime() + week);
    assert(receiptMayBePurged(saved, Timestamp.fromMillis(now.getTime() + week)));
  }
});
test('concurrent duplicate and distinct requests retain content and replay only their own acknowledgement', { skip: !enabled }, async () => {
  const f = await fixture();
  await Promise.all([remove(f.request, db, at()), remove(f.request, db, at()), remove(retry(f.request, 'second'), db, at())]);
  assert.equal((await f.shout.get()).data().status, 'deleted');
  await f.shout.update({ likesCount: 7 });
  await remove(f.request, db, at(2000));
  assert.equal((await f.shout.get()).data().likesCount, 7);
  await assert.rejects(remove({ ...f.request, data: { ...f.request.data, shoutId: 'another' } }, db, at()), errorCode('already-exists'));
  await db.doc(`bans/${f.uid}`).set({});
  await assert.rejects(remove(f.request, db, at(2000)), errorCode('permission-denied'));
});
test('Business, profile-injected roles and malformed trusted roles cannot delete foreign Shouts', { skip: !enabled }, async () => {
  for (const level of [null, 1, 2, 2.5, '3']) {
    const f = await fixture(); await f.shout.update({ authorId: 'another' });
    await db.doc(`users/${f.uid}`).update({ role: 'administrator', level: 5 });
    if (level !== null) await db.doc(`accountRoles/${f.uid}`).set({ level });
    await assert.rejects(remove(f.request, db, at()), errorCode('permission-denied'));
    assert.equal((await f.shout.get()).data().status, 'active'); assert.equal((await f.receipt.get()).exists, false);
  }
});
test('trusted moderator roles and legacy membership authorize; revocation also fences receipt replay', { skip: !enabled }, async () => {
  for (const level of [3, 4, 5, 'legacy']) {
    const f = await fixture(); await f.shout.update({ authorId: 'another' });
    const role = db.doc(`${level === 'legacy' ? 'moderators' : 'accountRoles'}/${f.uid}`);
    await role.set(level === 'legacy' ? {} : { level });
    await remove(f.request, db, at()); await remove(f.request, db, at(2000));
    await role.delete();
    await assert.rejects(remove(f.request, db, at(2000)), errorCode('permission-denied'));
  }
});
test('missing content and ineligible actors produce no receipt or partial status change', { skip: !enabled }, async () => {
  for (const mode of ['missing', 'profile', 'legal', 'deletion', 'ban', 'author']) {
    const f = await fixture();
    if (mode === 'missing') await f.shout.delete();
    if (mode === 'profile') await db.doc(`users/${f.uid}`).delete();
    if (mode === 'legal') await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    if (mode === 'deletion') await db.doc(`accountDeletionRequests/${f.uid}`).set({});
    if (mode === 'ban') await db.doc(`bans/${f.uid}`).set({});
    if (mode === 'author') await f.shout.update({ authorId: null });
    await assert.rejects(remove(f.request, db, at()));
    assert.equal((await f.receipt.get()).exists, false);
    if (mode !== 'missing') assert.equal((await f.shout.get()).data().status, 'active');
  }
});
test('expired keys are rejected before and after physical receipt cleanup', { skip: !enabled }, async () => {
  const f = await fixture(); await remove(f.request, db, at());
  await assert.rejects(remove(f.request, db, at(week)), error => error.message === 'operation-expired');
  await f.receipt.delete();
  await assert.rejects(remove(f.request, db, at(week)), error => error.message === 'operation-expired');
});
