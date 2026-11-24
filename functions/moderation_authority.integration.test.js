import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { deleteShoutOperation } from './delete_shout.js';
import { deleteCommentOperation } from './delete_comment.js';
import { managedModerationAuthorityEnabled } from './moderation_sanctions.js';
import { operationTestKey } from './test_helpers.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'moderation-authority') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const authorOnly = { authorOnly: true }, code = expected => error => error.code === expected;

async function fixture(t, kind, level) {
  const uid = randomUUID(), now = new Date(), shoutId = randomUUID(), commentId = randomUUID();
  const docs = [], add = async (path, value) => { const ref = db.doc(path); docs.push(ref); await ref.set(value); return ref; };
  await add(`users/${uid}`, { nickname: 'Synthetic authority actor' });
  await add(`users/${uid}/legal/acceptance_2026_07_25`, {});
  if (level) await add(`${level === 'legacy' ? 'moderators' : 'accountRoles'}/${uid}`, level === 'legacy' ? {} : { level });
  const shout = await add(`shouts/${shoutId}`, { authorId: uid, title: 'Synthetic authority', text: 'Body',
    status: 'active', expiresAt: Timestamp.fromMillis(0), likesCount: 2, dislikesCount: 0, savesCount: 1, commentsCount: 1 });
  const source = kind === 'Shout' ? shout : await add(`${shout.path}/comments/${commentId}`, { authorId: uid, text: 'Child' });
  const operation = kind === 'Shout' ? deleteShoutOperation : deleteCommentOperation;
  const request = { auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'web' },
    data: { expectedUserId: uid, shoutId, ...(kind === 'Comment' ? { commentId } : {}), idempotencyKey: operationTestKey('authority', now) } };
  t.after(async () => {
    for (const ref of docs.reverse()) await db.recursiveDelete(ref);
    for (const receipt of (await db.collection('serverOperations').where('userId', '==', uid).get()).docs) await receipt.ref.delete();
    await db.recursiveDelete(db.doc(`rateLimits/${uid}`));
  });
  return { uid, request, shout, source, operation, clock: () => now };
}

test('the generic deletion authority cutover remains disabled in this preparation', () => {
  assert.equal(managedModerationAuthorityEnabled, true);
});

for (const kind of ['Shout', 'Comment']) {
  test(`${kind}: owner deletion and replay remain available, including expired content`, { skip: !enabled }, async t => {
    for (const level of [null, 2, 3]) {
      const f = await fixture(t, kind, level);
      assert.deepEqual(await f.operation(f.request, db, f.clock, authorOnly), { deleted: true });
      const beforeReplay = await f.shout.get();
      assert.deepEqual(await f.operation(f.request, db, f.clock, authorOnly), { deleted: true });
      assert(beforeReplay.updateTime.isEqual((await f.shout.get()).updateTime));
      if (kind === 'Shout') assert.equal((await f.shout.get()).get('status'), 'deleted');
      else { assert.equal((await f.source.get()).exists, false); assert.equal((await f.shout.get()).get('commentsCount'), 0); }
    }
  });
  test(`${kind}: no current moderator/admin/legacy identity can bypass the audited foreign-content path`, { skip: !enabled }, async t => {
    for (const level of [3, 4, 5, 6, 'legacy']) {
      const f = await fixture(t, kind, level); await f.source.update({ authorId: 'foreign' });
      const before = await f.source.get(), parent = await f.shout.get();
      await assert.rejects(f.operation(f.request, db, f.clock, authorOnly), code('permission-denied'));
      assert(before.updateTime.isEqual((await f.source.get()).updateTime));
      assert(parent.updateTime.isEqual((await f.shout.get()).updateTime));
      assert.equal((await db.collection('serverOperations').where('userId', '==', f.uid).get()).size, 0);
      assert.equal((await db.doc(`rateLimits/${f.uid}/actions/delete`).get()).exists, false);
    }
  });
  test(`${kind}: a legacy foreign-content receipt cannot bypass the enabled authority gate`, { skip: !enabled }, async t => {
    const f = await fixture(t, kind, 5); await f.source.update({ authorId: 'foreign' });
    assert.deepEqual(await f.operation(f.request, db, f.clock), { deleted: true });
    await assert.rejects(f.operation(f.request, db, f.clock, authorOnly), code('permission-denied'));
  });
}

test('invalid authority configuration fails before any database access', async () => {
  for (const operation of [deleteShoutOperation, deleteCommentOperation]) {
    await assert.rejects(operation({}, null, () => new Date(), { authorOnly: 'true' }), /invalid-moderation-authority-option/);
  }
});
