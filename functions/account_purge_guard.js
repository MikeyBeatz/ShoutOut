import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';

export const accountRetentionMillis = 60 * 86400000;
export class AccountPurgeNeedsReview extends Error {}
export class AccountPurgeLeaseLost extends Error {}
export class AccountPurgeRequestChanged extends Error {}
export class AccountPurgeConflict extends Error {}
export const samePurgeTime = (a, b) => a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b);
export const validPurgeUid = uid => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
export function accountPurgeJobRef(db, identity) {
  if (!identity || identity.projectId !== db.projectId || !validPurgeUid(identity.userId) ||
      !(identity.requestCreateTime instanceof Timestamp)) throw new Error('invalid-account-purge-identity');
  const id = createHash('sha256').update(JSON.stringify([identity.projectId, identity.userId,
    identity.requestCreateTime.seconds, identity.requestCreateTime.nanoseconds])).digest('hex');
  return db.doc(`accountPurgeJobs/${id}`);
}

export function initialAccountPurgeJob(identity, time) {
  return { schemaVersion: 1, userId: identity.userId, requestCreateTime: identity.requestCreateTime,
    retainUntil: Timestamp.fromMillis(identity.requestCreateTime.toMillis() + accountRetentionMillis),
    nextAttemptAt: Timestamp.fromMillis(identity.requestCreateTime.toMillis() + accountRetentionMillis),
    phase: 'scheduled', stage: 0, stageCursor: null, version: 0, stack: [], selected: null, pendingFile: null,
    reservationKey: null, ingressClosedAt: null, createdAt: time, updatedAt: time, leaseToken: null, leaseUntil: null,
    deletedCount: 0, scrubbedCount: 0, storageCount: 0, lastErrorCode: null };
}

export function validateAccountPurgeJob(job, identity, stageCount) {
  const invalid = () => { throw new AccountPurgeNeedsReview('invalid-purge-job'); };
  if (!job || job.schemaVersion !== 1 || job.userId !== identity.userId ||
      !samePurgeTime(job.requestCreateTime, identity.requestCreateTime) ||
      !samePurgeTime(job.retainUntil, Timestamp.fromMillis(identity.requestCreateTime.toMillis() + accountRetentionMillis)) ||
      !['scheduled', 'purging', 'needs-review', 'obsolete'].includes(job.phase) ||
      !Number.isSafeInteger(job.stage) || job.stage < 0 || job.stage > stageCount ||
      ![job.version, job.deletedCount, job.scrubbedCount, job.storageCount].every(n => Number.isSafeInteger(n) && n >= 0) ||
      !Array.isArray(job.stack) || job.stack.length > 100 ||
      !(job.createdAt instanceof Timestamp) || !(job.updatedAt instanceof Timestamp) ||
      (job.leaseToken === null) !== (job.leaseUntil === null) ||
      !(job.leaseToken === null || typeof job.leaseToken === 'string') ||
      !(job.leaseUntil === null || job.leaseUntil instanceof Timestamp) ||
      !(job.nextAttemptAt === null || job.nextAttemptAt instanceof Timestamp)) invalid();
  if (!(job.ingressClosedAt === null || job.ingressClosedAt instanceof Timestamp) ||
      job.ingressClosedAt && job.ingressClosedAt.toMillis() < job.retainUntil.toMillis()) invalid();
  if ((job.selected === null) !== (job.stack.length === 0)) invalid();
  if (job.stageCursor !== null && (typeof job.stageCursor !== 'string' || !/^shouts\/[A-Za-z0-9_-]{1,128}$/.test(job.stageCursor) || job.stage !== 0)) invalid();
  if (job.selected && (typeof job.selected.path !== 'string' || !job.selected.path ||
      !(job.selected.createTime === null || job.selected.createTime instanceof Timestamp) ||
      !Number.isSafeInteger(job.selected.link) || job.selected.link < 0 ||
      !(job.selected.source === null || typeof job.selected.source === 'object'))) invalid();
}

export async function readAccountPurgeGuard(transaction, db, identity, jobRef, token, clock, stageCount) {
  const [snapshot, request, profile] = await transaction.getAll(jobRef, db.doc(`accountDeletionRequests/${identity.userId}`),
    db.doc(`publicProfiles/${identity.userId}`));
  const date = clock();
  if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) throw new Error('invalid-purge-clock');
  const now = Timestamp.fromDate(date), job = snapshot.data();
  validateAccountPurgeJob(job, identity, stageCount);
  if (job.phase !== 'purging' || !token || job.leaseToken !== token || job.leaseUntil?.toMillis() <= now.toMillis()) throw new AccountPurgeLeaseLost();
  if (!request.exists || request.get('userId') !== identity.userId || request.get('status') !== 'pending' ||
      !samePurgeTime(request.createTime, identity.requestCreateTime)) throw new AccountPurgeRequestChanged();
  if (now.toMillis() < job.retainUntil.toMillis()) throw new AccountPurgeNeedsReview('purge-before-deadline');
  if (!(job.ingressClosedAt instanceof Timestamp) || job.ingressClosedAt.toMillis() > now.toMillis()) {
    throw new AccountPurgeNeedsReview('purge-ingress-not-closed');
  }
  if (!(request.get('authDeletionConfirmedAt') instanceof Timestamp) ||
      request.get('authDeletionConfirmedAt').toMillis() < identity.requestCreateTime.toMillis() ||
      request.get('authDeletionConfirmedAt').toMillis() > now.toMillis() ||
      profile.get('schemaVersion') !== 1 || profile.get('accountStatus') !== 'deleted' ||
      Object.keys(profile.data() ?? {}).length !== 2) throw new AccountPurgeNeedsReview('purge-confirmation-or-marker-unavailable');
  return { job, now, request };
}
