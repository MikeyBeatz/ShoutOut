import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireAccountDeletionActor } from './callable_security.js';
import { receiptRetentionFields } from './operation_retention.js';

const action = 'prepareAccountDeletion';
const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const fail = (code, message) => { throw new HttpsError(code, message); };

// Preparation only: never creates/renews an intent, deletes Auth or removes children.
export async function prepareAccountDeletionOperation(request, db, clock = () => new Date(), { beforeCommit = null, indexWriter = null } = {}) {
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
  let batchSize = 50;
  const attempt = () => db.runTransaction(async transaction => {
    await requireAccountDeletionActor({ request, db, reader: transaction, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const saved = receipt.data(), result = saved.result;
      if (saved.action !== action || saved.userId !== uid || saved.fingerprint !== fingerprint ||
          !Number.isSafeInteger(result?.hidden) || result.hidden < 0 || result.hidden > 50 ||
          typeof result.hasMore !== 'boolean' || result.hidden === 0 && result.hasMore) fail('failed-precondition', 'Invalid stored preparation result.');
      return result;
    }
    const page = await transaction.get(db.collection('shouts').where('authorId', '==', uid)
      .where('status', '==', 'active').limit(batchSize));
    for (const shout of page.docs) {
      const data = shout.data();
      if (data.authorId !== uid || data.status !== 'active') fail('failed-precondition', 'Invalid preparation selection.');
    }
    // Trusted injection only; the callable wrapper does not enable an index.
    // Plan all changes before source/receipt writes, sharing roots within cells.
    const indexPlan = !page.empty && indexWriter ? await indexWriter.prepareBatch(transaction,
      page.docs.map(shout => ({ id: shout.id, before: shout.data(), after: { ...shout.data(), status: 'deleted' } })),
      { operationId: receiptRef.id, additionalWrites: 1 }) : null;
    if (!page.empty && indexWriter && typeof indexPlan?.apply !== 'function') throw new Error('invalid-index-batch-plan');
    for (const shout of page.docs) transaction.update(shout.ref, { status: 'deleted' });
    indexPlan?.apply();
    // A full page conservatively needs another call, including an empty final check.
    const result = { hidden: page.size, hasMore: page.size === batchSize };
    transaction.create(receiptRef, { ...retention, action, userId: uid, fingerprint, result, createdAt: now });
    if (beforeCommit) await beforeCommit();
    return result;
  });
  for (;;) {
    try { return await attempt(); } catch (error) {
      if (!['lab-mutation-too-large', 'feed-transaction-write-budget-exceeded'].includes(error.message) || batchSize === 1) throw error;
      batchSize = Math.max(1, Math.floor(batchSize / 2));
    }
  }
}
