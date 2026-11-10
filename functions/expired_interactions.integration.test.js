import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { operationTestKey } from './test_helpers.js';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';
import { toggleCommentReactionOperation } from './toggle_comment_reaction.js';
import { toggleShoutSaveOperation } from './toggle_shout_save.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'expired-interactions') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-11-10T12:00:00Z'), deadline = now.getTime() + 2000;
const operations = [toggleShoutReactionOperation, toggleCommentReactionOperation, toggleShoutSaveOperation];
async function fixture() {
  const uid = randomUUID(), shout = db.doc(`shouts/${randomUUID()}`), comment = shout.collection('comments').doc('comment');
  await db.doc(`users/${uid}`).set({ nickname: 'Expiry test' });
  await db.doc(`publicProfiles/${uid}`).set({ nickname: 'Expiry test' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  await shout.set({ authorId: uid, title: 'Expiry test', status: 'active', expiresAt: Timestamp.fromMillis(deadline),
    likesCount: 0, dislikesCount: 0, commentsCount: 1, savesCount: 0 });
  await comment.set({ authorId: uid, authorNickname: 'Expiry test', text: 'Comment', likesCount: 0, dislikesCount: 0 });
  return { uid, shout, comment, request(operation, label) { return {
    auth: { uid, token: { email_verified: true, email: 'expiry@example.test' } }, app: { appId: 'test' },
    data: { expectedUserId: uid, shoutId: shout.id, idempotencyKey: operationTestKey(label, now),
      ...(operation === toggleShoutSaveOperation ? {} : { button: 'like' }),
      ...(operation === toggleCommentReactionOperation ? { commentId: comment.id } : {}) },
  }; } };
}
const snapshot = async f => ({ source: (await f.shout.get()).data(), comment: (await f.comment.get()).data(),
  rate: (await db.doc(`rateLimits/${f.uid}/actions/interaction`).get()).data(),
  receipts: (await db.collection('serverOperations').where('userId', '==', f.uid).get()).size,
  reactions: (await f.shout.collection('reactions').get()).docs.map(d => d.data()),
  commentReactions: (await f.comment.collection('reactions').get()).docs.map(d => d.data()),
  saves: (await f.shout.collection('saves').get()).docs.map(d => d.data()),
  notices: (await db.doc(`users/${f.uid}`).collection('notifications').get()).size });
const closed = error => error.code === 'failed-precondition' && error.message === 'shout-interactions-closed';
for (const operation of operations) {
  test(`${operation.name}: expiry blocks adding, removing and switching without side effects; historical replay survives`, { skip: !enabled }, async () => {
    const f = await fixture(), first = f.request(operation, 'first');
    const result = await operation(first, db, () => now), before = await snapshot(f);
    for (const offset of [0, 1, 1000]) {
      const clock = () => new Date(deadline + offset);
      await assert.rejects(operation(f.request(operation, `remove-${offset}`), db, clock), closed);
      if (operation !== toggleShoutSaveOperation) {
        const changed = f.request(operation, `switch-${offset}`); changed.data.button = 'dislike';
        await assert.rejects(operation(changed, db, clock), closed);
      }
      assert.deepEqual(await operation(first, db, clock), result);
      assert.deepEqual(await snapshot(f), before);
    }
    const fresh = await fixture(), empty = await snapshot(fresh);
    await assert.rejects(operation(fresh.request(operation, 'add'), db, () => new Date(deadline)), closed);
    assert.deepEqual(await snapshot(fresh), empty);
  });
  test(`${operation.name}: status and invalid deadlines fail closed even before the time boundary`, { skip: !enabled }, async () => {
    for (const change of [{ status: 'expired' }, { status: 'deleted' }, { expiresAt: null }, { expiresAt: 'future' }, { contentPurged: true }]) {
      const f = await fixture(); await f.shout.update(change); const before = await snapshot(f);
      await assert.rejects(operation(f.request(operation, 'invalid'), db, () => now), closed);
      assert.deepEqual(await snapshot(f), before);
    }
  });
}
