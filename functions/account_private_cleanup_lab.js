// Emulator-only preparation. Not shipped in either deployed Functions artifact.
import { FieldPath } from 'firebase-admin/firestore';
import { accountDeletionJobRef } from './account_deletion_job.js';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';

const disabledPreferences = Object.freeze({ replies: false, reactions: false, privateReplies: false,
  followedProfiles: false, nearbyShouts: false });

export async function cleanupAccountPrivatePageLab(identity, db, auth, { pageSize = 50, beforeCommit = null } = {}) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('account-private-cleanup-emulator-required');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error('invalid-private-cleanup-page');
  const jobRef = accountDeletionJobRef(db, identity), user = db.doc(`users/${identity.userId}`);
  const requestRef = db.doc(`accountDeletionRequests/${identity.userId}`), settingsRef = user.collection('settings').doc('notifications');
  const check = (request, job) => {
    if (!request.exists || request.data()?.userId !== identity.userId || request.data()?.status !== 'pending') {
      throw new AccountDeletionRequestUnavailable('not-pending');
    }
    if (!request.createTime.isEqual(identity.requestCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
    const data = job.data();
    if (!job.exists || data.userId !== identity.userId || !data.requestCreateTime?.isEqual(identity.requestCreateTime) ||
        data.phase !== 'shouts-hidden' || data.leaseToken !== null || data.leaseUntil !== null) {
      throw new Error('account-deletion-shouts-not-hidden');
    }
  };
  check(...await db.getAll(requestRef, jobRef));
  try { await auth.getUser(identity.userId); return { state: 'waiting-for-auth-deletion', deleted: 0 }; }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }

  // Retain a minimal all-false preference document for legacy notification writers.
  // Removing it would make the old clients fall back to their enabled defaults.
  const settingsChanged = await db.runTransaction(async transaction => {
    const [request, job, settings] = await transaction.getAll(requestRef, jobRef, settingsRef); check(request, job);
    const data = settings.data() ?? {};
    if (Object.keys(data).some(key => !Object.hasOwn(disabledPreferences, key))) throw new Error('unknown-notification-settings');
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
  // Refuse unexpected nested data rather than leave undiscoverable orphan paths.
  for (const candidate of candidates) {
    if ((await candidate.ref.listCollections()).length) throw new Error('unexpected-private-subcollections');
  }
  if (beforeCommit) await beforeCommit(candidates.map(doc => doc.ref));
  try {
    await db.runTransaction(async transaction => {
      const [request, job, settings] = await transaction.getAll(requestRef, jobRef, settingsRef); check(request, job);
      if (!Object.keys(disabledPreferences).every(key => settings.data()?.[key] === false)) throw new Error('notification-guard-not-installed');
      for (const candidate of candidates) transaction.delete(candidate.ref, { lastUpdateTime: candidate.updateTime });
    });
  } catch (error) {
    if (error.code !== 9) throw error;
    return { state: 'continuation', deleted: 0, settingsChanged, conflict: true, needsAnotherPage: true };
  }
  return { state: needsAnotherPage ? 'continuation' : 'private-leaves-cleaned', deleted: candidates.length,
    settingsChanged, conflict: false, needsAnotherPage };
}
