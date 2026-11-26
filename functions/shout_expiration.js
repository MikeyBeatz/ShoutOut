// Only materialize the already elapsed lifetime. No root/child deletion or retention extension.
import { createHash } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { scanDueAccountDeletionJobs } from './account_deletion_job_scan.js';
import { scanDueAccountPurges } from './account_purge_scan.js';

export async function expireDueShouts(db, { maxCandidates, clock = () => new Date(), indexWriter = null, beforeTransaction = null } = {}) {
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 50 || typeof clock !== 'function') {
    throw new Error('invalid-shout-expiration-options');
  }
  const date = clock();
  if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) || date.getTime() < 0) throw new Error('invalid-expiration-clock');
  const now = Timestamp.fromDate(date);
  const page = await db.collection('shouts').where('status', '==', 'active')
    .where('expiresAt', '>=', Timestamp.fromMillis(0)).where('expiresAt', '<=', now)
    .orderBy('expiresAt').orderBy(FieldPath.documentId()).limit(maxCandidates).select('status', 'expiresAt').get();
  const result = { scanned: page.size, expired: 0, skipped: 0, invalid: 0, reachedLimit: page.size === maxCandidates };
  for (const candidate of page.docs) {
    if (beforeTransaction) await beforeTransaction(candidate.ref);
    const state = await db.runTransaction(async transaction => {
      const current = await transaction.get(candidate.ref), data = current.data();
      if (!current.exists || data.status !== 'active') return 'skipped';
      if (!(data.expiresAt instanceof Timestamp)) return 'invalid';
      if (data.expiresAt.toMillis() > now.toMillis() || data.expiresAt.toMillis() < 0) return 'skipped';
      const after = { ...data, status: 'expired' };
      const operationId = createHash('sha256').update(JSON.stringify(['expireShout', candidate.ref.path,
        current.updateTime.seconds, current.updateTime.nanoseconds])).digest('hex');
      const plan = await indexWriter?.prepare(transaction, candidate.id, data, after, { operationId });
      if (indexWriter && typeof plan?.apply !== 'function') throw new Error('invalid-expiration-index-plan');
      plan?.apply();
      transaction.update(candidate.ref, { status: 'expired' });
      return 'expired';
    });
    result[state]++;
  }
  return result;
}

// Reuse the existing minute tick. The optional lifecycle path divides the
// existing page allowance; it never adds two full source pages. Its work units
// include journal steps, unlike actual SDK reads/writes measured separately.
export async function runAccountMaintenanceTick(db, auth, options) {
  if (options.indexMaintenance != null && typeof options.indexMaintenance !== 'function') throw new Error('invalid-index-maintenance');
  if (options.contentMaintenance != null && (typeof options.contentMaintenance !== 'function' ||
      !Number.isInteger(options.pageSize) || options.pageSize < 2 || options.pageSize > 50 || options.maxJobs !== 1)) {
    throw new Error('invalid-content-maintenance');
  }
  const contentBudget = options.contentMaintenance ? Math.floor(options.pageSize / 2) : 0;
  const sourceOptions = contentBudget ? { ...options, pageSize: options.pageSize - contentBudget } : options;
  const index = options.indexMaintenance ? await options.indexMaintenance() : {};
  const runSources = async () => {
    const purge = sourceOptions.retentionPurgeEnabled ? await scanDueAccountPurges(db, auth, sourceOptions) : { purgeScanned: 0, purged: 0, purgeFailed: 0, purgeNeedsReview: 0 };
    if (purge.purgeScanned) return { ...purge, scanned: 0, failed: 0, expirationScanned: 0, expirationChanged: 0 };
    const account = await scanDueAccountDeletionJobs(db, auth, sourceOptions);
    if (!sourceOptions.shoutExpirationEnabled || account.scanned > 0) return { ...purge, ...account, expirationScanned: 0, expirationChanged: 0 };
    const expiration = await expireDueShouts(db, { clock: sourceOptions.clock, maxCandidates: sourceOptions.pageSize,
      indexWriter: sourceOptions.indexWriter });
    return { ...purge, ...account, expirationScanned: expiration.scanned, expirationChanged: expiration.expired, expirationInvalid: expiration.invalid };
  };
  // Retain the exact legacy path when disabled. With both queues enabled a
  // failing source RPC cannot indefinitely suppress ordinary retention work.
  if (!contentBudget) return { ...index, ...await runSources() };
  let source, error;
  try { source = await runSources(); } catch (failure) { error = failure; }
  const content = await options.contentMaintenance({ maxWork: contentBudget });
  if (error) throw error;
  return { ...index, ...source, ...content, sourcePageBudget: sourceOptions.pageSize, lifecycleWorkBudget: contentBudget };
}
