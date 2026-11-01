import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { archiveAccountContentPage as archive, drainArchivedCommentReactionsPage as drain } from './account_content_archive.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'content-archive-tests') : null;
const db = app ? getFirestore(app) : null, fixtures = [];
const missing = { getUser() { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); } };
after(async () => {
  if (!app) return;
  for (const f of fixtures) {
    for (const row of (await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.uid).get()).docs) await db.recursiveDelete(row.ref);
    await db.recursiveDelete(f.shout); await f.request.delete(); await f.progress.delete();
  }
  await db.terminate(); await deleteApp(app);
});

async function fixture() {
  const uid = `u_${randomUUID()}`, shout = db.doc(`shouts/s_${randomUUID()}`);
  const request = db.doc(`accountDeletionRequests/${uid}`), progress = db.doc(`archiveLabState/${uid}`);
  await request.set({ userId: uid, status: 'pending' });
  const requestTime = (await request.get()).createTime; let millis = Date.now();
  const identity = { projectId: db.projectId, userId: uid, requestCreateTime: requestTime };
  await shout.set({ authorId: 'unrelated-shout-owner', commentsCount: 7 });
  await progress.set({ leaseToken: 'first', leaseUntil: Timestamp.fromMillis(millis + 120000), roots: 0, reactions: 0, pendingArchiveId: null });
  const guard = token => async (transaction, change) => {
    const snapshot = await transaction.get(progress), data = snapshot.data();
    if (data.leaseToken !== token || data.leaseUntil.toMillis() <= millis) throw new Error('lease-lost');
    if (change.kind === 'check') return () => {};
    if (change.kind === 'archive-root') {
      if (data.pendingArchiveId !== null) throw new Error('pending-reactions-required');
      return () => transaction.update(progress, { roots: data.roots + 1, pendingArchiveId: change.pendingArchiveId });
    }
    if (data.pendingArchiveId !== change.archiveId && !(data.pendingArchiveId === null && change.kind === 'reactions-complete')) throw new Error('wrong-pending-archive');
    return () => transaction.update(progress, change.kind === 'archive-reaction'
      ? { reactions: data.reactions + change.copied } : { pendingArchiveId: null });
  };
  const options = { pageSize: 50, clock: () => new Date(millis), transactionGuard: guard('first') };
  const f = { uid, shout, request, progress, identity, options, guard, tick: delta => { millis += delta; } };
  fixtures.push(f); return f;
}
async function message(f, id, authorId = f.uid, recipientId = 'other-user', extra = {}) {
  const ref = f.shout.collection('privateReplies').doc(id);
  await ref.set({ authorId, recipientId, participants: [authorId, recipientId], text: `Unreported ${id}`,
    createdAt: Timestamp.now(), authorNickname: 'Original author', recipientNickname: 'Original recipient', ...extra });
  return ref;
}
async function comment(f, id, authorId = f.uid) {
  const ref = f.shout.collection('comments').doc(id);
  await ref.set({ authorId, authorNickname: 'Original', text: 'Unreported public comment', createdAt: Timestamp.now(), likesCount: 2, dislikesCount: 0 });
  return ref;
}

test('outgoing and incoming unreported messages archive in full, excluding two other participants under the same Shout', { skip: !enabled }, async () => {
  const f = await fixture();
  const out = await message(f, 'out'), incoming = await message(f, 'in', 'other-user', f.uid);
  const foreign = await message(f, 'foreign', 'alice', 'bob', { participants: [f.uid, 'bob'] });
  const before = await db.getAll(out, incoming), result = await archive(f.identity, db, missing, { ...f.options, kind: 'privateReply' });
  assert.equal(result.archived, 2); assert.equal(result.state, 'content-page-complete');
  assert.equal((await foreign.get()).exists, true); assert((await db.getAll(out, incoming)).every(d => !d.exists));
  const rows = await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.uid).get();
  assert.equal(rows.size, 2);
  for (const row of rows.docs) {
    const data = row.data(), original = before.find(d => d.ref.path === data.sourcePath);
    assert.deepEqual(data.content, original.data()); assert(data.sourceCreateTime.isEqual(original.createTime));
    assert.equal(data.retainUntil.toMillis() - f.identity.requestCreateTime.toMillis(), 60 * 86400000);
  }
  assert.equal((await f.progress.get()).data().roots, 2);
  assert.equal((await archive(f.identity, db, missing, { ...f.options, kind: 'privateReply' })).archived, 0);
});

test('comment root and parent count change atomically, then reactions drain in bounded pages', { skip: !enabled }, async () => {
  const f = await fixture(), own = await comment(f, 'own'), foreign = await comment(f, 'foreign', 'alice');
  for (const id of ['alice', 'bob', 'charlie']) await own.collection('reactions').doc(id).set({ type: 'like', updatedAt: Timestamp.now() });
  const before = (await own.get()).data(), first = await archive(f.identity, db, missing, { ...f.options, kind: 'comment' });
  assert.equal(first.state, 'reactions-pending'); assert.equal(first.archived, 1);
  assert.equal((await f.shout.get()).data().commentsCount, 6); assert.equal((await foreign.get()).exists, true);
  assert.equal((await own.get()).exists, false);
  const archived = db.doc(`accountContentArchive/${first.archiveId}`);
  assert.deepEqual((await archived.get()).data().content, before);
  const page = await drain(f.identity, db, missing, { ...f.options, archiveId: first.archiveId, pageSize: 2 });
  assert.equal(page.copied, 2); assert.equal(page.state, 'continuation');
  assert.equal((await own.collection('reactions').get()).size, 1);
  const last = await drain(f.identity, db, missing, { ...f.options, archiveId: first.archiveId, pageSize: 2 });
  assert.equal(last.copied, 1); assert.equal(last.state, 'reactions-complete');
  assert.equal((await archived.collection('reactions').get()).size, 3);
  assert.equal((await own.collection('reactions').get()).size, 0);
  assert.equal((await archived.get()).data().reactionsComplete, true);
  const progress = (await f.progress.get()).data(); assert.equal(progress.roots, 1); assert.equal(progress.reactions, 3); assert.equal(progress.pendingArchiveId, null);
  await drain(f.identity, db, missing, { ...f.options, archiveId: first.archiveId });
  assert.equal((await f.shout.get()).data().commentsCount, 6); assert.equal((await f.progress.get()).data().reactions, 3);
});

test('archive/delete/progress survive a lost acknowledgement without duplicate snapshots', { skip: !enabled }, async () => {
  const f = await fixture(), source = await message(f, 'lost-ack'); let transactions = 0;
  const proxy = { projectId: db.projectId, doc: db.doc.bind(db), collectionGroup: db.collectionGroup.bind(db),
    async runTransaction(...args) { const result = await db.runTransaction(...args); if (++transactions === 1) throw new Error('ack lost'); return result; } };
  await assert.rejects(archive(f.identity, proxy, missing, { ...f.options, kind: 'privateReply' }), /ack lost/);
  assert.equal((await source.get()).exists, false); assert.equal((await f.progress.get()).data().roots, 1);
  assert.equal((await archive(f.identity, db, missing, { ...f.options, kind: 'privateReply' })).archived, 0);
  assert.equal((await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.uid).get()).size, 1);
});

test('a failed lease callback rolls back archive, source deletion and counter update together', { skip: !enabled }, async () => {
  const f = await fixture(), source = await comment(f, 'rollback');
  const options = { ...f.options, kind: 'comment', transactionGuard: async () => () => { throw new Error('injected lease failure'); } };
  await assert.rejects(archive(f.identity, db, missing, options), /injected lease failure/);
  assert.equal((await source.get()).exists, true); assert.equal((await f.shout.get()).data().commentsCount, 7);
  assert.equal((await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.uid).get()).size, 0);
  assert.equal((await f.progress.get()).data().roots, 0);
});

test('a takeover fences the stale worker before it can archive any source', { skip: !enabled }, async () => {
  const f = await fixture(), source = await message(f, 'takeover');
  await assert.rejects(archive(f.identity, db, missing, { ...f.options, kind: 'privateReply',
    async beforeTransaction() { await f.progress.update({ leaseToken: 'successor' }); } }), /lease-lost/);
  assert.equal((await source.get()).exists, true);
  const resumed = await archive(f.identity, db, missing, { ...f.options, kind: 'privateReply', transactionGuard: f.guard('successor') });
  assert.equal(resumed.archived, 1); assert.equal((await f.progress.get()).data().roots, 1);
});

test('replaced requests and existing Auth never authorize archive writes', { skip: !enabled }, async () => {
  const f = await fixture(), source = await message(f, 'fenced');
  assert.equal((await archive(f.identity, db, { getUser: async () => ({ uid: f.uid }) }, { ...f.options, kind: 'privateReply' })).state, 'waiting-for-auth-deletion');
  await assert.rejects(archive(f.identity, db, { getUser() { throw new Error('Auth outage'); } }, { ...f.options, kind: 'privateReply' }), /Auth outage/);
  await assert.rejects(archive(f.identity, db, missing, { ...f.options, kind: 'privateReply', async beforeTransaction() {
    await f.request.delete(); await f.request.set({ userId: f.uid, status: 'pending' });
  } }), /account-deletion-request-replaced/);
  assert.equal((await source.get()).exists, true); assert.equal((await f.progress.get()).data().roots, 0);
});

test('invalid participants and unknown descendants preserve their source for review', { skip: !enabled }, async () => {
  for (const invalid of [true, false]) {
    const f = await fixture(), source = await message(f, 'invalid', f.uid, 'other', invalid ? { participants: ['other', f.uid] } : {});
    if (!invalid) await source.collection('unexpected').doc('child').set({ keep: true });
    await assert.rejects(archive(f.identity, db, missing, { ...f.options, kind: 'privateReply' }), /invalid-archive-participants|unexpected-content-subcollections/);
    assert.equal((await source.get()).exists, true); assert.equal((await f.progress.get()).data().roots, 0);
  }
});

test('the original request deadline never extends on retries and expires exactly at 60 days', { skip: !enabled }, async () => {
  const f = await fixture(), source = await message(f, 'deadline');
  f.tick(60 * 86400000);
  await assert.rejects(archive(f.identity, db, missing, { ...f.options, kind: 'privateReply' }), /archive-retention-expired/);
  assert.equal((await source.get()).exists, true); assert.equal((await f.progress.get()).data().roots, 0);
});

test('a recreated comment prevents draining its new incarnation reactions', { skip: !enabled }, async () => {
  const f = await fixture(), source = await comment(f, 'recreated');
  await source.collection('reactions').doc('alice').set({ type: 'like' });
  const first = await archive(f.identity, db, missing, { ...f.options, kind: 'comment' });
  await source.set({ authorId: 'alice', text: 'new incarnation', createdAt: Timestamp.now() });
  await assert.rejects(drain(f.identity, db, missing, { ...f.options, archiveId: first.archiveId }), /comment-recreated-during-drain/);
  assert.equal((await source.collection('reactions').get()).size, 1);
});

test('one message page archives at most 50 roots and resumes incoming messages', { skip: !enabled }, async () => {
  const f = await fixture();
  for (let i = 0; i < 52; i++) await message(f, `bulk-${i}`, i < 21 ? f.uid : 'other', i < 21 ? 'other' : f.uid);
  const first = await archive(f.identity, db, missing, { ...f.options, kind: 'privateReply' });
  assert.equal(first.archived, 50); assert.equal(first.state, 'continuation');
  const last = await archive(f.identity, db, missing, { ...f.options, kind: 'privateReply' });
  assert.equal(last.archived, 2); assert.equal(last.state, 'content-page-complete'); assert.equal((await f.progress.get()).data().roots, 52);
});


test('two deleting participants race for one source without duplicating it or extending its deadline', { skip: !enabled }, async () => {
  const a = await fixture(), b = await fixture();
  const source = await message(a, 'shared', a.uid, b.uid);
  await Promise.all([archive(a.identity, db, missing, { ...a.options, kind: 'privateReply' }),
    archive(b.identity, db, missing, { ...b.options, kind: 'privateReply' })]);
  assert.equal((await source.get()).exists, false);
  const rows = await db.collection('accountContentArchive').where('sourcePath', '==', source.path).get();
  assert.equal(rows.size, 1);
  const data = rows.docs[0].data(), owner = data.retentionOwnerId === a.uid ? a : b;
  assert.equal(data.retainUntil.toMillis(), owner.identity.requestCreateTime.toMillis() + 60 * 86400000);
  assert.equal((await a.progress.get()).data().roots + (await b.progress.get()).data().roots, 1);
  const originalUpdateTime = rows.docs[0].updateTime;
  await archive(b.identity, db, missing, { ...b.options, kind: 'privateReply' });
  assert((await rows.docs[0].ref.get()).updateTime.isEqual(originalUpdateTime));
});

test('a lost reaction-copy acknowledgement resumes without copying or counting the same reaction twice', { skip: !enabled }, async () => {
  const f = await fixture(), source = await comment(f, 'reaction-lost');
  for (const id of ['alice', 'bob']) await source.collection('reactions').doc(id).set({ type: 'like', updatedAt: Timestamp.now() });
  const first = await archive(f.identity, db, missing, { ...f.options, kind: 'comment' });
  let transactions = 0;
  const proxy = { projectId: db.projectId, doc: db.doc.bind(db), async runTransaction(...args) {
    const result = await db.runTransaction(...args); if (++transactions === 1) throw new Error('reaction ack lost'); return result;
  } };
  await assert.rejects(drain(f.identity, proxy, missing, { ...f.options, archiveId: first.archiveId }), /reaction ack lost/);
  assert.equal((await f.progress.get()).data().reactions, 1);
  const resumed = await drain(f.identity, db, missing, { ...f.options, archiveId: first.archiveId });
  assert.equal(resumed.state, 'reactions-complete'); assert.equal(resumed.copied, 1);
  assert.equal((await f.progress.get()).data().reactions, 2);
  assert.equal((await db.doc(`accountContentArchive/${first.archiveId}`).collection('reactions').get()).size, 2);
});

test('an orphan comment still archives its full content without inventing a missing parent counter', { skip: !enabled }, async () => {
  const f = await fixture(), source = await comment(f, 'orphan'); await f.shout.delete();
  const result = await archive(f.identity, db, missing, { ...f.options, kind: 'comment' });
  const row = await db.doc(`accountContentArchive/${result.archiveId}`).get();
  assert.equal(row.data().parentMissing, true); assert.equal(row.data().content.text, 'Unreported public comment');
  assert.equal((await source.get()).exists, false); assert.equal((await f.shout.get()).exists, false);
});
