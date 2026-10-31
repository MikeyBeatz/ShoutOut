// Local job prototype. No deployed trigger, scheduler, client input or Auth deletion.
import { createHash, randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { accountDeletionEventIdentity } from './account_deletion_event.js';
import { AccountDeletionRequestUnavailable, hideDeletedAuthAccountShoutsPage } from './account_shout_hiding.js';

const retentionMillis = 60 * 24 * 60 * 60 * 1000;
const phases = new Set(['waiting-auth', 'hiding-shouts', 'retry', 'shouts-hidden', 'obsolete', 'needs-review']);
const terminal = new Set(['shouts-hidden', 'obsolete', 'needs-review']);
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
  if (job.schemaVersion !== 1 || job.userId !== identity.userId || !same(job.requestCreateTime, identity.requestCreateTime) ||
      !phases.has(job.phase) || !Number.isSafeInteger(job.attempts) || job.attempts < 1 ||
      !Number.isSafeInteger(job.hiddenCount) || job.hiddenCount < 0 ||
      !(job.createdAt instanceof Timestamp) || !(job.updatedAt instanceof Timestamp) ||
      !same(job.retainUntil, Timestamp.fromMillis(identity.requestCreateTime.toMillis() + retentionMillis)) ||
      !(job.leaseToken === null || typeof job.leaseToken === 'string') ||
      !(job.leaseUntil === null || job.leaseUntil instanceof Timestamp) ||
      (job.leaseToken === null) !== (job.leaseUntil === null) ||
      !(job.nextAttemptAt === null || job.nextAttemptAt instanceof Timestamp)) throw new Error('invalid-account-deletion-job-state');
}

export async function runAccountDeletionCreatedEvent(event, db, auth, options) {
  return runAccountShoutHidingJob(accountDeletionEventIdentity(event, db), db, auth, options);
}

export async function runAccountShoutHidingJob(identity, db, auth, {
  leaseMillis, retryDelayMillis, authWaitMillis, clock = () => new Date(),
  pageSize = 50, indexWriter = null, beforeTransaction = null,
} = {}) {
  // Timings are required lab configuration; no live runtime policy is selected.
  if (![leaseMillis, retryDelayMillis, authWaitMillis].every(value => Number.isSafeInteger(value) && value > 0) ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || typeof clock !== 'function') {
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
    if (!pending(request, identity)) {
      if (job && !terminal.has(job.phase)) transaction.update(jobRef, {
        phase: 'obsolete', updatedAt: time, completedAt: time, leaseToken: null, leaseUntil: null,
        nextAttemptAt: null, lastErrorCode: null,
      });
      return { state: 'ignored' };
    }
    if (job) {
      if (terminal.has(job.phase)) return { state: job.phase, hiddenCount: job.hiddenCount };
      if (job.leaseUntil?.toMillis() > time.toMillis()) return { state: 'busy' };
      if (job.nextAttemptAt?.toMillis() > time.toMillis()) return { state: 'deferred' };
    }
    transaction.set(jobRef, {
      schemaVersion: 1, userId: identity.userId, requestCreateTime: identity.requestCreateTime,
      phase: job?.phase ?? 'waiting-auth', attempts: (job?.attempts ?? 0) + 1,
      hiddenCount: job?.hiddenCount ?? 0, createdAt: job?.createdAt ?? time, updatedAt: time,
      retainUntil: later(identity.requestCreateTime, retentionMillis),
      leaseToken: token, leaseUntil: later(time, leaseMillis), nextAttemptAt: later(time, leaseMillis),
      lastErrorCode: null,
    });
    return { state: 'claimed' };
  });
  if (claim.state !== 'claimed') return claim;

  const assertOwner = (snapshot, time) => {
    if (!snapshot.exists) throw new LeaseLost();
    const job = snapshot.data(); validateJob(job, identity);
    if (job.leaseToken !== token || job.leaseUntil?.toMillis() <= time.toMillis()) throw new LeaseLost();
    return job;
  };
  const transactionGuard = async transaction => {
    const snapshot = await transaction.get(jobRef), time = now(), job = assertOwner(snapshot, time);
    // Executed after all source/index reads, in the source transaction itself.
    return () => transaction.update(jobRef, { hiddenCount: job.hiddenCount + 1, phase: 'hiding-shouts', updatedAt: time });
  };
  const finish = async (phase, lastErrorCode = null) => db.runTransaction(async transaction => {
    const [snapshot, request] = await transaction.getAll(jobRef, requestRef), time = now();
    const job = assertOwner(snapshot, time);
    if (!pending(request, identity)) phase = 'obsolete';
    transaction.update(jobRef, {
      phase, updatedAt: time, leaseToken: null, leaseUntil: null, lastErrorCode,
      nextAttemptAt: terminal.has(phase) ? null : later(time, retryDelayMillis),
      completedAt: terminal.has(phase) ? time : null,
    });
    return { state: phase, hiddenCount: job.hiddenCount };
  });
  let result;
  try {
    result = await hideDeletedAuthAccountShoutsPage(db, auth, identity.userId, {
      pageSize, indexWriter, beforeTransaction, transactionGuard, expectedRequestCreateTime: identity.requestCreateTime,
    });
  } catch (error) {
    if (error instanceof LeaseLost) return { state: 'lease-lost' };
    try {
      if (error instanceof AccountDeletionRequestUnavailable) return await finish('obsolete');
      await finish('retry', 'processing-failed');
    } catch (finishError) {
      if (!(finishError instanceof LeaseLost)) throw finishError;
      if (error instanceof AccountDeletionRequestUnavailable) return { state: 'lease-lost' };
    }
    throw error;
  }
  let phase = result.state === 'shouts-hidden' ? 'shouts-hidden' : 'hiding-shouts';
  if (result.state === 'waiting-for-auth-deletion') {
    phase = now().toMillis() >= identity.requestCreateTime.toMillis() + authWaitMillis ? 'needs-review' : 'waiting-auth';
  }
  try {
    return { ...await finish(phase), examined: result.examined ?? 0, hidden: result.hidden ?? 0, skipped: result.skipped ?? 0 };
  } catch (error) {
    if (error instanceof LeaseLost) return { state: 'lease-lost' };
    throw error;
  }
}
