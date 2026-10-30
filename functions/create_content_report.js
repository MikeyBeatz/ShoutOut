import { receiptRetentionFields } from './operation_retention.js';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const collections = { shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' };

export function validateContentReport(input) {
  const fields = ['idempotencyKey', 'expectedUserId', 'targetType', 'shoutId', 'targetId', 'reason'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !fields.includes(k)) ||
      !identifier(input.idempotencyKey) || !identifier(input.shoutId) ||
      typeof input.targetType !== 'string' || !Object.hasOwn(collections, input.targetType) ||
      (input.expectedUserId !== undefined && !identifier(input.expectedUserId)) ||
      (input.targetType === 'shout' ? input.targetId !== undefined : !identifier(input.targetId)) ||
      typeof input.reason !== 'string' || [...input.reason].length < 1 || [...input.reason].length > 500) {
    fail('invalid-argument', 'Invalid content report fields.');
  }
  return Object.fromEntries(fields.filter(k => input[k] !== undefined).map(k => [k, input[k]]));
}

// Shared with all legacy report/bug-report writes: 20/day and one minute.
export function nextReportRate(data, now, eventId) {
  if (data) {
    if (!(data.lastAt instanceof Timestamp) || !(data.windowStartedAt instanceof Timestamp) ||
        !Number.isSafeInteger(data.count) || data.count < 1) {
      fail('failed-precondition', 'Invalid stored report rate.');
    }
    if (now.toMillis() < data.lastAt.toMillis() + 60000) {
      fail('resource-exhausted', 'rate-report-cooldown');
    }
  }
  const reset = !data || now.toMillis() >= data.windowStartedAt.toMillis() + 86400000;
  const count = reset ? 1 : data.count + 1;
  if (count > 20) fail('resource-exhausted', 'rate-report-daily-limit');
  return { lastAt: now, lastEventId: eventId, windowStartedAt: reset ? now : data.windowStartedAt, count };
}

export async function createContentReportOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request);
  const input = validateContentReport(request.data);
  if (input.expectedUserId !== undefined && input.expectedUserId !== uid) {
    fail('unauthenticated', 'The signed-in account changed.');
  }
  const { targetType, shoutId, targetId, reason } = input;
  const reportId = `${uid}_${shoutId}${targetId === undefined ? '' : `_${targetId}`}`;
  const collection = collections[targetType];
  const targetPath = `shouts/${shoutId}` + (targetType === 'shout' ? '' :
    `/${targetType === 'comment' ? 'comments' : 'privateReplies'}/${targetId}`);
  const clearanceId = `${targetType}_${shoutId}${targetId === undefined ? '' : `_${targetId}`}`;
  const receiptRef = db.doc(`serverOperations/${digest(`${uid}\ncreateContentReport\n${input.idempotencyKey}`)}`);
  const reportRef = db.doc(`${collection}/${reportId}`);
  const rateRef = db.doc(`rateLimits/${uid}/actions/report`);
  const fingerprint = digest(JSON.stringify(input));
  return db.runTransaction(async transaction => {
    const now = Timestamp.fromDate(clock());
    // Content restrictions deliberately do not remove the ability to report.
    await requireEligibleActor({ request, db, reader: transaction, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const data = receipt.data();
      if (data.action !== 'createContentReport' || data.fingerprint !== fingerprint) {
        fail('already-exists', 'Idempotency key was already used for another payload.');
      }
      if (data.userId !== uid || data.reportId !== reportId || data.collection !== collection) {
        fail('failed-precondition', 'Invalid stored operation result.');
      }
      return { reportId };
    }
    const [target, clearance, existing, rate] = await transaction.getAll(
      db.doc(targetPath), db.doc(`moderationClearances/${clearanceId}`), reportRef, rateRef,
    );
    const content = target.data();
    // Outsiders and senders cannot discover or copy a private message by ID.
    if (!target.exists || (targetType === 'privateReply' &&
        (content.recipientId !== uid || content.authorId === uid))) {
      fail('not-found', 'The report target is unavailable.');
    }
    if (!identifier(content.authorId) || (targetType === 'privateReply' && typeof content.text !== 'string')) {
      fail('failed-precondition', 'Invalid stored report target.');
    }
    if (content.authorId === uid) fail('permission-denied', 'You cannot report your own content.');
    if (clearance.exists) fail('failed-precondition', 'The content was already approved.');
    if (existing.exists) fail('already-exists', 'This content has already been reported by this account.');
    const data = { reporterId: uid, shoutId, reason, status: 'open', createdAt: now };
    if (targetType === 'comment') data.commentId = targetId;
    if (targetType === 'privateReply') Object.assign(data, {
      privateReplyId: targetId, authorId: content.authorId, text: content.text, priority: 'high',
    });
    const rateData = nextReportRate(rate.data(), now, reportId);
    transaction.create(reportRef, data);
    transaction.set(rateRef, rateData);
    // Private text and report reason are not copied into the receipt.
    transaction.create(receiptRef, { ...retention, userId: uid, action: 'createContentReport', fingerprint,
      collection, reportId, targetType, shoutId, ...(targetId === undefined ? {} : { targetId }), createdAt: now });
    return { reportId };
  });
}
