import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { operationRetryWindowMillis as week } from './operation_retention.js';
import { createShoutOperation } from './create_shout.js';
import { createCommentOperation } from './create_comment.js';
import { createPrivateReplyOperation } from './create_private_reply.js';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';
import { toggleCommentReactionOperation } from './toggle_comment_reaction.js';
import { toggleShoutSaveOperation } from './toggle_shout_save.js';
import { createContentReportOperation } from './create_content_report.js';
import { deleteCommentOperation } from './delete_comment.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'operation-retention-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-10-30T12:00:00Z');
const at = ms => () => new Date(now.getTime() + ms);
const key = `op1_${Math.floor(now.getTime() / 1000)}_${'b'.repeat(32)}`;
const expired = actual => actual.code === 'failed-precondition' && actual.message === 'operation-expired';
const operations = [
  [createShoutOperation, { title: 'Title', text: 'Text', categories: ['Dotaz'], durationMinutes: 120,
    location: { latitude: 50.0755, longitude: 14.4378 } }],
  [createCommentOperation, { shoutId: 'target', text: 'Comment' }],
  [createPrivateReplyOperation, { shoutId: 'target', text: 'Private', targetType: 'shout' }],
  [toggleShoutReactionOperation, { shoutId: 'target', button: 'like' }],
  [toggleCommentReactionOperation, { shoutId: 'target', commentId: 'comment', button: 'like' }],
  [toggleShoutSaveOperation, { shoutId: 'target' }],
  [createContentReportOperation, { shoutId: 'target', targetType: 'shout', reason: 'Spam' }],
  [deleteCommentOperation, { shoutId: 'target', commentId: 'comment' }],
];
async function request(data = {}) {
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set({ nickname: 'Retention test' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  return { auth: { uid, token: { email: 'test@example.test', email_verified: true } },
    app: { appId: 'web' }, data: { ...data, idempotencyKey: key, expectedUserId: uid } };
}
async function savedFixture() {
  const r = await request({ shoutId: randomUUID() });
  const shout = db.doc(`shouts/${r.data.shoutId}`);
  await shout.set({ authorId: r.auth.uid, likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0 });
  const receiptId = createHash('sha256').update(`${r.auth.uid}\ntoggleShoutSave\n${key}`).digest('hex');
  return { r, shout, receipt: db.doc(`serverOperations/${receiptId}`),
    rate: db.doc(`rateLimits/${r.auth.uid}/actions/interaction`) };
}

test('all eight operations reject expired timed requests before any content, rate or receipt writes', { skip: !enabled }, async () => {
  for (const [operation, data] of operations) {
    const r = await request(data);
    await assert.rejects(operation(r, db, at(week)), expired, operation.name);
    assert.equal((await db.collection(`rateLimits/${r.auth.uid}/actions`).get()).size, 0);
    assert.equal((await db.collection('serverOperations').where('userId', '==', r.auth.uid).get()).size, 0);
    assert.equal((await db.collection('shouts').where('authorId', '==', r.auth.uid).get()).size, 0);
  }
});

test('cutover rejects new legacy keys in every operation without writes', { skip: !enabled }, async () => {
  for (const [operation, data] of operations) {
    const r = await request(data);
    r.data.idempotencyKey = 'old-client-operation-key';
    await assert.rejects(operation(r, db, at(0)), actual => actual.code === 'failed-precondition' &&
      actual.message === 'operation-key-upgrade-required', operation.name);
    assert.equal((await db.collection(`rateLimits/${r.auth.uid}/actions`).get()).size, 0);
    assert.equal((await db.collection('serverOperations').where('userId', '==', r.auth.uid).get()).size, 0);
    assert.equal((await db.collection('shouts').where('authorId', '==', r.auth.uid).get()).size, 0);
  }
});

test('cleanup cannot turn the same timed save request into a second toggle', { skip: !enabled }, async () => {
  const f = await savedFixture();
  assert.deepEqual(await toggleShoutSaveOperation(f.r, db, at(0)), { saved: true, count: 1 });
  const receipt = (await f.receipt.get()).data();
  assert.equal(receipt.keyVersion, 1);
  assert.equal(receipt.expiresAt.toMillis(), now.getTime() + week);
  assert.equal(receipt.createdAt.toMillis(), now.getTime());
  await f.receipt.delete(); // Isolated emulator: simulate completed physical cleanup.
  await assert.rejects(toggleShoutSaveOperation(f.r, db, at(week)), expired);
  assert.equal((await f.shout.get()).data().savesCount, 1);
  assert.equal((await f.shout.collection('saves').doc(f.r.auth.uid).get()).exists, true);
  assert.equal((await f.rate.get()).data().count, 1);
  assert.equal((await f.receipt.get()).exists, false);
});

test('deadline is enforced even while an expired receipt is still physically present', { skip: !enabled }, async () => {
  const f = await savedFixture();
  await toggleShoutSaveOperation(f.r, db, at(0));
  const before = (await f.receipt.get()).data();
  assert.deepEqual(await toggleShoutSaveOperation(f.r, db, at(week - 1)), { saved: true, count: 1 });
  await assert.rejects(toggleShoutSaveOperation(f.r, db, at(week)), expired);
  assert.deepEqual((await f.receipt.get()).data(), before);
  assert.equal((await f.rate.get()).data().count, 1);
  assert.equal((await f.shout.get()).data().savesCount, 1);
});

test('current account eligibility still precedes the retention check in every operation', { skip: !enabled }, async () => {
  for (const [operation, data] of operations) {
    const r = await request(data);
    await db.doc(`bans/${r.auth.uid}`).set({ expiresAt: Timestamp.fromMillis(now.getTime() + week * 2) });
    await assert.rejects(operation(r, db, at(week)), actual => actual.code === 'permission-denied', operation.name);
  }
});
