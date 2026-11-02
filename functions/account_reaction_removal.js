// Internal primitive only. No live discovery, callable export or job activation.
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';
import { accountContentArchiveId } from './account_content_archive.js';

export class AccountReactionRemovalNeedsReview extends Error {}
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const counter = value => Number.isSafeInteger(value) && value >= 0;
const same = (a, b) => a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b);
const before = (a, b) => a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds < b.nanoseconds;

function target(path, uid) {
  if (typeof path !== 'string') throw new Error('invalid-owned-reaction-path');
  const parts = path.split('/');
  if (parts[0] !== 'shouts' || !identifier(parts[1]) || parts.at(-1) !== uid ||
      !(parts.length === 4 && parts[2] === 'reactions' ||
        parts.length === 6 && parts[2] === 'comments' && identifier(parts[3]) && parts[4] === 'reactions')) {
    throw new Error('invalid-owned-reaction-path');
  }
  return { path, parentPath: parts.slice(0, -2).join('/'), shoutId: parts[1],
    kind: parts.length === 4 ? 'shoutReaction' : 'commentReaction' };
}

export async function removeDeletedAccountReactions(identity, db, auth, {
  reactionPaths, transactionGuard, clock = () => new Date(), indexWriter = null, beforeTransaction = null,
} = {}) {
  if (!identity || identity.projectId !== db.projectId || !identifier(identity.userId) ||
      !(identity.requestCreateTime instanceof Timestamp) || typeof transactionGuard !== 'function' ||
      typeof clock !== 'function' || beforeTransaction !== null && typeof beforeTransaction !== 'function' ||
      !Array.isArray(reactionPaths) || reactionPaths.length < 1 || reactionPaths.length > 50 ||
      new Set(reactionPaths).size !== reactionPaths.length) throw new Error('invalid-account-reaction-removal-options');
  const candidates = reactionPaths.map(path => target(path, identity.userId));
  const requestRef = db.doc(`accountDeletionRequests/${identity.userId}`);
  const retainUntil = Timestamp.fromMillis(identity.requestCreateTime.toMillis() + 60 * 86400000);
  try { await auth.getUser(identity.userId); return { state: 'waiting-for-auth-deletion', examined: 0, removed: 0 }; }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  const result = { state: 'selection-processed', examined: 0, removed: 0, missing: 0, ownTargets: 0, orphaned: 0 };
  for (const candidate of candidates) {
    const sourceRef = db.doc(candidate.path), parentRef = db.doc(candidate.parentPath);
    if (beforeTransaction) await beforeTransaction(candidate.path);
    if ((await sourceRef.listCollections()).length) throw new AccountReactionRemovalNeedsReview('unexpected-reaction-subcollections');
    const state = await db.runTransaction(async transaction => {
      const [request, source, parent] = await transaction.getAll(requestRef, sourceRef, parentRef);
      if (!request.exists || request.data()?.userId !== identity.userId || request.data()?.status !== 'pending') {
        throw new AccountDeletionRequestUnavailable('not-pending');
      }
      if (!same(request.createTime, identity.requestCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
      const date = clock(), confirmed = request.data().authDeletionConfirmedAt;
      if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) ||
          date.getTime() < identity.requestCreateTime.toMillis() || date.getTime() >= retainUntil.toMillis() ||
          !(confirmed instanceof Timestamp) || confirmed.toMillis() < identity.requestCreateTime.toMillis() || confirmed.toMillis() > date.getTime()) {
        throw new AccountReactionRemovalNeedsReview('reaction-confirmation-or-retention-unavailable');
      }
      const guard = async change => {
        const apply = await transactionGuard(transaction, change);
        if (typeof apply !== 'function') throw new Error('reaction-progress-guard-required');
        return apply;
      };
      if (!source.exists) { await guard({ kind: 'check' }); return 'missing'; }
      const data = source.data();
      if (Object.keys(data).some(key => !['type', 'updatedAt', 'userId'].includes(key)) ||
          !['like', 'dislike'].includes(data.type) || !(data.updatedAt instanceof Timestamp) ||
          data.userId !== undefined && data.userId !== identity.userId) {
        throw new AccountReactionRemovalNeedsReview('invalid-stored-owned-reaction');
      }
      // A surviving leaf from an older parent incarnation cannot affect the new parent's counts.
      const targetState = !parent.exists ? 'missing' : before(source.createTime, parent.createTime) ? 'recreated' : 'present';
      if (targetState === 'recreated' && !before(source.updateTime, parent.createTime)) {
        throw new AccountReactionRemovalNeedsReview('ambiguous-recreated-reaction-target');
      }
      const parentData = parent.data();
      if (targetState === 'present' && !identifier(parentData.authorId)) throw new AccountReactionRemovalNeedsReview('invalid-reaction-target-author');
      if (targetState === 'present' && parentData.authorId === identity.userId) {
        await guard({ kind: 'check' }); return 'ownTargets';
      }
      let after;
      if (targetState === 'present') {
        const likes = parentData.likesCount ?? 0, dislikes = parentData.dislikesCount ?? 0;
        if (!counter(likes) || !counter(dislikes)) throw new AccountReactionRemovalNeedsReview('invalid-target-reaction-counts');
        after = { ...parentData, likesCount: likes - (data.type === 'like' ? 1 : 0),
          dislikesCount: dislikes - (data.type === 'dislike' ? 1 : 0) };
        if (!counter(after.likesCount) || !counter(after.dislikesCount)) throw new AccountReactionRemovalNeedsReview('target-reaction-count-underflow');
      }
      const archiveId = accountContentArchiveId(db.projectId, source.ref.path, source.createTime);
      const archiveRef = db.collection('accountContentArchive').doc(archiveId);
      if ((await transaction.get(archiveRef)).exists) throw new AccountReactionRemovalNeedsReview('reaction-archive-conflict');
      const applyProgress = await guard({ kind: 'reaction-removed', archiveId, sourcePath: source.ref.path,
        counterAdjusted: targetState === 'present', targetKind: candidate.kind });
      const operationId = createHash('sha256').update(JSON.stringify(['removeAccountReaction', archiveId,
        identity.requestCreateTime.seconds, identity.requestCreateTime.nanoseconds])).digest('hex');
      const indexPlan = after && candidate.kind === 'shoutReaction'
        ? await indexWriter?.prepare(transaction, candidate.shoutId, parentData, after, { operationId }) : null;
      indexPlan?.apply();
      transaction.create(archiveRef, {
        schemaVersion: 1, kind: candidate.kind, retentionOwnerId: identity.userId,
        requestCreateTime: identity.requestCreateTime, retainUntil, archivedAt: Timestamp.fromDate(date),
        sourcePath: source.ref.path, sourceCreateTime: source.createTime, sourceUpdateTime: source.updateTime,
        targetPath: parentRef.path, targetCreateTime: parent.createTime ?? null, targetState,
        counterAdjusted: targetState === 'present', content: data,
      });
      if (after) transaction.update(parentRef, { likesCount: after.likesCount, dislikesCount: after.dislikesCount });
      transaction.delete(sourceRef);
      applyProgress();
      return targetState === 'present' ? 'removed' : 'orphaned';
    });
    result.examined++;
    result[state]++;
    if (state === 'orphaned') result.removed++;
  }
  return result;
}
