// Bounded UID-indexed phase for new v5 jobs; historical jobs never migrate.
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { removeDeletedAccountReactions, AccountReactionRemovalNeedsReview } from './account_reaction_removal.js';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';
import { AccountIdentityJobLeaseLost } from './account_identity_job.js';

const counts = ['removedShoutReactionCount', 'removedCommentReactionCount', 'removedOrphanReactionCount'];
const validPath = (path, uid) => typeof path === 'string' &&
  new RegExp(`^shouts/[A-Za-z0-9_-]{1,128}/(?:comments/[A-Za-z0-9_-]{1,128}/)?reactions/${uid}$`).test(path);

export function actorReactionJobFields(job) {
  return { actorReactionCursor: job?.actorReactionCursor ?? null, actorReactionsRemovedAt: job?.actorReactionsRemovedAt ?? null,
    ...Object.fromEntries(counts.map(key => [key, job?.[key] ?? 0])) };
}

export function validateActorReactionJob(job) {
  const invalid = () => { throw new Error('invalid-account-actor-reactions-job-state'); };
  if (counts.some(key => !Number.isSafeInteger(job[key]) || job[key] < 0) ||
      job.actorReactionCursor !== null && !validPath(job.actorReactionCursor, job.userId)) invalid();
  if (['identity', 'logos', 'shouts'].includes(job.workStage)) {
    if (job.actorReactionCursor !== null || job.actorReactionsRemovedAt !== null || counts.some(key => job[key] !== 0)) invalid();
  } else if (job.workStage === 'actor-reactions') {
    if (job.actorReactionsRemovedAt !== null || job.privateDeletedCount !== 0 || job.privatePreferencesDisabled !== false ||
        !['removing-reactions', 'waiting-auth', 'retry', 'obsolete', 'needs-review'].includes(job.phase)) invalid();
  } else if (!(job.actorReactionsRemovedAt instanceof Timestamp) || job.actorReactionCursor !== null ||
      job.actorReactionsRemovedAt.toMillis() < job.requestCreateTime.toMillis() ||
      job.actorReactionsRemovedAt.toMillis() > job.updatedAt.toMillis()) invalid();
  if (job.workStage !== 'actor-reactions' && job.phase === 'removing-reactions') invalid();
}

export async function runActorReactionsSlice(identity, db, auth, {
  jobRef, clock, pageSize, assertOwner, indexWriter = null, beforeTransaction = null,
}) {
  const requestRef = db.doc(`accountDeletionRequests/${identity.userId}`);
  const read = async transaction => {
    const [snapshot, request] = await transaction.getAll(jobRef, requestRef);
    const now = Timestamp.fromDate(clock()), job = assertOwner(snapshot, now);
    if (job.workStage !== 'actor-reactions') throw new AccountIdentityJobLeaseLost();
    if (!request.exists || request.data()?.status !== 'pending' || request.data()?.userId !== identity.userId ||
        !request.createTime.isEqual(identity.requestCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
    if (!(request.data().authDeletionConfirmedAt instanceof Timestamp) || now.toMillis() >= job.retainUntil.toMillis()) {
      throw new AccountReactionRemovalNeedsReview('reaction-confirmation-or-retention-unavailable');
    }
    return { job, now };
  };
  const initial = await db.runTransaction(read);
  let query = db.collectionGroup('reactions').where('userId', '==', identity.userId).orderBy(FieldPath.documentId());
  if (initial.job.actorReactionCursor) query = query.startAfter(db.doc(initial.job.actorReactionCursor));
  const page = await query.limit(pageSize).get();
  if (page.docs.some(doc => !validPath(doc.ref.path, identity.userId))) {
    throw new AccountReactionRemovalNeedsReview('unknown-owned-reaction-path');
  }
  const result = page.empty ? { examined: 0, removed: 0 } : await removeDeletedAccountReactions(identity, db, auth, {
    reactionPaths: page.docs.map(doc => doc.ref.path), clock, indexWriter, beforeTransaction,
    transactionGuard: async (transaction, change) => {
      const { job, now } = await read(transaction);
      if (change.kind === 'check') return () => {};
      const field = !change.counterAdjusted ? 'removedOrphanReactionCount'
        : change.targetKind === 'shoutReaction' ? 'removedShoutReactionCount' : 'removedCommentReactionCount';
      return () => transaction.update(jobRef, { [field]: job[field] + 1, phase: 'removing-reactions', updatedAt: now });
    },
  });
  if (result.state === 'waiting-for-auth-deletion') return result;
  // Advance only after every selected transaction succeeds. Deleted cursor docs remain usable.
  await db.runTransaction(async transaction => {
    const { job, now } = await read(transaction);
    if (job.actorReactionCursor !== initial.job.actorReactionCursor) throw new AccountIdentityJobLeaseLost();
    if (!page.empty) transaction.update(jobRef, { actorReactionCursor: page.docs.at(-1).ref.path, updatedAt: now });
  });
  return { ...result, state: page.size < pageSize ? 'actor-reactions-removed' : 'removing-reactions' };
}
