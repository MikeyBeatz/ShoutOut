// Internal worker building block only: no callable or scheduled export.
import { createHash } from 'node:crypto';

export async function hideRequestedAccountShoutsPage(db, userId, {
  pageSize = 50, indexWriter = null, beforeTransaction = null,
} = {}) {
  if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(userId) ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error('invalid-account-hide-page');
  const requestRef = db.doc(`accountDeletionRequests/${userId}`);
  const assertPending = request => {
    const marker = request.data();
    if (!request.exists || marker.userId !== userId || marker.status !== 'pending') throw new Error('account-deletion-request-not-pending');
  };
  assertPending(await requestRef.get());
  const page = await db.collection('shouts').where('authorId', '==', userId)
    .where('status', '==', 'active').limit(pageSize).get();
  const result = { examined: page.size, hidden: 0, skipped: 0, needsAnotherPage: page.size === pageSize };
  for (const candidate of page.docs) {
    if (beforeTransaction) await beforeTransaction(candidate.id);
    const hidden = await db.runTransaction(async transaction => {
      const [request, shout] = await transaction.getAll(requestRef, candidate.ref);
      assertPending(request);
      if (!shout.exists || shout.data().authorId !== userId || shout.data().status !== 'active') return false;
      const before = shout.data();
      // Different request/source incarnations must not reuse an old archive ID.
      const operationId = createHash('sha256').update(`${userId}\n${candidate.id}\n${request.createTime.seconds}:${request.createTime.nanoseconds}\n${shout.updateTime.seconds}:${shout.updateTime.nanoseconds}`).digest('hex');
      const plan = await indexWriter?.prepare(transaction, shout.id, before,
        { ...before, status: 'deleted' }, { operationId });
      plan?.apply();
      transaction.update(candidate.ref, { status: 'deleted' });
      return true;
    });
    if (hidden) result.hidden++; else result.skipped++;
  }
  return result;
}
