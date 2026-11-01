// Internal transaction gate; no callable and never deletes an Auth account.
import { Timestamp } from 'firebase-admin/firestore';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';
export class AccountDeletionConfirmationNeedsReview extends Error {}

export async function confirmAccountAuthDeletion(identity, db, auth, { clock, transactionGuard } = {}) {
  if (!identity || identity.projectId !== db.projectId || typeof identity.userId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(identity.userId) || !(identity.requestCreateTime instanceof Timestamp) ||
      typeof clock !== 'function' || typeof transactionGuard !== 'function') throw new Error('invalid-account-confirmation-options');
  try { await auth.getUser(identity.userId); return { state: 'waiting-for-auth-deletion' }; }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  return db.runTransaction(async transaction => {
    const requestRef = db.doc(`accountDeletionRequests/${identity.userId}`), request = await transaction.get(requestRef);
    if (!request.exists || request.data().userId !== identity.userId || request.data().status !== 'pending') {
      throw new AccountDeletionRequestUnavailable('not-pending');
    }
    if (!request.createTime.isEqual(identity.requestCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) || date.getTime() < identity.requestCreateTime.toMillis() ||
        date.getTime() >= identity.requestCreateTime.toMillis() + 60 * 86400000) {
      throw new AccountDeletionConfirmationNeedsReview('confirmation-clock-or-retention-invalid');
    }
    const previous = request.data().authDeletionConfirmedAt;
    if (previous !== undefined && (!(previous instanceof Timestamp) || previous.toMillis() < identity.requestCreateTime.toMillis() ||
        previous.toMillis() > date.getTime())) throw new AccountDeletionConfirmationNeedsReview('invalid-auth-deletion-confirmation');
    // Read caller lease in the same transaction before recording confirmation.
    await transactionGuard(transaction);
    if (previous === undefined) transaction.update(requestRef, { authDeletionConfirmedAt: Timestamp.fromDate(date) });
    return { state: 'auth-deletion-confirmed', changed: previous === undefined };
  });
}
