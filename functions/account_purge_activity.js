import { AccountPurgeNeedsReview } from './account_purge_guard.js';

// No new archive after the deadline. Source deletion and the matching live
// counter decrement still share the caller's fenced journal transaction.
export async function purgeActivity(transaction, snapshot, action, uid, { indexWriter = null, operationId } = {}) {
  const parts = snapshot.ref.path.split('/'), parent = await transaction.get(snapshot.ref.parent.parent);
  if (parts.at(-1) !== uid || snapshot.get('userId') !== uid) throw new AccountPurgeNeedsReview('invalid-purge-activity-owner');
  if (!parent.exists || parent.get('contentPurged') === true || parent.get('authorId') === uid) return;
  if (typeof parent.get('authorId') !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(parent.get('authorId'))) {
    throw new AccountPurgeNeedsReview('invalid-purge-activity-target-author');
  }
  const before = (a, b) => a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds < b.nanoseconds;
  if (before(snapshot.createTime, parent.createTime)) {
    if (!before(snapshot.updateTime, parent.createTime)) throw new AccountPurgeNeedsReview('ambiguous-purge-activity-incarnation');
    return;
  }
  const field = action === 'save' ? 'savesCount' : snapshot.get('type') === 'like' ? 'likesCount'
    : snapshot.get('type') === 'dislike' ? 'dislikesCount' : null;
  const count = field ? parent.get(field) ?? 0 : null;
  if (!field || !Number.isSafeInteger(count) || count < 1) throw new AccountPurgeNeedsReview('purge-activity-counter-invalid');
  const after = { ...parent.data(), [field]: count - 1 };
  // Saves and comment reactions do not change the Shout ordering projection.
  const indexedReaction = action === 'reaction' && parent.ref.path.split('/').length === 2;
  const plan = indexedReaction ? await indexWriter?.prepare(transaction, parent.id, parent.data(), after, { operationId }) : null;
  if (indexedReaction && indexWriter && typeof plan?.apply !== 'function') throw new Error('invalid-purge-index-plan');
  plan?.apply(); transaction.update(parent.ref, { [field]: count - 1 });
}
