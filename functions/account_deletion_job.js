// Durable job core, used by the DEV pilot. Never deletes Auth accounts.
import { createHash, randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { AccountArchiveNeedsReview, archiveAccountContentPage, drainArchivedCommentReactionsPage } from './account_content_archive.js';
import { AccountPrivateCleanupNeedsReview, cleanupAccountPrivatePage } from './account_private_cleanup.js';
import { accountDeletionEventIdentity } from './account_deletion_event.js';
import { AccountDeletionRequestUnavailable, hideDeletedAuthAccountShoutsPage } from './account_shout_hiding.js';
import { AccountDeletionConfirmationNeedsReview, confirmAccountAuthDeletion } from './account_deletion_confirmation.js';
import { AccountPublicIdentityNeedsReview } from './account_public_identity.js';
import { AccountLogoRevocationNeedsReview } from './account_logo_revocation.js';
import { AccountIdentityJobNeedsReview, AccountIdentityJobLeaseLost, identityJobFields, validateIdentityJob, runAccountIdentitySlice } from './account_identity_job.js';

const retentionMillis = 60 * 24 * 60 * 60 * 1000;
const phases = new Set(['waiting-auth', 'hiding-shouts', 'retry', 'shouts-hidden', 'cleaning-private',
  'private-leaves-cleaned', 'archiving-content', 'content-archived', 'obsolete', 'needs-review', 'masking-identity', 'revoking-logos']);
const terminalPhase = (phase, version) => ['obsolete', 'needs-review'].includes(phase) ||
  (version === 1 ? phase === 'shouts-hidden' : version === 2 ? phase === 'private-leaves-cleaned' : phase === 'content-archived');
class LeaseLost extends Error {}
const same = (left, right) => left instanceof Timestamp && left.isEqual(right);
const pending = (request, identity) => request.exists && request.data()?.status === 'pending' &&
  request.data()?.userId === identity.userId && same(request.createTime, identity.requestCreateTime);

export function accountDeletionJobRef(db, identity) {
  if (!identity || identity.projectId !== db.projectId || typeof identity.projectId !== 'string' ||
      typeof identity.userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(identity.userId) ||
      !(identity.requestCreateTime instanceof Timestamp)) throw new Error('invalid-account-deletion-job-identity');
  const id = createHash('sha256').update(JSON.stringify([
    identity.projectId, identity.userId, identity.requestCreateTime.seconds, identity.requestCreateTime.nanoseconds,
  ])).digest('hex');
  return db.doc(`accountDeletionJobs/${id}`);
}

function validateJob(job, identity) {
  const invalid = () => { throw new Error('invalid-account-deletion-job-state'); };
  if (![1, 2, 3, 4].includes(job.schemaVersion) || job.userId !== identity.userId || !same(job.requestCreateTime, identity.requestCreateTime) ||
      !phases.has(job.phase) || !Number.isSafeInteger(job.attempts) || job.attempts < 1 ||
      !Number.isSafeInteger(job.hiddenCount) || job.hiddenCount < 0 ||
      !(job.createdAt instanceof Timestamp) || !(job.updatedAt instanceof Timestamp) ||
      !same(job.retainUntil, Timestamp.fromMillis(identity.requestCreateTime.toMillis() + retentionMillis)) ||
      !(job.leaseToken === null || typeof job.leaseToken === 'string') ||
      !(job.leaseUntil === null || job.leaseUntil instanceof Timestamp) ||
      (job.leaseToken === null) !== (job.leaseUntil === null) ||
      !(job.nextAttemptAt === null || job.nextAttemptAt instanceof Timestamp)) invalid();
  if (job.schemaVersion === 4 && validateIdentityJob(job)) return;
  if (job.schemaVersion !== 4 && ['masking-identity', 'revoking-logos'].includes(job.phase)) invalid();
  if (job.schemaVersion === 1) {
    if (['cleaning-private', 'private-leaves-cleaned', 'archiving-content', 'content-archived'].includes(job.phase)) invalid();
    return;
  }
  const contentStage = ['messages', 'comments', 'reactions'].includes(job.workStage);
  if (!['shouts', 'private', ...(job.schemaVersion >= 3 ? ['messages', 'comments', 'reactions'] : [])].includes(job.workStage) ||
      !Number.isSafeInteger(job.privateDeletedCount) || job.privateDeletedCount < 0 ||
      typeof job.privatePreferencesDisabled !== 'boolean' || job.phase === 'shouts-hidden' ||
      (job.workStage === 'shouts' && (job.shoutsHiddenAt !== null || job.privateDeletedCount !== 0 ||
        job.privatePreferencesDisabled || ['cleaning-private', 'private-leaves-cleaned', 'archiving-content', 'content-archived'].includes(job.phase))) ||
      (job.workStage !== 'shouts' && (!(job.shoutsHiddenAt instanceof Timestamp) || job.phase === 'hiding-shouts'))) invalid();
  if (job.schemaVersion === 2) {
    if (['archiving-content', 'content-archived'].includes(job.phase)) invalid(); return;
  }
  if (![job.archivedMessageCount, job.archivedCommentCount, job.archivedReactionCount].every(n => Number.isSafeInteger(n) && n >= 0) ||
      !(job.pendingArchiveId === null || typeof job.pendingArchiveId === 'string' && /^[a-f0-9]{64}$/.test(job.pendingArchiveId)) ||
      (job.workStage === 'reactions') !== (job.pendingArchiveId !== null) || job.phase === 'private-leaves-cleaned' ||
      (contentStage && (!(job.privateLeavesCleanedAt instanceof Timestamp) || !job.privatePreferencesDisabled)) ||
      (!contentStage && (job.privateLeavesCleanedAt !== null || job.archivedMessageCount || job.archivedCommentCount || job.archivedReactionCount)) ||
      (['archiving-content', 'content-archived'].includes(job.phase) && !contentStage) ||
      (job.phase === 'content-archived' && job.workStage !== 'comments') ||
      (contentStage && !['archiving-content', 'content-archived', 'waiting-auth', 'retry', 'obsolete', 'needs-review'].includes(job.phase)) ||
      (job.workStage === 'reactions' && job.archivedCommentCount < 1)) invalid();
}

export async function runAccountDeletionCreatedEvent(event, db, auth, options) {
  return runAccountShoutHidingJob(accountDeletionEventIdentity(event, db), db, auth, options);
}

export async function runAccountShoutHidingJob(identity, db, auth, {
  leaseMillis, retryDelayMillis, authWaitMillis, clock = () => new Date(),
  pageSize = 50, indexWriter = null, beforeTransaction = null,
  privateCleanupEnabled = false, beforePrivateCommit = null,
  contentArchiveEnabled = false, beforeContentTransaction = null,
  confirmAuthDeletionEnabled = false,
  publicIdentityEnabled = false, logoBucket = null,
} = {}) {
  // Callers supply policy explicitly; the DEV wrapper selects approved timings.
  if (![leaseMillis, retryDelayMillis, authWaitMillis].every(value => Number.isSafeInteger(value) && value > 0) ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || typeof clock !== 'function' ||
      typeof privateCleanupEnabled !== 'boolean' || typeof contentArchiveEnabled !== 'boolean' || typeof confirmAuthDeletionEnabled !== 'boolean' ||
      typeof publicIdentityEnabled !== 'boolean' ||
      (publicIdentityEnabled && (!confirmAuthDeletionEnabled || !contentArchiveEnabled || !logoBucket)) ||
      (contentArchiveEnabled && !privateCleanupEnabled)) {
    throw new Error('invalid-account-deletion-job-options');
  }
  const jobRef = accountDeletionJobRef(db, identity), requestRef = db.doc(`accountDeletionRequests/${identity.userId}`);
  const now = () => {
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) || date.getTime() < 0) throw new Error('invalid-account-deletion-job-clock');
    return Timestamp.fromDate(date);
  };
  const later = (time, duration) => Timestamp.fromMillis(time.toMillis() + duration);
  const token = randomUUID();
  const claim = await db.runTransaction(async transaction => {
    const [request, snapshot] = await transaction.getAll(requestRef, jobRef);
    const time = now(), job = snapshot.exists ? snapshot.data() : null;
    if (job) validateJob(job, identity);
    if (job?.schemaVersion === 4 && !publicIdentityEnabled) return { state: 'identity-disabled' };
    if (job?.schemaVersion >= 3 && (!privateCleanupEnabled || !contentArchiveEnabled)) return { state: 'content-disabled' };
    if (job?.schemaVersion === 2 && !privateCleanupEnabled) return { state: 'private-disabled' };
    if (!pending(request, identity)) {
      if (job && !terminalPhase(job.phase, job.schemaVersion)) transaction.update(jobRef, {
        phase: 'obsolete', updatedAt: time, completedAt: time, leaseToken: null, leaseUntil: null,
        nextAttemptAt: null, lastErrorCode: null,
      });
      return { state: 'ignored' };
    }
    if (job) {
      if (terminalPhase(job.phase, job.schemaVersion)) return { state: job.phase, hiddenCount: job.hiddenCount,
        ...(job.schemaVersion >= 2 ? { privateDeletedCount: job.privateDeletedCount } : {}),
        ...(job.schemaVersion >= 3 ? { archivedMessageCount: job.archivedMessageCount, archivedCommentCount: job.archivedCommentCount,
          archivedReactionCount: job.archivedReactionCount } : {}) };
      if (job.leaseUntil?.toMillis() > time.toMillis()) return { state: 'busy' };
      if (job.nextAttemptAt?.toMillis() > time.toMillis()) return { state: 'deferred' };
    }
    const schemaVersion = job?.schemaVersion ?? (publicIdentityEnabled ? 4 : contentArchiveEnabled ? 3 : privateCleanupEnabled ? 2 : 1);
    const privateData = schemaVersion >= 2 ? { workStage: job?.workStage ?? (schemaVersion === 4 ? 'identity' : 'shouts'),
      privateDeletedCount: job?.privateDeletedCount ?? 0,
      privatePreferencesDisabled: job?.privatePreferencesDisabled ?? false,
      shoutsHiddenAt: job?.shoutsHiddenAt ?? null } : {};
    const contentData = schemaVersion >= 3 ? { privateLeavesCleanedAt: job?.privateLeavesCleanedAt ?? null,
      archivedMessageCount: job?.archivedMessageCount ?? 0, archivedCommentCount: job?.archivedCommentCount ?? 0,
      archivedReactionCount: job?.archivedReactionCount ?? 0, pendingArchiveId: job?.pendingArchiveId ?? null } : {};
    transaction.set(jobRef, {
      ...contentData, ...privateData, ...(schemaVersion === 4 ? identityJobFields(job) : {}), schemaVersion, userId: identity.userId, requestCreateTime: identity.requestCreateTime,
      phase: job?.phase ?? 'waiting-auth', attempts: (job?.attempts ?? 0) + 1,
      hiddenCount: job?.hiddenCount ?? 0, createdAt: job?.createdAt ?? time, updatedAt: time,
      retainUntil: later(identity.requestCreateTime, retentionMillis),
      leaseToken: token, leaseUntil: later(time, leaseMillis), nextAttemptAt: later(time, leaseMillis),
      lastErrorCode: null,
    });
    return { state: 'claimed', schemaVersion, private: privateData.workStage === 'private', workStage: privateData.workStage,
      identity: schemaVersion === 4 && ['identity', 'logos'].includes(privateData.workStage),
      pendingArchiveId: contentData.pendingArchiveId, content: ['messages', 'comments', 'reactions'].includes(privateData.workStage) };
  });
  if (claim.state !== 'claimed') return claim;

  let observedAuth;
  const invocationAuth = { getUser(uid) { return observedAuth ??= Promise.resolve().then(() => auth.getUser(uid)); } };

  const assertOwner = (snapshot, time) => {
    if (!snapshot.exists) throw new LeaseLost();
    const job = snapshot.data(); validateJob(job, identity);
    if (job.leaseToken !== token || job.leaseUntil?.toMillis() <= time.toMillis() ||
        job.schemaVersion !== claim.schemaVersion || (job.workStage === 'private') !== claim.private) throw new LeaseLost();
    return job;
  };
  const transactionGuard = async transaction => {
    const snapshot = await transaction.get(jobRef), time = now(), job = assertOwner(snapshot, time);
    // Executed after all source/index reads, in the source transaction itself.
    return () => transaction.update(jobRef, { hiddenCount: job.hiddenCount + 1, phase: 'hiding-shouts', updatedAt: time });
  };
  const privateTransactionGuard = async (transaction, progress) => {
    const snapshot = await transaction.get(jobRef), time = now(), job = assertOwner(snapshot, time);
    if (job.schemaVersion < 2 || job.workStage !== 'private') throw new LeaseLost();
    if (progress.deleted === 0 && job.privatePreferencesDisabled) return () => {};
    return () => transaction.update(jobRef, { privateDeletedCount: job.privateDeletedCount + progress.deleted,
      privatePreferencesDisabled: progress.preferencesDisabled, phase: 'cleaning-private', updatedAt: time });
  };
  const archiveTransactionGuard = async (transaction, change) => {
    const snapshot = await transaction.get(jobRef), time = now(), job = assertOwner(snapshot, time);
    if (job.schemaVersion < 3 || !['messages', 'comments', 'reactions'].includes(job.workStage)) throw new LeaseLost();
    if (change.kind === 'check') return () => {};
    const updates = { phase: 'archiving-content', updatedAt: time };
    if (change.kind === 'archive-root') {
      if (job.pendingArchiveId !== null || job.workStage !== (change.contentKind === 'comment' ? 'comments' : 'messages')) throw new LeaseLost();
      const field = change.contentKind === 'comment' ? 'archivedCommentCount' : 'archivedMessageCount';
      updates[field] = job[field] + 1;
      if (change.pendingArchiveId) Object.assign(updates, { workStage: 'reactions', pendingArchiveId: change.pendingArchiveId });
    } else {
      if (job.workStage !== 'reactions' || job.pendingArchiveId !== change.archiveId) throw new LeaseLost();
      if (change.kind === 'archive-reaction') updates.archivedReactionCount = job.archivedReactionCount + change.copied;
      else if (change.kind === 'reactions-complete') Object.assign(updates, { workStage: 'comments', pendingArchiveId: null });
      else throw new Error('invalid-archive-progress');
    }
    return () => transaction.update(jobRef, updates);
  };
  const contentSlice = async () => {
    let remaining = pageSize, stage = claim.workStage, pendingId = claim.pendingArchiveId, authRead;
    const counts = { archivedMessages: 0, archivedComments: 0, archivedReactions: 0 };
    // One Auth observation for this bounded invocation, never a process cache.
    const sliceAuth = { getUser(uid) { return authRead ??= Promise.resolve().then(() => invocationAuth.getUser(uid)); } };
    while (remaining > 0) {
      const options = { pageSize: remaining, clock, transactionGuard: archiveTransactionGuard, beforeTransaction: beforeContentTransaction };
      const result = stage === 'reactions'
        ? await drainArchivedCommentReactionsPage(identity, db, sliceAuth, { ...options, archiveId: pendingId })
        : await archiveAccountContentPage(identity, db, sliceAuth, { ...options, kind: stage === 'messages' ? 'privateReply' : 'comment' });
      if (result.state === 'waiting-for-auth-deletion') return { state: result.state, ...counts };
      remaining -= result.examined;
      if (stage === 'reactions') {
        counts.archivedReactions += result.copied;
        if (result.state === 'reactions-complete') { stage = 'comments'; pendingId = null; }
        else break;
      } else {
        counts[stage === 'messages' ? 'archivedMessages' : 'archivedComments'] += result.archived;
        if (result.state === 'reactions-pending') { stage = 'reactions'; pendingId = result.archiveId; }
        else if (result.state === 'content-page-complete') {
          if (stage === 'comments') return { state: 'content-archived', ...counts };
          await db.runTransaction(async transaction => {
            const [snapshot, request] = await transaction.getAll(jobRef, requestRef), time = now(), job = assertOwner(snapshot, time);
            if (!pending(request, identity)) throw new AccountDeletionRequestUnavailable('replaced');
            if (job.workStage !== 'messages') throw new LeaseLost();
            transaction.update(jobRef, { workStage: 'comments', phase: 'archiving-content', updatedAt: time });
          });
          stage = 'comments';
        } else break;
      }
    }
    return { state: 'archiving-content', ...counts };
  };
  const finish = async (phase, lastErrorCode = null) => db.runTransaction(async transaction => {
    const [snapshot, request] = await transaction.getAll(jobRef, requestRef), time = now();
    const job = assertOwner(snapshot, time);
    if (!pending(request, identity)) phase = 'obsolete';
    transaction.update(jobRef, {
      ...(job.schemaVersion >= 2 && !claim.private && phase === 'cleaning-private'
        ? { workStage: 'private', shoutsHiddenAt: time } : {}),
      ...(job.schemaVersion >= 3 && claim.private && phase === 'archiving-content'
        ? { workStage: 'messages', privateLeavesCleanedAt: time } : {}),
      phase, updatedAt: time, leaseToken: null, leaseUntil: null, lastErrorCode,
      nextAttemptAt: terminalPhase(phase, job.schemaVersion) ? null : later(time, retryDelayMillis),
      completedAt: terminalPhase(phase, job.schemaVersion) ? time : null,
    });
    return { state: phase, hiddenCount: job.hiddenCount,
      ...(job.schemaVersion >= 2 ? { privateDeletedCount: job.privateDeletedCount } : {}),
        ...(job.schemaVersion >= 3 ? { archivedMessageCount: job.archivedMessageCount, archivedCommentCount: job.archivedCommentCount,
          archivedReactionCount: job.archivedReactionCount } : {}) };
  });
  let result;
  try {
    const confirmation = confirmAuthDeletionEnabled ? await confirmAccountAuthDeletion(identity, db, invocationAuth, {
      clock, transactionGuard: async transaction => { assertOwner(await transaction.get(jobRef), now()); },
    }) : null;
    result = confirmation?.state === 'waiting-for-auth-deletion' ? confirmation
      : claim.identity ? await runAccountIdentitySlice(identity, db, invocationAuth, { jobRef, bucket: logoBucket, clock, pageSize, assertOwner })
      : claim.content ? await contentSlice() : claim.private ? await cleanupAccountPrivatePage(identity, db, invocationAuth, {
      pageSize, beforeCommit: beforePrivateCommit, transactionGuard: privateTransactionGuard,
    }) : await hideDeletedAuthAccountShoutsPage(db, invocationAuth, identity.userId, {
      pageSize, indexWriter, beforeTransaction, transactionGuard, expectedRequestCreateTime: identity.requestCreateTime,
    });
  } catch (error) {
    if (error instanceof LeaseLost || error instanceof AccountIdentityJobLeaseLost) return { state: 'lease-lost' };
    try {
      if (error instanceof AccountDeletionRequestUnavailable) return await finish('obsolete');
      const permanent = error instanceof AccountIdentityJobNeedsReview || error instanceof AccountPublicIdentityNeedsReview || error instanceof AccountLogoRevocationNeedsReview || error instanceof AccountDeletionConfirmationNeedsReview || error instanceof AccountArchiveNeedsReview || error instanceof AccountPrivateCleanupNeedsReview || ['auth/insufficient-permission', 'auth/invalid-credential',
        'permission-denied', 'invalid-argument', 'failed-precondition', 3, 7, 9, 403].includes(error?.code);
      const expired = now().toMillis() >= identity.requestCreateTime.toMillis() + authWaitMillis;
      const result = await finish(permanent || expired ? 'needs-review' : 'retry', 'processing-failed');
      if (result.state === 'needs-review' || result.state === 'obsolete') return result;
    } catch (finishError) {
      if (!(finishError instanceof LeaseLost)) throw finishError;
      if (error instanceof AccountDeletionRequestUnavailable) return { state: 'lease-lost' };
    }
    throw error;
  }
  let phase = claim.identity ? result.state === 'logos-revoked' ? 'hiding-shouts' : 'revoking-logos' : claim.content ? result.state
    : claim.private ? result.state === 'private-leaves-cleaned' ? claim.schemaVersion >= 3 ? 'archiving-content' : 'private-leaves-cleaned' : 'cleaning-private'
    : result.state === 'shouts-hidden' ? claim.schemaVersion >= 2 ? 'cleaning-private' : 'shouts-hidden' : 'hiding-shouts';
  if (result.state === 'waiting-for-auth-deletion') {
    phase = now().toMillis() >= identity.requestCreateTime.toMillis() + authWaitMillis ? 'needs-review' : 'waiting-auth';
  }
  try {
    return { ...await finish(phase), examined: result.examined ?? 0, hidden: result.hidden ?? 0, skipped: result.skipped ?? 0,
      ...(claim.content ? { archivedMessages: result.archivedMessages ?? 0, archivedComments: result.archivedComments ?? 0,
        archivedReactions: result.archivedReactions ?? 0 } : {}),
      ...(claim.private ? { deleted: result.deleted ?? 0, conflict: result.conflict ?? false } : {}) };
  } catch (error) {
    if (error instanceof LeaseLost) return { state: 'lease-lost' };
    throw error;
  }
}
