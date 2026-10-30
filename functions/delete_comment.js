import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const counter = (value) => Number.isSafeInteger(value) && value >= 0;

export function validateCommentDeletion(input) {
  const fields = ['idempotencyKey', 'shoutId', 'commentId', 'expectedUserId'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !fields.includes(key)) ||
      !identifier(input.idempotencyKey) || !identifier(input.shoutId) ||
      !identifier(input.commentId) ||
      (input.expectedUserId !== undefined && !identifier(input.expectedUserId))) {
    fail('invalid-argument', 'Invalid comment deletion fields.');
  }
  return Object.fromEntries(fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

// The existing shared delete bucket: 120/hour, one second between deletions.
export function nextDeleteRate(data, now, eventId) {
  if (data) {
    if (!(data.lastAt instanceof Timestamp) || !(data.windowStartedAt instanceof Timestamp) ||
        !Number.isSafeInteger(data.count) || data.count < 1) {
      fail('failed-precondition', 'Invalid stored rate limit.');
    }
    if (now.toMillis() < data.lastAt.toMillis() + 1000) {
      fail('resource-exhausted', 'rate-delete-cooldown');
    }
  }
  const reset = !data || now.toMillis() >= data.windowStartedAt.toMillis() + 3600000;
  const count = reset ? 1 : data.count + 1;
  if (count > 120) fail('resource-exhausted', 'rate-delete-hourly-limit');
  return { lastAt: now, lastEventId: eventId,
    windowStartedAt: reset ? now : data.windowStartedAt, count };
}

export async function deleteCommentOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request);
  const input = validateCommentDeletion(request.data);
  if (input.expectedUserId !== undefined && input.expectedUserId !== uid) {
    fail('unauthenticated', 'The signed-in account changed.');
  }
  const fingerprint = digest(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${digest(`${uid}\ndeleteComment\n${input.idempotencyKey}`)}`);
  const shoutRef = db.doc(`shouts/${input.shoutId}`);
  const commentRef = shoutRef.collection('comments').doc(input.commentId);
  const rateRef = db.doc(`rateLimits/${uid}/actions/delete`);
  return db.runTransaction(async (transaction) => {
    const now = Timestamp.fromDate(clock());
    await requireEligibleActor({ request, db, reader: transaction, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    const authorize = async (authorId) => {
      if (typeof authorId !== 'string' || !authorId) {
        fail('failed-precondition', 'Invalid stored comment author.');
      }
      if (authorId === uid) return; // Ordinary authors do not need two role reads.
      const [role, legacyModerator] = await transaction.getAll(
        db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`));
      // Match hasRoleLevel(3) in current Rules, including the legacy membership.
      const level = role.data()?.level;
      const moderator = (Number.isSafeInteger(level) && level >= 3) || legacyModerator.exists;
      if (!moderator) fail('permission-denied', 'Only the author or a moderator may delete this comment.');
    };
    if (receipt.exists) {
      const data = receipt.data();
      if (data.action !== 'deleteComment' || data.fingerprint !== fingerprint) {
        fail('already-exists', 'Idempotency key was already used for another payload.');
      }
      if (data.userId !== uid || data.shoutId !== input.shoutId ||
          data.commentId !== input.commentId || data.result?.deleted !== true) {
        fail('failed-precondition', 'Invalid stored operation result.');
      }
      await authorize(data.authorId);
      return data.result;
    }
    const [shout, comment, rate] = await transaction.getAll(shoutRef, commentRef, rateRef);
    if (!comment.exists || !shout.exists) fail('not-found', 'The comment or Shout is no longer available.');
    const authorId = comment.data().authorId;
    await authorize(authorId);
    const data = shout.data();
    const comments = data.commentsCount === undefined ? 0 : data.commentsCount;
    if (![data.likesCount, data.dislikesCount, data.savesCount, comments].every(counter)) {
      fail('failed-precondition', 'Invalid stored Shout counters.');
    }
    const rateData = nextDeleteRate(rate.data(), now, input.commentId);
    const result = { deleted: true };
    // Preserve the legacy single-document deletion. Replies, reports and reaction
    // subcollections have a separate lifecycle; no unbounded recursive operation.
    transaction.delete(commentRef);
    transaction.update(shoutRef, { commentsCount: Math.max(0, comments - 1) });
    transaction.set(rateRef, rateData);
    transaction.create(receiptRef, { userId: uid, action: 'deleteComment', fingerprint,
      shoutId: input.shoutId, commentId: input.commentId, authorId, result, createdAt: now });
    return result;
  });
}
