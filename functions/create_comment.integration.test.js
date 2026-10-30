import { operationTestKey } from './test_helpers.js';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createCommentOperation } from './create_comment.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'create-comment-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-10-25T12:00:00Z');
const timedKey = label => operationTestKey(label, now);
const clock = () => now;
const code = (expected) => (error) => error.code === expected;
async function fixture() {
  const uid = randomUUID();
  const owner = randomUUID();
  const parentAuthor = randomUUID();
  const shoutId = randomUUID();
  await db.doc(`users/${uid}`).set({ nickname: 'Serverový autor' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  const shoutRef = db.doc(`shouts/${shoutId}`);
  await shoutRef.set({ authorId: owner, title: 'Serverový nadpis', status: 'active', commentsCount: 0,
    expiresAt: Timestamp.fromMillis(now.getTime() + 60000) });
  const request = { auth: { uid, token: { email: 'test@example.test', email_verified: true } },
    app: { appId: 'test-app' }, data: { idempotencyKey: timedKey('comment-1'), shoutId, text: 'Komentář' } };
  return { uid, owner, parentAuthor, shoutRef, request };
}
const notification = (uid, kind, shoutId) => db.doc(`users/${uid}/notifications/${kind}_${shoutId}`);

test('concurrent comment retries charge one limit, counter and notification event', { skip: !enabled }, async () => {
  const { uid, owner, shoutRef, request } = await fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => createCommentOperation(request, db, clock)));
  assert.equal(new Set(results.map((result) => result.commentId)).size, 1);
  const commentId = results[0].commentId;
  const comment = (await shoutRef.collection('comments').doc(commentId).get()).data();
  assert.equal(comment.authorId, uid);
  assert.equal(comment.authorNickname, 'Serverový autor');
  assert.equal(comment.createdAt.toMillis(), now.getTime());
  assert.equal(comment.likesCount, 0);
  assert.equal(comment.dislikesCount, 0);
  assert.equal((await shoutRef.get()).data().commentsCount, 1);
  const rate = (await db.doc(`rateLimits/${uid}/actions/comment`).get()).data();
  assert.equal(rate.count, 1);
  assert.equal(rate.lastEventId, commentId);
  const receipt = (await db.doc(`serverOperations/${commentId}`).get()).data();
  assert.equal(receipt.action, 'createComment');
  assert.equal(receipt.shoutId, shoutRef.id);
  assert.equal(receipt.createdAt.toMillis(), now.getTime());
  const notice = (await notification(owner, 'comment', shoutRef.id).get()).data();
  assert.equal(notice.eventCount, 1);
  assert.equal(notice.actorNickname, 'Serverový autor');
  assert.equal(notice.targetTitle, 'Serverový nadpis');
  assert.equal(notice.targetCommentId, commentId);
  await assert.rejects(createCommentOperation({ ...request, data: { ...request.data, text: 'Jiný' } }, db, clock), code('already-exists'));
  await shoutRef.update({ status: 'deleted' });
  assert.deepEqual(await createCommentOperation(request, db, clock), { commentId });
  assert.equal((await shoutRef.get()).data().commentsCount, 1);
});

test('reply uses parent from the same Shout and notifies the two distinct recipients', { skip: !enabled }, async () => {
  const { owner, parentAuthor, shoutRef, request } = await fixture();
  await shoutRef.collection('comments').doc('parent').set({ authorId: parentAuthor, authorNickname: 'Původní autor' });
  request.data.replyToCommentId = 'parent';
  const { commentId } = await createCommentOperation(request, db, clock);
  const comment = (await shoutRef.collection('comments').doc(commentId).get()).data();
  assert.equal(comment.replyToNickname, 'Původní autor');
  const replyNotice = (await notification(parentAuthor, 'reply', shoutRef.id).get()).data();
  assert.equal(replyNotice.parentCommentId, 'parent');
  assert.equal(replyNotice.eventCount, 1);
  assert.equal((await notification(owner, 'comment', shoutRef.id).get()).data().eventCount, 1);
});

test('notification preferences, self-replies and owner replies avoid duplicate notices', { skip: !enabled }, async () => {
  for (const mode of ['disabled', 'self', 'owner', 'own-shout']) {
    const { uid, owner, shoutRef, request } = await fixture();
    const parentAuthor = mode === 'owner' ? owner : uid;
    await shoutRef.collection('comments').doc('parent').set({ authorId: parentAuthor, authorNickname: 'Autor' });
    request.data.replyToCommentId = 'parent';
    if (mode === 'own-shout') await shoutRef.update({ authorId: uid });
    if (mode === 'disabled') await db.doc(`users/${owner}/settings/notifications`).set({ replies: false });
    await createCommentOperation(request, db, clock);
    assert.equal((await notification(owner, 'comment', shoutRef.id).get()).exists, !['disabled', 'own-shout'].includes(mode));
    assert.equal((await notification(parentAuthor, 'reply', shoutRef.id).get()).exists, false);
  }
});

test('a later comment aggregates the notice while a retry cannot create it again', { skip: !enabled }, async () => {
  const { owner, shoutRef, request } = await fixture();
  await createCommentOperation(request, db, clock);
  const noticeRef = notification(owner, 'comment', shoutRef.id);
  await noticeRef.update({ readAt: Timestamp.fromDate(now) });
  const next = { ...request, data: { ...request.data, idempotencyKey: timedKey('next'), text: 'Další' } };
  const later = () => new Date(now.getTime() + 10000);
  const result = await createCommentOperation(next, db, later);
  assert.equal((await noticeRef.get()).data().eventCount, 2);
  assert.equal((await noticeRef.get()).data().readAt, null);
  assert.equal((await shoutRef.get()).data().commentsCount, 2);
  await shoutRef.collection('comments').doc(result.commentId).delete();
  assert.deepEqual(await createCommentOperation(next, db, later), result);
  assert.equal((await shoutRef.collection('comments').doc(result.commentId).get()).exists, false);
  assert.equal((await noticeRef.get()).data().eventCount, 2);
});

test('expired/deleted Shout and missing parent fail without consuming a rate or counter', { skip: !enabled }, async () => {
  for (const mode of ['expired', 'deleted', 'missing-parent']) {
    const { uid, shoutRef, request } = await fixture();
    if (mode === 'expired') await shoutRef.update({ expiresAt: Timestamp.fromDate(now) });
    if (mode === 'deleted') await shoutRef.update({ status: 'deleted' });
    if (mode === 'missing-parent') request.data.replyToCommentId = 'not-in-this-shout';
    await assert.rejects(createCommentOperation(request, db, clock), code(mode === 'missing-parent' ? 'not-found' : 'failed-precondition'));
    assert.equal((await shoutRef.collection('comments').get()).size, 0);
    assert.equal((await shoutRef.get()).data().commentsCount, 0);
    assert.equal((await db.doc(`rateLimits/${uid}/actions/comment`).get()).exists, false);
  }
});

test('concurrent distinct comments cannot bypass cooldown or double increment counts', { skip: !enabled }, async () => {
  const { uid, shoutRef, request } = await fixture();
  const results = await Promise.allSettled(['one', 'two'].map((idempotencyKey) =>
    createCommentOperation({ ...request, data: { ...request.data, idempotencyKey: timedKey(idempotencyKey) } }, db, clock)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await shoutRef.get()).data().commentsCount, 1);
  assert.equal((await db.doc(`rateLimits/${uid}/actions/comment`).get()).data().count, 1);
});

test('blocked actor and damaged notification settings leave no partial transaction', { skip: !enabled }, async () => {
  for (const mode of ['ban', 'restriction', 'deletion', 'settings']) {
    const { uid, owner, shoutRef, request } = await fixture();
    if (mode === 'ban') await db.doc(`bans/${uid}`).set({ permanent: true });
    if (mode === 'restriction') await db.doc(`contentRestrictions/${uid}`).set({ expiresAt: Timestamp.fromMillis(now.getTime() + 60000) });
    if (mode === 'deletion') await db.doc(`accountDeletionRequests/${uid}`).set({ status: 'pending' });
    if (mode === 'settings') await db.doc(`users/${owner}/settings/notifications`).set({ replies: 'invalid' });
    await assert.rejects(createCommentOperation(request, db, clock));
    assert.equal((await shoutRef.collection('comments').get()).size, 0);
    assert.equal((await shoutRef.get()).data().commentsCount, 0);
    assert.equal((await db.doc(`rateLimits/${uid}/actions/comment`).get()).exists, false);
    assert.equal((await notification(owner, 'comment', shoutRef.id).get()).exists, false);
  }
});
