import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { nextInteractionRate } from './toggle_shout_reaction.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const counter = (value) => Number.isSafeInteger(value) && value >= 0;

export function validateShoutSave(input) {
  const fields = ['idempotencyKey', 'shoutId', 'expectedUserId'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !fields.includes(key)) ||
      !identifier(input.idempotencyKey) || !identifier(input.shoutId) ||
      (input.expectedUserId !== undefined && !identifier(input.expectedUserId))) {
    fail('invalid-argument', 'Invalid save fields.');
  }
  return Object.fromEntries(fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

export function saveTransition(wasSaved, count) {
  if (typeof wasSaved !== 'boolean' || !counter(count)) {
    fail('failed-precondition', 'Invalid stored save count.');
  }
  const result = { saved: !wasSaved, count: count + (wasSaved ? -1 : 1) };
  if (!counter(result.count)) fail('failed-precondition', 'Inconsistent stored save count.');
  return result;
}

export async function toggleShoutSaveOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request);
  const input = validateShoutSave(request.data);
  if (input.expectedUserId !== undefined && input.expectedUserId !== uid) {
    fail('unauthenticated', 'The signed-in account changed.');
  }
  const key = digest(`${uid}\ntoggleShoutSave\n${input.idempotencyKey}`);
  const fingerprint = digest(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${key}`);
  const shoutRef = db.doc(`shouts/${input.shoutId}`);
  const saveRef = shoutRef.collection('saves').doc(uid);
  const rateRef = db.doc(`rateLimits/${uid}/actions/interaction`);
  return db.runTransaction(async (transaction) => {
    const now = Timestamp.fromDate(clock());
    // Saves use eligibleUser(), not the content-creation restriction, in Rules.
    await requireEligibleActor({ request, db, reader: transaction, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      const data = receipt.data();
      if (data.action !== 'toggleShoutSave' || data.fingerprint !== fingerprint) {
        fail('already-exists', 'Idempotency key was already used for another payload.');
      }
      if (data.userId !== uid || data.shoutId !== input.shoutId ||
          typeof data.result?.saved !== 'boolean' || !counter(data.result?.count)) {
        fail('failed-precondition', 'Invalid stored operation result.');
      }
      // Historical acknowledgement only: clients must display realtime state.
      return data.result;
    }
    const [shout, save, rate] = await transaction.getAll(shoutRef, saveRef, rateRef);
    if (!shout.exists) fail('not-found', 'The Shout is no longer available.');
    const data = shout.data();
    if (![data.likesCount, data.dislikesCount, data.commentsCount].every(counter)) {
      fail('failed-precondition', 'Invalid stored Shout counters.');
    }
    // Current Rules permit saves on retained Shouts regardless of their status.
    const result = saveTransition(save.exists, data.savesCount === undefined ? 0 : data.savesCount);
    const rateData = nextInteractionRate(rate.data(), now, `save_${input.shoutId}`);
    if (result.saved) transaction.create(saveRef, { createdAt: now });
    else transaction.delete(saveRef);
    transaction.update(shoutRef, { savesCount: result.count });
    transaction.set(rateRef, rateData);
    transaction.create(receiptRef, { userId: uid, action: 'toggleShoutSave', fingerprint,
      shoutId: input.shoutId, result, createdAt: now });
    return result;
  });
}
