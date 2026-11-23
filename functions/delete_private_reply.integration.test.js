import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { deletePrivateReplyOperation as remove } from './delete_private_reply.js';
import { deleteCommentOperation } from './delete_comment.js';
import { archiveAccountContentPage as archive } from './account_content_archive.js';
import { receiptMayBePurged, cleanupExpiredOperationReceipts } from './cleanup_operation_receipts.js';
import { operationRetryWindowMillis as week } from './operation_retention.js';
import { operationTestKey } from './test_helpers.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'private-deletion-tests') : null;
const db = app ? getFirestore(app) : null, fixtures = [];
const code = expected => error => error.code === expected;
async function fixture() {
  const uid = randomUUID(), recipient = randomUUID(), shout = db.doc(`shouts/${randomUUID()}`);
  const source = shout.collection('privateReplies').doc(randomUUID());
  await db.doc(`users/${uid}`).set({ nickname: 'Deletion fixture' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  const parent = { authorId: recipient, title: 'Synthetic', status: 'active', commentsCount: 1, likesCount: 2, dislikesCount: 3, savesCount: 4 };
  await shout.set(parent);
  await source.set({ authorId: uid, recipientId: recipient, participants: [uid, recipient],
    authorNickname: 'Author fixture', recipientNickname: 'Recipient fixture', text: 'Private fixture', createdAt: Timestamp.now(), targetType: 'shout' });
  const now = new Date(), key = label => operationTestKey(label, now);
  const request = { auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { expectedUserId: uid, shoutId: shout.id, privateReplyId: source.id, idempotencyKey: key('first') } };
  const f = { uid, recipient, shout, source, now, key, request, parent, clock: (delta = 0) => () => new Date(now.getTime() + delta),
    receipt: label => db.doc(`serverOperations/${createHash('sha256').update(`${uid}\ndeletePrivateReply\n${key(label)}`).digest('hex')}`),
    rate: db.doc(`rateLimits/${uid}/actions/delete`) };
  fixtures.push(f); return f;
}
after(async () => {
  if (!app) return;
  for (const f of fixtures) {
    await db.recursiveDelete(f.shout); await db.recursiveDelete(db.doc(`users/${f.uid}`));
    await db.recursiveDelete(db.doc(`rateLimits/${f.uid}`));
    for (const name of ['bans', 'accountDeletionRequests', 'contentRestrictions', 'accountRoles', 'moderators']) await db.doc(`${name}/${f.uid}`).delete();
    const receipts = await db.collection('serverOperations').where('userId', '==', f.uid).get();
    await Promise.all(receipts.docs.map(row => row.ref.delete()));
    const records = await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.recipient).get();
    await Promise.all(records.docs.map(row => db.recursiveDelete(row.ref)));
    await db.doc(`accountDeletionRequests/${f.recipient}`).delete(); await db.doc(`privateDeletionLab/${f.uid}`).delete();
  }
  await db.terminate(); await deleteApp(app);
});
function meter(raw, { failReceipt = false } = {}) {
  const count = { reads: 0, writes: 0, paths: [] };
  const proxy = new Proxy(raw, { get(target, key) {
    if (key === 'runTransaction') return (run, options) => target.runTransaction(tx => {
      const wrapped = new Proxy(tx, { get(value, method) {
        if (['get', 'getAll'].includes(method)) return (...refs) => { count.reads += refs.length; count.paths.push(...refs.map(ref => ref.path)); return value[method](...refs); };
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => {
          if (method === 'create' && failReceipt) throw new Error('injected-receipt-failure');
          count.writes++; value[method](...args); return wrapped;
        };
        return typeof value[method] === 'function' ? value[method].bind(value) : value[method];
      } }); return run(wrapped);
    }, options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } }); return { db: proxy, count };
}

test('own deletion uses 8 SDK reads/3 writes, no parent/index access and a body-free private receipt', { skip: !enabled }, async () => {
  const f = await fixture(), parent = await f.shout.get(), metered = meter(db);
  assert.deepEqual(await remove(f.request, metered.db, f.clock()), { deleted: true });
  assert.equal((await f.source.get()).exists, false);
  assert((await f.shout.get()).updateTime.isEqual(parent.updateTime));
  assert.equal(metered.count.reads, 8); assert.equal(metered.count.writes, 3);
  assert(metered.count.paths.every(path => path !== f.shout.path && !path.startsWith('feedIndex')));
  const saved = (await f.receipt('first').get()).data();
  assert.deepEqual(Object.keys(saved).sort(), ['action', 'authorId', 'createdAt', 'expiresAt', 'fingerprint', 'keyVersion', 'privateReplyId', 'result', 'shoutId', 'userId']);
  assert.equal(saved.authorId, f.uid); assert.equal(saved.expiresAt.toMillis(), f.now.getTime() + week);
  assert.equal((await f.rate.get()).get('count'), 1);
  const replay = meter(db); assert.deepEqual(await remove(f.request, replay.db, f.clock(2000)), { deleted: true });
  assert.equal(replay.count.reads, 6); assert.equal(replay.count.writes, 0);
  writeFileSync(new URL('../build/private-deletion-measurement.json', import.meta.url), JSON.stringify({
    model: 'Emulator SDK operations, not cloud billing or latency', first: { reads: 8, writes: 3 }, replay: { reads: 6, writes: 0 }, parentOrIndexReads: 0,
  }, null, 2) + '\n');
});
test('four parallel retries commit once; a lost acknowledgement replays without another rate event', { skip: !enabled }, async () => {
  const f = await fixture();
  const result = await Promise.all(Array.from({ length: 4 }, () => remove(f.request, db, f.clock())));
  assert(result.every(row => row.deleted === true)); assert.equal((await f.rate.get()).get('count'), 1);
  assert.equal((await db.collection('serverOperations').where('userId', '==', f.uid).get()).size, 1);
  const other = { ...f.request, data: { ...f.request.data, privateReplyId: 'another' } };
  await assert.rejects(remove(other, db, f.clock(2000)), code('already-exists'));
  // Replay remains eligibility-gated even after the target is gone.
  await db.doc(`bans/${f.uid}`).set({}); await assert.rejects(remove(f.request, db, f.clock(2000)), code('permission-denied'));
});
test('distinct keys race for one root; exactly one consumes quota', { skip: !enabled }, async () => {
  const f = await fixture();
  const other = { ...f.request, data: { ...f.request.data, idempotencyKey: f.key('other') } };
  const results = await Promise.allSettled([remove(f.request, db, f.clock()), remove(other, db, f.clock())]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'not-found');
  assert.equal((await f.rate.get()).get('count'), 1);
});
test('foreign, recipient, parent-owner and moderator targets share the same unavailable response as a missing target', { skip: !enabled }, async () => {
  const f = await fixture(), errors = [];
  for (const mode of ['foreign', 'recipient', 'parent-owner', 'moderator', 'missing']) {
    await f.source.set({ authorId: mode === 'missing' ? f.uid : 'other', recipientId: f.uid });
    if (mode === 'parent-owner') await f.shout.update({ authorId: f.uid });
    if (mode === 'moderator') await db.doc(`accountRoles/${f.uid}`).set({ level: 6, role: 'owner' });
    if (mode === 'missing') await f.source.delete();
    try { await remove(f.request, db, f.clock()); assert.fail('unexpected deletion'); }
    catch (error) { errors.push([error.code, error.message]); }
    assert.equal((await f.rate.get()).exists, false); assert.equal((await f.receipt('first').get()).exists, false);
  }
  assert(errors.every(error => JSON.stringify(error) === JSON.stringify(errors[0])));
  assert.equal(errors[0][0], 'not-found');
});
test('ban, pending deletion and absent profile/legal reject atomically; creation restriction alone permits deletion', { skip: !enabled }, async () => {
  for (const mode of ['ban', 'pending', 'profile', 'legal', 'restriction']) {
    const f = await fixture();
    if (mode === 'ban') await db.doc(`bans/${f.uid}`).set({});
    if (mode === 'pending') await db.doc(`accountDeletionRequests/${f.uid}`).set({ status: 'pending' });
    if (mode === 'profile') await db.doc(`users/${f.uid}`).delete();
    if (mode === 'legal') await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    if (mode === 'restriction') await db.doc(`contentRestrictions/${f.uid}`).set({ expiresAt: Timestamp.fromMillis(f.now.getTime() + 60000) });
    if (mode === 'restriction') { await remove(f.request, db, f.clock()); continue; }
    await assert.rejects(remove(f.request, db, f.clock()));
    assert((await f.source.get()).exists); assert.equal((await f.rate.get()).exists, false);
    assert.equal((await f.receipt('first').get()).exists, false);
  }
});
test('expired, purged and missing parents preserve continuations, report evidence and existing archive', { skip: !enabled }, async () => {
  for (const mode of ['expired', 'purged', 'missing']) {
    const f = await fixture();
    if (mode === 'expired') await f.shout.update({ status: 'expired', expiresAt: Timestamp.fromMillis(f.now.getTime() - 1) });
    if (mode === 'purged') await f.shout.set({ schemaVersion: 1, status: 'deleted', contentPurged: true });
    if (mode === 'missing') await f.shout.delete();
    const continuation = f.shout.collection('privateReplies').doc('child'), report = db.doc(`privateReplyReports/${f.uid}`), existing = db.doc(`accountContentArchive/${f.uid}`);
    await continuation.set({ authorId: 'other', recipientId: f.uid, parentPrivateReplyId: f.source.id });
    await report.set({ text: 'Immutable report evidence', authorId: f.uid });
    await existing.set({ retentionOwnerId: f.recipient, content: { text: 'Retained evidence' } });
    const before = await db.getAll(continuation, report, existing);
    await remove(f.request, db, f.clock());
    const after = await db.getAll(continuation, report, existing);
    after.forEach((row, i) => assert(row.updateTime.isEqual(before[i].updateTime)));
    assert.equal((await f.shout.get()).exists, mode !== 'missing');
    await report.delete();
  }
});
test('private and comment deletion share cooldown/hourly budget without partial changes on refusal', { skip: !enabled }, async () => {
  const f = await fixture(), comment = f.shout.collection('comments').doc('comment');
  await comment.set({ authorId: f.uid, text: 'Comment' });
  await remove(f.request, db, f.clock());
  const input = { ...f.request, data: { expectedUserId: f.uid, shoutId: f.shout.id, commentId: comment.id, idempotencyKey: f.key('comment') } };
  await assert.rejects(deleteCommentOperation(input, db, f.clock(999)), code('resource-exhausted'));
  assert((await comment.get()).exists); assert.equal((await f.shout.get()).get('commentsCount'), 1);
  await deleteCommentOperation(input, db, f.clock(1000));
  assert.equal((await f.rate.get()).get('count'), 2);
  const next = await fixture();
  await next.rate.set({ lastAt: Timestamp.fromMillis(next.now.getTime() - 1000), windowStartedAt: Timestamp.fromMillis(next.now.getTime() - 3599999), count: 120 });
  await assert.rejects(remove(next.request, db, next.clock()), code('resource-exhausted'));
  assert((await next.source.get()).exists); await remove(next.request, db, next.clock(1));
  assert.equal((await next.rate.get()).get('count'), 1);
});
test('failure while staging the receipt rolls back deletion and quota together', { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(remove(f.request, meter(db, { failReceipt: true }).db, f.clock()), /injected-receipt-failure/);
  assert((await f.source.get()).exists); assert.equal((await f.rate.get()).exists, false);
  assert.equal((await f.receipt('first').get()).exists, false);
});

async function archival(f) {
  const request = db.doc(`accountDeletionRequests/${f.recipient}`), progress = db.doc(`privateDeletionLab/${f.uid}`);
  await request.set({ userId: f.recipient, status: 'pending' }); await progress.set({ roots: 0 });
  const identity = { projectId: db.projectId, userId: f.recipient, requestCreateTime: (await request.get()).createTime };
  return { identity, options: { kind: 'privateReply', clock: () => new Date(), transactionGuard: async (tx, change) => {
    const state = await tx.get(progress);
    return change.kind === 'archive-root' ? () => tx.update(progress, { roots: state.get('roots') + 1 }) : () => {};
  } } };
}
const missingAuth = { getUser() { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); } };
test('archive wins: own deletion sees unavailable and does not change the retained body or deadline', { skip: !enabled }, async () => {
  const f = await fixture(), a = await archival(f);
  assert.equal((await archive(a.identity, db, missingAuth, a.options)).archived, 1);
  const saved = (await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.recipient).get()).docs[0];
  await assert.rejects(remove(f.request, db, f.clock()), code('not-found'));
  assert((await saved.ref.get()).updateTime.isEqual(saved.updateTime));
  assert.equal(saved.get('content.text'), 'Private fixture');
  assert.equal(saved.get('retainUntil').toMillis(), a.identity.requestCreateTime.toMillis() + 60 * 86400000);
  assert.equal((await f.rate.get()).exists, false);
});
test('delete wins after archive selection: archive skips the vanished root without recreating it', { skip: !enabled }, async () => {
  const f = await fixture(), a = await archival(f); let once = false;
  const result = await archive(a.identity, db, missingAuth, { ...a.options, beforeTransaction: async () => {
    if (!once) { once = true; await remove(f.request, db, f.clock()); }
  } });
  assert(once); assert.equal(result.archived, 0); assert.equal((await f.source.get()).exists, false);
  assert.equal((await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.recipient).get()).size, 0);
  assert.equal((await f.rate.get()).get('count'), 1);
});
test('simultaneous archive and author deletion commit a single disposition and preserve other participants', { skip: !enabled }, async () => {
  const f = await fixture(), a = await archival(f), foreign = f.shout.collection('privateReplies').doc('foreign');
  await foreign.set({ authorId: 'alice', recipientId: 'bob', participants: ['alice', 'bob'], text: 'Unrelated', createdAt: Timestamp.now() });
  const untouched = await foreign.get();
  const outcomes = await Promise.allSettled([archive(a.identity, db, missingAuth, a.options), remove(f.request, db, f.clock())]);
  assert.equal(outcomes[0].status, 'fulfilled');
  const archived = (await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.recipient).get()).size;
  const deleted = (await f.receipt('first').get()).exists ? 1 : 0;
  assert.equal(archived + deleted, 1); assert.equal((await f.source.get()).exists, false);
  assert((await foreign.get()).updateTime.isEqual(untouched.updateTime));
  if (outcomes[1].status === 'rejected') assert.equal(outcomes[1].reason.code, 'not-found');
});
test('seven-day boundary expires receipt replay and permits existing bounded cleanup of the new action', { skip: !enabled }, async () => {
  const f = await fixture(); await remove(f.request, db, f.clock());
  assert.equal(receiptMayBePurged((await f.receipt('first').get()).data(), Timestamp.fromMillis(f.now.getTime() + week - 1)), false);
  await remove(f.request, db, f.clock(week - 1));
  await assert.rejects(remove(f.request, db, f.clock(week)), code('failed-precondition'));
  assert.equal(receiptMayBePurged((await f.receipt('first').get()).data(), Timestamp.fromMillis(f.now.getTime() + week)), true);
  await cleanupExpiredOperationReceipts(db, { clock: f.clock(week), maximum: 500 });
  assert.equal((await f.receipt('first').get()).exists, false);
  await assert.rejects(remove(f.request, db, f.clock(week)), code('failed-precondition'));
  assert.equal((await f.rate.get()).get('count'), 1);
});
