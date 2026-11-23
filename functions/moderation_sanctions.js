// Prepared server core and host declarations; no live activation.
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { receiptRetentionFields } from './operation_retention.js';
import { privateReportModeratorLevel, assertPrivateReportScope } from './remove_reported_private_reply.js';
import { validateContentReportDecision, pendingContentReports, assertContentReportGroup } from './decide_content_reports.js';
import { isPurgedShoutContext } from './shout_context.js';

// Activate with the checked client/Rules cutover, never by deploying this preparation.
export const managedModerationAuthorityEnabled = false;

const day = 86400000, hash = value => createHash('sha256').update(value).digest('hex');
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const fail = (code, message) => { throw new HttpsError(code, message); };
export const sanctionActions = Object.freeze({
  warning: { type: 'warning', days: null, role: 3, retention: 180 },
  restrict1d: { type: 'contentRestriction', days: 1, role: 3, retention: 365 },
  restrict7d: { type: 'contentRestriction', days: 7, role: 3, retention: 365 },
  restrict30d: { type: 'contentRestriction', days: 30, role: 3, retention: 365 },
  restrict90d: { type: 'contentRestriction', days: 90, role: 4, retention: 365 },
  ban1d: { type: 'accountBan', days: 1, role: 3, retention: 730 },
  ban7d: { type: 'accountBan', days: 7, role: 3, retention: 730 },
  ban30d: { type: 'accountBan', days: 30, role: 3, retention: 730 },
  ban90d: { type: 'accountBan', days: 90, role: 4, retention: 730 },
  banPermanent: { type: 'accountBan', days: null, role: 4, retention: null },
});
const activeCollection = type => type === 'accountBan' ? 'bans' : 'contentRestrictions';
function reason(value) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > 500) fail('invalid-argument', 'A concrete sanction reason is required.');
  return value.trim();
}
export function validateSanctionContent(data) {
  const allowed = ['expectedUserId', 'expectedTargetUserId', 'expectedCreatedAt', 'idempotencyKey', 'mode', 'targetType', 'shoutId', 'targetId', 'reportIds', 'sourceReportId', 'decision', 'note'];
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !allowed.includes(k)) ||
      !id(data.expectedTargetUserId) || !Object.hasOwn(sanctionActions, data.decision ?? '') ||
      !['report', 'observation'].includes(data.mode)) fail('invalid-argument', 'Invalid sanction fields.');
  const target = validateContentReportDecision({ expectedUserId: data.expectedUserId, idempotencyKey: data.idempotencyKey,
    targetType: data.targetType, shoutId: data.shoutId, ...(data.targetId === undefined ? {} : { targetId: data.targetId }),
    reportIds: data.mode === 'report' ? data.reportIds : ['observation'], decision: 'resolve', note: data.note });
  if (data.mode === 'report' ? data.expectedCreatedAt !== undefined || !target.reportIds.includes(data.sourceReportId) :
    data.reportIds !== undefined || data.sourceReportId !== undefined || !Number.isSafeInteger(data.expectedCreatedAt) || data.expectedCreatedAt <= 0) fail('invalid-argument', 'Invalid sanction source identity.');
  return { ...target, decision: data.decision, note: reason(data.note), mode: data.mode,
    expectedTargetUserId: data.expectedTargetUserId,
    ...(data.mode === 'report' ? { sourceReportId: data.sourceReportId } : { reportIds: [], expectedCreatedAt: data.expectedCreatedAt }) };
}
function nowAt(clock) {
  const date = clock();
  if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) fail('failed-precondition', 'operation-clock-unavailable');
  return Timestamp.fromDate(date);
}
async function targetAccount(tx, db, uid, moderator, moderatorLevel) {
  const [profile, role, legacy, deletion, marker] = await tx.getAll(db.doc(`users/${uid}`), db.doc(`accountRoles/${uid}`),
    db.doc(`moderators/${uid}`), db.doc(`accountDeletionRequests/${uid}`), db.doc(`publicProfiles/${uid}`));
  if (!profile.exists || deletion.exists || [profile, role, marker].some(d => d.get('accountStatus') === 'deleted')) fail('failed-precondition', 'The target account is unavailable.');
  let level = 1;
  if (role.exists && role.get('level') !== undefined) {
    level = role.get('level');
    if (!Number.isInteger(level) || level < 1 || level > 6) fail('failed-precondition', 'Invalid target role.');
  } else if (legacy.exists && legacy.get('accountStatus') !== 'deleted') level = 3;
  if (uid === moderator || level >= moderatorLevel) fail('permission-denied', 'A peer or higher account cannot be sanctioned.');
}
function activeBinding(current, next, now) {
  if (!current) return next;
  if (current.userId !== next.userId || !id(current.sanctionId) ||
      current.expiresAt !== null && !(current.expiresAt instanceof Timestamp)) fail('failed-precondition', 'Invalid active sanction.');
  if (current.expiresAt && current.expiresAt.toMillis() <= now.toMillis()) return next;
  // Approved policy: record every decision, never shorten the active binding.
  // Equal expirations preserve the original pointer and avoid an extra write.
  if (current.expiresAt === null || next.expiresAt && current.expiresAt.toMillis() >= next.expiresAt.toMillis()) return current;
  return next;
}
export async function sanctionContentOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request), input = validateSanctionContent(request.data);
  if (uid !== input.expectedUserId) fail('unauthenticated', 'The signed-in account changed.');
  const action = 'sanctionContent', fingerprint = hash(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${hash(`${uid}\n${action}\n${input.idempotencyKey}`)}`), sanctionRef = db.doc(`sanctions/${receiptRef.id}`);
  const shoutRef = db.doc(`shouts/${input.shoutId}`), sourceRef = input.targetType === 'shout' ? shoutRef :
    shoutRef.collection(input.targetType === 'comment' ? 'comments' : 'privateReplies').doc(input.targetId);
  return db.runTransaction(async tx => {
    const now = nowAt(clock), policy = sanctionActions[input.decision];
    await requireEligibleActor({ request, db, reader: tx, now: now.toDate() });
    const [role, legacy, receipt, shout] = await tx.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`), receiptRef, shoutRef);
    const level = privateReportModeratorLevel(role.data(), legacy.data()); assertPrivateReportScope(role.data(), level, shout.data());
    if (level < policy.role) fail('permission-denied', 'Senior moderator permission is required.');
    await targetAccount(tx, db, input.expectedTargetUserId, uid, level);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const stored = receipt.data();
      if (stored.action !== action || stored.fingerprint !== fingerprint) fail('already-exists', 'Idempotency key was already used for another payload.');
      if (stored.userId !== uid || stored.authorId !== input.expectedTargetUserId || stored.sanctionId !== sanctionRef.id ||
          stored.targetType !== input.targetType || stored.shoutId !== input.shoutId || stored.targetId !== input.targetId ||
          JSON.stringify(stored.reportIds) !== JSON.stringify(input.reportIds) ||
          stored.result?.sanctionId !== sanctionRef.id || stored.result?.decision !== input.decision ||
          stored.result?.count !== input.reportIds.length || ![3, 4].includes(stored.requiredRoleLevel)) fail('failed-precondition', 'Invalid stored sanction result.');
      if (level < stored.requiredRoleLevel) fail('permission-denied', 'Senior moderator permission is required.');
      return { sanctionId: sanctionRef.id, decision: input.decision, count: input.reportIds.length };
    }
    const source = input.targetType === 'shout' ? shout : await tx.get(sourceRef);
    if (!source.exists || !shout.exists || isPurgedShoutContext(shout.data())) fail('not-found', 'The sanction source is unavailable.');
    const body = source.data();
    if (body.authorId !== input.expectedTargetUserId || !(body.createdAt instanceof Timestamp) ||
        input.mode === 'observation' && body.createdAt.toMillis() !== input.expectedCreatedAt) fail('failed-precondition', 'The sanction source changed.');
    if (input.targetType === 'privateReply' && (typeof body.text !== 'string' || !id(body.recipientId) ||
        JSON.stringify(body.participants) !== JSON.stringify([body.authorId, body.recipientId]))) fail('failed-precondition', 'Invalid private source.');
    const clearance = await tx.get(db.doc(`moderationClearances/${input.targetType}_${input.shoutId}${input.targetId === undefined ? '' : `_${input.targetId}`}`));
    if (clearance.exists) fail('failed-precondition', 'The content was already approved.');
    const reports = input.mode === 'report' ? await tx.get(pendingContentReports(db, input)) : null;
    if (reports) assertContentReportGroup(reports, { ...input, decision: 'resolve' }, source);
    const requiredRoleLevel = Math.max(policy.role, reports?.docs.some(d => d.get('status') === 'escalated') ? 4 : 3);
    if (level < requiredRoleLevel) fail('permission-denied', 'Senior moderator permission is required.');
    const previous = await tx.get(db.collection('sanctions').where('userId', '==', body.authorId).limit(50).select());
    const warningRef = db.doc(`warnings/${sanctionRef.id}`), pointerRef = policy.type === 'warning' ? null : db.doc(`${activeCollection(policy.type)}/${body.authorId}`);
    const pointer = pointerRef ? await tx.get(pointerRef) : null;
    const permanent = input.decision === 'banPermanent', expiresAt = policy.days === null ? null : Timestamp.fromMillis(now.toMillis() + policy.days * day);
    const purgeAt = Timestamp.fromMillis(permanent ? Date.UTC(9999, 11, 31) : (expiresAt?.toMillis() ?? now.toMillis()) + policy.retention * day);
    const active = { userId: body.authorId, reason: input.note, createdAt: now, expiresAt, moderatorId: uid, sanctionId: sanctionRef.id };
    const current = pointer?.data(), next = pointerRef ? activeBinding(current, active, now) : null;
    tx.create(sanctionRef, { userId: body.authorId, type: policy.type, reason: input.note, createdAt: now, expiresAt, permanent,
      moderatorId: uid, status: 'active', sourceReportId: input.sourceReportId ?? '', previousSanctionsCount: previous.size, purgeAt,
      sourceType: input.mode === 'report' ? 'report' : 'moderatorObservation', sourceContentType: input.targetType,
      sourceContentId: input.targetId ?? input.shoutId, contentSnapshot: { ...body, shoutId: input.shoutId } });
    if (pointerRef) { if (next !== current) tx.set(pointerRef, next); }
    else tx.create(warningRef, { userId: body.authorId, reason: input.note, createdAt: now, moderatorId: uid, sanctionId: sanctionRef.id });
    for (const report of reports?.docs ?? []) tx.update(report.ref, { status: 'resolved', resolution: 'sanctioned', resolvedAt: now,
      resolvedBy: uid, decisionOperationId: receiptRef.id, moderatorNote: input.note });
    const result = { sanctionId: sanctionRef.id, decision: input.decision, count: input.reportIds.length };
    tx.create(receiptRef, { ...retention, action, userId: uid, authorId: body.authorId, fingerprint, requiredRoleLevel, sanctionId: sanctionRef.id,
      targetType: input.targetType, shoutId: input.shoutId, ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
      reportIds: input.reportIds, result, createdAt: now });
    return result;
  });
}

export async function revokeSanctionOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request), data = request.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !['expectedUserId', 'sanctionId', 'note', 'idempotencyKey'].includes(k)) ||
      !id(data.sanctionId) || !id(data.idempotencyKey) || data.expectedUserId !== uid) fail('invalid-argument', 'Invalid sanction revocation.');
  const input = { expectedUserId: uid, sanctionId: data.sanctionId, note: reason(data.note), idempotencyKey: data.idempotencyKey };
  const action = 'revokeSanction', fingerprint = hash(JSON.stringify(input)), receiptRef = db.doc(`serverOperations/${hash(`${uid}\n${action}\n${input.idempotencyKey}`)}`);
  const sanctionRef = db.doc(`sanctions/${input.sanctionId}`), revocationRef = db.doc(`sanctionRevocations/${input.sanctionId}`);
  return db.runTransaction(async tx => {
    const now = nowAt(clock); await requireEligibleActor({ request, db, reader: tx, now: now.toDate() });
    const [role, legacy, receipt, sanction, revocation] = await tx.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`), receiptRef, sanctionRef, revocationRef);
    const level = privateReportModeratorLevel(role.data(), legacy.data()), retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    const original = sanction.data();
    if (!sanction.exists || !id(original.userId) || !['accountBan', 'contentRestriction'].includes(original.type) ||
        typeof original.permanent !== 'boolean' || !(original.purgeAt instanceof Timestamp)) fail('failed-precondition', 'The sanction is unavailable.');
    await targetAccount(tx, db, original.userId, uid, level);
    // Existing revocation authority: own temporary decision or senior review.
    if (level < 4 && (original.moderatorId !== uid || original.permanent)) fail('permission-denied', 'Senior moderator permission is required.');
    if (receipt.exists) {
      const stored = receipt.data();
      if (stored.action !== action || stored.fingerprint !== fingerprint) fail('already-exists', 'Idempotency key was already used for another payload.');
      if (stored.userId !== uid || stored.authorId !== original.userId || stored.sanctionId !== sanction.id || stored.result?.revoked !== true ||
          !revocation.exists || revocation.get('revokedBy') !== uid || revocation.get('userId') !== original.userId ||
          revocation.get('sanctionId') !== sanction.id || revocation.get('originalType') !== original.type ||
          !(revocation.get('createdAt') instanceof Timestamp)) fail('failed-precondition', 'Invalid stored revocation result.');
      return { revoked: true };
    }
    if (revocation.exists) fail('already-exists', 'The sanction was already revoked.');
    if (original.purgeAt.toMillis() <= now.toMillis()) fail('failed-precondition', 'The sanction retention expired.');
    const pointerRef = db.doc(`${activeCollection(original.type)}/${original.userId}`), pointer = await tx.get(pointerRef);
    if (!pointer.exists || pointer.get('sanctionId') !== sanction.id) fail('failed-precondition', 'The active sanction changed.');
    tx.create(revocationRef, { userId: original.userId, sanctionId: sanction.id, originalType: original.type, reason: input.note,
      createdAt: now, revokedBy: uid, purgeAt: original.purgeAt });
    tx.delete(pointerRef);
    tx.create(receiptRef, { ...retention, action, userId: uid, authorId: original.userId, fingerprint, sanctionId: sanction.id,
      result: { revoked: true }, createdAt: now });
    return { revoked: true };
  });
}
