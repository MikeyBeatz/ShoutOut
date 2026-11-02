// Internal transaction gate; no callable and never deletes an Auth account.
import { Timestamp } from 'firebase-admin/firestore';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';
export class AccountDeletionConfirmationNeedsReview extends Error {}

export async function confirmAccountAuthDeletion(identity, db, auth, { clock, transactionGuard, retireRoles = false } = {}) {
  if (!identity || identity.projectId !== db.projectId || typeof identity.userId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(identity.userId) || !(identity.requestCreateTime instanceof Timestamp) ||
      typeof clock !== 'function' || typeof transactionGuard !== 'function' || typeof retireRoles !== 'boolean') throw new Error('invalid-account-confirmation-options');
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
    const retired = request.data().rolesRetiredAt;
    if (retired !== undefined && (!(retired instanceof Timestamp) || previous === undefined ||
        retired.toMillis() < previous.toMillis() || retired.toMillis() > date.getTime())) {
      throw new AccountDeletionConfirmationNeedsReview('invalid-role-retirement');
    }
    const roles = retireRoles && retired === undefined ? await transaction.getAll(
      db.doc(`accountRoles/${identity.userId}`), db.doc(`moderators/${identity.userId}`)) : [];
    // Read caller lease in the same transaction before recording confirmation.
    await transactionGuard(transaction);
    const patch = previous === undefined ? { authDeletionConfirmedAt: Timestamp.fromDate(date) } : {};
    if (retireRoles && retired === undefined) {
      for (const role of roles) if (role.exists) transaction.update(role.ref, { accountStatus: 'deleted' });
      patch.rolesRetiredAt = Timestamp.fromDate(date);
    }
    if (Object.keys(patch).length) transaction.update(requestRef, patch);
    return { state: 'auth-deletion-confirmed', changed: previous === undefined };
  });
}
