// Durable job core, used by the DEV pilot. Never deletes Auth accounts.
import { createHash, randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { AccountPrivateCleanupNeedsReview, cleanupAccountPrivatePage } from './account_private_cleanup.js';
import { accountDeletionEventIdentity } from './account_deletion_event.js';
import { AccountDeletionRequestUnavailable, hideDeletedAuthAccountShoutsPage } from './account_shout_hiding.js';

const retentionMillis = 60 * 24 * 60 * 60 * 1000;
const phases = new Set(['waiting-auth', 'hiding-shouts', 'retry', 'shouts-hidden', 'cleaning-private',
  'private-leaves-cleaned', 'obsolete', 'needs-review']);
const terminalPhase = (phase, version) => ['obsolete', 'needs-review'].includes(phase) ||
  (version === 1 ? phase === 'shouts-hidden' : phase === 'private-leaves-cleaned');
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
  if (![1, 2].includes(job.schemaVersion) || job.userId !== identity.userId || !same(job.requestCreateTime, identity.requestCreateTime) ||
      !phases.has(job.phase) || !Number.isSafeInteger(job.attempts) || job.attempts < 1 ||
      !Number.isSafeInteger(job.hiddenCount) || job.hiddenCount < 0 ||
      !(job.createdAt instanceof Timestamp) || !(job.updatedAt instanceof Timestamp) ||
      !same(job.retainUntil, Timestamp.fromMillis(identity.requestCreateTime.toMillis() + retentionMillis)) ||
      !(job.leaseToken === null || typeof job.leaseToken === 'string') ||
      !(job.leaseUntil === null || job.leaseUntil instanceof Timestamp) ||
      (job.leaseToken === null) !== (job.leaseUntil === null) ||
      !(job.nextAttemptAt === null || job.nextAttemptAt instanceof Timestamp)) throw new Error('invalid-account-deletion-job-state');
  if (job.schemaVersion === 1 && ['cleaning-private', 'private-leaves-cleaned'].includes(job.phase) ||
      job.schemaVersion === 2 && (!['shouts', 'private'].includes(job.workStage) ||
        !Number.isSafeInteger(job.privateDeletedCount) || job.privateDeletedCount < 0 ||
        typeof job.privatePreferencesDisabled !== 'boolean' || job.phase === 'shouts-hidden' ||
        (job.workStage === 'shouts' && (job.shoutsHiddenAt !== null || job.privateDeletedCount !== 0 ||
          job.privatePreferencesDisabled || ['cleaning-private', 'private-leaves-cleaned'].includes(job.phase))) ||
        (job.workStage === 'private' && (!(job.shoutsHiddenAt instanceof Timestamp) || job.phase === 'hiding-shouts')))) {
    throw new Error('invalid-account-deletion-job-state');
  }
}

export async function runAccountDeletionCreatedEvent(event, db, auth, options) {
  return runAccountShoutHidingJob(accountDeletionEventIdentity(event, db), db, auth, options);
}

export async function runAccountShoutHidingJob(identity, db, auth, {
  leaseMillis, retryDelayMillis, authWaitMillis, clock = () => new Date(),
  pageSize = 50, indexWriter = null, beforeTransaction = null,
  privateCleanupEnabled = false, beforePrivateCommit = null,
} = {}) {
  // Callers supply policy explicitly; the DEV wrapper selects approved timings.
  if (![leaseMillis, retryDelayMillis, authWaitMillis].every(value => Number.isSafeInteger(value) && value > 0) ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || typeof clock !== 'function' ||
      typeof privateCleanupEnabled !== 'boolean') {
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
        ...(job.schemaVersion === 2 ? { privateDeletedCount: job.privateDeletedCount } : {}) };
      if (job.leaseUntil?.toMillis() > time.toMillis()) return { state: 'busy' };
      if (job.nextAttemptAt?.toMillis() > time.toMillis()) return { state: 'deferred' };
    }
    const schemaVersion = job?.schemaVersion ?? (privateCleanupEnabled ? 2 : 1);
    const privateData = schemaVersion === 2 ? { workStage: job?.workStage ?? 'shouts',
      privateDeletedCount: job?.privateDeletedCount ?? 0,
      privatePreferencesDisabled: job?.privatePreferencesDisabled ?? false,
      shoutsHiddenAt: job?.shoutsHiddenAt ?? null } : {};
    transaction.set(jobRef, {
      ...privateData, schemaVersion, userId: identity.userId, requestCreateTime: identity.requestCreateTime,
      phase: job?.phase ?? 'waiting-auth', attempts: (job?.attempts ?? 0) + 1,
      hiddenCount: job?.hiddenCount ?? 0, createdAt: job?.createdAt ?? time, updatedAt: time,
      retainUntil: later(identity.requestCreateTime, retentionMillis),
      leaseToken: token, leaseUntil: later(time, leaseMillis), nextAttemptAt: later(time, leaseMillis),
      lastErrorCode: null,
    });
    return { state: 'claimed', schemaVersion, private: privateData.workStage === 'private' };
  });
  if (claim.state !== 'claimed') return claim;

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
    if (job.schemaVersion !== 2 || job.workStage !== 'private') throw new LeaseLost();
    if (progress.deleted === 0 && job.privatePreferencesDisabled) return () => {};
    return () => transaction.update(jobRef, { privateDeletedCount: job.privateDeletedCount + progress.deleted,
      privatePreferencesDisabled: progress.preferencesDisabled, phase: 'cleaning-private', updatedAt: time });
  };
  const finish = async (phase, lastErrorCode = null) => db.runTransaction(async transaction => {
    const [snapshot, request] = await transaction.getAll(jobRef, requestRef), time = now();
    const job = assertOwner(snapshot, time);
    if (!pending(request, identity)) phase = 'obsolete';
    transaction.update(jobRef, {
      ...(job.schemaVersion === 2 && !claim.private && phase === 'cleaning-private'
        ? { workStage: 'private', shoutsHiddenAt: time } : {}),
      phase, updatedAt: time, leaseToken: null, leaseUntil: null, lastErrorCode,
      nextAttemptAt: terminalPhase(phase, job.schemaVersion) ? null : later(time, retryDelayMillis),
      completedAt: terminalPhase(phase, job.schemaVersion) ? time : null,
    });
    return { state: phase, hiddenCount: job.hiddenCount,
      ...(job.schemaVersion === 2 ? { privateDeletedCount: job.privateDeletedCount } : {}) };
  });
  let result;
  try {
    result = claim.private ? await cleanupAccountPrivatePage(identity, db, auth, {
      pageSize, beforeCommit: beforePrivateCommit, transactionGuard: privateTransactionGuard,
    }) : await hideDeletedAuthAccountShoutsPage(db, auth, identity.userId, {
      pageSize, indexWriter, beforeTransaction, transactionGuard, expectedRequestCreateTime: identity.requestCreateTime,
    });
  } catch (error) {
    if (error instanceof LeaseLost) return { state: 'lease-lost' };
    try {
      if (error instanceof AccountDeletionRequestUnavailable) return await finish('obsolete');
      const permanent = error instanceof AccountPrivateCleanupNeedsReview || ['auth/insufficient-permission', 'auth/invalid-credential',
        'permission-denied', 'invalid-argument', 'failed-precondition', 3, 7, 9].includes(error?.code);
      const expired = now().toMillis() >= identity.requestCreateTime.toMillis() + authWaitMillis;
      const result = await finish(permanent || expired ? 'needs-review' : 'retry', 'processing-failed');
      if (result.state === 'needs-review' || result.state === 'obsolete') return result;
    } catch (finishError) {
      if (!(finishError instanceof LeaseLost)) throw finishError;
      if (error instanceof AccountDeletionRequestUnavailable) return { state: 'lease-lost' };
    }
    throw error;
  }
  let phase = claim.private
    ? result.state === 'private-leaves-cleaned' ? 'private-leaves-cleaned' : 'cleaning-private'
    : result.state === 'shouts-hidden' ? claim.schemaVersion === 2 ? 'cleaning-private' : 'shouts-hidden' : 'hiding-shouts';
  if (result.state === 'waiting-for-auth-deletion') {
    phase = now().toMillis() >= identity.requestCreateTime.toMillis() + authWaitMillis ? 'needs-review' : 'waiting-auth';
  }
  try {
    return { ...await finish(phase), examined: result.examined ?? 0, hidden: result.hidden ?? 0, skipped: result.skipped ?? 0,
      ...(claim.private ? { deleted: result.deleted ?? 0, conflict: result.conflict ?? false } : {}) };
  } catch (error) {
    if (error instanceof LeaseLost) return { state: 'lease-lost' };
    throw error;
  }
}
