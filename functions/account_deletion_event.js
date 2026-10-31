// Local event adapter only. No deployed trigger, queue, retry policy or request writes.
import { AccountDeletionRequestUnavailable, hideDeletedAuthAccountShoutsPage } from './account_shout_hiding.js';

export async function handleAccountDeletionRequestCreated(event, db, auth, options = {}) {
  const userId = event?.params?.userId, snapshot = event?.data;
  if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(userId) ||
      !snapshot?.exists || snapshot.ref?.path !== `accountDeletionRequests/${userId}` ||
      typeof db?.projectId !== 'string' || !db.projectId.length ||
      snapshot.ref?.firestore?.projectId !== db.projectId ||
      typeof snapshot.createTime?.isEqual !== 'function' || typeof snapshot.data !== 'function') {
    throw new Error('invalid-account-deletion-event');
  }
  const marker = snapshot.data();
  if (marker?.userId !== userId || marker?.status !== 'pending') throw new Error('invalid-account-deletion-event');
  let result;
  try {
    // Identity always comes from the original trusted event, including redelivery.
    result = await hideDeletedAuthAccountShoutsPage(db, auth, userId,
      { ...options, expectedRequestCreateTime: snapshot.createTime });
  } catch (error) {
    if (error instanceof AccountDeletionRequestUnavailable) return { state: 'ignored', reason: error.reason };
    throw error;
  }
  if (result.state === 'waiting-for-auth-deletion') return { state: 'retry-required', reason: 'auth-user-present' };
  if (result.state === 'hiding') return { ...result, state: 'retry-required', reason: 'more-shouts' };
  // This is only the public-Shout hiding phase, not completion of account erasure.
  return result;
}
