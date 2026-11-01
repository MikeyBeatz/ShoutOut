// Emulator-only adapter for the original shouts-hidden prototype; never shipped.
import { accountDeletionJobRef } from './account_deletion_job.js';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';
import { cleanupAccountPrivatePage } from './account_private_cleanup.js';

export async function cleanupAccountPrivatePageLab(identity, db, auth, options = {}) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('account-private-cleanup-emulator-required');
  }
  const jobRef = accountDeletionJobRef(db, identity), requestRef = db.doc(`accountDeletionRequests/${identity.userId}`);
  const check = (request, snapshot) => {
    if (!request.exists || request.data()?.userId !== identity.userId || request.data()?.status !== 'pending') {
      throw new AccountDeletionRequestUnavailable('not-pending');
    }
    if (!request.createTime.isEqual(identity.requestCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
    const job = snapshot.data();
    if (!snapshot.exists || job.userId !== identity.userId || !job.requestCreateTime?.isEqual(identity.requestCreateTime) ||
        job.phase !== 'shouts-hidden' || job.leaseToken !== null || job.leaseUntil !== null) {
      throw new Error('account-deletion-shouts-not-hidden');
    }
  };
  check(...await db.getAll(requestRef, jobRef));
  return cleanupAccountPrivatePage(identity, db, auth, { ...options,
    transactionGuard: async transaction => {
      check(...await transaction.getAll(requestRef, jobRef));
      return () => {};
    } });
}
