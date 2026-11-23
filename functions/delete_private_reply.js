// Transactional own-message deletion; moderator decisions use a separate path.
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { receiptRetentionFields } from './operation_retention.js';
import { nextDeleteRate } from './delete_comment.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function validatePrivateReplyDeletion(input) {
  const fields = ['expectedUserId', 'shoutId', 'privateReplyId', 'idempotencyKey'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !fields.includes(key)) ||
      !fields.every(key => identifier(input[key]))) {
    fail('invalid-argument', 'Invalid private reply deletion fields.');
  }
  return Object.fromEntries(fields.map(key => [key, input[key]]));
}

export async function deletePrivateReplyOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request);
  const input = validatePrivateReplyDeletion(request.data);
  if (input.expectedUserId !== uid) fail('unauthenticated', 'The signed-in account changed.');
  const fingerprint = digest(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${digest(`${uid}\ndeletePrivateReply\n${input.idempotencyKey}`)}`);
  const sourceRef = db.doc(`shouts/${input.shoutId}/privateReplies/${input.privateReplyId}`);
  const rateRef = db.doc(`rateLimits/${uid}/actions/delete`);
  return db.runTransaction(async transaction => {
    const now = Timestamp.fromDate(clock());
    await requireEligibleActor({ request, db, reader: transaction, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const data = receipt.data();
      if (data.action !== 'deletePrivateReply' || data.fingerprint !== fingerprint) {
        fail('already-exists', 'Idempotency key was already used for another payload.');
      }
      if (data.userId !== uid || data.authorId !== uid || data.shoutId !== input.shoutId ||
          data.privateReplyId !== input.privateReplyId || data.result?.deleted !== true) {
        fail('failed-precondition', 'Invalid stored operation result.');
      }
      return { deleted: true }; // Never return arbitrary stored receipt fields.
    }
    const [source, rate] = await transaction.getAll(sourceRef, rateRef);
    // Same response for a missing or foreign message: no existence oracle.
    // Moderator removal belongs to a separate report/decision transaction.
    if (!source.exists || source.get('authorId') !== uid) {
      fail('not-found', 'The private reply is unavailable.');
    }
    const rateData = nextDeleteRate(rate.data(), now, input.privateReplyId);
    transaction.delete(sourceRef);
    transaction.set(rateRef, rateData);
    transaction.create(receiptRef, { ...retention, action: 'deletePrivateReply', userId: uid, authorId: uid,
      shoutId: input.shoutId, privateReplyId: input.privateReplyId, fingerprint, result: { deleted: true }, createdAt: now });
    // No parent/index/counter mutation, recursion, report or archive expansion.
    return { deleted: true };
  });
}
