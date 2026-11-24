// Shared decision core; the callable host is exported separately in content.js.
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { receiptRetentionFields } from './operation_retention.js';
import { privateReportModeratorLevel, assertPrivateReportScope } from './remove_reported_private_reply.js';
import { isPurgedShoutContext } from './shout_context.js';
import { assertReportEvidenceRetention } from './moderation_retention.js';

const action = 'decideContentReports';
const unavailableAction = 'resolveUnavailableContentReports';
export const orphanReportResolutionEnabled = true;
const collections = { shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' };
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const reportId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,386}$/.test(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (code, text) => { throw new HttpsError(code, text); };

export function validateContentReportDecision(data) {
  const fields = ['expectedUserId', 'idempotencyKey', 'targetType', 'shoutId', 'targetId', 'reportIds', 'decision', 'note'];
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !fields.includes(k)) ||
      !id(data.expectedUserId) || !id(data.idempotencyKey) || typeof data.targetType !== 'string' || !Object.hasOwn(collections, data.targetType) ||
      !id(data.shoutId) || (data.targetType === 'shout' ? data.targetId !== undefined : !id(data.targetId)) ||
      !['approve', 'escalate', 'resolve'].includes(data.decision) ||
      !Array.isArray(data.reportIds) || data.reportIds.length < 1 || data.reportIds.length > 50 ||
      !data.reportIds.every(reportId) || new Set(data.reportIds).size !== data.reportIds.length ||
      data.note !== undefined && (typeof data.note !== 'string' || [...data.note].length > 500)) {
    fail('invalid-argument', 'Invalid report decision fields.');
  }
  return { expectedUserId: data.expectedUserId, idempotencyKey: data.idempotencyKey, targetType: data.targetType,
    shoutId: data.shoutId, ...(data.targetId === undefined ? {} : { targetId: data.targetId }),
    reportIds: [...data.reportIds].sort(), decision: data.decision, note: (data.note ?? '').trim() };
}

export function pendingContentReports(db, input) {
  let query = db.collection(collections[input.targetType]).where('shoutId', '==', input.shoutId);
  if (input.targetType !== 'shout') query = query.where(input.targetType === 'comment' ? 'commentId' : 'privateReplyId', '==', input.targetId);
  return query.where('status', 'in', ['open', 'escalated']).limit(51).select(
    'reporterId', 'shoutId', 'status', 'createdAt', 'reason',
    ...(input.targetType === 'comment' ? ['commentId'] : input.targetType === 'privateReply' ? ['privateReplyId', 'authorId', 'text'] : []),
  );
}

function validateTarget(source, shout) {
  if (!source.exists || !shout.exists || isPurgedShoutContext(shout.data())) fail('not-found', 'The report target is unavailable.');
  if (!id(source.get('authorId')) || !(source.get('createdAt') instanceof Timestamp)) fail('failed-precondition', 'Invalid report target.');
}
function assertUnavailableReportGroup(reports, input) {
  const ids = reports.docs.map(d => d.id).sort();
  if (ids.length > 50 || JSON.stringify(ids) !== JSON.stringify(input.reportIds)) fail('failed-precondition', 'The report group changed.');
  for (const report of reports.docs) {
    const d = report.data(), suffix = input.targetType === 'shout' ? '' : `_${input.targetId}`;
    if (!id(d.reporterId) || report.id !== `${d.reporterId}_${input.shoutId}${suffix}` || d.shoutId !== input.shoutId ||
        !(d.createdAt instanceof Timestamp) || typeof d.reason !== 'string' || !d.reason ||
        input.targetType === 'comment' && d.commentId !== input.targetId ||
        input.targetType === 'privateReply' && (d.privateReplyId !== input.targetId || !id(d.authorId) ||
          d.reporterId === d.authorId || typeof d.text !== 'string')) fail('failed-precondition', 'Invalid unavailable report target.');
  }
}
export function assertContentReportGroup(reports, input, source) {
  const ids = reports.docs.map(d => d.id).sort();
  if (ids.length > 50) fail('failed-precondition', 'The report group exceeds the supported decision size.');
  if (JSON.stringify(ids) !== JSON.stringify(input.reportIds)) fail('failed-precondition', 'The report group changed. Refresh before deciding.');
  for (const report of reports.docs) {
    const d = report.data(), suffix = input.targetType === 'shout' ? '' : `_${input.targetId}`;
    if (!id(d.reporterId) || report.id !== `${d.reporterId}_${input.shoutId}${suffix}` || d.shoutId !== input.shoutId ||
        !(d.createdAt instanceof Timestamp) || typeof d.reason !== 'string' || !d.reason ||
        d.reporterId === source.get('authorId') ||
        source.createTime.seconds > report.createTime.seconds ||
        source.createTime.seconds === report.createTime.seconds && source.createTime.nanoseconds > report.createTime.nanoseconds ||
        input.targetType === 'comment' && d.commentId !== input.targetId ||
        input.targetType === 'privateReply' && (d.privateReplyId !== input.targetId || d.authorId !== source.get('authorId') ||
          d.reporterId !== source.get('recipientId') || d.text !== source.get('text') || typeof d.text !== 'string' ||
          JSON.stringify(source.get('participants')) !== JSON.stringify([d.authorId, d.reporterId]))) {
      fail('failed-precondition', 'The report target changed or is ambiguous.');
    }
    if (input.decision === 'escalate' && d.status !== 'open') fail('failed-precondition', 'The report was already escalated.');
  }
}

export async function decideContentReportsOperation(request, db, clock = () => new Date(), { resolveUnavailableTargets = false, guardEvidenceRetention = false } = {}) {
  if (typeof resolveUnavailableTargets !== 'boolean' || typeof guardEvidenceRetention !== 'boolean') throw new Error('invalid-unavailable-report-option');
  const { uid } = requireCallableIdentity(request), input = validateContentReportDecision(request.data);
  if (uid !== input.expectedUserId) fail('unauthenticated', 'The signed-in account changed.');
  const fingerprint = digest(JSON.stringify(input)), receiptRef = db.doc(`serverOperations/${digest(`${uid}\n${action}\n${input.idempotencyKey}`)}`);
  const unavailableRef = resolveUnavailableTargets && input.decision === 'resolve' ?
    db.doc(`serverOperations/${digest(`${uid}\n${unavailableAction}\n${input.idempotencyKey}`)}`) : null;
  const shoutRef = db.doc(`shouts/${input.shoutId}`), sourceRef = input.targetType === 'shout' ? shoutRef :
    shoutRef.collection(input.targetType === 'comment' ? 'comments' : 'privateReplies').doc(input.targetId);
  const clearanceRef = db.doc(`moderationClearances/${input.targetType}_${input.shoutId}${input.targetId === undefined ? '' : `_${input.targetId}`}`);
  return db.runTransaction(async tx => {
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) fail('failed-precondition', 'operation-clock-unavailable');
    const now = Timestamp.fromDate(date);
    await requireEligibleActor({ request, db, reader: tx, now: date });
    const [role, legacy, primaryReceipt, shout, unavailableReceipt] = await tx.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`), receiptRef, shoutRef, ...(unavailableRef ? [unavailableRef] : []));
    if (primaryReceipt.exists && unavailableReceipt?.exists) fail('failed-precondition', 'Ambiguous stored decision result.');
    const receipt = unavailableReceipt?.exists ? unavailableReceipt : primaryReceipt;
    const level = privateReportModeratorLevel(role.data(), legacy.data());
    assertPrivateReportScope(role.data(), level, shout.data());
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const stored = receipt.data();
      const unavailable = unavailableReceipt?.exists === true;
      if (stored.action !== (unavailable ? unavailableAction : action) || stored.fingerprint !== fingerprint) fail('already-exists', 'Idempotency key was already used for another payload.');
      if (stored.userId !== uid || stored.shoutId !== input.shoutId || stored.targetType !== input.targetType ||
          stored.targetId !== input.targetId || JSON.stringify(stored.reportIds) !== JSON.stringify(input.reportIds) ||
          (unavailable ? stored.targetUnavailable !== true || stored.authorId !== undefined : !id(stored.authorId)) || ![3, 4].includes(stored.requiredRoleLevel) ||
          stored.result?.decision !== input.decision || stored.result?.count !== input.reportIds.length) fail('failed-precondition', 'Invalid stored decision result.');
      if (level < stored.requiredRoleLevel) fail('permission-denied', 'Senior moderator permission is required.');
      return { decision: input.decision, count: input.reportIds.length };
    }
    const [source, clearance] = input.targetType === 'shout' ? [shout, await tx.get(clearanceRef)] : await tx.getAll(sourceRef, clearanceRef);
    const unavailable = unavailableRef !== null && (!source.exists || input.targetType === 'shout' && isPurgedShoutContext(shout.data()));
    const contextChild = unavailableRef !== null && input.targetType !== 'shout' && source.exists && (!shout.exists || isPurgedShoutContext(shout.data()));
    if (!unavailable && !contextChild) validateTarget(source, shout);
    if (contextChild && (!id(source.get('authorId')) || !(source.get('createdAt') instanceof Timestamp))) fail('failed-precondition', 'Invalid report target.');
    if (!unavailable && clearance.exists) fail('failed-precondition', 'The content was already approved.');
    const reports = await tx.get(pendingContentReports(db, input));
    if (unavailable) assertUnavailableReportGroup(reports, input);
    else assertContentReportGroup(reports, input, source);
    if (guardEvidenceRetention && input.decision === 'approve') await assertReportEvidenceRetention(tx, db, reports, now);
    const requiredRoleLevel = reports.docs.some(d => d.get('status') === 'escalated') ? 4 : 3;
    if (level < requiredRoleLevel) fail('permission-denied', 'Senior moderator permission is required.');
    if (unavailable && shout.exists && level < 5 && role.get('moderationScope')?.global !== true &&
        reports.docs.some(d => shout.createTime.seconds > d.createTime.seconds || shout.createTime.seconds === d.createTime.seconds && shout.createTime.nanoseconds > d.createTime.nanoseconds)) {
      fail('permission-denied', 'The original parent geography is unavailable.');
    }
    const operationRef = unavailable ? unavailableRef : receiptRef;
    if (input.decision === 'approve') tx.create(clearanceRef, {
      targetType: input.targetType, shoutId: input.shoutId, contentId: input.targetId ?? input.shoutId,
      moderatorId: uid, createdAt: now, reason: input.note || 'Obsah byl zkontrolován a je v pořádku.', sourceReportIds: input.reportIds,
    });
    for (const report of reports.docs) tx.update(report.ref, input.decision === 'escalate' ? {
      status: 'escalated', assignedRole: 'seniorModerator', escalatedBy: uid, escalatedAt: now,
      escalationOperationId: operationRef.id, ...(input.note ? { escalationNote: input.note } : {}),
    } : {
      status: 'resolved', resolution: input.decision === 'approve' ? 'contentApproved' : 'noAction',
      resolvedBy: uid, resolvedAt: now, decisionOperationId: operationRef.id, ...(input.note ? { moderatorNote: input.note } : {}),
    });
    const result = { decision: input.decision, count: reports.size };
    tx.create(operationRef, { ...retention, action: unavailable ? unavailableAction : action, userId: uid, fingerprint, targetType: input.targetType,
      shoutId: input.shoutId, ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
      reportIds: input.reportIds, ...(unavailable ? { targetUnavailable: true } : { authorId: source.get('authorId') }), requiredRoleLevel, result, createdAt: now });
    return result;
  });
}
