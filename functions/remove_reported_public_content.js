// Atomic public removal core; the callable host supplies the managed writer.
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { validateContentReportDecision, pendingContentReports, assertContentReportGroup } from './decide_content_reports.js';
import { privateReportModeratorLevel, assertPrivateReportScope } from './remove_reported_private_reply.js';
import { receiptRetentionFields } from './operation_retention.js';
import { nextDeleteRate } from './delete_comment.js';
import { prepareCardMutation } from './feed_card_state.js';
import { isPurgedShoutContext } from './shout_context.js';

const action = 'removeReportedPublicContent';
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const counter = value => Number.isSafeInteger(value) && value >= 0;
const fail = (code, message) => { throw new HttpsError(code, message); };

export function validatePublicContentRemoval(data) {
  if (!data || data.decision !== 'remove' || !['shout', 'comment'].includes(data.targetType)) {
    fail('invalid-argument', 'Invalid public report removal.');
  }
  // Reuse the exact bounded group/target/note contract of existing decisions.
  return { ...validateContentReportDecision({ ...data, decision: 'resolve' }), decision: 'remove' };
}

export async function removeReportedPublicContentOperation(request, db, clock = () => new Date(), { indexWriter = null } = {}) {
  const { uid } = requireCallableIdentity(request), input = validatePublicContentRemoval(request.data);
  if (uid !== input.expectedUserId) fail('unauthenticated', 'The signed-in account changed.');
  const fingerprint = digest(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${digest(`${uid}\n${action}\n${input.idempotencyKey}`)}`);
  const shoutRef = db.doc(`shouts/${input.shoutId}`);
  const sourceRef = input.targetType === 'shout' ? shoutRef : shoutRef.collection('comments').doc(input.targetId);
  const clearanceRef = db.doc(`moderationClearances/${input.targetType}_${input.shoutId}${input.targetId === undefined ? '' : `_${input.targetId}`}`);
  return db.runTransaction(async tx => {
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) fail('failed-precondition', 'operation-clock-unavailable');
    const now = Timestamp.fromDate(date);
    await requireEligibleActor({ request, db, reader: tx, now: date });
    const [role, legacy, receipt, shout] = await tx.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`), receiptRef, shoutRef);
    const level = privateReportModeratorLevel(role.data(), legacy.data());
    assertPrivateReportScope(role.data(), level, shout.data());
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const stored = receipt.data();
      if (stored.action !== action || stored.fingerprint !== fingerprint) fail('already-exists', 'Idempotency key was already used for another payload.');
      if (stored.userId !== uid || stored.shoutId !== input.shoutId || stored.targetType !== input.targetType ||
          stored.targetId !== input.targetId || JSON.stringify(stored.reportIds) !== JSON.stringify(input.reportIds) ||
          !identifier(stored.authorId) || ![3, 4].includes(stored.requiredRoleLevel) ||
          stored.result?.removed !== true || stored.result?.count !== input.reportIds.length) fail('failed-precondition', 'Invalid stored removal result.');
      if (level < stored.requiredRoleLevel) fail('permission-denied', 'Senior moderator permission is required.');
      return { removed: true, count: input.reportIds.length };
    }
    const [source, clearance] = input.targetType === 'shout' ? [shout, await tx.get(clearanceRef)] : await tx.getAll(sourceRef, clearanceRef);
    if (!source.exists || !shout.exists || input.targetType === 'shout' && isPurgedShoutContext(shout.data())) fail('not-found', 'The report target is unavailable.');
    if (!identifier(source.get('authorId')) || !(source.get('createdAt') instanceof Timestamp)) fail('failed-precondition', 'Invalid report target.');
    if (clearance.exists) fail('failed-precondition', 'The content was already approved.');
    const reports = await tx.get(pendingContentReports(db, input));
    assertContentReportGroup(reports, input, source);
    const requiredRoleLevel = reports.docs.some(d => d.get('status') === 'escalated') ? 4 : 3;
    if (level < requiredRoleLevel) fail('permission-denied', 'Senior moderator permission is required.');
    const body = shout.data();
    let plan, remainingComments, rateRef, rateData;
    if (input.targetType === 'shout') {
      if (typeof indexWriter?.prepare !== 'function') fail('failed-precondition', 'The feed index writer is required.');
      plan = await indexWriter.prepare(tx, input.shoutId, body, { ...body, status: 'deleted' },
        { operationId: receiptRef.id, additionalWrites: reports.size + 1 });
      if (typeof plan?.apply !== 'function') throw new Error('invalid-public-removal-index-plan');
    } else {
      rateRef = db.doc(`rateLimits/${uid}/actions/delete`);
      const rate = await tx.get(rateRef);
      rateData = nextDeleteRate(rate.data(), now, input.targetId);
      if (!isPurgedShoutContext(body)) {
        const count = body.commentsCount ?? 0;
        if (![body.likesCount, body.dislikesCount, body.savesCount, count].every(counter)) fail('failed-precondition', 'Invalid stored Shout counters.');
        remainingComments = Math.max(0, count - 1);
        plan = await prepareCardMutation(db, tx, input.shoutId, body, { ...body, commentsCount: remainingComments },
          { operationId: receiptRef.id, additionalWrites: reports.size + 3 });
      }
    }
    plan?.apply();
    if (input.targetType === 'shout') {
      if (body.status !== 'deleted') tx.update(shoutRef, { status: 'deleted' });
    } else {
      tx.delete(sourceRef);
      if (remainingComments !== undefined) tx.update(shoutRef, { commentsCount: remainingComments });
      tx.set(rateRef, rateData);
    }
    for (const report of reports.docs) tx.update(report.ref, {
      status: 'resolved', resolution: 'contentRemoved', resolvedBy: uid, resolvedAt: now,
      decisionOperationId: receiptRef.id, ...(input.note ? { moderatorNote: input.note } : {}),
    });
    const result = { removed: true, count: reports.size };
    tx.create(receiptRef, { ...retention, action, userId: uid, fingerprint, targetType: input.targetType,
      shoutId: input.shoutId, ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
      reportIds: input.reportIds, authorId: source.get('authorId'), requiredRoleLevel, result, createdAt: now });
    return result;
  });
}
