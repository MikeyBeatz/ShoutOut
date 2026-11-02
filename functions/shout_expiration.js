// Only materialize the already elapsed lifetime. No root/child deletion or retention extension.
import { createHash } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { scanDueAccountDeletionJobs } from './account_deletion_job_scan.js';

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
      plan?.apply();
      transaction.update(candidate.ref, { status: 'expired' });
      return 'expired';
    });
    result[state]++;
  }
  return result;
}

// Reuse the existing minute tick and its source-work budget: never two full pages.
export async function runAccountMaintenanceTick(db, auth, options) {
  const account = await scanDueAccountDeletionJobs(db, auth, options);
  if (!options.shoutExpirationEnabled || account.scanned > 0) return { ...account, expirationScanned: 0, expirationChanged: 0 };
  const expiration = await expireDueShouts(db, { clock: options.clock, maxCandidates: options.pageSize });
  return { ...account, expirationScanned: expiration.scanned, expirationChanged: expiration.expired, expirationInvalid: expiration.invalid };
}
