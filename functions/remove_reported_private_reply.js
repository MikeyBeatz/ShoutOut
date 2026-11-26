// Local-only core. No callable export, client activation or live Rules change.
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { receiptRetentionFields } from './operation_retention.js';
import { lifecycleEnabled } from './content_lifecycle.js';
import { resolveLifecycleReportGroup, lifecycleEvidenceReference } from './content_lifecycle_evidence.js';

const action = 'removeReportedPrivateReply';
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const fail = (code, text) => { throw new HttpsError(code, text); };
const unavailable = () => fail('not-found', 'The reported private reply is unavailable.');

export function validateReportedPrivateReplyRemoval(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['expectedUserId', 'reportId', 'idempotencyKey', 'note'].includes(k)) ||
      !identifier(input.expectedUserId) || !identifier(input.idempotencyKey) ||
      typeof input.reportId !== 'string' || !/^[A-Za-z0-9_-]{1,386}$/.test(input.reportId) ||
      input.note !== undefined && (typeof input.note !== 'string' || [...input.note].length > 500)) {
    fail('invalid-argument', 'Invalid private report decision fields.');
  }
  return { expectedUserId: input.expectedUserId, reportId: input.reportId,
    idempotencyKey: input.idempotencyKey, note: (input.note ?? '').trim() };
}

// Match the fixed 1–6 hierarchy and the existing active legacy moderator marker.
// A legacy marker does not grant geography: scope still comes from accountRoles.
export function privateReportModeratorLevel(role, legacy) {
  const level = role?.level;
  if (role?.accountStatus !== 'deleted' && Number.isInteger(level) && level >= 3 && level <= 6) return level;
  if (legacy && typeof legacy === 'object' && legacy.accountStatus !== 'deleted') return 3;
  fail('permission-denied', 'Moderator permission is required.');
}

export function assertPrivateReportScope(role, level, shout) {
  // Administrators and owners already have global geography in canonical Rules.
  if (level >= 5) return;
  const scope = role?.moderationScope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) ||
      scope.global !== undefined && typeof scope.global !== 'boolean' ||
      ['countries', 'subdivisions'].some(k => scope[k] !== undefined &&
        (!Array.isArray(scope[k]) || scope[k].some(v => typeof v !== 'string' || !v)))) {
    fail('permission-denied', 'Moderator geography is unavailable.');
  }
  if (scope.global === true) return;
  const geography = shout?.geography;
  if (geography?.schemaVersion === 1 &&
      (typeof geography.countryCode === 'string' && geography.countryCode && (scope.countries ?? []).includes(geography.countryCode) ||
       typeof geography.subdivisionCode === 'string' && geography.subdivisionCode && (scope.subdivisions ?? []).includes(geography.subdivisionCode))) return;
  fail('permission-denied', 'The report is outside the moderator geography.');
}

function reportTarget(report, managed = false) {
  if (!report.exists) return unavailable();
  const data = report.data();
  if (!identifier(data.shoutId) || !identifier(data.privateReplyId) || !identifier(data.reporterId) ||
      !identifier(data.authorId) || data.reporterId === data.authorId ||
      report.id !== `${data.reporterId}_${data.shoutId}_${data.privateReplyId}` ||
      (!managed && typeof data.text !== 'string') || typeof data.reason !== 'string' || !data.reason ||
      !(data.createdAt instanceof Timestamp)) {
    fail('failed-precondition', 'Invalid stored private report.');
  }
  if (!['open', 'escalated'].includes(data.status)) fail('failed-precondition', 'The report is no longer open.');
  return data;
}
function assertTargetIncarnation(report, source, data) {
  if (!source.exists) return unavailable();
  const body = source.data();
  if (body.authorId !== data.authorId || body.recipientId !== data.reporterId || body.text !== data.text ||
      !Array.isArray(body.participants) || body.participants.length !== 2 ||
      body.participants[0] !== body.authorId || body.participants[1] !== body.recipientId ||
      !(body.createdAt instanceof Timestamp) || source.createTime.seconds > report.createTime.seconds ||
      source.createTime.seconds === report.createTime.seconds && source.createTime.nanoseconds > report.createTime.nanoseconds) {
    fail('failed-precondition', 'The private report target changed.');
  }
}

export async function removeReportedPrivateReplyOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request), input = validateReportedPrivateReplyRemoval(request.data);
  if (input.expectedUserId !== uid) fail('unauthenticated', 'The signed-in account changed.');
  const fingerprint = digest(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${digest(`${uid}\n${action}\n${input.idempotencyKey}`)}`);
  const reportRef = db.doc(`privateReplyReports/${input.reportId}`);
  return db.runTransaction(async tx => {
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) fail('failed-precondition', 'operation-clock-unavailable');
    const now = Timestamp.fromDate(date);
    await requireEligibleActor({ request, db, reader: tx, now: date });
    const [role, legacy, receipt] = await tx.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`), receiptRef);
    const level = privateReportModeratorLevel(role.data(), legacy.data());
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const stored = receipt.data();
      if (stored.action !== action || stored.fingerprint !== fingerprint) fail('already-exists', 'Idempotency key was already used for another payload.');
      if (stored.userId !== uid || stored.reportId !== input.reportId || !identifier(stored.shoutId) ||
          !identifier(stored.privateReplyId) || ![3, 4].includes(stored.requiredRoleLevel) ||
          stored.result?.removed !== true) fail('failed-precondition', 'Invalid stored decision result.');
      if (level < stored.requiredRoleLevel) fail('permission-denied', 'Senior moderator permission is required.');
      // Check current authority, never the role supplied in an old request.
      const shout = await tx.get(db.doc(`shouts/${stored.shoutId}`));
      assertPrivateReportScope(role.data(), level, lifecycleEnabled(db) && (stored.contentArchiveKey || stored.accountArchiveId) ? { geography: stored.moderationGeography } : shout.data());
      return { removed: true };
    }
    const managed = lifecycleEnabled(db), report = await tx.get(reportRef), data = reportTarget(report, managed);
    const requiredRoleLevel = data.status === 'escalated' ? 4 : 3;
    if (level < requiredRoleLevel) fail('permission-denied', 'Senior moderator permission is required.');
    const sourceRef = db.doc(`shouts/${data.shoutId}/privateReplies/${data.privateReplyId}`);
    const [shout, source] = await tx.getAll(db.doc(`shouts/${data.shoutId}`), sourceRef);
    const evidence = managed ? await resolveLifecycleReportGroup(tx, db, { docs: [report] }, {
      targetType: 'privateReply', shoutId: data.shoutId, targetId: data.privateReplyId, reportIds: [report.id], decision: 'remove',
    }, source, now) : null;
    assertPrivateReportScope(role.data(), level, evidence ? { geography: evidence.geography } : shout.data());
    if (!managed) assertTargetIncarnation(report, source, data);
    if (source.exists) tx.delete(sourceRef);
    tx.update(reportRef, { status: 'resolved', resolution: 'contentRemoved', resolvedAt: now,
      resolvedBy: uid, decisionOperationId: receiptRef.id, ...(input.note ? { moderatorNote: input.note } : {}) });
    tx.create(receiptRef, { ...retention, action, userId: uid, reportId: report.id,
      shoutId: data.shoutId, privateReplyId: data.privateReplyId, requiredRoleLevel,
      fingerprint, ...lifecycleEvidenceReference(evidence), result: { removed: true }, createdAt: now });
    // Report body/reason, archive, related messages, rate counters and feed stay intact.
    return { removed: true };
  });
}
