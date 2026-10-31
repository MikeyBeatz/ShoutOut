import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { receiptRetentionFields } from './operation_retention.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function validateShoutDeletion(input) {
  const fields = ['idempotencyKey', 'shoutId', 'expectedUserId'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !fields.includes(key)) ||
      !identifier(input.idempotencyKey) || !identifier(input.shoutId) ||
      (input.expectedUserId !== undefined && !identifier(input.expectedUserId))) {
    fail('invalid-argument', 'Invalid Shout deletion fields.');
  }
  return Object.fromEntries(fields.filter(key => input[key] !== undefined).map(key => [key, input[key]]));
}

export async function deleteShoutOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request);
  const input = validateShoutDeletion(request.data);
  if (input.expectedUserId !== undefined && input.expectedUserId !== uid) fail('unauthenticated', 'The signed-in account changed.');
  const fingerprint = digest(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${digest(`${uid}\ndeleteShout\n${input.idempotencyKey}`)}`);
  const shoutRef = db.doc(`shouts/${input.shoutId}`);
  return db.runTransaction(async transaction => {
    const now = Timestamp.fromDate(clock());
    await requireEligibleActor({ request, db, reader: transaction, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    const authorize = async authorId => {
      if (typeof authorId !== 'string' || !authorId) fail('failed-precondition', 'Invalid stored Shout author.');
      if (authorId === uid) return;
      const [role, legacy] = await transaction.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`));
      const level = role.data()?.level;
      if (!(Number.isSafeInteger(level) && level >= 3) && !legacy.exists) {
        fail('permission-denied', 'Only the author or a moderator may delete this Shout.');
      }
    };
    if (receipt.exists) {
      const saved = receipt.data();
      if (saved.action !== 'deleteShout' || saved.fingerprint !== fingerprint) fail('already-exists', 'Idempotency key was already used for another payload.');
      if (saved.userId !== uid || saved.shoutId !== input.shoutId || saved.result?.deleted !== true) fail('failed-precondition', 'Invalid stored operation result.');
      await authorize(saved.authorId);
      return saved.result;
    }
    const shout = await transaction.get(shoutRef);
    if (!shout.exists) fail('not-found', 'The Shout is no longer available.');
    const data = shout.data();
    await authorize(data.authorId);
    const result = { deleted: true };
    // Preserve current Rules: soft deletion only, including retained/expired
    // Shouts, with no new deletion rate bucket or recursive child cleanup.
    if (data.status !== 'deleted') transaction.update(shoutRef, { status: 'deleted' });
    transaction.create(receiptRef, { ...retention, action: 'deleteShout', userId: uid,
      fingerprint, shoutId: input.shoutId, authorId: data.authorId, result, createdAt: now });
    return result;
  });
}
