import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'shout-reaction-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-10-26T12:00:00Z');
const at = (ms = 0) => () => new Date(now.getTime() + ms);
async function actor() {
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set({ nickname: 'Private profile' });
  await db.doc(`publicProfiles/${uid}`).set({ nickname: 'Public author' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  return uid;
}
async function fixture() {
  const uid = await actor(), owner = randomUUID();
  const shoutRef = db.doc(`shouts/${randomUUID()}`);
  await shoutRef.set({ authorId: owner, title: 'Target', status: 'active',
    likesCount: 2, dislikesCount: 3, commentsCount: 4, savesCount: 5 });
  const request = { auth: { uid, token: { email: 'test@example.test', email_verified: true } },
    app: { appId: 'test-app' }, data: { idempotencyKey: 'first', shoutId: shoutRef.id, button: 'like' } };
  return { uid, owner, shoutRef, request };
}
const change = (request, key, button) => ({ ...request, data: { ...request.data, idempotencyKey: key, button } });
const notice = (uid, type, shoutId) => db.doc(`users/${uid}/notifications/reaction_${type}_${shoutId}`);
const rate = (uid) => db.doc(`rateLimits/${uid}/actions/interaction`);

test('add, switch and remove atomically update counters while only additions notify', { skip: !enabled }, async () => {
  const { uid, owner, shoutRef, request } = await fixture();
  assert.deepEqual(await toggleShoutReactionOperation(request, db, at()), { type: 'like', likes: 3, dislikes: 3 });
  assert.deepEqual(await toggleShoutReactionOperation(change(request, 'switch', 'dislike'), db, at(1000)), { type: 'dislike', likes: 2, dislikes: 4 });
  assert.deepEqual(await toggleShoutReactionOperation(change(request, 'remove', 'dislike'), db, at(2000)), { type: null, likes: 2, dislikes: 3 });
  assert.equal((await shoutRef.collection('reactions').doc(uid).get()).exists, false);
  const data = (await shoutRef.get()).data();
  assert.equal(data.commentsCount, 4);
  assert.equal(data.savesCount, 5);
  assert.equal((await rate(uid).get()).data().count, 3);
  assert.equal((await rate(uid).get()).data().lastEventId, `shoutReaction_${shoutRef.id}`);
  for (const type of ['like', 'dislike']) {
    const n = (await notice(owner, type, shoutRef.id).get()).data();
    assert.equal(n.eventCount, 1);
    assert.equal(n.actorNickname, 'Public author');
  }
});

test('concurrent retry applies one toggle and a later replay cannot reverse a newer action', { skip: !enabled }, async () => {
  const { uid, owner, shoutRef, request } = await fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => toggleShoutReactionOperation(request, db, at())));
  for (const result of results) assert.deepEqual(result, { type: 'like', likes: 3, dislikes: 3 });
  assert.equal((await rate(uid).get()).data().count, 1);
  assert.equal((await notice(owner, 'like', shoutRef.id).get()).data().eventCount, 1);
  await assert.rejects(toggleShoutReactionOperation(change(request, 'first', 'dislike'), db, at(1000)), (e) => e.code === 'already-exists');
  await toggleShoutReactionOperation(change(request, 'second', 'dislike'), db, at(1000));
  assert.deepEqual(await toggleShoutReactionOperation(request, db, at(2000)), results[0]);
  assert.equal((await shoutRef.collection('reactions').doc(uid).get()).data().type, 'dislike');
  assert.equal((await shoutRef.get()).data().likesCount, 2);
  assert.equal((await rate(uid).get()).data().count, 2);
});

test('parallel actors preserve totals and distinct operations by one actor obey cooldown', { skip: !enabled }, async () => {
  const f = await fixture();
  const other = await actor();
  await Promise.all([toggleShoutReactionOperation(f.request, db, at()),
    toggleShoutReactionOperation({ ...f.request, auth: { ...f.request.auth, uid: other } }, db, at())]);
  assert.equal((await f.shoutRef.get()).data().likesCount, 4);
  const g = await fixture();
  const results = await Promise.allSettled(['one', 'two'].map(key =>
    toggleShoutReactionOperation(change(g.request, key, 'like'), db, at())));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await g.shoutRef.get()).data().likesCount, 3);
  assert.equal((await rate(g.uid).get()).data().count, 1);
});

test('self reactions, opt-out and missing public profile skip notifications; removal ignores settings', { skip: !enabled }, async () => {
  for (const mode of ['self', 'disabled', 'missing-public', 'removal']) {
    const f = await fixture();
    if (mode === 'self') await f.shoutRef.update({ authorId: f.uid });
    if (mode === 'disabled') await db.doc(`users/${f.owner}/settings/notifications`).set({ reactions: false });
    if (mode === 'missing-public') await db.doc(`publicProfiles/${f.uid}`).delete();
    await toggleShoutReactionOperation(f.request, db, at());
    assert.equal((await notice(f.owner, 'like', f.shoutRef.id).get()).exists, mode === 'removal');
    if (mode === 'removal') {
      await db.doc(`users/${f.owner}/settings/notifications`).set({ reactions: 'damaged' });
      await toggleShoutReactionOperation(change(f.request, 'remove', 'like'), db, at(1000));
      assert.equal((await notice(f.owner, 'like', f.shoutRef.id).get()).data().eventCount, 1);
    }
  }
});

test('invalid account, counters, reaction and notification data leave no partial writes', { skip: !enabled }, async () => {
  for (const mode of ['ban', 'deletion', 'legal', 'counter', 'reaction', 'settings', 'missing']) {
    const f = await fixture();
    if (mode === 'ban') await db.doc(`bans/${f.uid}`).set({ permanent: true });
    if (mode === 'deletion') await db.doc(`accountDeletionRequests/${f.uid}`).set({});
    if (mode === 'legal') await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    if (mode === 'counter') await f.shoutRef.update({ likesCount: 0 });
    if (mode === 'counter' || mode === 'reaction') await f.shoutRef.collection('reactions').doc(f.uid).set({ type: mode === 'reaction' ? 'invalid' : 'like' });
    if (mode === 'settings') await db.doc(`users/${f.owner}/settings/notifications`).set({ reactions: 'invalid' });
    if (mode === 'missing') await f.shoutRef.delete();
    await assert.rejects(toggleShoutReactionOperation(f.request, db, at()));
    assert.equal((await rate(f.uid).get()).exists, false);
    assert.equal((await notice(f.owner, 'like', f.shoutRef.id).get()).exists, false);
    if (mode !== 'missing') assert.equal((await f.shoutRef.get()).data().dislikesCount, 3);
  }
});

test('shared hourly limit resets at boundary and content restrictions do not change reaction policy', { skip: !enabled }, async () => {
  const f = await fixture();
  await rate(f.uid).set({ lastAt: Timestamp.fromMillis(now.getTime() - 1000),
    windowStartedAt: Timestamp.fromMillis(now.getTime() - 3599000), count: 120, lastEventId: 'save_previous' });
  await assert.rejects(toggleShoutReactionOperation(f.request, db, at()), (e) => e.code === 'resource-exhausted');
  assert.equal((await f.shoutRef.collection('reactions').doc(f.uid).get()).exists, false);
  await db.doc(`contentRestrictions/${f.uid}`).set({ expiresAt: Timestamp.fromMillis(now.getTime() + 60000) });
  await f.shoutRef.update({ status: 'deleted' });
  await toggleShoutReactionOperation(f.request, db, at(1000));
  assert.equal((await rate(f.uid).get()).data().count, 1);
  assert.equal((await f.shoutRef.get()).data().likesCount, 3);
});
