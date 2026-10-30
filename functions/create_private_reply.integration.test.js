import { operationTestKey } from './test_helpers.js';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createPrivateReplyOperation } from './create_private_reply.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'private-reply-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-10-26T12:00:00Z');
const timedKey = label => operationTestKey(label, now);
const clock = () => now;
const code = (expected) => (error) => error.code === expected;
async function fixture() {
  const uid = randomUUID(), owner = randomUUID(), commenter = randomUUID(), shoutId = randomUUID();
  for (const [id, nickname] of [[uid, 'Autor'], [owner, 'Profil firmy'], [commenter, 'Komentující']]) {
    await db.doc(`users/${id}`).set({ nickname });
  }
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  const shoutRef = db.doc(`shouts/${shoutId}`);
  await shoutRef.set({ authorId: owner, authorNickname: 'Ověřená pobočka', title: 'Veřejný nadpis',
    status: 'active', commentsCount: 7, expiresAt: Timestamp.fromMillis(now.getTime() + 3600000) });
  const request = { auth: { uid, token: { email: 'test@example.test', email_verified: true } },
    app: { appId: 'test-app' }, data: { idempotencyKey: timedKey('private-1'), shoutId, text: 'Private payload fixture', targetType: 'shout' } };
  return { uid, owner, commenter, shoutRef, request };
}
const noticeRef = (recipient, shoutId) => db.doc(`users/${recipient}/notifications/privateReply_${shoutId}`);
async function assertNoWrite({ uid, shoutRef }) {
  assert.equal((await shoutRef.collection('privateReplies').get()).size, 0);
  assert.equal((await db.doc(`rateLimits/${uid}/actions/privateReply`).get()).exists, false);
  assert.equal((await shoutRef.get()).data().commentsCount, 7);
}

test('concurrent retries create one private message, rate and notice with canonical participants', { skip: !enabled }, async () => {
  const { uid, owner, shoutRef, request } = await fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => createPrivateReplyOperation(request, db, clock)));
  const id = results[0].privateReplyId;
  assert.equal(new Set(results.map((result) => result.privateReplyId)).size, 1);
  const reply = (await shoutRef.collection('privateReplies').doc(id).get()).data();
  assert.deepEqual(reply.participants, [uid, owner]);
  assert.equal(reply.authorNickname, 'Autor');
  // Business branch labels must never replace canonical recipient identity.
  assert.equal(reply.recipientNickname, 'Profil firmy');
  assert.equal(reply.createdAt.toMillis(), now.getTime());
  assert.equal((await shoutRef.get()).data().commentsCount, 7);
  assert.equal((await db.doc(`rateLimits/${uid}/actions/privateReply`).get()).data().count, 1);
  const receipt = (await db.doc(`serverOperations/${id}`).get()).data();
  assert.equal(receipt.action, 'createPrivateReply');
  assert.equal(receipt.privateReplyId, id);
  assert.equal(receipt.text, undefined);
  assert.equal(receipt.recipientId, undefined);
  const notice = (await noticeRef(owner, shoutRef.id).get()).data();
  assert.equal(notice.eventCount, 1);
  assert.equal(notice.targetPrivateReplyId, id);
  assert.equal(notice.text, undefined);
  await assert.rejects(createPrivateReplyOperation({ ...request, data: { ...request.data, text: 'Changed' } }, db, clock), code('already-exists'));
  await shoutRef.collection('privateReplies').doc(id).delete();
  assert.deepEqual(await createPrivateReplyOperation(request, db, clock), { privateReplyId: id });
  assert.equal((await shoutRef.collection('privateReplies').doc(id).get()).exists, false);
  assert.equal((await noticeRef(owner, shoutRef.id).get()).data().eventCount, 1);
});

test('comment target determines the recipient within this Shout', { skip: !enabled }, async () => {
  const { commenter, shoutRef, request } = await fixture();
  await shoutRef.collection('comments').doc('parent').set({ authorId: commenter, authorNickname: 'Stará přezdívka' });
  request.data = { ...request.data, targetType: 'comment', parentCommentId: 'parent' };
  const result = await createPrivateReplyOperation(request, db, clock);
  const reply = (await shoutRef.collection('privateReplies').doc(result.privateReplyId).get()).data();
  assert.equal(reply.recipientId, commenter);
  assert.equal(reply.recipientNickname, 'Komentující');
  assert.equal(reply.parentCommentId, 'parent');
});

test('received private message determines the other participant and inherits comment context', { skip: !enabled }, async () => {
  const { uid, commenter, shoutRef, request } = await fixture();
  await shoutRef.collection('comments').doc('parent').set({ authorId: commenter });
  await shoutRef.collection('privateReplies').doc('source').set({ authorId: commenter, recipientId: uid,
    participants: [commenter, uid], parentCommentId: 'parent' });
  request.data = { ...request.data, targetType: 'privateReply', parentPrivateReplyId: 'source' };
  const result = await createPrivateReplyOperation(request, db, clock);
  const reply = (await shoutRef.collection('privateReplies').doc(result.privateReplyId).get()).data();
  assert.equal(reply.recipientId, commenter);
  assert.deepEqual(reply.participants, [uid, commenter]);
  assert.equal(reply.parentCommentId, 'parent');
  assert.equal(reply.parentPrivateReplyId, undefined);
});

test('private target is unavailable to outsiders, the sender and mismatched participant records', { skip: !enabled }, async () => {
  for (const mode of ['missing', 'outsider', 'sender', 'damaged', 'other-shout']) {
    const f = await fixture();
    let data = { authorId: f.owner, recipientId: f.uid, participants: [f.owner, f.uid] };
    if (mode === 'outsider') data = { authorId: f.owner, recipientId: f.commenter, participants: [f.owner, f.commenter] };
    if (mode === 'sender') data = { authorId: f.uid, recipientId: f.owner, participants: [f.uid, f.owner] };
    if (mode === 'damaged') data.participants = [f.owner, f.commenter];
    const parent = mode === 'other-shout' ? db.doc(`shouts/${randomUUID()}/privateReplies/source`)
      : f.shoutRef.collection('privateReplies').doc('source');
    if (mode !== 'missing') await parent.set(data);
    const request = { ...f.request, data: { ...f.request.data, targetType: 'privateReply', parentPrivateReplyId: 'source' } };
    await assert.rejects(createPrivateReplyOperation(request, db, clock), code('permission-denied'));
    assert.equal((await db.doc(`rateLimits/${f.uid}/actions/privateReply`).get()).exists, false);
  }
});

test('missing or inactive public targets and self-replies do not write anything', { skip: !enabled }, async () => {
  for (const mode of ['missing-comment', 'expired', 'deleted', 'self', 'missing-recipient']) {
    const f = await fixture();
    if (mode === 'missing-comment') f.request.data = { ...f.request.data, targetType: 'comment', parentCommentId: 'missing' };
    if (mode === 'expired') await f.shoutRef.update({ expiresAt: Timestamp.fromDate(now) });
    if (mode === 'deleted') await f.shoutRef.update({ status: 'deleted' });
    if (mode === 'self') await f.shoutRef.update({ authorId: f.uid });
    if (mode === 'missing-recipient') await db.doc(`users/${f.owner}`).delete();
    await assert.rejects(createPrivateReplyOperation(f.request, db, clock));
    await assertNoWrite(f);
  }
});

test('private notification preferences and aggregation preserve privacy and reset read state', { skip: !enabled }, async () => {
  for (const enabled of [true, false]) {
    const { owner, shoutRef, request } = await fixture();
    await db.doc(`users/${owner}/settings/notifications`).set({ privateReplies: enabled });
    await createPrivateReplyOperation(request, db, clock);
    const notice = noticeRef(owner, shoutRef.id);
    if (enabled) await notice.update({ readAt: Timestamp.fromDate(now) });
    await createPrivateReplyOperation({ ...request, data: { ...request.data, idempotencyKey: timedKey('next') } },
      db, () => new Date(now.getTime() + 10000));
    const snapshot = await notice.get();
    assert.equal(snapshot.exists, enabled);
    if (enabled) {
      assert.equal(snapshot.data().eventCount, 2);
      assert.equal(snapshot.data().readAt, null);
      assert.equal(snapshot.data().text, undefined);
    }
  }
});

test('concurrent distinct private replies cannot bypass their independent cooldown', { skip: !enabled }, async () => {
  const f = await fixture();
  const results = await Promise.allSettled(['one', 'two'].map((idempotencyKey) =>
    createPrivateReplyOperation({ ...f.request, data: { ...f.request.data, idempotencyKey: timedKey(idempotencyKey) } }, db, clock)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await db.doc(`rateLimits/${f.uid}/actions/privateReply`).get()).data().count, 1);
  assert.equal((await db.doc(`rateLimits/${f.uid}/actions/comment`).get()).exists, false);
});

test('blocked accounts, missing legal consent and invalid settings fail atomically', { skip: !enabled }, async () => {
  for (const mode of ['ban', 'restriction', 'deletion', 'legal', 'settings']) {
    const f = await fixture();
    if (mode === 'ban') await db.doc(`bans/${f.uid}`).set({ permanent: true });
    if (mode === 'restriction') await db.doc(`contentRestrictions/${f.uid}`).set({ expiresAt: Timestamp.fromMillis(now.getTime() + 60000) });
    if (mode === 'deletion') await db.doc(`accountDeletionRequests/${f.uid}`).set({ status: 'pending' });
    if (mode === 'legal') await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    if (mode === 'settings') await db.doc(`users/${f.owner}/settings/notifications`).set({ privateReplies: 'invalid' });
    await assert.rejects(createPrivateReplyOperation(f.request, db, clock));
    await assertNoWrite(f);
    assert.equal((await noticeRef(f.owner, f.shoutRef.id).get()).exists, false);
  }
});
