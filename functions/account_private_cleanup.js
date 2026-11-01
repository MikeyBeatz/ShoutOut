// Internal, lease-fenced private cleanup. No callable, trigger or scheduler export.
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';

const disabledPreferences = Object.freeze({ replies: false, reactions: false, privateReplies: false,
  followedProfiles: false, nearbyShouts: false });

export class AccountPrivateCleanupNeedsReview extends Error {}

export async function cleanupAccountPrivatePage(identity, db, auth, {
  pageSize = 50, beforeCommit = null, transactionGuard,
} = {}) {
  if (!identity || identity.projectId !== db.projectId || typeof identity.userId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(identity.userId) || !(identity.requestCreateTime instanceof Timestamp) ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || typeof transactionGuard !== 'function') {
    throw new Error('invalid-private-cleanup-options');
  }
  const user = db.doc(`users/${identity.userId}`), requestRef = db.doc(`accountDeletionRequests/${identity.userId}`);
  const settingsRef = user.collection('settings').doc('notifications');
  const check = request => {
    if (!request.exists || request.data()?.userId !== identity.userId || request.data()?.status !== 'pending') {
      throw new AccountDeletionRequestUnavailable('not-pending');
    }
    if (!request.createTime.isEqual(identity.requestCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
  };
  check(await requestRef.get());
  try { await auth.getUser(identity.userId); return { state: 'waiting-for-auth-deletion', deleted: 0 }; }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }

  // Preserve the all-false guard until legacy notification writers are retired.
  const settingsChanged = await db.runTransaction(async transaction => {
    const [request, settings] = await transaction.getAll(requestRef, settingsRef); check(request);
    const data = settings.data() ?? {};
    if (Object.keys(data).some(key => !Object.hasOwn(disabledPreferences, key))) {
      throw new AccountPrivateCleanupNeedsReview('unknown-notification-settings');
    }
    const record = await transactionGuard(transaction, { deleted: 0, preferencesDisabled: true });
    if (typeof record !== 'function') throw new Error('private-cleanup-guard-required');
    record();
    if (settings.exists && Object.keys(disabledPreferences).every(key => data[key] === false)) return false;
    transaction.set(settingsRef, disabledPreferences); return true;
  });
  const candidates = []; let needsAnotherPage = false;
  for (const name of ['notifications', 'following', 'blocked']) {
    const remaining = pageSize - candidates.length;
    const page = await user.collection(name).orderBy(FieldPath.documentId()).select().limit(remaining).get();
    candidates.push(...page.docs);
    if (page.size === remaining) { needsAnotherPage = true; break; }
  }
  for (const candidate of candidates) {
    if ((await candidate.ref.listCollections()).length) {
      throw new AccountPrivateCleanupNeedsReview('unexpected-private-subcollections');
    }
  }
  if (beforeCommit) await beforeCommit(candidates.map(doc => doc.ref));
  try {
    await db.runTransaction(async transaction => {
      const [request, settings] = await transaction.getAll(requestRef, settingsRef); check(request);
      if (!Object.keys(disabledPreferences).every(key => settings.data()?.[key] === false)) {
        throw new AccountPrivateCleanupNeedsReview('notification-guard-not-installed');
      }
      const record = await transactionGuard(transaction, { deleted: candidates.length, preferencesDisabled: true });
      if (typeof record !== 'function') throw new Error('private-cleanup-guard-required');
      for (const candidate of candidates) transaction.delete(candidate.ref, { lastUpdateTime: candidate.updateTime });
      record();
    });
  } catch (error) {
    if (error.code !== 9) throw error;
    return { state: 'continuation', deleted: 0, settingsChanged, conflict: true, needsAnotherPage: true };
  }
  return { state: needsAnotherPage ? 'continuation' : 'private-leaves-cleaned', deleted: candidates.length,
    settingsChanged, conflict: false, needsAnotherPage };
}
