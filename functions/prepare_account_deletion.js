import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { receiptRetentionFields } from './operation_retention.js';

const action = 'prepareAccountDeletion';
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const fail = (code, message) => { throw new HttpsError(code, message); };

// Preparation only: never creates/renews an intent, deletes Auth or removes children.
export async function prepareAccountDeletionOperation(request, db, clock = () => new Date(), { beforeCommit = null } = {}) {
  const { uid } = requireCallableIdentity(request), input = request.data;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['idempotencyKey', 'expectedUserId'].includes(key)) ||
      !identifier(input.idempotencyKey) || !identifier(input.expectedUserId)) {
    fail('invalid-argument', 'Invalid account deletion preparation fields.');
  }
  if (input.expectedUserId !== uid) fail('unauthenticated', 'The signed-in account changed.');
  const receiptRef = db.doc(`serverOperations/${digest(`${uid}\n${action}\n${input.idempotencyKey}`)}`);
  const fingerprint = digest(JSON.stringify({ expectedUserId: uid }));
  const now = Timestamp.fromDate(clock());
  return db.runTransaction(async transaction => {
    await requireEligibleActor({ request, db, reader: transaction, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const saved = receipt.data(), result = saved.result;
      if (saved.action !== action || saved.userId !== uid || saved.fingerprint !== fingerprint ||
          !Number.isSafeInteger(result?.hidden) || result.hidden < 0 || result.hidden > 50 ||
          result.hasMore !== (result.hidden === 50)) fail('failed-precondition', 'Invalid stored preparation result.');
      return result;
    }
    const page = await transaction.get(db.collection('shouts').where('authorId', '==', uid)
      .where('status', '==', 'active').limit(50));
    for (const shout of page.docs) {
      const data = shout.data();
      if (data.authorId !== uid || data.status !== 'active') fail('failed-precondition', 'Invalid preparation selection.');
    }
    for (const shout of page.docs) transaction.update(shout.ref, { status: 'deleted' });
    // A full page conservatively needs another call, including an empty final check.
    const result = { hidden: page.size, hasMore: page.size === 50 };
    transaction.create(receiptRef, { ...retention, action, userId: uid, fingerprint, result, createdAt: now });
    if (beforeCommit) await beforeCommit();
    return result;
  });
}
