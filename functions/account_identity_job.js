// Versioned identity/logo phase. No Function export, Auth deletion or Storage deletion.
import { Timestamp } from 'firebase-admin/firestore';
import { maskDeletedAccountPublicIdentity } from './account_public_identity.js';
import { listDeletedAccountLogos, revokeDeletedAccountLogo } from './account_logo_revocation.js';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';

export class AccountIdentityJobNeedsReview extends Error {}
export class AccountIdentityJobLeaseLost extends Error {}
const keyValid = key => typeof key === 'string' && key.length >= 3 && key.length <= 24 && key === key.toLowerCase() &&
  /^[\p{L}0-9]+([-_][\p{L}0-9]+)*$/u.test(key);
const pathValid = (uid, path) => typeof path === 'string' && new RegExp(`^businessLogos/${uid}/logo-[0-9]+\\.png$`).test(path);

export function identityJobFields(job) {
  return { publicIdentityMaskedAt: job?.publicIdentityMaskedAt ?? null, reservationKey: job?.reservationKey ?? null,
    logosRevokedAt: job?.logosRevokedAt ?? null, logoCursor: job?.logoCursor ?? null,
    logoNextCursor: job?.logoNextCursor ?? null, logoPageLoaded: job?.logoPageLoaded ?? false,
    pendingLogoPaths: job?.pendingLogoPaths ?? [], logoProcessedCount: job?.logoProcessedCount ?? 0 };
}

// Returns true for the two pre-content stages; normal content stages retain v3 validation.
export function validateIdentityJob(job) {
  const invalid = () => { throw new Error('invalid-account-identity-job-state'); };
  if (!Number.isSafeInteger(job.logoProcessedCount) || job.logoProcessedCount < 0 ||
      typeof job.logoPageLoaded !== 'boolean' || !Array.isArray(job.pendingLogoPaths) || job.pendingLogoPaths.length > 50 ||
      new Set(job.pendingLogoPaths).size !== job.pendingLogoPaths.length || job.pendingLogoPaths.some(p => !pathValid(job.userId, p)) ||
      [job.logoCursor, job.logoNextCursor].some(v => v !== null && (typeof v !== 'string' || !v)) ||
      (!job.logoPageLoaded && (job.pendingLogoPaths.length || job.logoNextCursor !== null))) invalid();
  if (job.workStage === 'identity') {
    if (job.publicIdentityMaskedAt !== null || job.reservationKey !== null || job.logosRevokedAt !== null ||
        job.logoCursor !== null || job.logoPageLoaded || job.logoProcessedCount !== 0 ||
        !['waiting-auth', 'masking-identity', 'retry', 'obsolete', 'needs-review'].includes(job.phase)) invalid();
  } else {
    if (!(job.publicIdentityMaskedAt instanceof Timestamp) || !keyValid(job.reservationKey)) invalid();
    if (job.publicIdentityMaskedAt.toMillis() < job.requestCreateTime.toMillis() ||
        job.publicIdentityMaskedAt.toMillis() > job.updatedAt.toMillis()) invalid();
    if (job.workStage === 'logos') {
      if (job.logosRevokedAt !== null || !['revoking-logos', 'waiting-auth', 'retry', 'obsolete', 'needs-review'].includes(job.phase)) invalid();
    } else if (!(job.logosRevokedAt instanceof Timestamp) || job.logosRevokedAt.toMillis() < job.publicIdentityMaskedAt.toMillis() ||
        job.logosRevokedAt.toMillis() > job.updatedAt.toMillis() || job.logoPageLoaded || job.logoCursor !== null || job.pendingLogoPaths.length ||
        ['masking-identity', 'revoking-logos'].includes(job.phase)) invalid();
  }
  const preliminary = ['identity', 'logos'].includes(job.workStage);
  if (preliminary && (job.hiddenCount !== 0 || job.privateDeletedCount !== 0 || job.privatePreferencesDisabled !== false ||
      job.shoutsHiddenAt !== null || job.privateLeavesCleanedAt !== null || job.pendingArchiveId !== null ||
      job.archivedMessageCount !== 0 || job.archivedCommentCount !== 0 || job.archivedReactionCount !== 0)) invalid();
  return preliminary;
}

export async function runAccountIdentitySlice(identity, db, auth, {
  jobRef, bucket, clock, pageSize, assertOwner,
}) {
  const requestRef = db.doc(`accountDeletionRequests/${identity.userId}`);
  const read = async (transaction, stage, head) => {
    const [snapshot, request] = await transaction.getAll(jobRef, requestRef);
    const now = Timestamp.fromDate(clock()), job = assertOwner(snapshot, now);
    if (!request.exists || request.data()?.status !== 'pending' || request.data()?.userId !== identity.userId ||
        !request.createTime.isEqual(identity.requestCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
    if (!(request.data().authDeletionConfirmedAt instanceof Timestamp) || now.toMillis() >= job.retainUntil.toMillis()) {
      throw new AccountIdentityJobNeedsReview('identity-confirmation-or-retention-unavailable');
    }
    if ((stage && job.workStage !== stage) || (head && job.pendingLogoPaths[0] !== head)) throw new AccountIdentityJobLeaseLost();
    return { job, now };
  };
  const initial = await db.runTransaction(transaction => read(transaction));
  if (initial.job.workStage === 'identity') {
    return maskDeletedAccountPublicIdentity(identity, db, auth, { clock, transactionGuard: async (transaction, change) => {
      const { now } = await read(transaction, 'identity');
      return () => transaction.update(jobRef, { publicIdentityMaskedAt: now, reservationKey: change.reservationKey,
        workStage: 'logos', phase: 'revoking-logos', updatedAt: now });
    } });
  }
  if (initial.job.workStage !== 'logos') throw new AccountIdentityJobLeaseLost();
  // The approved DEV bucket was verified unversioned; never silently omit old versions.
  const [metadata] = await bucket.getMetadata();
  if (metadata.versioning?.enabled) throw new AccountIdentityJobNeedsReview('versioned-logo-bucket-needs-review');
  let examined = 0;
  while (examined < pageSize) {
    const { job } = await db.runTransaction(transaction => read(transaction, 'logos'));
    if (!job.logoPageLoaded) {
      const page = await listDeletedAccountLogos(identity, db, auth, bucket, { clock, pageSize: pageSize - examined,
        ...(job.logoCursor ? { pageToken: job.logoCursor } : {}), transactionGuard: transaction => read(transaction, 'logos') });
      await db.runTransaction(async transaction => {
        const current = await read(transaction, 'logos');
        if (current.job.logoPageLoaded || current.job.logoCursor !== job.logoCursor) throw new AccountIdentityJobLeaseLost();
        transaction.update(jobRef, { logoPageLoaded: true, pendingLogoPaths: page.paths, logoNextCursor: page.nextPageToken, updatedAt: current.now });
      });
      // One listing per slice; processing its candidates below remains inside the shared budget.
    }
    const current = await db.runTransaction(transaction => read(transaction, 'logos'));
    const path = current.job.pendingLogoPaths[0];
    if (!path) {
      return db.runTransaction(async transaction => {
        const { job: latest, now } = await read(transaction, 'logos');
        if (!latest.logoPageLoaded || latest.pendingLogoPaths.length) throw new AccountIdentityJobLeaseLost();
        const more = latest.logoNextCursor !== null;
        transaction.update(jobRef, { logoPageLoaded: false, logoCursor: latest.logoNextCursor, logoNextCursor: null,
          ...(more ? {} : { logosRevokedAt: now, workStage: 'shouts', phase: 'hiding-shouts' }), updatedAt: now });
        return { state: more ? 'logos-continuation' : 'logos-revoked', examined };
      });
    }
    await revokeDeletedAccountLogo(identity, db, auth, bucket, path, { clock,
      transactionGuard: transaction => read(transaction, 'logos', path) });
    await db.runTransaction(async transaction => {
      const { job: latest, now } = await read(transaction, 'logos', path);
      transaction.update(jobRef, { pendingLogoPaths: latest.pendingLogoPaths.slice(1),
        logoProcessedCount: latest.logoProcessedCount + 1, updatedAt: now });
    });
    examined++;
  }
  return { state: 'logos-continuation', examined };
}
