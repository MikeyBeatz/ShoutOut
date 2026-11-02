import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { removeDeletedAccountReactions as remove } from './account_reaction_removal.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'reaction-removal-tests') : null;
const db = app ? getFirestore(app) : null, fixtures = [];
const absent = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
after(async () => {
  if (!db) return;
  for (const f of fixtures) {
    for (const row of (await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.uid).get()).docs) await db.recursiveDelete(row.ref);
    for (const root of [f.root, f.request, f.lease]) await db.recursiveDelete(root);
  }
  await db.terminate(); await deleteApp(app);
});

async function fixture() {
  const uid = randomUUID(), root = db.doc(`shouts/${randomUUID()}`), request = db.doc(`accountDeletionRequests/${uid}`), lease = db.doc(`reactionRemovalLab/${uid}`);
  await root.set({ authorId: 'other-author', title: 'Retain content', status: 'active', likesCount: 1, dislikesCount: 1 });
  await request.set({ userId: uid, status: 'pending' });
  const requestTime = (await request.get()).createTime; let millis = Date.now() + 100;
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(millis) });
  await lease.set({ token: 'first', removed: 0 });
  const identity = { projectId: db.projectId, userId: uid, requestCreateTime: requestTime };
  const options = { clock: () => new Date(millis), transactionGuard: async (tx, change) => {
    const current = await tx.get(lease); assert.equal(current.data().token, 'first', 'lost-lease');
    return () => { if (change.kind === 'reaction-removed') tx.update(lease, { removed: current.data().removed + 1 }); };
  } };
  const reaction = async (parent = root, type = 'like') => {
    const ref = parent.collection('reactions').doc(uid); await ref.set({ type, updatedAt: Timestamp.now() }); return ref;
  };
  const f = { uid, root, request, lease, identity, options, reaction,
    tick: value => { millis += value; },
    run: (refs, extra = {}, auth = absent) => remove(identity, db, auth, { ...options, reactionPaths: refs.map(r => r.path), ...extra }),
    archives: () => db.collection('accountContentArchive').where('retentionOwnerId', '==', uid).get() };
  fixtures.push(f); return f;
}

test('a foreign Shout like is removed, counted and archived atomically with the original deadline', { skip: !enabled }, async () => {
  const f = await fixture(), reaction = await f.reaction(), source = await reaction.get(), request = await f.request.get(), before = (await f.root.get()).data();
  const result = await f.run([reaction]); assert.equal(result.removed, 1);
  assert.deepEqual((await f.root.get()).data(), { ...before, likesCount: 0 }); assert.equal((await reaction.get()).exists, false);
  const archive = (await f.archives()).docs[0].data();
  assert.equal(archive.kind, 'shoutReaction'); assert.equal(archive.retentionOwnerId, f.uid); assert.deepEqual(archive.content, source.data());
  assert.ok(archive.sourceCreateTime.isEqual(source.createTime)); assert.equal(archive.counterAdjusted, true);
  assert.equal(archive.retainUntil.toMillis(), f.identity.requestCreateTime.toMillis() + 60 * 86400000);
  assert.ok((await f.request.get()).updateTime.isEqual(request.updateTime)); assert.equal((await f.lease.get()).data().removed, 1);
});

test('comment dislikes adjust only the comment and never the enclosing Shout or another actors vote', { skip: !enabled }, async () => {
  const f = await fixture(), comment = f.root.collection('comments').doc('comment');
  await comment.set({ authorId: 'comment-author', text: 'Keep text', likesCount: 2, dislikesCount: 1 });
  const source = await f.reaction(comment, 'dislike'), other = comment.collection('reactions').doc('other'); await other.set({ type: 'like', updatedAt: Timestamp.now() });
  const before = await f.root.get(), otherBefore = await other.get();
  assert.equal((await f.run([source], { indexWriter: { prepare() { assert.fail('no Shout counter changed'); } } })).removed, 1);
  assert.equal((await comment.get()).data().dislikesCount, 0); assert.equal((await comment.get()).data().likesCount, 2);
  assert.ok((await f.root.get()).updateTime.isEqual(before.updateTime)); assert.ok((await other.get()).updateTime.isEqual(otherBefore.updateTime));
  assert.equal((await f.archives()).docs[0].data().kind, 'commentReaction');
});

test('lost acknowledgement replay and concurrent duplicate removals subtract once', { skip: !enabled }, async () => {
  const f = await fixture(), source = await f.reaction();
  const results = await Promise.all([f.run([source]), f.run([source])]);
  assert.equal(results.reduce((n, r) => n + r.removed, 0), 1); assert.equal((await f.root.get()).data().likesCount, 0);
  assert.equal((await f.archives()).size, 1); assert.equal((await f.lease.get()).data().removed, 1);
  const rootBefore = await f.root.get(); assert.equal((await f.run([source])).removed, 0);
  assert.ok((await f.root.get()).updateTime.isEqual(rootBefore.updateTime));
});

test('own content is untouched and missing parents are drained without a counter write', { skip: !enabled }, async () => {
  const f = await fixture(); await f.root.update({ authorId: f.uid }); const own = await f.reaction();
  assert.equal((await f.run([own])).ownTargets, 1); assert.equal((await own.get()).exists, true);
  const parent = f.root.collection('comments').doc('gone'), orphan = await f.reaction(parent);
  const result = await f.run([orphan]); assert.equal(result.removed, 1); assert.equal(result.orphaned, 1);
  assert.equal((await parent.get()).exists, false); const archive = (await f.archives()).docs[0].data();
  assert.equal(archive.targetState, 'missing'); assert.equal(archive.counterAdjusted, false);
});

test('a recreated parent never loses a count to a surviving older reaction', { skip: !enabled }, async () => {
  const f = await fixture(), source = await f.reaction(); await f.root.delete();
  await f.root.set({ authorId: 'new-author', likesCount: 99, dislikesCount: 12 }); const before = await f.root.get();
  assert.equal((await f.run([source])).orphaned, 1); assert.ok((await f.root.get()).updateTime.isEqual(before.updateTime));
  assert.equal((await f.archives()).docs[0].data().targetState, 'recreated');
});

test('Auth presence, outages and missing confirmation cannot remove anything', { skip: !enabled }, async () => {
  const f = await fixture(), source = await f.reaction(), before = await source.get();
  assert.equal((await f.run([source], {}, { getUser: async () => ({ uid: f.uid }) })).state, 'waiting-for-auth-deletion');
  await assert.rejects(f.run([source], {}, { getUser: async () => { throw new Error('provider-outage'); } }), /provider-outage/);
  await f.request.update({ authDeletionConfirmedAt: FieldValue.delete() }); await assert.rejects(f.run([source]), /confirmation-or-retention/);
  assert.ok((await source.get()).updateTime.isEqual(before.updateTime)); assert.equal((await f.archives()).size, 0);
});

test('an older leaf modified after parent recreation is ambiguous and cannot change new counts', { skip: !enabled }, async () => {
  const f = await fixture(), source = await f.reaction(); await f.root.delete();
  await f.root.set({ authorId: 'new-author', likesCount: 8, dislikesCount: 0 });
  await source.update({ updatedAt: Timestamp.now() }); const before = await f.root.get();
  await assert.rejects(f.run([source]), /ambiguous-recreated/);
  assert.ok((await f.root.get()).updateTime.isEqual(before.updateTime)); assert.equal((await source.get()).exists, true);
  assert.equal((await f.archives()).size, 0);
});

test('replaced requests, lost leases and the exact 60-day boundary fail closed', { skip: !enabled }, async () => {
  const f = await fixture(), source = await f.reaction();
  await f.lease.update({ token: 'other' }); await assert.rejects(f.run([source]), /lost-lease/);
  await f.lease.update({ token: 'first' });
  await assert.rejects(f.run([source], { clock: () => new Date(f.identity.requestCreateTime.toMillis() + 60 * 86400000) }), /confirmation-or-retention/);
  const data = (await f.request.get()).data(); await f.request.delete(); await f.request.set(data);
  await assert.rejects(f.run([source]), /replaced/); assert.equal((await source.get()).exists, true); assert.equal((await f.archives()).size, 0);
});

test('counter underflow, unknown fields and unexpected descendants preserve the source', { skip: !enabled }, async () => {
  const f = await fixture(), source = await f.reaction(); await f.root.update({ likesCount: 0 });
  await assert.rejects(f.run([source]), /underflow/); await f.root.update({ likesCount: 1 });
  await source.update({ userId: 'forged' }); await assert.rejects(f.run([source]), /invalid-stored/);
  await source.update({ userId: FieldValue.delete(), unexpected: true }); await assert.rejects(f.run([source]), /invalid-stored/);
  await source.update({ unexpected: FieldValue.delete() }); await source.collection('unknown').doc('keep').set({ kept: true });
  await assert.rejects(f.run([source]), /unexpected-reaction-subcollections/);
  assert.equal((await source.get()).exists, true); assert.equal((await f.archives()).size, 0);
});

test('foreign paths, duplicate paths and unbounded pages are rejected before Auth access', { skip: !enabled }, async () => {
  const f = await fixture(), source = await f.reaction(), noAuth = { getUser() { assert.fail('invalid paths must not reach Auth'); } };
  for (const paths of [[f.root.path], [`${f.root.path}/reactions/another`], [source.path, source.path], Array(51).fill(source.path), []]) {
    await assert.rejects(remove(f.identity, db, noAuth, { ...f.options, reactionPaths: paths }), /invalid-/);
  }
});

test('index composition failures roll back archive, source, counts and progress together', { skip: !enabled }, async () => {
  const f = await fixture(), source = await f.reaction(), index = f.lease.collection('index').doc('entry'); let broken = true;
  const indexWriter = { async prepare(tx, id, before, after, { operationId }) {
    assert.equal(id, f.root.id); assert.equal(before.likesCount, 1); assert.equal(after.likesCount, 0); assert.equal(operationId.length, 64);
    await tx.get(index); return { apply() { tx.set(index, { updated: true }); if (broken) throw new Error('index-failed'); } };
  } };
  await assert.rejects(f.run([source], { indexWriter }), /index-failed/);
  assert.equal((await source.get()).exists, true); assert.equal((await f.archives()).size, 0);
  assert.equal((await f.root.get()).data().likesCount, 1); assert.equal((await index.get()).exists, false); assert.equal((await f.lease.get()).data().removed, 0);
  broken = false; assert.equal((await f.run([source], { indexWriter })).removed, 1); assert.equal((await index.get()).data().updated, true);
});

test('a concurrent foreign like is preserved while the owned vote is subtracted', { skip: !enabled }, async () => {
  const f = await fixture(), source = await f.reaction(), other = f.root.collection('reactions').doc('other');
  const result = await f.run([source], { beforeTransaction: async () => {
    await db.runTransaction(async tx => { const root = await tx.get(f.root); tx.create(other, { type: 'like', updatedAt: Timestamp.now() }); tx.update(f.root, { likesCount: root.data().likesCount + 1 }); });
  } });
  assert.equal(result.removed, 1); assert.equal((await f.root.get()).data().likesCount, 1); assert.equal((await other.get()).exists, true);
});
