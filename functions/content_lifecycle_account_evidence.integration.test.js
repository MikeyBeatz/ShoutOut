import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Firestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { createContentLifecycleDatabase, lifecycleDay, lifecycleTimes, lifecycleArchiveKey, lifecycleBodyHash, lifecycleArchiveRecord } from './content_lifecycle.js';
import { archiveAccountContentPage, drainArchivedCommentReactionsPage, accountContentArchiveId } from './account_content_archive.js';
import { accountDeletionJobRef } from './account_deletion_job.js';
import { planLifecycleAccountAdoption, applyLifecycleAccountAdoption } from './content_lifecycle_account_adoption.js';
import { getLifecycleReportEvidenceOperation, readLifecycleReportEvidence } from './content_lifecycle_evidence.js';
import { accountReportBodyProven } from './account_archive_lifecycle_binding.js';
import { decideContentReportsOperation } from './decide_content_reports.js';
import { removeReportedPrivateReplyOperation } from './remove_reported_private_reply.js';
import { removeReportedPublicContentOperation } from './remove_reported_public_content.js';
import { sanctionContentOperation } from './moderation_sanctions.js';
import { operationTestKey } from './test_helpers.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const absent = { async getUser() { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); } };
const hash = s => createHash('sha256').update(s).digest('hex');
async function fixture(t, kind = 'privateReply', { mutateCopy = false, mutateSource = false, reportFirst = false, recipientOwner = false } = {}) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), nonce = randomUUID().replaceAll('-', '');
  const owner = `owner_${nonce}`, peer = `peer_${nonce}`, moderator = `mod_${nonce}`, parentAuthor = `parent_${nonce}`, extra = [];
  let now = new Date(Date.now() + 5000); const clock = () => now;
  const root = raw.doc(`shouts/account_evidence_${nonce}`), control = raw.doc('contentLifecycleControl/current');
  const source = root.collection(kind === 'comment' ? 'comments' : 'privateReplies').doc('target');
  const reporter = recipientOwner ? owner : peer, author = recipientOwner ? peer : owner;
  const report = raw.doc(`${kind === 'comment' ? 'commentReports' : 'privateReplyReports'}/${reporter}_${root.id}_target`);
  t.after(async () => {
    for (const doc of (await raw.collection('serverOperations').where('userId', '==', moderator).get()).docs) await raw.recursiveDelete(doc.ref);
    for (const doc of (await raw.collection('sanctions').where('userId', '==', owner).get()).docs) await raw.recursiveDelete(doc.ref);
    for (const doc of (await raw.collection('accountContentArchive').where('sourceShoutId', '==', root.id).get()).docs) await raw.recursiveDelete(doc.ref);
    for (const ref of [root, report, control, raw.doc(`users/${moderator}`), raw.doc(`accountRoles/${moderator}`),
      raw.doc(`rateLimits/${moderator}`), raw.doc(`moderationClearances/${kind}_${root.id}_target`), ...extra]) await raw.recursiveDelete(ref);
    await raw.terminate();
  });
  const body = { authorId: parentAuthor, title: 'Original parent', text: 'Original parent body', status: 'active',
    createdAt: Timestamp.fromMillis(now.getTime() - 100000), expiresAt: Timestamp.fromMillis(now.getTime() + lifecycleDay),
    commentsCount: kind === 'comment' ? 1 : 0, likesCount: 0, dislikesCount: 0, savesCount: 0,
    geography: { schemaVersion: 1, countryCode: 'CZ' } };
  const child = { authorId: author, authorNickname: 'Synthetic', text: 'Existing original child', createdAt: Timestamp.fromMillis(now.getTime() - 99000),
    ...(kind === 'privateReply' ? { recipientId: reporter, participants: [author, reporter] } : {}) };
  const reportBody = { reporterId: reporter, shoutId: root.id, status: 'open', reason: 'Synthetic old report', createdAt: Timestamp.now(),
    ...(kind === 'comment' ? { commentId: source.id } : { privateReplyId: source.id, authorId: author, text: child.text }) };
  await control.create({ schemaVersion: 1, mode: 'paused', revision: 1 });
  await root.create(body);
  if (reportFirst) await report.create(reportBody);
  await source.create(child);
  if (!reportFirst) await report.create(reportBody);
  if (mutateSource) await source.update({ text: `${child.text} changed after report` });
  // The production transition record constructor captures the unchanged
  // legacy parent after reporting, before the old account worker changes counts.
  const originalRoot = await root.get(), times = lifecycleTimes(body.expiresAt), parentKey = lifecycleArchiveKey(raw.projectId, root.path, body);
  const parent = raw.doc(`contentLifecycleArchive/${parentKey}`), thread = raw.doc(`contentLifecycleThreads/${root.id}`);
  extra.push(parent, thread);
  const header = { schemaVersion: 1, shoutId: root.id, sourceCreatedAt: body.createdAt, plannedExpiresAt: body.expiresAt,
    ...times, geography: body.geography, archivedAt: FieldValue.serverTimestamp(), captureMode: 'transition',
    migrationDigest: 'a'.repeat(64), sourceCreateTime: originalRoot.createTime, sourceUpdateTime: originalRoot.updateTime };
  await raw.runTransaction(async tx => {
    tx.create(thread, header); tx.create(parent, lifecycleArchiveRecord(root.path, body, header,
      { sourceCreateTime: originalRoot.createTime, sourceUpdateTime: originalRoot.updateTime, migrationDigest: 'a'.repeat(64) }));
    tx.update(root, { contentArchiveKey: parentKey, contentHash: lifecycleBodyHash(body), publicUntil: times.publicUntil, historyUntil: times.historyUntil });
  });
  const deletion = raw.doc(`accountDeletionRequests/${owner}`); extra.push(deletion); await deletion.create({ userId: owner, status: 'pending' });
  const deletionTime = (await deletion.get()).createTime;
  await deletion.update({ authDeletionConfirmedAt: Timestamp.fromMillis(deletionTime.toMillis() + 1) });
  const identity = { projectId: raw.projectId, userId: owner, requestCreateTime: deletionTime }, primary = accountDeletionJobRef(raw, identity);
  extra.push(primary);
  await primary.create({ schemaVersion: 3, userId: owner, requestCreateTime: deletionTime, retainUntil: Timestamp.fromMillis(deletionTime.toMillis() + 60 * lifecycleDay),
    phase: 'archiving-content', workStage: kind === 'comment' ? 'comments' : 'messages', pendingArchiveId: null });
  const marker = raw.doc(`publicProfiles/${owner}`); extra.push(marker); await marker.create({ schemaVersion: 1, accountStatus: 'deleted' });
  const sourceSnapshot = await source.get(), copy = raw.doc(`accountContentArchive/${accountContentArchiveId(raw.projectId, source.path, sourceSnapshot.createTime)}`);
  const guard = async (tx, progress) => { await tx.get(primary); return () => tx.update(primary, progress.kind === 'archive-root' && progress.pendingArchiveId ?
    { pendingArchiveId: progress.pendingArchiveId, workStage: 'reactions' } : progress.kind === 'reactions-complete' ?
      { pendingArchiveId: null, workStage: 'comments' } : { probe: progress.kind }); };
  await archiveAccountContentPage(identity, raw, absent, { kind, clock, transactionGuard: guard });
  if (mutateCopy) await copy.update({ evidenceProbe: true });
  now = new Date(Date.now() + 5000);
  const before = await copy.get(), plan = await planLifecycleAccountAdoption(raw, [copy.id], { clock });
  assert.equal(plan.entries[0].action, 'bind', plan.entries[0].reason);
  await applyLifecycleAccountAdoption(raw, plan, { approvedDigest: plan.digest, compatibleWriters: true, clock });
  const profile = raw.doc(`users/${moderator}`), role = raw.doc(`accountRoles/${moderator}`);
  await profile.create({ nickname: 'Synthetic moderator' }); await profile.collection('legal').doc('acceptance_2026_07_25').create({});
  await role.create({ level: 3, moderationScope: { countries: ['CZ'] } });
  const db = createContentLifecycleDatabase(raw, { enabled: true, clock });
  const request = data => ({ auth: { uid: moderator, token: { email: 'synthetic@example.test', email_verified: true } }, app: { appId: 'synthetic' },
    data: { expectedUserId: moderator, ...data } });
  const read = () => getLifecycleReportEvidenceOperation(request({ targetType: kind, reportId: report.id }), db, clock);
  return { raw, db, owner, peer, moderator, root, source, report, parent, thread, deletion, copy, before, identity, primary, guard, clock, request, role, extra, read,
    setNow(date) { now = date; } };
}

for (const kind of ['comment', 'privateReply']) test(`common ${kind} evidence preserves original SDK body proof and audits only the actual account copy`, { skip: !enabled }, async t => {
  const f = await fixture(t, kind), bound = await f.copy.get();
  assert(bound.get('lifecycleAccountBinding.originalArchiveUpdateTime').isEqual(f.before.updateTime));
  assert(bound.get('lifecycleAccountBinding.archiveCreateTime').isEqual(f.before.createTime));
  const result = await f.read();
  assert.equal(result.targetData.text, 'Existing original child'); assert.equal(result.parentData.title, 'Original parent');
  assert.equal(result.captureMode, 'account-archive'); assert.equal(result.capturedAtMillis, Math.floor(f.before.createTime.toMillis()));
  assert(!JSON.stringify(result).includes('participants')); assert.equal((await f.copy.collection('accessAudits').get()).size, 1);
  assert.equal((await f.parent.collection('accessAudits').get()).size, 0);
  if (kind === 'comment') {
    await drainArchivedCommentReactionsPage(f.identity, f.raw, absent, { archiveId: f.copy.id, clock: f.clock, transactionGuard: f.guard });
    assert(accountReportBodyProven(await f.copy.get(), await f.report.get())); await f.read();
  }
  await f.role.update({ moderationScope: { countries: ['DE'] } });
  await assert.rejects(f.read(), e => e.code === 'permission-denied');
});

for (const variant of ['mutateCopy', 'mutateSource', 'reportFirst']) test(`unproven legacy ${variant} is never presented as the reported body`, { skip: !enabled }, async t => {
  const f = await fixture(t, 'privateReply', { [variant]: true });
  await assert.rejects(f.read(), e => ['failed-precondition', 'not-found'].includes(e.code));
  assert.equal((await f.copy.collection('accessAudits').get()).size, 0);
});

test('body changes, source recreation, missing parent and replaced report fail without an audit', { skip: !enabled }, async t => {
  const f = await fixture(t), content = (await f.copy.get()).get('content');
  await f.copy.update({ 'content.text': 'modified' }); await assert.rejects(f.read(), e => e.code === 'failed-precondition');
  await f.copy.update({ content }); await f.source.create(content); await assert.rejects(f.read(), e => e.code === 'failed-precondition'); await f.source.delete();
  const saved = (await f.report.get()).data(); await f.report.delete(); await f.report.create(saved);
  await assert.rejects(f.read(), e => e.code === 'failed-precondition');
  assert.equal((await f.copy.collection('accessAudits').get()).size, 0);
});

test('unknown old marker stays deadline-only and cannot gain a body proof by replay', { skip: !enabled }, async t => {
  const f = await fixture(t), b = (await f.copy.get()).get('lifecycleAccountBinding');
  for (const key of ['originalArchiveUpdateTime', 'bodyHash', 'parentArchiveKey', 'parentArchiveCreateTime']) delete b[key]; b.schemaVersion = 1;
  await f.copy.update({ lifecycleAccountBinding: b });
  const plan = await planLifecycleAccountAdoption(f.raw, [f.copy.id], { clock: f.clock }); assert.equal(plan.entries[0].action, 'covered');
  assert.equal((await applyLifecycleAccountAdoption(f.raw, plan, { approvedDigest: plan.digest, compatibleWriters: true, clock: f.clock })).writes, 0);
  await assert.rejects(f.read(), e => e.code === 'failed-precondition');
});

test('account deadline boundary ends access even with an unchanged body and a valid report', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.read();
  f.setNow(new Date((await f.copy.get()).get('retainUntil').toMillis()));
  await assert.rejects(f.read(), e => e.code === 'not-found');
  assert.equal((await f.copy.collection('accessAudits').get()).size, 1);
});

test('private evidence requires the actual reported recipient and the original copied text', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.report.update({ text: 'another conversation' });
  await assert.rejects(f.read(), e => e.code === 'failed-precondition');
  assert.equal((await f.copy.collection('accessAudits').get()).size, 0);
});

test('recreated account copy and recreated parent proof cannot reuse the original binding', { skip: !enabled }, async t => {
  const f = await fixture(t), saved = (await f.copy.get()).data();
  await f.copy.delete(); await f.copy.create(saved); await assert.rejects(f.read(), e => e.code === 'failed-precondition');
  assert.equal((await f.copy.collection('accessAudits').get()).size, 0);
});

test('an identically recreated parent copy is rejected by its SDK birth, not accepted by body hash alone', { skip: !enabled }, async t => {
  const f = await fixture(t), saved = (await f.parent.get()).data();
  await f.parent.delete(); await f.parent.create(saved); await assert.rejects(f.read(), e => e.code === 'failed-precondition');
  assert.equal((await f.copy.collection('accessAudits').get()).size, 0);
});

test('a completed recipient purge prevents exposure of a still-retained authors account copy', { skip: !enabled }, async t => {
  const f = await fixture(t), marker = f.raw.doc(`publicProfiles/${f.peer}`); f.extra.push(marker);
  await marker.create({ schemaVersion: 1, accountStatus: 'deleted' });
  await assert.rejects(f.read(), e => e.code === 'not-found');
  assert.equal((await f.copy.collection('accessAudits').get()).size, 0);
});

test('escalated account evidence requires senior permission and keeps the same geographic scope', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.report.update({ status: 'escalated' });
  await assert.rejects(f.read(), e => e.code === 'permission-denied');
  await f.role.update({ level: 4 }); await f.read();
  await f.role.update({ moderationScope: { countries: ['DE'] } }); await assert.rejects(f.read(), e => e.code === 'permission-denied');
  assert.equal((await f.copy.collection('accessAudits').get()).size, 1);
});

test('a missing or unproven original parent never borrows current geographic authority', { skip: !enabled }, async t => {
  const f = await fixture(t), saved = (await f.parent.get()).data();
  await f.parent.delete(); await assert.rejects(f.read(), e => e.code === 'not-found');
  delete saved.migrationDigest; delete saved.sourceUpdateTime; saved.captureMode = 'atomic-write'; await f.parent.create(saved);
  await assert.rejects(f.read(), e => e.code === 'failed-precondition');
});

for (const kind of ['comment', 'privateReply']) test(`managed removal of archived ${kind} closes the report and rechecks current scope on replay`, { skip: !enabled }, async t => {
  const f = await fixture(t, kind), operation = kind === 'comment' ? removeReportedPublicContentOperation : removeReportedPrivateReplyOperation;
  const key = operationTestKey(`account_${kind}`, f.clock());
  const payload = kind === 'comment' ? { targetType: kind, shoutId: f.root.id, targetId: 'target', reportIds: [f.report.id], decision: 'remove' } : { reportId: f.report.id };
  const request = f.request({ ...payload, idempotencyKey: key });
  await operation(request, f.db, f.clock); await operation(request, f.db, f.clock);
  assert.equal((await f.report.get()).get('resolution'), 'contentRemoved'); assert((await f.copy.get()).exists);
  const receipts = await f.raw.collection('serverOperations').where('userId', '==', f.moderator).get(); assert.equal(receipts.size, 1);
  assert.equal(receipts.docs[0].get('accountArchiveId'), f.copy.id); assert.equal(receipts.docs[0].get('contentArchiveKey'), undefined);
  await f.role.update({ moderationScope: { countries: ['DE'] } }); await assert.rejects(operation(request, f.db, f.clock), e => e.code === 'permission-denied');
});

test('ordinary decision accepts account evidence and persists its storage namespace without body copies', { skip: !enabled }, async t => {
  const f = await fixture(t), key = operationTestKey('account_approve', f.clock());
  const request = f.request({ targetType: 'privateReply', targetId: 'target', shoutId: f.root.id, reportIds: [f.report.id], decision: 'approve', idempotencyKey: key });
  assert.deepEqual(await decideContentReportsOperation(request, f.db, f.clock), { decision: 'approve', count: 1 });
  assert.deepEqual(await decideContentReportsOperation(request, f.db, f.clock), { decision: 'approve', count: 1 });
  const receipt = await f.raw.doc(`serverOperations/${hash(`${f.moderator}\ndecideContentReports\n${key}`)}`).get();
  assert.equal(receipt.get('accountArchiveId'), f.copy.id); assert.equal(receipt.get('contentArchiveKey'), undefined);
  await f.role.update({ moderationScope: { countries: ['DE'] } });
  await assert.rejects(decideContentReportsOperation(request, f.db, f.clock), e => e.code === 'permission-denied');
});

test('sanction of a surviving author uses a recipients account archive and stores only its exact reference', { skip: !enabled }, async t => {
  const f = await fixture(t, 'privateReply', { recipientOwner: true }), profile = f.raw.doc(`users/${f.peer}`); f.extra.push(profile);
  await profile.create({ nickname: 'Synthetic surviving author' });
  const key = operationTestKey('account_warning', f.clock()), request = f.request({ expectedTargetUserId: f.peer, mode: 'report',
    targetType: 'privateReply', targetId: 'target', shoutId: f.root.id, reportIds: [f.report.id], sourceReportId: f.report.id,
    decision: 'warning', note: 'Synthetic test reason', idempotencyKey: key });
  const result = await sanctionContentOperation(request, f.db, f.clock), sanction = f.raw.doc(`sanctions/${result.sanctionId}`);
  f.extra.push(sanction, f.raw.doc(`warnings/${result.sanctionId}`));
  const saved = await sanction.get(); assert.equal(saved.get('accountArchiveId'), f.copy.id);
  assert.equal(saved.get('contentSnapshot.accountArchiveId'), f.copy.id); assert.equal(saved.get('contentSnapshot.contentArchiveKey'), undefined);
  assert.equal(saved.get('contentSnapshot.text'), undefined); assert.equal(saved.get('contentSnapshot.moderationGeography'), undefined);
  assert.deepEqual(await sanctionContentOperation(request, f.db, f.clock), result);
  await f.role.update({ moderationScope: { countries: ['DE'] } });
  await assert.rejects(sanctionContentOperation(request, f.db, f.clock), e => e.code === 'permission-denied');
});

test('repeated reads within a report-group transaction reuse the bounded account lookup', { skip: !enabled }, async t => {
  const f = await fixture(t); const trace = { documentReads: 0, readCalls: 0, queryReads: 0 };
  await f.raw.runTransaction(async tx => {
    const report = await tx.get(f.report), cache = { documents: new Map(), subjects: new Map() };
    const reader = {
      async getAll(...args) { trace.readCalls++; const rows = await tx.getAll(...args); trace.documentReads += rows.length; return rows; },
      async get(ref) { trace.readCalls++; const result = await tx.get(ref);
        if (ref.path) trace.documentReads++; else { trace.queryReads++; trace.documentReads += Math.max(1, result.size); } return result; },
    };
    const a = await readLifecycleReportEvidence(reader, f.raw, report, 'privateReply', Timestamp.fromDate(f.clock()), cache);
    const first = { ...trace };
    const b = await readLifecycleReportEvidence(reader, f.raw, report, 'privateReply', Timestamp.fromDate(f.clock()), cache);
    assert.equal(a.archiveRef.path, b.archiveRef.path); assert.deepEqual(trace, first);
  }, { readOnly: true });
  assert.deepEqual(trace, { documentReads: 11, readCalls: 5, queryReads: 1 });
  t.diagnostic(`ACCOUNT_EVIDENCE_READ_TRACE ${JSON.stringify(trace)}; repeatReads=0; writes=0; excludes actor/report reads and cloud billing`);
});
