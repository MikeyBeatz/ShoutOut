// Local-only coordinator. Reuses the existing effect cores once, then drains
// immutable membership in <=50 report transactions. No scheduler/host export.
import { createHash } from 'node:crypto';
import { Timestamp, FieldPath, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { accountRetentionMillis } from './account_purge_guard.js';
import { receiptRetentionFields } from './operation_retention.js';
import { privateReportModeratorLevel, assertPrivateReportScope, removeReportedPrivateReplyOperation } from './remove_reported_private_reply.js';
import { decideContentReportsOperation } from './decide_content_reports.js';
import { removeReportedPublicContentOperation } from './remove_reported_public_content.js';
import { sanctionActions, sanctionContentOperation } from './moderation_sanctions.js';
import { lifecycleReportReadsEnabled, lifecycleBodyHash } from './content_lifecycle.js';
import { readLifecycleReportEvidence } from './content_lifecycle_evidence.js';
import { moderationQueueBinding, moderationDecisionBatch, validateModerationCase, validateModerationQueueControl } from './moderation_queue.js';
import { bindCardPublisher, prepareCardMutation } from './feed_card_state.js';

const action = 'decideModerationCase';
const hash = value => createHash('sha256').update(value).digest('hex');
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const fail = (message, code = 'failed-precondition') => { throw new HttpsError(code, message); };
const stamp = clock => {
  const date = clock(); if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) fail('operation-clock-unavailable');
  return Timestamp.fromDate(date);
};
function validateInput(data) {
  const fields = ['expectedUserId', 'idempotencyKey', 'caseId', 'expectedIncarnation', 'expectedRevision', 'decision', 'note'];
  if (!data || Object.getPrototypeOf(data) !== Object.prototype || Object.keys(data).some(k => !fields.includes(k)) ||
      typeof data.expectedUserId !== 'string' || !data.expectedUserId || typeof data.idempotencyKey !== 'string' || data.idempotencyKey.length > 128 ||
      !hex(data.caseId) || !hex(data.expectedIncarnation) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 1 ||
      !['resolve', 'approve', 'escalate', 'remove', ...Object.keys(sanctionActions)].includes(data.decision) ||
      typeof data.note !== 'string' || [...data.note].length > 500 || Object.hasOwn(sanctionActions, data.decision) && !data.note.trim()) fail('Invalid moderation decision.', 'invalid-argument');
  return Object.fromEntries(fields.map(key => [key, key === 'note' ? data.note.trim() : data[key]]));
}
async function actor(request, db, tx, now) {
  const { uid } = requireCallableIdentity(request);
  await requireEligibleActor({ request, db, reader: tx, now: now.toDate() });
  const [role, legacy] = await tx.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`));
  return { uid, role: role.data(), level: privateReportModeratorLevel(role.data(), legacy.data()) };
}
function permission(a, geography, requiredLevel) {
  if (a.level < requiredLevel) fail('Senior moderator permission is required.', 'permission-denied');
  assertPrivateReportScope(a.role, a.level, { geography });
}
function requireAdapter(db) { if (!db[moderationQueueBinding]?.enabled) fail('moderation-queue-adapter-required'); }
function result(job, jobId) { return { status: 'processing', jobId, caseId: job.caseId, decision: job.decision,
  processedCount: job.processedCount, totalCount: job.totalCount, effectComplete: job.effectComplete }; }
async function evidence(tx, db, c, now, selected = null) {
  const report = selected ?? await tx.get(db.doc(c.representativePath));
  if (!report.exists) fail('moderation-case-report-unavailable');
  if (lifecycleReportReadsEnabled(db, { docs: [report] })) {
    const proof = report.get('contentArchiveKey') ? hash(`content:${report.get('contentArchiveKey')}`) : hash(`account:${report.get('accountArchiveId')}`);
    if (proof !== c.evidenceIdentity) fail('moderation-case-evidence-changed');
    const e = await readLifecycleReportEvidence(tx, db, report, c.type, now);
    return { geography: e.geography, authorId: e.content.authorId, retainUntil: e.retainUntil };
  }
  const parent = await tx.get(db.doc(`shouts/${c.shoutId}`));
  const source = c.type === 'shout' ? parent : await tx.get(db.doc(`shouts/${c.shoutId}/${c.type === 'comment' ? 'comments' : 'privateReplies'}/${c.targetId}`));
  if (!parent.exists || !source.exists || source.createTime.toMillis() > report.createTime.toMillis() ||
      hash(`legacy:${source.ref.path}:${source.createTime.seconds}:${source.createTime.nanoseconds}:${lifecycleBodyHash(source.data())}`) !== c.evidenceIdentity) fail('moderation-case-evidence-changed');
  return { geography: parent.get('geography') ?? null, authorId: source.get('authorId'), retainUntil: null };
}

/** Bounded private maintenance, to be wired into an existing worker only in
 * the separately approved DEV activation. No new schedule and no TTL here.
 * Expired retry data/notes disappear; a content-bound minimal effect proof
 * permits completion with a new valid request without applying it again.
 */
export async function reapExpiredModerationCaseDecisions(db, clock = () => new Date()) {
  requireAdapter(db);
  return db.runTransaction(async tx => {
    const now = stamp(clock), control = await tx.get(db.doc('moderationQueueControl/current'));
    validateModerationQueueControl(control.data());
    const jobs = await tx.get(db.collection('moderationCaseDecisions').where('expiresAt', '<=', now).orderBy('expiresAt').limit(50));
    const cases = jobs.size ? await tx.getAll(...jobs.docs.map(j => db.doc(`moderationCases/${j.get('caseId')}`))) : [];
    for (let i = 0; i < jobs.size; i++) {
      const job = jobs.docs[i], c = cases[i];
      if (c.exists && c.get('activeDecision') === job.id && c.get('incarnation') === job.get('caseIncarnation')) {
        if (!c.get('pendingCount')) tx.delete(c.ref);
        else {
          if (job.get('effectComplete') && c.get('appliedEffect.operationId') !== job.get('effect.operationId')) fail('Invalid expired effect proof.');
          tx.update(c.ref, { activeDecision: FieldValue.delete(), revision: c.get('revision') + 1 });
        }
      }
      tx.delete(job.ref);
    }
    return { examined: jobs.size, deleted: jobs.size, complete: jobs.size < 50 };
  });
}

export async function startModerationCaseDecisionOperation(request, db, clock = () => new Date()) {
  requireAdapter(db);
  const input = validateInput(request.data), identity = requireCallableIdentity(request);
  if (identity.uid !== input.expectedUserId) fail('The signed-in account changed.', 'unauthenticated');
  const fingerprint = hash(JSON.stringify(input)), jobId = hash(`${identity.uid}\n${action}\n${input.idempotencyKey}`);
  const jobRef = db.doc(`moderationCaseDecisions/${jobId}`), receiptRef = db.doc(`serverOperations/${jobId}`), caseRef = db.doc(`moderationCases/${input.caseId}`);
  return db.runTransaction(async tx => {
    const now = stamp(clock), a = await actor(request, db, tx, now);
    const [receipt, existing, control, document] = await tx.getAll(receiptRef, jobRef, db.doc('moderationQueueControl/current'), caseRef);
    validateModerationQueueControl(control.data(), { reading: true });
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data() ?? existing.data());
    if (receipt.exists) {
      if (receipt.get('action') !== action || receipt.get('fingerprint') !== fingerprint || receipt.get('userId') !== a.uid) fail('The operation key was already used.', 'already-exists');
      permission(a, receipt.get('geography'), receipt.get('requiredRoleLevel')); return receipt.get('result');
    }
    if (existing.exists) {
      const j = existing.data(); if (j.fingerprint !== fingerprint || j.userId !== a.uid) fail('The operation key was already used.', 'already-exists');
      permission(a, j.geography, j.requiredRoleLevel); return result(j, jobId);
    }
    if (!document.exists) fail('The case is no longer pending.');
    const c = validateModerationCase(document.data(), input.caseId);
    if (c.incarnation !== input.expectedIncarnation || c.revision !== input.expectedRevision || !c.pendingCount) fail('Refresh the moderation case.');
    if (c.activeDecision) fail('A decision is already in progress.', 'already-exists');
    const originalEffect = c.appliedEffect ?? null;
    if (originalEffect && originalEffect.decision !== input.decision) fail('Continue the original decision first.');
    const currentEvidence = await evidence(tx, db, c, now);
    const e = originalEffect ? { ...originalEffect, ...currentEvidence } : currentEvidence;
    if (e.retainUntil && now.toMillis() >= e.retainUntil.toMillis()) fail('The archived evidence expired.');
    const requiredRoleLevel = originalEffect?.requiredRoleLevel ?? Math.max(c.escalatedCount ? 4 : 3, sanctionActions[input.decision]?.role ?? 3);
    permission(a, e.geography, requiredRoleLevel);
    if (input.decision === 'escalate' && c.escalatedCount && !originalEffect) fail('The case was already escalated.');
    if (c.type === 'privateReply' && c.pendingCount !== 1) fail('Ambiguous private report group.');
    const job = { schemaVersion: 1, ...retention, createdAt: now, userId: a.uid, caseId: input.caseId,
      caseIncarnation: c.incarnation, controlIncarnation: control.get('incarnation'), fingerprint,
      idempotencyKey: input.idempotencyKey, decision: input.decision, note: originalEffect ? '' : input.note,
      targetType: c.type, shoutId: c.shoutId, targetId: c.targetId, authorId: e.authorId ?? null,
      geography: e.geography, retainUntil: e.retainUntil ?? null, requiredRoleLevel,
      totalCount: c.pendingCount, processedCount: 0, effectComplete: Boolean(originalEffect),
      ...(originalEffect ? { effect: originalEffect } : {}) };
    tx.create(jobRef, job); tx.update(caseRef, { activeDecision: jobId, revision: c.revision + 1 });
    return result(job, jobId);
  });
}

function embeddedDatabase(db, tx) {
  const embedded = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return callback => callback(tx);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  // The existing card publisher is held in a WeakMap keyed by database object.
  // Forward it explicitly when reusing an effect core in our outer transaction.
  bindCardPublisher(embedded, { prepare: (...args) => prepareCardMutation(db, ...args) });
  return embedded;
}

/** One committed step; client/optional runner can resume this exact job after
 * a cold restart. Caller authority is checked now, not copied from the job.
 */
export async function stepModerationCaseDecisionOperation(request, db, clock = () => new Date(), { indexWriter = null } = {}) {
  requireAdapter(db);
  const uid = requireCallableIdentity(request).uid, data = request.data;
  if (!data || Object.getPrototypeOf(data) !== Object.prototype || Object.keys(data).some(k => !['expectedUserId', 'jobId'].includes(k)) ||
      data.expectedUserId !== uid || !hex(data.jobId)) fail('Invalid continuation.', 'invalid-argument');
  const jobRef = db.doc(`moderationCaseDecisions/${data.jobId}`), receiptRef = db.doc(`serverOperations/${data.jobId}`);
  return db.runTransaction(async tx => {
    const now = stamp(clock), a = await actor(request, db, tx, now);
    const [snapshot, receipt, control] = await tx.getAll(jobRef, receiptRef, db.doc('moderationQueueControl/current'));
    validateModerationQueueControl(control.data(), { reading: true });
    if (receipt.exists) {
      const r = receipt.data(); receiptRetentionFields(r.idempotencyKey, now, r);
      permission(a, r.geography, r.requiredRoleLevel); return r.result;
    }
    if (!snapshot.exists) fail('The decision is no longer available.');
    const job = snapshot.data();
    if (job.schemaVersion !== 1 || !hex(job.caseId) || job.controlIncarnation !== control.get('incarnation')) fail('The queue incarnation changed.');
    receiptRetentionFields(job.idempotencyKey, now, job);
    permission(a, job.geography, job.requiredRoleLevel);
    if (!job.effectComplete && a.uid !== job.userId) fail('Only the original moderator can apply the decision.', 'permission-denied');
    if (job.retainUntil && now.toMillis() >= job.retainUntil.toMillis()) fail('The archived evidence expired.');
    const caseRef = db.doc(`moderationCases/${job.caseId}`), document = await tx.get(caseRef);
    if (!document.exists) fail('The case was purged.');
    const c = validateModerationCase(document.data(), job.caseId);
    if (c.incarnation !== job.caseIncarnation || c.activeDecision !== data.jobId) fail('The active case changed.');
    const representative = c.pendingCount ? await tx.get(db.doc(c.representativePath)) : null;
    if (c.pendingCount && (!job.effectComplete || lifecycleReportReadsEnabled(db, { docs: [representative] }))) {
      const current = await evidence(tx, db, c, now, representative);
      if (current.retainUntil && now.toMillis() >= current.retainUntil.toMillis()) fail('The archived evidence expired.');
      if (current.authorId !== job.authorId || JSON.stringify(current.geography) !== JSON.stringify(job.geography)) fail('The reported evidence changed.');
      permission(a, current.geography, job.requiredRoleLevel);
    }
    let membership = caseRef.collection('members').orderBy(FieldPath.documentId());
    if (job.afterMemberId) membership = membership.startAfter(job.afterMemberId);
    const members = await tx.get(membership.limit(50));
    if (!members.size) {
      if ((job.decision === 'escalate' ? c.openCount !== 0 || c.escalatedCount !== job.totalCount : c.pendingCount !== 0) ||
          !job.effectComplete || job.processedCount !== job.totalCount) fail('Invalid decision completion.');
      const done = { status: 'complete', caseId: job.caseId, decision: job.decision, count: job.totalCount };
      tx.create(receiptRef, { action, userId: job.userId, idempotencyKey: job.idempotencyKey, fingerprint: job.fingerprint,
        authorId: job.authorId, targetType: job.targetType, shoutId: job.shoutId, targetId: job.targetId,
        createdAt: job.createdAt, expiresAt: job.expiresAt, keyVersion: job.keyVersion, geography: job.geography,
        requiredRoleLevel: job.requiredRoleLevel, completedAt: now, completedBy: a.uid, result: done });
      if (job.decision === 'escalate') tx.update(caseRef, { activeDecision: FieldValue.delete(), appliedEffect: FieldValue.delete(), revision: c.revision + 1 });
      else tx.delete(caseRef);
      tx.delete(jobRef); return done;
    }
    const reports = await tx.getAll(...members.docs.map(m => db.doc(m.get('reportPath'))));
    if (reports.some((r, i) => !r.exists || !['open', 'escalated'].includes(r.get('status')) ||
        r.get('moderationQueueIncarnation') !== members.docs[i].get('reportIncarnation') ||
        members.docs[i].get('evidenceIdentity') !== c.evidenceIdentity) || reports.length > c.pendingCount) fail('The report membership changed.');
    const capability = { caseId: job.caseId, jobId: data.jobId, targetType: job.targetType, shoutId: job.shoutId, targetId: job.targetId, docs: reports };
    Object.defineProperty(tx, moderationDecisionBatch, { value: capability, configurable: true });
    let effect = job.effect;
    if (effect?.actorId && effect.actorId !== a.uid) {
      const [profile, deletion, marker] = await tx.getAll(db.doc(`users/${effect.actorId}`), db.doc(`accountDeletionRequests/${effect.actorId}`), db.doc(`publicProfiles/${effect.actorId}`));
      const expired = deletion.exists ? now.toMillis() >= deletion.createTime.toMillis() + accountRetentionMillis :
        !profile.exists || marker.get('accountStatus') === 'deleted';
      if (expired) {
        const { actorId: removed, ...redacted } = effect; void removed;
        effect = redacted; capability.casePatch = { appliedEffect: effect };
      }
    }
    if (!job.effectComplete) {
      const common = { expectedUserId: a.uid, idempotencyKey: job.idempotencyKey, targetType: job.targetType,
        shoutId: job.shoutId, ...(job.targetType === 'shout' ? {} : { targetId: job.targetId }),
        reportIds: reports.map(r => r.id), decision: job.decision, note: job.note };
      const inner = { ...request, data: common }, bound = embeddedDatabase(db, tx);
      let innerAction;
      if (Object.hasOwn(sanctionActions, job.decision)) {
        innerAction = 'sanctionContent'; inner.data = { ...common, mode: 'report', expectedTargetUserId: job.authorId, sourceReportId: reports[0].id };
        await sanctionContentOperation(inner, bound, clock);
      } else if (job.decision === 'remove' && job.targetType === 'privateReply') {
        innerAction = 'removeReportedPrivateReply'; inner.data = { expectedUserId: a.uid, idempotencyKey: job.idempotencyKey, reportId: reports[0].id, note: job.note };
        await removeReportedPrivateReplyOperation(inner, bound, clock);
      } else if (job.decision === 'remove') {
        innerAction = 'removeReportedPublicContent'; await removeReportedPublicContentOperation(inner, bound, clock, { indexWriter });
      } else { innerAction = 'decideContentReports'; await decideContentReportsOperation(inner, bound, clock, { guardEvidenceRetention: true }); }
      const operationId = hash(`${a.uid}\n${innerAction}\n${job.idempotencyKey}`);
      tx.update(db.doc(`serverOperations/${operationId}`), { caseDecisionId: data.jobId, caseReportCount: job.totalCount });
      effect = { decision: job.decision, actorId: a.uid, authorId: job.authorId, operationId,
        geography: job.geography, requiredRoleLevel: job.requiredRoleLevel, retainUntil: job.retainUntil, createdAt: now };
      capability.casePatch = { appliedEffect: effect };
      if (job.decision === 'approve') tx.update(db.doc(`moderationClearances/${job.targetType}_${job.shoutId}${job.targetType === 'shout' ? '' : `_${job.targetId}`}`),
        { caseDecisionId: data.jobId, sourceReportCount: job.totalCount });
    } else {
      if (!effect || effect.decision !== job.decision || c.appliedEffect?.operationId !== effect.operationId) fail('The applied decision proof changed.');
      for (const report of reports) tx.update(report.ref, job.decision === 'escalate' ? {
        status: 'escalated', assignedRole: 'seniorModerator', ...(effect.actorId ? { escalatedBy: effect.actorId } : {}), escalatedAt: effect.createdAt,
        escalationOperationId: effect.operationId, caseDecisionId: data.jobId,
      } : { status: 'resolved', resolution: job.decision === 'approve' ? 'contentApproved' : job.decision === 'remove' ? 'contentRemoved' :
        Object.hasOwn(sanctionActions, job.decision) ? 'sanctioned' : 'noAction',
      ...(effect.actorId ? { resolvedBy: effect.actorId } : {}), resolvedAt: effect.createdAt, decisionOperationId: effect.operationId, caseDecisionId: data.jobId });
    }
    const processedCount = job.processedCount + reports.length;
    if (processedCount > job.totalCount) fail('Invalid processed report count.');
    tx.update(jobRef, { processedCount, effectComplete: true, effect, lastRunnerId: a.uid, afterMemberId: members.docs.at(-1).id });
    return result({ ...job, processedCount, effectComplete: true }, data.jobId);
  });
}
