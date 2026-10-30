import { operationTestKey } from './test_helpers.js';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { toggleCommentReactionOperation as toggle } from './toggle_comment_reaction.js';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'comment-reaction-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-10-26T12:00:00Z');
const timedKey = label => operationTestKey(label, now);
const at = (ms = 0) => () => new Date(now.getTime() + ms);
async function actor() {
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set({ nickname: 'Private profile' });
  await db.doc(`publicProfiles/${uid}`).set({ nickname: 'Public reactor' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  return uid;
}
async function fixture() {
  const uid = await actor(), owner = randomUUID(), shoutOwner = randomUUID();
  const shoutRef = db.doc(`shouts/${randomUUID()}`), commentRef = shoutRef.collection('comments').doc(randomUUID());
  const shoutData = { authorId: shoutOwner, title: 'Parent Shout', status: 'active',
    likesCount: 7, dislikesCount: 8, commentsCount: 1, savesCount: 9 };
  const commentData = { authorId: owner, authorNickname: 'Comment author', text: 'Original comment',
    likesCount: 2, dislikesCount: 3 };
  await shoutRef.set(shoutData);
  await commentRef.set(commentData);
  const request = { auth: { uid, token: { email: 'test@example.test', email_verified: true } },
    app: { appId: 'test' }, data: { idempotencyKey: timedKey('first'), shoutId: shoutRef.id, commentId: commentRef.id, button: 'like', expectedUserId: uid } };
  return { uid, owner, shoutOwner, shoutRef, commentRef, shoutData, commentData, request };
}
const rate = uid => db.doc(`rateLimits/${uid}/actions/interaction`);
const change = (request, idempotencyKey, button) => ({ ...request, data: { ...request.data, idempotencyKey: timedKey(idempotencyKey), button } });
const notice = (f, type) => db.doc(`users/${f.owner}/notifications/commentReaction_${type}_${f.shoutRef.id}_${f.commentRef.id}`);
const receipt = (f, key = 'first') => db.doc(`serverOperations/${createHash('sha256').update(`${f.uid}\ntoggleCommentReaction\n${timedKey(key)}`).digest('hex')}`);

test('comment add, switch and removal are atomic and notify the comment author only', { skip: !enabled }, async () => {
  const f = await fixture();
  for (const [key, button, time, result] of [
    ['first', 'like', 0, { type: 'like', likes: 3, dislikes: 3 }],
    ['switch', 'dislike', 1000, { type: 'dislike', likes: 2, dislikes: 4 }],
    ['remove', 'dislike', 2000, { type: null, likes: 2, dislikes: 3 }],
  ]) {
    assert.deepEqual(await toggle(change(f.request, key, button), db, at(time)), result);
    const saved = (await receipt(f, key).get()).data();
    assert.equal(saved.userId, f.uid);
    assert.equal(saved.commentId, f.commentRef.id);
    assert.equal(saved.shoutId, f.shoutRef.id);
    assert.deepEqual(saved.result, result);
    assert.equal(saved.text, undefined);
    assert.equal(saved.createdAt.toMillis(), now.getTime() + time);
  }
  assert.deepEqual((await f.commentRef.get()).data(), f.commentData);
  assert.deepEqual((await f.shoutRef.get()).data(), f.shoutData);
  assert.equal((await f.commentRef.collection('reactions').doc(f.uid).get()).exists, false);
  assert.equal((await rate(f.uid).get()).data().count, 3);
  assert.equal((await rate(f.uid).get()).data().lastEventId, `commentReaction_${f.shoutRef.id}_${f.commentRef.id}`);
  for (const type of ['like', 'dislike']) {
    const n = (await notice(f, type).get()).data();
    assert.equal(n.actorNickname, 'Public reactor');
    assert.equal(n.targetTitle, f.shoutData.title);
    assert.equal(n.targetCommentId, f.commentRef.id);
    assert.equal(n.eventCount, 1);
  }
  assert.equal((await db.collection(`users/${f.shoutOwner}/notifications`).get()).size, 0);
});

test('concurrent retry is one toggle; replay cannot overwrite newer comment reactions', { skip: !enabled }, async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 3 }, () => toggle(f.request, db, at())));
  for (const result of results) assert.deepEqual(result, { type: 'like', likes: 3, dislikes: 3 });
  assert.equal((await rate(f.uid).get()).data().count, 1);
  assert.equal((await notice(f, 'like').get()).data().eventCount, 1);
  await toggle(change(f.request, 'newer', 'dislike'), db, at(1000));
  assert.deepEqual(await toggle(f.request, db, at(2000)), results[0]);
  assert.equal((await f.commentRef.get()).data().dislikesCount, 4);
  assert.equal((await rate(f.uid).get()).data().count, 2);
  for (const data of [{ ...f.request.data, button: 'dislike' }, { ...f.request.data, commentId: 'different' }]) {
    await assert.rejects(toggle({ ...f.request, data }, db, at(3000)), e => e.code === 'already-exists');
  }
  await db.doc(`bans/${f.uid}`).set({});
  await assert.rejects(toggle(f.request, db, at(3000)), e => e.code === 'permission-denied');
});

test('parallel reactors preserve totals and distinct requests cannot bypass shared cooldown', { skip: !enabled }, async () => {
  const f = await fixture(), other = await actor();
  await Promise.all([toggle(f.request, db, at()), toggle({ ...f.request,
    auth: { ...f.request.auth, uid: other }, data: { ...f.request.data, expectedUserId: other } }, db, at())]);
  assert.equal((await f.commentRef.get()).data().likesCount, 4);
  const g = await fixture();
  const results = await Promise.allSettled(['one', 'two'].map(key => toggle(change(g.request, key, 'like'), db, at())));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await g.commentRef.get()).data().likesCount, 3);
});

test('comment and Shout reactions share limits but use independent receipt namespaces', { skip: !enabled }, async () => {
  const f = await fixture();
  await rate(f.uid).set({ count: 120, lastAt: Timestamp.fromMillis(now.getTime() - 1000),
    windowStartedAt: Timestamp.fromMillis(now.getTime() - 3599000), lastEventId: 'save_previous' });
  await assert.rejects(toggle(f.request, db, at()), e => e.code === 'resource-exhausted');
  assert.equal((await receipt(f).get()).exists, false);
  await toggle(f.request, db, at(1000));
  const shoutRequest = { ...f.request, data: { ...f.request.data } };
  delete shoutRequest.data.commentId;
  await assert.rejects(toggleShoutReactionOperation(shoutRequest, db, at(1500)), e => e.code === 'resource-exhausted');
  await toggleShoutReactionOperation(shoutRequest, db, at(2000));
  assert.equal((await rate(f.uid).get()).data().count, 2);
  assert.equal((await receipt(f).get()).data().action, 'toggleCommentReaction');
  assert.equal((await f.commentRef.get()).data().likesCount, 3);
  assert.equal((await f.shoutRef.get()).data().likesCount, 8);
});

test('self, preferences and absent public profile avoid notifications; removal skips damaged preferences', { skip: !enabled }, async () => {
  for (const mode of ['self', 'disabled', 'missing-profile', 'removal']) {
    const f = await fixture();
    if (mode === 'self') await f.commentRef.update({ authorId: f.uid });
    if (mode === 'disabled') await db.doc(`users/${f.owner}/settings/notifications`).set({ reactions: false });
    if (mode === 'missing-profile') await db.doc(`publicProfiles/${f.uid}`).delete();
    await toggle(f.request, db, at());
    assert.equal((await notice(f, 'like').get()).exists, mode === 'removal');
    if (mode === 'removal') {
      await db.doc(`users/${f.owner}/settings/notifications`).set({ reactions: 'broken' });
      await toggle(change(f.request, 'remove', 'like'), db, at(1000));
      assert.equal((await notice(f, 'like').get()).data().eventCount, 1);
    }
  }
});

test('invalid targets, account or stored state reject without partial comment writes', { skip: !enabled }, async () => {
  for (const mode of ['ban', 'deletion', 'legal', 'missing-comment', 'missing-shout', 'counter', 'reaction', 'settings', 'profile', 'title']) {
    const f = await fixture();
    if (mode === 'ban') await db.doc(`bans/${f.uid}`).set({});
    if (mode === 'deletion') await db.doc(`accountDeletionRequests/${f.uid}`).set({});
    if (mode === 'legal') await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    if (mode === 'missing-comment') await f.commentRef.delete();
    if (mode === 'missing-shout') await f.shoutRef.delete();
    if (mode === 'counter') await f.commentRef.update({ likesCount: 0 });
    if (mode === 'counter' || mode === 'reaction') await f.commentRef.collection('reactions').doc(f.uid).set({ type: mode === 'reaction' ? 'broken' : 'like' });
    if (mode === 'settings') await db.doc(`users/${f.owner}/settings/notifications`).set({ reactions: 'broken' });
    if (mode === 'profile') await db.doc(`publicProfiles/${f.uid}`).set({ nickname: false });
    if (mode === 'title') await f.shoutRef.update({ title: false });
    await assert.rejects(toggle(f.request, db, at()));
    assert.equal((await rate(f.uid).get()).exists, false);
    assert.equal((await receipt(f).get()).exists, false);
    assert.equal((await notice(f, 'like').get()).exists, false);
    if (mode !== 'missing-comment') assert.equal((await f.commentRef.get()).data().dislikesCount, 3);
  }
});

test('retained inactive Shouts and creation restrictions do not block comment reactions', { skip: !enabled }, async () => {
  for (const status of ['expired', 'deleted']) {
    const f = await fixture();
    await f.shoutRef.update({ status });
    await db.doc(`contentRestrictions/${f.uid}`).set({ expiresAt: Timestamp.fromMillis(now.getTime() + 60000) });
    await toggle(f.request, db, at());
    assert.equal((await f.commentRef.get()).data().likesCount, 3);
  }
});
