import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint, FieldValue } from 'firebase-admin/firestore';
import { createFeedRuntime } from './feed_runtime.js';
import { createModerationQueueHandlers } from './moderation_queue_runtime.js';
import { moderationReportTarget } from './moderation_queue.js';
import { startModerationCaseDecisionOperation as start, stepModerationCaseDecisionOperation as step } from './moderation_case_decision.js';
import { createContentReportOperation } from './create_content_report.js';
import { currentLegalPolicy } from './legal_policy.js';
import { operationTestKey } from './test_helpers.js';
import { accountPurgeStages } from './account_purge_policy.js';
import { encodeGeohash } from './geohash.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'queue-managed') : null;
const raw = app ? getFirestore(app) : null;
after(async () => { if (app) { await raw.terminate(); await deleteApp(app); } });
const sha = s => createHash('sha256').update(s).digest('hex');
async function fixture(t, { type = 'comment', count = 53 } = {}) {
  const nonce = randomUUID(), uid = 'mod_' + nonce, author = 'author_' + nonce, viewer = 'viewer_' + nonce;
  let now = new Date();
  const clock = () => new Date(now), setNow = d => { now = d; }, root = raw.doc('shouts/' + nonce);
  const generation = raw.doc('feedIndexGenerations/mq-' + nonce);
  await raw.doc('feedIndexControl/current').set({ schemaVersion: 2, revision: 1, mode: 'active',
    readGenerationId: generation.id, writeGenerationIds: [generation.id], cardWriteGenerationIds: [generation.id], cardReadGenerationId: generation.id });
  await generation.set({ schemaVersion: 1, v: 2, cardProjection: 1, readIdentity: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1, cardReady: true });
  await raw.doc('contentLifecycleControl/current').set({ schemaVersion: 1, mode: 'active', revision: 1 });
  await raw.doc('moderationQueueControl/current').set({ schemaVersion: 1, mode: 'building', revision: 1, incarnation: sha(nonce) });
  for (const userId of [uid, author, viewer]) {
    await raw.doc('users/' + userId).set({ nickname: 'Synthetic staff', avatarId: 'fox', avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'navy', avatarGradientDirection: 'horizontal' });
    await raw.doc(`users/${userId}/legal/${currentLegalPolicy().acceptanceDocument}`).set({ acceptedAt: Timestamp.fromDate(now) });
  }
  await raw.doc('accountRoles/' + uid).set({ level: 3, moderationScope: { countries: ['CZ'] } });
  const rt = createFeedRuntime(raw, { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } }, {
    clock, cardStateEnabled: true, newsRuntimeEnabled: false, contentLifecycleEnabled: true, contentCaptureEnabled: true,
    contentMaintenanceEnabled: false, moderationQueueEnabled: true,
  });
  const source = { authorId: author, authorNickname: 'Synthetic author', title: 'Synthetic managed case', text: 'Managed retained body',
    categories: ['Dotaz'], location: new GeoPoint(50.53, 14.13), geohash: encodeGeohash(50.53, 14.13),
    geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, status: 'active',
    createdAt: Timestamp.fromDate(now), expiresAt: Timestamp.fromMillis(now.getTime() + 86400000),
    likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: type === 'comment' ? 2 : 0 };
  await rt.database.runTransaction(async tx => { const plan = await rt.indexWriter.prepare(tx, root.id, null, source); plan.apply(); tx.create(root, source); });
  const target = type === 'shout' ? root : root.collection(type === 'comment' ? 'comments' : 'privateReplies').doc('reported');
  if (type !== 'shout') await rt.database.runTransaction(tx => {
    tx.create(target, { authorId: author, text: 'Synthetic retained child', createdAt: Timestamp.fromDate(now),
      ...(type === 'privateReply' ? { recipientId: viewer, participants: [author, viewer] } : { likesCount: 0, dislikesCount: 0 }) });
    if (type === 'comment') tx.create(root.collection('comments').doc('control'), { authorId: viewer, text: 'Keep this comment', createdAt: Timestamp.fromDate(now), likesCount: 0, dislikesCount: 0 });
  });
  const collection = { shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' }[type], reports = [];
  for (let offset = 0; offset < count; offset += 50) await rt.database.runTransaction(tx => {
    for (let n = offset; n < Math.min(count, offset + 50); n++) {
      const reporterId = type === 'privateReply' ? viewer : 'reporter' + n, ref = raw.doc(`${collection}/${reporterId}_${root.id}${type === 'shout' ? '' : '_' + target.id}`);
      tx.create(ref, { reporterId, shoutId: root.id, reason: 'Synthetic managed reason', createdAt: Timestamp.fromDate(now), status: 'open',
        ...(type === 'comment' ? { commentId: target.id } : type === 'privateReply' ? { privateReplyId: target.id, authorId: author, text: 'Synthetic retained child' } : {}) }); reports.push(ref);
    }
  });
  const caseId = moderationReportTarget(reports[0].path, (await reports[0].get()).data()).caseId, caseRef = raw.doc('moderationCases/' + caseId);
  await raw.doc('moderationQueueControl/current').update({ mode: 'active' });
  const identity = userId => ({ auth: { uid: userId, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' } });
  const request = async (decision = 'remove', by = uid) => {
    const c = (await caseRef.get()).data();
    return { ...identity(by), data: { expectedUserId: by, caseId, expectedIncarnation: c.incarnation, expectedRevision: c.revision,
      idempotencyKey: operationTestKey('managed-' + decision, now), decision, note: 'Synthetic decision reason' } };
  };
  const continuation = (jobId, by = uid) => ({ ...identity(by), data: { expectedUserId: by, jobId } });
  const finish = async jobId => { let r; for (let i = 0; i < 20; i++) { r = await step(continuation(jobId), rt.database, clock, { indexWriter: rt.indexWriter }); if (r.status === 'complete') return r; } assert.fail('job did not converge'); };
  t.after(async () => {
    await raw.recursiveDelete(root); await raw.recursiveDelete(generation); await raw.recursiveDelete(caseRef);
    for (const ref of reports) await ref.delete();
    for (const d of (await raw.collection('moderationCaseDecisions').where('caseId', '==', caseId).get()).docs) await d.ref.delete();
    for (const c of ['reports', 'commentReports', 'privateReplyReports', 'contentLifecycleArchive', 'moderationClearances']) {
      const field = c === 'contentLifecycleArchive' ? 'threadId' : 'shoutId';
      for (const d of (await raw.collection(c).where(field, '==', root.id).get()).docs) await raw.recursiveDelete(d.ref);
    }
    await raw.doc('contentLifecycleThreads/' + root.id).delete();
    for (const id of [uid, author, viewer]) {
      for (const c of ['users', 'publicProfiles', 'accountRoles', 'bans', 'contentRestrictions', 'accountDeletionRequests', 'rateLimits']) await raw.recursiveDelete(raw.doc(c + '/' + id));
      for (const c of ['serverOperations', 'sanctions', 'warnings']) for (const d of (await raw.collection(c).where('userId', '==', id).get()).docs) await raw.recursiveDelete(d.ref);
    }
    for (const p of ['feedIndexControl/current', 'contentLifecycleControl/current', 'moderationQueueControl/current']) await raw.doc(p).delete();
  });
  return { uid, author, viewer, rt, root, target, generation, caseId, caseRef, reports, clock, setNow, request, continuation, finish, identity };
}

test('managed comment removal drains 120 reports once, updates real card/index counts and preserves archive/control', { skip: !enabled }, async t => {
  const f = await fixture(t, { count: 120 }), snapshot = await f.target.get(), archive = raw.doc('contentLifecycleArchive/' + snapshot.get('contentArchiveKey'));
  const archivedBefore = await archive.get();
  const job = await start(await f.request(), f.rt.database, f.clock);
  await Promise.all([0, 1].map(() => step(f.continuation(job.jobId), f.rt.database, f.clock, { indexWriter: f.rt.indexWriter })));
  assert.equal((await f.root.get()).get('commentsCount'), 1);
  assert.equal((await f.generation.collection('publicStates').doc(f.root.id).get()).get('commentsCount'), 1);
  assert(!(await f.target.get()).exists); assert((await f.root.collection('comments').doc('control').get()).exists);
  assert((await archive.get()).updateTime.isEqual(archivedBefore.updateTime));
  const done = await f.finish(job.jobId); assert.equal(done.count, 120);
  assert.equal((await raw.collection('serverOperations').where('userId', '==', f.uid).where('action', '==', 'removeReportedPublicContent').get()).size, 1);
  assert.equal((await archive.get()).get('content.text'), 'Synthetic retained child');
});

test('managed shout deletion rolls back index/body/reports/job together if the index planner fails', { skip: !enabled }, async t => {
  const f = await fixture(t, { type: 'shout' }), request = await f.request(), job = await start(request, f.rt.database, f.clock);
  const before = await f.root.get(), c = await f.caseRef.get(), j = await raw.doc('moderationCaseDecisions/' + job.jobId).get();
  const state = await f.generation.collection('publicStates').doc(f.root.id).get();
  await assert.rejects(step(f.continuation(job.jobId), f.rt.database, f.clock, { indexWriter: { async prepare() { throw Error('synthetic-index-failure'); } } }), /synthetic-index-failure/);
  assert((await f.root.get()).updateTime.isEqual(before.updateTime)); assert((await f.caseRef.get()).updateTime.isEqual(c.updateTime));
  assert((await raw.doc('moderationCaseDecisions/' + job.jobId).get()).updateTime.isEqual(j.updateTime));
  assert((await f.generation.collection('publicStates').doc(f.root.id).get()).updateTime.isEqual(state.updateTime));
  assert((await Promise.all(f.reports.map(r => r.get()))).every(r => r.get('status') === 'open'));
  await f.finish(job.jobId);
  assert.equal((await f.root.get()).get('status'), 'deleted'); assert.equal((await f.generation.collection('publicStates').doc(f.root.id).get()).get('status'), 'deleted');
});

test('managed approval drains all reports and blocks another report without extending archive retention', { skip: !enabled }, async t => {
  const f = await fixture(t, { type: 'shout' }), header = await raw.doc('contentLifecycleThreads/' + f.root.id).get();
  const job = await start(await f.request('approve'), f.rt.database, f.clock); await f.finish(job.jobId);
  const clearance = await raw.doc(`moderationClearances/shout_${f.root.id}`).get();
  assert.equal(clearance.get('sourceReportCount'), 53); assert.equal(clearance.get('caseDecisionId'), job.jobId);
  await assert.rejects(createContentReportOperation({ ...f.identity(f.viewer), data: { expectedUserId: f.viewer, targetType: 'shout', shoutId: f.root.id,
    reason: 'Synthetic repeated report', idempotencyKey: operationTestKey('approved', f.clock()) } }, f.rt.database, f.clock), /already approved/);
  assert((await raw.doc('contentLifecycleThreads/' + f.root.id).get()).get('retainUntil').isEqual(header.get('retainUntil')));
});

test('managed private removal is single-recipient, preserves retained evidence and has no content copy in queue', { skip: !enabled }, async t => {
  const f = await fixture(t, { type: 'privateReply', count: 1 }), report = await f.reports[0].get();
  assert.equal(report.get('text'), undefined); assert(report.get('contentArchiveKey'));
  const job = await start(await f.request(), f.rt.database, f.clock); await f.finish(job.jobId);
  assert(!(await f.target.get()).exists);
  const archive = await raw.doc('contentLifecycleArchive/' + report.get('contentArchiveKey')).get();
  assert.equal(archive.get('content.text'), 'Synthetic retained child');
});

test('current retention deadline stops the next chunk even after one committed effect', { skip: !enabled }, async t => {
  const f = await fixture(t);
  const deletion = raw.doc('accountDeletionRequests/' + f.author);
  await deletion.set({ userId: f.author, status: 'pending' });
  const deadline = new Date((await deletion.get()).createTime.toMillis() + 60 * 86400000);
  f.setNow(new Date(deadline.getTime() - 1000));
  const job = await start(await f.request('resolve'), f.rt.database, f.clock);
  await step(f.continuation(job.jobId), f.rt.database, f.clock, { indexWriter: f.rt.indexWriter });
  f.setNow(deadline);
  await assert.rejects(step(f.continuation(job.jobId), f.rt.database, f.clock, { indexWriter: f.rt.indexWriter }), /evidence expired|expired|unavailable/);
  assert.equal((await f.caseRef.get()).get('pendingCount'), 3);
});

test('partial retention purge cancels the old journal, recovery only resolves the retained remainder', { skip: !enabled }, async t => {
  const f = await fixture(t), job = await start(await f.request('warning'), f.rt.database, f.clock);
  await step(f.continuation(job.jobId), f.rt.database, f.clock, { indexWriter: f.rt.indexWriter });
  const pending = (await raw.collection('commentReports').where('shoutId', '==', f.root.id).where('status', '==', 'open').get()).docs;
  await f.rt.database.runTransaction(tx => tx.delete(pending[0].ref));
  assert.equal((await f.caseRef.get()).get('activeDecision'), undefined);
  await assert.rejects(step(f.continuation(job.jobId), f.rt.database, f.clock), /no longer available/);
  const next = await f.request('warning'); next.data.idempotencyKey = operationTestKey('recover-purge', f.clock());
  const recovery = await start(next, f.rt.database, f.clock); assert.equal(recovery.effectComplete, true);
  assert.equal((await f.finish(recovery.jobId)).count, 2);
  assert.equal((await raw.collection('sanctions').where('userId', '==', f.author).get()).size, 1);
});

test('removing an original actor cannot resurrect its UID during continuation by another eligible moderator', { skip: !enabled }, async t => {
  const f = await fixture(t), job = await start(await f.request('warning'), f.rt.database, f.clock);
  await step(f.continuation(job.jobId), f.rt.database, f.clock, { indexWriter: f.rt.indexWriter });
  await raw.doc('users/' + f.uid).delete(); await raw.doc('publicProfiles/' + f.uid).set({ schemaVersion: 1, accountStatus: 'deleted' });
  await raw.doc('accountRoles/' + f.viewer).set({ level: 3, moderationScope: { countries: ['CZ'] } });
  const remaining = (await raw.collection('commentReports').where('shoutId', '==', f.root.id).where('status', '==', 'open').get()).docs;
  await step(f.continuation(job.jobId, f.viewer), f.rt.database, f.clock, { indexWriter: f.rt.indexWriter });
  for (const report of remaining) assert.equal((await report.ref.get()).get('resolvedBy'), undefined);
  assert.equal((await raw.doc('moderationCaseDecisions/' + job.jobId).get()).get('effect.actorId'), undefined);
  assert.equal((await f.caseRef.get()).get('appliedEffect.actorId'), undefined);
  // The account purge deletes the original actor's journal and releases its
  // final empty shell; a stale continuation must never recreate a receipt.
  await f.rt.database.runTransaction(tx => tx.delete(raw.doc('moderationCaseDecisions/' + job.jobId)));
  assert(!(await f.caseRef.get()).exists);
  await assert.rejects(step(f.continuation(job.jobId, f.viewer), f.rt.database, f.clock), /no longer available/);
  const old = accountPurgeStages(f.uid), next = accountPurgeStages(f.uid, { moderationQueueEnabled: true });
  assert.deepEqual(next.slice(0, old.length), old);
});

test('prepared handlers are zero-access when disabled and demand managed archive decisions', async () => {
  const unusable = new Proxy({}, { get() { assert.fail('Disabled handler accessed the database'); } });
  const off = createModerationQueueHandlers(unusable);
  assert.throws(() => off.page({}), /not enabled/); assert.throws(() => off.start({}), /not enabled/);
  assert.deepEqual(await off.maintenance(), { examined: 0, deleted: 0, disabled: true });
});

test('actual report callable projects archive bindings and a locked case rolls back report, rate and receipt', { skip: !enabled }, async t => {
  const f = await fixture(t, { type: 'shout' });
  const data = userId => ({ expectedUserId: userId, targetType: 'shout', shoutId: f.root.id, reason: 'Synthetic callable report',
    idempotencyKey: operationTestKey('queue-report', f.clock()) });
  const created = await createContentReportOperation({ ...f.identity(f.viewer), data: data(f.viewer) }, f.rt.database, f.clock);
  const report = raw.doc('reports/' + created.reportId); f.reports.push(report);
  assert.equal((await f.caseRef.get()).get('pendingCount'), 54);
  assert.equal((await report.get()).get('contentArchiveKey'), (await f.root.get()).get('contentArchiveKey'));
  await start(await f.request('resolve'), f.rt.database, f.clock);
  await assert.rejects(createContentReportOperation({ ...f.identity(f.uid), data: data(f.uid) }, f.rt.database, f.clock), /in-progress/);
  assert(!(await raw.doc(`reports/${f.uid}_${f.root.id}`).get()).exists);
  assert(!(await raw.doc(`rateLimits/${f.uid}/actions/report`).get()).exists);
  assert.equal((await raw.collection('serverOperations').where('userId', '==', f.uid).get()).size, 0);
});

test('mandatory parent-context retirement wins over a locked case and recovery checks its reduced scope', { skip: !enabled }, async t => {
  const f = await fixture(t), job = await start(await f.request('warning'), f.rt.database, f.clock);
  await step(f.continuation(job.jobId), f.rt.database, f.clock, { indexWriter: f.rt.indexWriter });
  const pending = (await raw.collection('commentReports').where('shoutId', '==', f.root.id).where('status', '==', 'open').get()).docs;
  await f.rt.database.runTransaction(tx => {
    for (const report of pending) tx.update(report.ref, { shoutArchiveKey: FieldValue.delete(), moderationGeography: null, parentContextPurged: true });
  });
  assert.equal((await f.caseRef.get()).get('activeDecision'), undefined);
  assert.equal((await f.caseRef.get()).get('geography'), null);
  await assert.rejects(step(f.continuation(job.jobId), f.rt.database, f.clock), /no longer available/);
  const request = await f.request('warning'); request.data.idempotencyKey = operationTestKey('context-recovery', f.clock());
  await assert.rejects(start(request, f.rt.database, f.clock), { code: 'permission-denied' });
  await raw.doc('accountRoles/' + f.uid).update({ level: 5 });
  const recovered = await start(request, f.rt.database, f.clock);
  assert.equal(recovered.effectComplete, true);
  assert.equal((await f.finish(recovered.jobId)).count, 3);
  assert.equal((await raw.collection('sanctions').where('userId', '==', f.author).get()).size, 1);
});
