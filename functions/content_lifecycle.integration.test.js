import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { createContentLifecycleDatabase, lifecycleTimes, lifecycleArchiveKey, lifecycleDay } from './content_lifecycle.js';
import { getLifecycleReportEvidenceOperation as readEvidence } from './content_lifecycle_evidence.js';
import { stepContentLifecycleTree, expireLifecycleAccountCopy, finishContentLifecycleThread } from './content_lifecycle_purge.js';
import { archiveAccountContentPage, drainArchivedCommentReactionsPage } from './account_content_archive.js';
import { decideContentReportsOperation } from './decide_content_reports.js';
import { removeReportedPublicContentOperation } from './remove_reported_public_content.js';
import { removeReportedPrivateReplyOperation } from './remove_reported_private_reply.js';
import { sanctionContentOperation } from './moderation_sanctions.js';
import { operationTestKey } from './test_helpers.js';
import { purgeScrubPatch } from './account_purge_policy.js';
import { runContentLifecycleMaintenance } from './content_lifecycle_maintenance.js';
import { createFeedRuntime } from './feed_runtime.js';
import { bodyProjection } from './feed_body_contract.js';
import { encodeGeohash } from './geohash.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
async function fixture(t, { writeBudget = 450, initialTime = new Date() } = {}) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), nonce = randomUUID().replaceAll('-', ''), shoutId = `lifecycle_${nonce}`;
  let now = new Date(initialTime);
  await raw.doc('contentLifecycleControl/current').set({ schemaVersion: 1, mode: 'active', revision: 1 });
  const source = { authorId: `author_${nonce}`, authorNickname: 'Synthetic author', title: 'Synthetic lifecycle', text: 'Synthetic original body',
    createdAt: Timestamp.fromDate(now), expiresAt: Timestamp.fromMillis(now.getTime() + lifecycleDay),
    geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, location: new GeoPoint(50.53, 14.13),
    status: 'active', likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: 0 };
  const db = createContentLifecycleDatabase(raw, { enabled: true, clock: () => now, writeBudget });
  const root = raw.doc(`shouts/${shoutId}`), cleanup = [], flatCleanup = [];
  t.after(async () => {
    await raw.recursiveDelete(root); await raw.recursiveDelete(raw.doc(`contentLifecycleThreads/${shoutId}`));
    for (const d of (await raw.collection('contentLifecycleArchive').where('threadId', '==', shoutId).get()).docs) await raw.recursiveDelete(d.ref);
    await raw.doc('contentLifecycleControl/current').delete();
    await raw.doc(`publicProfiles/${source.authorId}`).delete(); await raw.doc(`accountDeletionRequests/${source.authorId}`).delete();
    for (const doc of (await raw.collection('contentLifecycleJobs').where('threadId', '==', shoutId).get()).docs) await doc.ref.delete();
    for (const doc of (await raw.collection('accountContentArchive').where('sourceShoutId', '==', shoutId).get()).docs) await raw.recursiveDelete(doc.ref);
    for (const ref of cleanup) await raw.recursiveDelete(ref);
    for (let start = 0; start < flatCleanup.length; start += 400) {
      const batch = raw.batch(); for (const ref of flatCleanup.slice(start, start + 400)) batch.delete(ref); await batch.commit();
    }
    await raw.terminate();
  });
  return { raw, db, root, source, shoutId, cleanup, flatCleanup, setNow: value => { now = value; } };
}

test('creation archives unreported bodies atomically; closure shortens one shared deadline', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const created = await f.root.get(), header = await f.raw.doc(`contentLifecycleThreads/${f.shoutId}`).get();
  assert.equal(header.get('retainUntil').toMillis() - f.source.createdAt.toMillis(), 68 * lifecycleDay);
  assert(created.get('historyUntil').isEqual(header.get('historyUntil')));
  const key = created.get('contentArchiveKey'), archive = await f.raw.doc(`contentLifecycleArchive/${key}`).get();
  assert.equal(archive.get('content.text'), f.source.text);
  assert(archive.get('archivedAt') instanceof Timestamp);
  // Transform timestamps are audit times, not an SDK document createTime.
  // The immutable source binding is committed atomically with the archive.
  assert.equal(archive.get('sourceCreateTime'), undefined);
  assert(archive.get('sourceCreatedAt').isEqual(created.get('createdAt')));
  const child = f.root.collection('comments').doc('child');
  await f.db.runTransaction(async tx => {
    await tx.get(f.root);
    tx.create(child, { authorId: f.source.authorId, authorNickname: 'Synthetic author', text: 'Synthetic comment', createdAt: f.source.createdAt, likesCount: 0 });
    tx.update(f.root, { commentsCount: 1 });
  });
  const childArchive = await f.raw.doc(`contentLifecycleArchive/${(await child.get()).get('contentArchiveKey')}`).get();
  const oldChildVersion = childArchive.updateTime;
  f.setNow(new Date(f.source.createdAt.toMillis() + 3 * 3600000));
  await f.db.runTransaction(async tx => { await tx.get(f.root); tx.update(f.root, { status: 'deleted' }); });
  const closed = await f.raw.doc(`contentLifecycleThreads/${f.shoutId}`).get();
  assert.equal(closed.get('retainUntil').toMillis() - f.source.createdAt.toMillis(), 67 * lifecycleDay + 3 * 3600000);
  assert(oldChildVersion.isEqual((await childArchive.ref.get()).updateTime));
  await f.db.runTransaction(async tx => { await tx.get(child); tx.delete(child); });
  assert((await childArchive.ref.get()).exists); assert.equal((await f.root.get()).get('status'), 'deleted');
  assert.equal(lifecycleArchiveKey(f.raw.projectId, f.root.path, created.data()), key);
});

async function actor(f, level = 3, scope = { countries: ['CZ'] }) {
  const uid = `moderator_${randomUUID()}`;
  const profile = f.raw.doc(`users/${uid}`), role = f.raw.doc(`accountRoles/${uid}`);
  f.cleanup.push(profile, role);
  await profile.set({ nickname: 'Synthetic actor' });
  await profile.collection('legal').doc('acceptance_2026_07_25').set({});
  await role.set({ level, moderationScope: scope });
  return { uid, request: (targetType, reportId) => ({ auth: { uid, token: { email: 'synthetic@example.test', email_verified: true } },
    app: { appId: 'synthetic' }, data: { targetType, reportId, expectedUserId: uid } }) };
}

async function reportFixture(t, type) {
  const f = await fixture(t), mod = await actor(f);
  await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const source = type === 'shout' ? f.root : f.root.collection(type === 'comment' ? 'comments' : 'privateReplies').doc('target');
  if (type !== 'shout') await f.db.runTransaction(tx => tx.create(source, { authorId: f.source.authorId,
    text: 'Synthetic reported original', createdAt: f.source.createdAt,
    ...(type === 'privateReply' ? { recipientId: 'reporter', participants: [f.source.authorId, 'reporter'] } : {}) }));
  const collection = { shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' }[type];
  const report = f.raw.doc(`${collection}/reporter_${f.shoutId}${type === 'shout' ? '' : '_target'}`); f.cleanup.push(report);
  await f.db.runTransaction(async tx => {
    await tx.get(source); tx.create(report, { reporterId: 'reporter', shoutId: f.shoutId,
      createdAt: Timestamp.now(), status: 'open', reason: 'Synthetic report',
      ...(type === 'comment' ? { commentId: source.id } : type === 'privateReply' ? { privateReplyId: source.id } : {}) });
  });
  f.cleanup.push(f.raw.doc(`moderationClearances/${type}_${f.shoutId}${type === 'shout' ? '' : '_target'}`));
  return { ...f, mod, source, report, type, request: decision => ({ ...mod.request(type, report.id), data: {
    expectedUserId: mod.uid, targetType: type, shoutId: f.shoutId, ...(type === 'shout' ? {} : { targetId: source.id }),
    reportIds: [report.id], decision, note: 'Synthetic decision', idempotencyKey: operationTestKey(`${type}_${decision}`, new Date()),
  } }), async preserveReceipt(request, action) {
    // Capture the exact resulting receipt for fixture-only cleanup.
    const { createHash } = await import('node:crypto');
    const key = createHash('sha256').update(`${mod.uid}\n${action}\n${request.data.idempotencyKey}`).digest('hex');
    f.cleanup.push(f.raw.doc(`serverOperations/${key}`)); return key;
  } };
}

for (const type of ['shout', 'comment', 'privateReply']) {
  test(`immutable ${type} evidence supports decisions after the source and parent disappear; replay keeps authority checks`, { skip: !enabled }, async t => {
    const f = await reportFixture(t, type);
    await f.db.runTransaction(async tx => { await tx.getAll(f.source, f.root); tx.delete(f.source); if (type !== 'shout') tx.delete(f.root); });
    const request = f.request('approve'); await f.preserveReceipt(request, 'decideContentReports');
    assert.deepEqual(await decideContentReportsOperation(request, f.db), { decision: 'approve', count: 1 });
    assert.equal((await f.report.get()).get('resolution'), 'contentApproved');
    assert.deepEqual(await decideContentReportsOperation(request, f.db), { decision: 'approve', count: 1 });
    await f.raw.doc(`accountRoles/${f.mod.uid}`).update({ moderationScope: { countries: ['DE'] } });
    await assert.rejects(decideContentReportsOperation(request, f.db), e => e.code === 'permission-denied');
  });
  test(`archived ${type} removal closes the report atomically without restoring a missing source`, { skip: !enabled }, async t => {
    const f = await reportFixture(t, type);
    await f.db.runTransaction(async tx => { await tx.get(f.source); tx.delete(f.source); });
    const request = f.request('remove');
    const operation = type === 'privateReply' ? removeReportedPrivateReplyOperation : removeReportedPublicContentOperation;
    if (type === 'privateReply') request.data = { expectedUserId: f.mod.uid, reportId: f.report.id,
      idempotencyKey: request.data.idempotencyKey, note: 'Synthetic removal' };
    await f.preserveReceipt(request, type === 'privateReply' ? 'removeReportedPrivateReply' : 'removeReportedPublicContent');
    await operation(request, f.db);
    assert.equal((await f.report.get()).get('resolution'), 'contentRemoved');
    assert(!(await f.source.get()).exists);
    await operation(request, f.db);
  });
}

test('sanctions over a removed public source retain a reference, never a fresh full body copy', { skip: !enabled }, async t => {
  const f = await reportFixture(t, 'comment');
  // Use the source's owner, without deriving an identity from a path segment.
  const owner = (await f.source.get()).get('authorId');
  const actualProfile = f.raw.doc(`users/${owner}`); f.cleanup.push(actualProfile); await actualProfile.set({ nickname: 'Synthetic target' });
  await f.db.runTransaction(async tx => { await tx.get(f.source); tx.delete(f.source); });
  const request = f.request('warning'); Object.assign(request.data, { mode: 'report', expectedTargetUserId: owner, sourceReportId: f.report.id });
  const receipt = await f.preserveReceipt(request, 'sanctionContent');
  f.cleanup.push(f.raw.doc(`sanctions/${receipt}`), f.raw.doc(`warnings/${receipt}`));
  const result = await sanctionContentOperation(request, f.db);
  assert.equal(result.sanctionId, receipt);
  const stored = (await f.raw.doc(`sanctions/${receipt}`).get()).data();
  assert.equal(stored.contentSnapshot.text, undefined); assert.equal(stored.contentSnapshot.title, undefined);
  assert.equal(stored.contentArchiveKey, (await f.report.get()).get('contentArchiveKey'));
  assert(!JSON.stringify(stored).includes('Synthetic reported original'));
});

test('an anonymous account context is not mistaken for a replacement Shout when deciding its retained report', { skip: !enabled }, async t => {
  const f = await reportFixture(t, 'shout');
  await f.db.runTransaction(async tx => {
    await tx.get(f.root); tx.set(f.root, { schemaVersion: 1, contentPurged: true, status: 'deleted' });
  });
  const request = f.request('approve'); await f.preserveReceipt(request, 'decideContentReports');
  assert.deepEqual(await decideContentReportsOperation(request, f.db), { decision: 'approve', count: 1 });
  assert.equal((await f.root.get()).get('contentPurged'), true);
  assert.equal((await f.root.get()).get('title'), undefined);
});

test('report-only reader preserves private evidence after source/parent deletion, with scope and exact cutoff', { skip: !enabled }, async t => {
  const f = await fixture(t), mod = await actor(f);
  delete f.source.geography.subdivisionCode; // Country-only authority remains valid.
  await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const reply = f.root.collection('privateReplies').doc('reported'), recipient = 'recipient';
  await f.db.runTransaction(tx => tx.create(reply, { authorId: f.source.authorId, recipientId: recipient,
    participants: [f.source.authorId, recipient], text: 'Only this reported message', createdAt: f.source.createdAt }));
  const report = f.raw.doc(`privateReplyReports/${recipient}_${f.shoutId}_${reply.id}`); f.cleanup.push(report);
  await f.db.runTransaction(async tx => {
    await tx.get(reply);
    tx.create(report, { shoutId: f.shoutId, privateReplyId: reply.id, reporterId: recipient,
      status: 'open', reason: 'Synthetic evidence', createdAt: Timestamp.now() });
  });
  await f.db.runTransaction(async tx => { await tx.getAll(reply, f.root); tx.delete(reply); tx.delete(f.root); });
  const req = mod.request('privateReply', report.id), result = await readEvidence(req, f.db);
  assert.equal(result.targetData.text, 'Only this reported message');
  assert.equal(result.targetData.participants, undefined); assert.equal(result.targetData.recipientId, undefined);
  assert.equal(result.targetData.location, undefined);
  const archive = f.raw.doc(`contentLifecycleArchive/${(await report.get()).get('contentArchiveKey')}`);
  const audits = await archive.collection('accessAudits').get(); assert.equal(audits.size, 1);
  assert(!JSON.stringify(audits.docs[0].data()).includes('Only this reported message'));
  await assert.rejects(readEvidence({ ...req, data: { ...req.data, archiveKey: archive.id } }, f.db), e => e.code === 'invalid-argument');
  await assert.rejects(readEvidence({ ...req, app: undefined }, f.db), e => e.code === 'unauthenticated');
  await f.raw.doc(`accountRoles/${mod.uid}`).update({ moderationScope: { countries: ['DE'] } });
  await assert.rejects(readEvidence(req, f.db), e => e.code === 'permission-denied');
  await f.raw.doc(`accountRoles/${mod.uid}`).update({ moderationScope: { countries: ['CZ'] } });
  await assert.rejects(readEvidence(req, f.db, () => new Date(result.retainUntilMillis)), e => e.code === 'not-found');
  await f.raw.doc(`publicProfiles/${f.source.authorId}`).set({ accountStatus: 'deleted' });
  await assert.rejects(readEvidence(req, f.db), e => e.code === 'not-found');
  assert.equal((await archive.collection('accessAudits').get()).size, 1);
});

function pagerFor(f) {
  return { async list(path, token) {
    const refs = (await f.raw.collection(path).listDocuments()).map(r => r.path).sort();
    const after = token === null ? refs : refs.filter(p => p > token), paths = after.slice(0, 1);
    return { paths, next: after.length > 1 ? paths[0] : null };
  } };
}
test('bounded source drain resumes a missing-parent tree and archive drain removes access audits only at deadline', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const comment = f.root.collection('comments').doc('removed');
  await f.db.runTransaction(tx => tx.create(comment, { authorId: f.source.authorId, text: 'Synthetic comment', createdAt: f.source.createdAt }));
  await comment.collection('reactions').doc('voter').create({ userId: 'voter', value: 1 });
  const key = (await comment.get()).get('contentArchiveKey');
  await f.db.runTransaction(async tx => { await tx.get(comment); tx.delete(comment); });
  const options = { threadId: f.shoutId, kind: 'source', pager: pagerFor(f),
    indexWriter: { prepare: async () => ({ apply() {} }) }, clock: () => f.source.createdAt.toDate() };
  await assert.rejects(stepContentLifecycleTree(f.db, options), /not-due/);
  options.clock = () => lifecycleTimes(f.source.expiresAt).historyUntil.toDate(); f.setNow(options.clock());
  let steps = 0, deleted = 0, state;
  do {
    // A new invocation reconstructs every bit of traversal from Firestore.
    const result = await stepContentLifecycleTree(f.db, { ...options }); state = result.state; deleted += result.deleted;
    assert(++steps < 60);
  } while (state !== 'complete');
  assert.equal(deleted, 2); assert(!(await f.root.get()).exists);
  assert(!(await comment.collection('reactions').doc('voter').get()).exists);
  const archive = f.raw.doc(`contentLifecycleArchive/${key}`); assert((await archive.get()).exists);
  await archive.collection('accessAudits').doc('audit').set({ actorId: 'moderator' });
  const purge = { ...options, kind: 'archive', archiveKey: key };
  await assert.rejects(stepContentLifecycleTree(f.db, purge), /not-due/);
  purge.clock = () => lifecycleTimes(f.source.expiresAt).retainUntil.toDate(); f.setNow(purge.clock()); steps = 0;
  do { state = (await stepContentLifecycleTree(f.db, purge)).state; assert(++steps < 30); } while (state !== 'complete');
  assert(!(await archive.get()).exists); assert((await archive.collection('accessAudits').get()).empty);
  assert.equal((await stepContentLifecycleTree(f.db, purge)).state, 'complete');
});

test('archive cleanup rejects changed sources, unknown descendants and a missing index plan without partial deletion', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const now = lifecycleTimes(f.source.expiresAt).historyUntil.toDate(); f.setNow(now);
  const options = { threadId: f.shoutId, kind: 'source', pager: pagerFor(f), clock: () => now };
  await f.root.collection('unknown').doc('protected').set({ preserve: true });
  await assert.rejects(stepContentLifecycleTree(f.db, options), /unknown-subcollection/);
  assert((await f.root.get()).exists);
  await f.raw.recursiveDelete(f.root.collection('unknown'));
  await stepContentLifecycleTree(f.db, options);
  await assert.rejects(stepContentLifecycleTree(f.db, options), /index-writer-required/);
  assert((await f.root.get()).exists);
  await assert.rejects(stepContentLifecycleTree(f.db, { ...options, indexWriter: { prepare: async () => null } }), /index-plan-required/);
  await assert.rejects(stepContentLifecycleTree(f.db, { ...options, indexWriter: { prepare: async () => ({ apply() {} }) },
    beforeCommit: async () => f.root.update({ likesCount: 77 }) }), /leaf-changed/);
  assert.equal((await f.root.get()).get('likesCount'), 77);
});

test('account copies inherit the earlier ordinary deadline and expired reactions drain without a fresh copy', { skip: !enabled }, async t => {
  const f = await fixture(t, { initialTime: new Date(Date.now() - 68 * lifecycleDay + 60000) });
  await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const comment = f.root.collection('comments').doc('account');
  await f.db.runTransaction(tx => tx.create(comment, { authorId: f.source.authorId, text: 'Synthetic account comment', createdAt: f.source.createdAt }));
  await comment.collection('reactions').doc('voter').set({ userId: 'voter', value: 1 });
  const deletion = f.raw.doc(`accountDeletionRequests/${f.source.authorId}`);
  await deletion.create({ userId: f.source.authorId, status: 'pending' });
  const identity = { projectId: f.raw.projectId, userId: f.source.authorId, requestCreateTime: (await deletion.get()).createTime };
  // For this laboratory boundary the ordinary thread has already ended.
  const earlier = lifecycleTimes(f.source.expiresAt).retainUntil;
  assert(earlier.toMillis() < identity.requestCreateTime.toMillis() + 60 * lifecycleDay);
  const missingAuth = { async getUser() { throw Object.assign(Error('Synthetic missing'), { code: 'auth/user-not-found' }); } };
  const opts = { kind: 'comment', transactionGuard: async () => () => {}, clock: () => new Date(earlier.toMillis() + 1) };
  f.setNow(opts.clock());
  const result = await archiveAccountContentPage(identity, f.db, missingAuth, opts);
  const copy = await f.raw.doc(`accountContentArchive/${result.archiveId}`).get();
  assert(copy.get('retainUntil').isEqual(earlier)); assert.deepEqual(copy.get('content'), {});
  const drained = await drainArchivedCommentReactionsPage(identity, f.db, missingAuth, { ...opts, archiveId: result.archiveId });
  assert.equal(drained.copied, 0); assert.equal(drained.state, 'reactions-complete');
  assert((await copy.ref.collection('reactions').get()).empty);
  assert((await comment.collection('reactions').get()).empty);
});

test('paused control, missing legacy binding, budget and thrown callback never partially publish', { skip: !enabled }, async t => {
  const f = await fixture(t, { writeBudget: 2 });
  await assert.rejects(f.db.runTransaction(tx => tx.create(f.root, f.source)), /write-budget/);
  assert(!(await f.root.get()).exists); assert((await f.raw.collection('contentLifecycleArchive').where('threadId', '==', f.shoutId).get()).empty);
  const normal = createContentLifecycleDatabase(f.raw, { enabled: true });
  await assert.rejects(normal.runTransaction(tx => { tx.create(f.root, f.source); throw Error('injected-rollback'); }), /injected-rollback/);
  assert(!(await f.root.get()).exists);
  await f.raw.doc('contentLifecycleControl/current').update({ mode: 'paused', revision: 2 });
  await assert.rejects(normal.runTransaction(tx => tx.create(f.root, f.source)), /not active/);
  assert(!(await f.root.get()).exists);
  await f.raw.doc('contentLifecycleControl/current').update({ mode: 'active', revision: 3 });
  await f.root.create(f.source);
  await assert.rejects(normal.runTransaction(async tx => { await tx.get(f.root); tx.update(f.root, { status: 'deleted' }); }), /migration/);
  assert.equal((await f.root.get()).get('status'), 'active');
});

test('all report types bind to immutable versions, without another copy or private text', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const reply = f.root.collection('privateReplies').doc('reply'), recipient = 'recipient';
  await f.db.runTransaction(tx => tx.create(reply, { authorId: f.source.authorId, recipientId: recipient,
    participants: [f.source.authorId, recipient], text: 'Synthetic private text', createdAt: f.source.createdAt }));
  const reported = f.raw.doc(`privateReplyReports/${f.shoutId}`); f.cleanup.push(reported);
  const archive = await f.raw.doc(`contentLifecycleArchive/${(await reply.get()).get('contentArchiveKey')}`).get();
  await f.db.runTransaction(async tx => {
    await tx.get(reply);
    tx.create(reported, { shoutId: f.shoutId, privateReplyId: reply.id, reporterId: recipient, reason: 'Synthetic report', text: 'Synthetic private text' });
  });
  const data = (await reported.get()).data(); assert.equal(data.contentArchiveKey, archive.id); assert.equal(data.text, undefined);
  assert(archive.updateTime.isEqual((await archive.ref.get()).updateTime));
  await f.db.runTransaction(async tx => { await tx.get(reply); tx.delete(reply); });
  assert((await archive.ref.get()).exists);
});

test('counter-only mutations avoid archive writes; first account boundary fences new copies', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const created = await f.root.get(), key = created.get('contentArchiveKey'), archive = await f.raw.doc(`contentLifecycleArchive/${key}`).get();
  await f.db.runTransaction(async tx => { await tx.get(f.root); tx.update(f.root, { likesCount: 1 }); });
  assert(archive.updateTime.isEqual((await archive.ref.get()).updateTime));
  await f.raw.doc(`publicProfiles/${f.source.authorId}`).set({ schemaVersion: 1, accountStatus: 'deleted' });
  const child = f.root.collection('comments').doc('blocked');
  await assert.rejects(f.db.runTransaction(tx => tx.create(child, { authorId: f.source.authorId, text: 'Cannot restore', createdAt: f.source.createdAt })), /Deleted accounts/);
  assert(!(await child.get()).exists);
  const end = lifecycleTimes(f.source.expiresAt).retainUntil.toMillis(); f.setNow(new Date(end));
  await f.db.runTransaction(async tx => { await tx.get(f.root); tx.delete(f.root); });
  assert(!(await f.root.get()).exists); assert.equal((await archive.ref.get()).get('content.text'), f.source.text);
});

function metered(raw) {
  const counts = { reads: 0, writes: 0 };
  const db = new Proxy(raw, { get(target, key) {
    if (key !== 'runTransaction') return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    return callback => target.runTransaction(tx => callback(new Proxy(tx, { get(transaction, method) {
      if (['get', 'getAll'].includes(method)) return async (...args) => {
        const result = await transaction[method](...args);
        counts.reads += Array.isArray(result) ? result.length : result.docs ? Math.max(1, result.size) : 1;
        return result;
      };
      if (['create', 'update', 'set', 'delete'].includes(method)) return (...args) => { counts.writes++; return transaction[method](...args); };
      return typeof transaction[method] === 'function' ? transaction[method].bind(transaction) : transaction[method];
    } })));
  } });
  return { db, counts };
}

test('a fifty-source archive batch reuses account guards and respects the joint 450-write budget', { skip: !enabled }, async t => {
  const f = await fixture(t), measured = metered(f.raw);
  const db = createContentLifecycleDatabase(measured.db, { enabled: true });
  const sources = Array.from({ length: 50 }, (_, n) => {
    const ref = f.raw.doc(`shouts/${f.shoutId}_${n}`), body = { ...f.source, title: `Synthetic ${n}` };
    f.flatCleanup.push(ref, f.raw.doc(`contentLifecycleThreads/${ref.id}`), f.raw.doc(`contentLifecycleArchive/${lifecycleArchiveKey(f.raw.projectId, ref.path, body)}`));
    return { ref, body };
  });
  await db.runTransaction(tx => { for (const s of sources) tx.create(s.ref, s.body); });
  assert.deepEqual(measured.counts, { reads: 153, writes: 150 });
  const counter = metered(f.raw), counterDb = createContentLifecycleDatabase(counter.db, { enabled: true });
  await counterDb.runTransaction(async tx => { await tx.get(sources[0].ref); tx.update(sources[0].ref, { likesCount: 2 }); });
  assert.deepEqual(counter.counts, { reads: 1, writes: 1 });
  const newSources = sources.map((s, n) => ({ ref: f.raw.doc(`shouts/${f.shoutId}_extra${n}`), body: s.body }));
  for (const s of newSources) f.flatCleanup.push(s.ref, f.raw.doc(`contentLifecycleThreads/${s.ref.id}`), f.raw.doc(`contentLifecycleArchive/${lifecycleArchiveKey(f.raw.projectId, s.ref.path, s.body)}`));
  const extra = f.raw.doc(`shouts/${f.shoutId}_extra50`); f.flatCleanup.push(extra);
  await assert.rejects(db.runTransaction(tx => {
    for (const s of newSources) tx.create(s.ref, s.body); tx.create(extra, f.source);
  }), /exceeds 50/);
  const technical = Array.from({ length: 301 }, (_, n) => f.raw.doc(`lifecycleTestCounters/${f.shoutId}_${n}`)); f.flatCleanup.push(...technical);
  await assert.rejects(db.runTransaction(tx => {
    for (const s of newSources) tx.create(s.ref, s.body);
    for (const ref of technical) tx.create(ref, { fixture: true });
  }), /write-budget/);
  assert(!(await newSources[0].ref.get()).exists); assert(!(await technical[0].get()).exists);
});

test('final completion removes technical traversal journals and the thread after every body is gone', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.db.runTransaction(tx => tx.create(f.root, f.source));
  let now = lifecycleTimes(f.source.expiresAt).historyUntil.toDate(); f.setNow(now);
  const opts = { threadId: f.shoutId, pager: pagerFor(f), clock: () => now, indexWriter: { prepare: async () => ({ apply() {} }) } };
  let steps = 0;
  while ((await stepContentLifecycleTree(f.db, { ...opts, kind: 'source' })).state !== 'complete') assert(++steps < 20);
  now = lifecycleTimes(f.source.expiresAt).retainUntil.toDate(); f.setNow(now);
  assert.equal((await finishContentLifecycleThread(f.db, opts)).state, 'continuation');
  const key = lifecycleArchiveKey(f.raw.projectId, f.root.path, f.source); steps = 0;
  while ((await stepContentLifecycleTree(f.db, { ...opts, kind: 'archive', archiveKey: key })).state !== 'complete') assert(++steps < 20);
  assert.equal((await finishContentLifecycleThread(f.db, opts)).state, 'complete');
  assert(!(await f.raw.doc(`contentLifecycleThreads/${f.shoutId}`).get()).exists);
  assert((await f.raw.collection('contentLifecycleJobs').where('threadId', '==', f.shoutId).get()).empty);
  assert.equal((await finishContentLifecycleThread(f.db, opts)).state, 'complete');
});

test('expired account copies lose body, reactions and audits while preserving a resumable account header', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const requestTime = Timestamp.fromDate(new Date());
  const copy = f.raw.doc(`accountContentArchive/${'a'.repeat(64)}`); f.cleanup.push(copy);
  const end = lifecycleTimes(f.source.expiresAt).retainUntil;
  const requestAt = Timestamp.fromMillis(end.toMillis() - 30 * lifecycleDay);
  assert(requestAt.toMillis() > requestTime.toMillis());
  await copy.create({ sourceShoutId: f.shoutId, requestCreateTime: requestAt, retainUntil: end,
    ordinaryRetainUntil: end, contentArchiveKey: lifecycleArchiveKey(f.raw.projectId, f.root.path, f.source),
    contentExpired: false, reactionsComplete: false, content: { text: 'Must disappear' } });
  await copy.collection('reactions').doc('a').set({ actorId: 'a' });
  await copy.collection('accessAudits').doc('b').set({ actorId: 'b' });
  const options = { threadId: f.shoutId, clock: () => end.toDate(), pageSize: 1 };
  let steps = 0, deleted = 0, result;
  do { result = await expireLifecycleAccountCopy(f.db, options); deleted += result.deleted; assert(++steps < 6); } while (result.state !== 'complete');
  assert.equal(deleted, 2); const header = (await copy.get()).data();
  assert.deepEqual(header.content, {}); assert.equal(header.reactionsComplete, false);
  assert.equal(header.contentExpired, true); assert(header.requestCreateTime.isEqual(requestAt));
});

test('account-reference anonymization preserves a foreign reported reply and rejects unrelated edits after history', { skip: !enabled }, async t => {
  const f = await fixture(t), mod = await actor(f);
  await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const reply = f.root.collection('comments').doc('foreign');
  await f.db.runTransaction(tx => tx.create(reply, { authorId: 'foreign-author', authorNickname: 'Foreign', createdAt: f.source.createdAt,
    text: '@Original Preserve this reply', replyToCommentId: 'original', replyToNickname: 'Original' }));
  const original = await reply.get(), archive = f.raw.doc(`contentLifecycleArchive/${original.get('contentArchiveKey')}`);
  const report = f.raw.doc(`commentReports/reporter_${f.shoutId}_foreign`); f.cleanup.push(report);
  await f.db.runTransaction(async tx => { await tx.get(reply); tx.create(report, {
    reporterId: 'reporter', shoutId: f.shoutId, commentId: 'foreign', reason: 'Synthetic report', status: 'open', createdAt: Timestamp.now(),
  }); });
  const later = new Date(f.source.createdAt.toMillis() + 9 * lifecycleDay); f.setNow(later);
  await f.db.runTransaction(async tx => { const source = await tx.get(reply); tx.update(reply, purgeScrubPatch(source.data(), 'reply')); });
  await f.db.runTransaction(async tx => { const source = await tx.get(archive); tx.update(archive, purgeScrubPatch(source.data(), 'lifecycleReply')); });
  const view = await readEvidence(mod.request('comment', report.id), f.db, () => later);
  assert.equal(view.targetData.text, 'Preserve this reply'); assert.equal(view.privacyRedacted, true);
  assert.equal((await archive.get()).get('content.replyToNickname'), undefined);
  await assert.rejects(f.db.runTransaction(async tx => { await tx.get(reply); tx.update(reply, { text: 'Unrelated rewrite' }); }), /cannot be changed/);
  assert.equal((await reply.get()).get('text'), 'Preserve this reply');
});

test('the inactive adapter resumes source, report, archive and technical cleanup across cold one-step invocations', { skip: !enabled }, async t => {
  const f = await reportFixture(t, 'comment');
  const header = await f.raw.doc(`contentLifecycleThreads/${f.shoutId}`).get();
  let now = header.get('historyUntil').toDate(); f.setNow(now);
  const options = { maxSteps: 1, maxElapsedMillis: 10000, retryDelayMillis: 60000, clock: () => now,
    pager: pagerFor(f), indexWriter: { prepare: async () => ({ apply() {} }) } };
  let result, calls = 0;
  do { result = await runContentLifecycleMaintenance(f.db, options); assert(++calls < 60); assert(result.steps <= 1); } while (result.state !== 'idle');
  assert(!(await f.root.get()).exists); assert(!(await f.source.get()).exists);
  assert((await f.report.get()).exists);
  assert.equal((await f.raw.doc(`contentLifecycleThreads/${f.shoutId}`).get()).get('maintenancePhase'), 'copies');
  now = header.get('retainUntil').toDate(); f.setNow(now); calls = 0;
  do { result = await runContentLifecycleMaintenance(f.db, options); assert(++calls < 80); } while (result.state !== 'idle');
  assert(!(await f.report.get()).exists);
  assert(!(await f.raw.doc(`contentLifecycleThreads/${f.shoutId}`).get()).exists);
  assert((await f.raw.collection('contentLifecycleArchive').where('threadId', '==', f.shoutId).get()).empty);
  assert((await f.raw.collection('contentLifecycleJobs').where('threadId', '==', f.shoutId).get()).empty);
});

test('maintenance observes pause/time bounds and quarantines malformed descendants without deleting their data', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.db.runTransaction(tx => tx.create(f.root, f.source));
  const now = lifecycleTimes(f.source.expiresAt).historyUntil.toDate(); f.setNow(now);
  const options = { maxSteps: 32, maxElapsedMillis: 10000, retryDelayMillis: 60000, clock: () => now, pager: pagerFor(f) };
  let tick = 0;
  const bounded = await runContentLifecycleMaintenance(f.db, { ...options, maxElapsedMillis: 1, workClock: () => ++tick });
  assert.equal(bounded.steps, 0); assert((await f.root.get()).exists);
  await f.raw.doc('contentLifecycleControl/current').update({ mode: 'paused', revision: 2 });
  assert.equal((await runContentLifecycleMaintenance(f.db, options)).state, 'paused');
  await f.raw.doc('contentLifecycleControl/current').update({ mode: 'active', revision: 3 });
  const protectedRef = f.root.collection('unknown').doc('preserve'); await protectedRef.create({ preserve: true });
  assert.equal((await runContentLifecycleMaintenance(f.db, options)).state, 'needs-review');
  assert((await protectedRef.get()).exists); assert((await f.root.get()).exists);
  assert.equal((await f.raw.doc(`contentLifecycleThreads/${f.shoutId}`).get()).get('maintenanceState'), 'needs-review');
  assert.equal((await runContentLifecycleMaintenance(f.db, options)).state, 'idle');
});

test('archive writes share an actual feed-index transaction and leave B4 body identity unchanged', { skip: !enabled }, async t => {
  const f = await fixture(t), generation = `life-${randomUUID().slice(0, 24)}`, base = f.raw.doc(`feedIndexGenerations/${generation}`), control = f.raw.doc('feedIndexControl/current');
  f.cleanup.push(base, control, f.raw.doc('feedIndexMaintenance/erasureQueue'));
  await base.create({ schemaVersion: 1, v: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
  await control.create({ schemaVersion: 1, revision: 1, mode: 'active', readGenerationId: generation, writeGenerationIds: [generation] });
  const runtime = createFeedRuntime(f.raw, { getUser() { throw new Error('Auth lookup is not needed for a source transaction'); } }, {
    enabled: true, compatibleGenerations: false, cardStateEnabled: false, newsRuntimeEnabled: false, contentLifecycleEnabled: true,
  });
  const body = { ...f.source, categories: ['Dotaz'], geohash: encodeGeohash(50.53, 14.13) };
  await runtime.database.runTransaction(async tx => {
    const plan = await runtime.indexWriter.prepare(tx, f.shoutId, null, body); plan.apply(); tx.create(f.root, body);
  });
  const current = await f.root.get(); assert(current.get('contentArchiveKey'));
  assert.equal(bodyProjection(current.data()).version, bodyProjection(body).version);
  const cells = await base.collection('cells').get(); assert.equal(cells.size, 1);
  await runtime.database.runTransaction(async tx => {
    const snapshot = await tx.get(f.root), data = snapshot.data();
    const plan = await runtime.indexWriter.prepare(tx, f.shoutId, data, { ...data, status: 'deleted' });
    plan.apply(); tx.update(f.root, { status: 'deleted' });
  });
  const after = await cells.docs[0].ref.get();
  assert(!after.exists || !after.updateTime.isEqual(cells.docs[0].updateTime));
  assert.equal((await f.root.get()).get('status'), 'deleted');
  assert.equal((await f.raw.doc(`contentLifecycleArchive/${current.get('contentArchiveKey')}`).get()).get('content.text'), f.source.text);
});
