import { operationTestKey } from './test_helpers.js';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { deleteCommentOperation as remove } from './delete_comment.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'comment-deletion-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-10-30T12:00:00Z');
const timedKey = label => operationTestKey(label, now);
const at = (ms = 0) => () => new Date(now.getTime() + ms);
const errorCode = code => error => error.code === code;
async function actor() {
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set({ nickname: 'Deletion test' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  return uid;
}
async function fixture() {
  const uid = await actor();
  const shout = db.doc(`shouts/${randomUUID()}`);
  const comment = shout.collection('comments').doc(randomUUID());
  const original = { authorId: randomUUID(), title: 'Target', status: 'active',
    likesCount: 2, dislikesCount: 3, commentsCount: 2, savesCount: 5 };
  await shout.set(original);
  await comment.set({ authorId: uid, text: 'Comment', likesCount: 1, dislikesCount: 0 });
  const request = { auth: { uid, token: { email: 'test@example.test', email_verified: true } },
    app: { appId: 'web' }, data: { shoutId: shout.id, commentId: comment.id, expectedUserId: uid, idempotencyKey: timedKey('first') } };
  return { uid, shout, comment, original, request };
}
const rate = f => db.doc(`rateLimits/${f.uid}/actions/delete`);
const receipt = (f, key = 'first') => db.doc(`serverOperations/${createHash('sha256').update(`${f.uid}\ndeleteComment\n${timedKey(key)}`).digest('hex')}`);
const change = (request, key) => ({ ...request, data: { ...request.data, idempotencyKey: timedKey(key) } });

test('author deletion changes one parent counter and writes one rate event and private receipt atomically', { skip: !enabled }, async () => {
  const f = await fixture();
  const reaction = f.comment.collection('reactions').doc('reader');
  const reply = f.shout.collection('comments').doc('reply');
  await reaction.set({ type: 'like' });
  await reply.set({ authorId: 'reader', replyToCommentId: f.comment.id });
  assert.deepEqual(await remove(f.request, db, at()), { deleted: true });
  assert.equal((await f.comment.get()).exists, false);
  assert.deepEqual((await f.shout.get()).data(), { ...f.original, commentsCount: 1 });
  assert.equal((await reaction.get()).exists, true);
  assert.equal((await reply.get()).exists, true);
  assert.deepEqual((await rate(f).get()).data(), { count: 1, lastEventId: f.comment.id,
    lastAt: Timestamp.fromDate(now), windowStartedAt: Timestamp.fromDate(now) });
  const saved = (await receipt(f).get()).data();
  assert.deepEqual(Object.keys(saved).sort(), ['action','authorId','commentId','createdAt','expiresAt','fingerprint','keyVersion','result','shoutId','userId']);
  assert.equal(saved.authorId, f.uid);
  assert.deepEqual(saved.result, { deleted: true });
  assert.equal((await db.collection(`users/${f.original.authorId}/notifications`).get()).size, 0);
});

test('parallel retries delete once and a historical acknowledgement does not change newer counts or rate', { skip: !enabled }, async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => remove(f.request, db, at())));
  results.forEach(result => assert.deepEqual(result, { deleted: true }));
  assert.equal((await f.shout.get()).data().commentsCount, 1);
  assert.equal((await rate(f).get()).data().count, 1);
  await f.shout.update({ commentsCount: 8 });
  await remove(f.request, db, at(2000));
  assert.equal((await f.shout.get()).data().commentsCount, 8);
  assert.equal((await rate(f).get()).data().count, 1);
  await assert.rejects(remove({ ...f.request, data: { ...f.request.data, commentId: 'another' } }, db, at(2000)), errorCode('already-exists'));
  await assert.rejects(remove(change(f.request, 'new-key'), db, at(2000)), errorCode('not-found'));
  await db.doc(`bans/${f.uid}`).set({});
  await assert.rejects(remove(f.request, db, at(2000)), errorCode('permission-denied'));
});

test('competing distinct keys and independent moderators cannot decrement one comment twice', { skip: !enabled }, async () => {
  for (const secondActor of [false, true]) {
    const f = await fixture();
    let other = change(f.request, 'second');
    if (secondActor) {
      const uid = await actor();
      await db.doc(`accountRoles/${uid}`).set({ level: 3 });
      other = { ...other, auth: { ...other.auth, uid }, data: { ...other.data, expectedUserId: uid } };
    }
    const results = await Promise.allSettled([remove(f.request, db, at()), remove(other, db, at())]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'not-found');
    assert.equal((await f.shout.get()).data().commentsCount, 1);
  }
});

test('outsiders including the parent author and Business cannot delete another author comment', { skip: !enabled }, async () => {
  for (const level of [null, 1, 2, 2.5, '3']) {
    const f = await fixture();
    await f.comment.update({ authorId: 'another-author' });
    await f.shout.update({ authorId: f.uid });
    await db.doc(`users/${f.uid}`).update({ role: 'administrator', level: 5 });
    if (level !== null) await db.doc(`accountRoles/${f.uid}`).set({ level });
    await assert.rejects(remove(f.request, db, at()), errorCode('permission-denied'));
    assert.equal((await f.comment.get()).exists, true);
    assert.equal((await rate(f).get()).exists, false);
    assert.equal((await receipt(f).get()).exists, false);
  }
});

test('current trusted role or legacy membership permits moderators and revocation fences receipt replays', { skip: !enabled }, async () => {
  for (const mode of ['moderator', 'senior', 'admin', 'legacy']) {
    const f = await fixture();
    await f.comment.update({ authorId: 'another-author' });
    const ref = db.doc(`${mode === 'legacy' ? 'moderators' : 'accountRoles'}/${f.uid}`);
    await ref.set(mode === 'legacy' ? {} : { level: { moderator: 3, senior: 4, admin: 5 }[mode] });
    await remove(f.request, db, at());
    await remove(f.request, db, at(1000));
    await ref.delete();
    await assert.rejects(remove(f.request, db, at(2000)), errorCode('permission-denied'));
    assert.equal((await rate(f).get()).data().count, 1);
  }
});

test('missing targets, invalid counts and ineligible accounts cannot cause partial deletion', { skip: !enabled }, async () => {
  for (const mode of ['missing-parent','missing-comment','negative','null','fraction','other-counter','ban','deletion','profile','legal']) {
    const f = await fixture();
    if (mode === 'missing-parent') await f.shout.delete();
    if (mode === 'missing-comment') await f.comment.delete();
    if (mode === 'negative') await f.shout.update({ commentsCount: -1 });
    if (mode === 'null') await f.shout.update({ commentsCount: null });
    if (mode === 'fraction') await f.shout.update({ commentsCount: 0.5 });
    if (mode === 'other-counter') await f.shout.update({ likesCount: -1 });
    if (mode === 'ban') await db.doc(`bans/${f.uid}`).set({});
    if (mode === 'deletion') await db.doc(`accountDeletionRequests/${f.uid}`).set({});
    if (mode === 'profile') await db.doc(`users/${f.uid}`).delete();
    if (mode === 'legal') await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    await assert.rejects(remove(f.request, db, at()));
    assert.equal((await rate(f).get()).exists, false);
    assert.equal((await receipt(f).get()).exists, false);
    assert.equal((await f.comment.get()).exists, mode !== 'missing-comment');
  }
});

test('retained inactive Shouts, zero or missing count and content restrictions preserve legacy deletion behavior', { skip: !enabled }, async () => {
  for (const status of ['expired', 'deleted']) {
    for (const count of [0, undefined]) {
      const f = await fixture();
      await f.shout.update({ status, commentsCount: count === undefined ? FieldValue.delete() : count });
      await db.doc(`contentRestrictions/${f.uid}`).set({ expiresAt: Timestamp.fromMillis(now.getTime() + 60000) });
      await remove(f.request, db, at());
      assert.equal((await f.shout.get()).data().commentsCount, 0);
    }
  }
});

test('legacy delete rate state enforces cooldown and hourly reset without consuming failed attempts', { skip: !enabled }, async () => {
  const f = await fixture();
  await rate(f).set({ count: 120, lastEventId: 'old', lastAt: Timestamp.fromMillis(now.getTime() - 500),
    windowStartedAt: Timestamp.fromMillis(now.getTime() - 3599000) });
  await assert.rejects(remove(f.request, db, at()), errorCode('resource-exhausted'));
  await assert.rejects(remove(f.request, db, at(500)), errorCode('resource-exhausted'));
  assert.equal((await f.comment.get()).exists, true);
  assert.equal((await receipt(f).get()).exists, false);
  await remove(f.request, db, at(1000));
  assert.equal((await rate(f).get()).data().count, 1);
});
