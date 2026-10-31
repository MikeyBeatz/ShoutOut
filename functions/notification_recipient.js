import { HttpsError } from 'firebase-functions/v2/https';

// Read in the caller's transaction so creation of a deletion request fences
// notifications/messages atomically, not through a stale process-level cache.
export async function readNotificationRecipients(transaction, db, userIds) {
  const ids = [...new Set(userIds)];
  if (ids.some(uid => typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid))) {
    throw new HttpsError('failed-precondition', 'Invalid recipient profile.');
  }
  if (ids.length === 0) return new Map();
  const snapshots = await transaction.getAll(...ids.flatMap(uid => [
    db.doc(`users/${uid}`), db.doc(`accountDeletionRequests/${uid}`), db.doc(`users/${uid}/settings/notifications`),
  ]), { fieldMask: ['nickname', 'reactions', 'replies', 'privateReplies'] });
  return new Map(ids.map((uid, index) => {
    const [profile, deletion, settings] = snapshots.slice(index * 3, index * 3 + 3);
    return [uid, { profile, settings, available: profile.exists && !deletion.exists }];
  }));
}
