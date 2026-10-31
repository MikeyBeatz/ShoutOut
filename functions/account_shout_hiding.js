// Internal worker building block only: no callable or scheduled export.
import { createHash } from 'node:crypto';

export class AccountDeletionRequestUnavailable extends Error {
  constructor(reason) {
    super(`account-deletion-request-${reason}`);
    this.name = 'AccountDeletionRequestUnavailable';
    this.reason = reason;
  }
}

function validatePage(userId, pageSize) {
  if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(userId) ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error('invalid-account-hide-page');
}
function assertPending(request, userId) {
  const marker = request.data();
  if (!request.exists || marker.userId !== userId || marker.status !== 'pending') throw new AccountDeletionRequestUnavailable('not-pending');
}
function assertSameRequest(request, expectedCreateTime) {
  if (expectedCreateTime && !request.createTime.isEqual(expectedCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
}

// Internal orchestration only. Does not delete Auth users or write request state.
export async function hideDeletedAuthAccountShoutsPage(db, auth, userId, options = {}) {
  const { pageSize = 50, expectedRequestCreateTime = null } = options;
  validatePage(userId, pageSize);
  const request = await db.doc(`accountDeletionRequests/${userId}`).get();
  assertPending(request, userId);
  // A trusted worker/event carries this fence across page calls and retries.
  // Do not silently replace it with the current request's identity.
  assertSameRequest(request, expectedRequestCreateTime);
  try {
    await auth.getUser(userId);
    return { state: 'waiting-for-auth-deletion' };
  } catch (error) {
    // An outage or denied Admin permission must never count as account deletion.
    if (error?.code !== 'auth/user-not-found') throw error;
  }
  const result = await hideRequestedAccountShoutsPage(db, userId,
    { ...options, expectedRequestCreateTime: request.createTime });
  return { ...result, state: result.needsAnotherPage ? 'hiding' : 'shouts-hidden' };
}

export async function hideRequestedAccountShoutsPage(db, userId, {
  pageSize = 50, indexWriter = null, beforeTransaction = null, expectedRequestCreateTime = null, transactionGuard = null,
} = {}) {
  validatePage(userId, pageSize);
  const requestRef = db.doc(`accountDeletionRequests/${userId}`);
  const initialRequest = await requestRef.get();
  assertPending(initialRequest, userId);
  assertSameRequest(initialRequest, expectedRequestCreateTime);
  const page = await db.collection('shouts').where('authorId', '==', userId)
    .where('status', '==', 'active').limit(pageSize).get();
  const result = { examined: page.size, hidden: 0, skipped: 0, needsAnotherPage: page.size === pageSize };
  for (const candidate of page.docs) {
    if (beforeTransaction) await beforeTransaction(candidate.id);
    const hidden = await db.runTransaction(async transaction => {
      const [request, shout] = await transaction.getAll(requestRef, candidate.ref);
      assertPending(request, userId);
      // A restarted request belongs to a new worker run, even for the same UID.
      assertSameRequest(request, initialRequest.createTime);
      // Trusted job coordination reads its lease before any index/source writes.
      const recordHidden = await transactionGuard?.(transaction);
      if (!shout.exists || shout.data().authorId !== userId || shout.data().status !== 'active') return false;
      const before = shout.data();
      // Different request/source incarnations must not reuse an old archive ID.
      const operationId = createHash('sha256').update(`${userId}\n${candidate.id}\n${request.createTime.seconds}:${request.createTime.nanoseconds}\n${shout.updateTime.seconds}:${shout.updateTime.nanoseconds}`).digest('hex');
      const plan = await indexWriter?.prepare(transaction, shout.id, before,
        { ...before, status: 'deleted' }, { operationId });
      plan?.apply();
      recordHidden?.();
      transaction.update(candidate.ref, { status: 'deleted' });
      return true;
    });
    if (hidden) result.hidden++; else result.skipped++;
  }
  return result;
}
