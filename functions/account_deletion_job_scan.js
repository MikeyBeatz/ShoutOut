// Bounded local recovery scan. No live schedule; bounds/timings are caller supplied.
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { accountDeletionJobRef, runAccountShoutHidingJob } from './account_deletion_job.js';

export async function scanDueAccountDeletionJobs(db, auth, { maxJobs, ...options } = {}) {
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 50 || typeof options.clock !== 'function' ||
      ![options.leaseMillis, options.retryDelayMillis, options.authWaitMillis].every(value => Number.isSafeInteger(value) && value > 0) ||
      !Number.isInteger(options.pageSize ?? 50) || (options.pageSize ?? 50) < 1 || (options.pageSize ?? 50) > 50) {
    throw new Error('invalid-account-deletion-job-scan-options');
  }
  const date = options.clock();
  if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) || date.getTime() < 0) throw new Error('invalid-account-deletion-job-clock');
  const now = Timestamp.fromDate(date), checkpointRef = db.doc('maintenanceState/accountDeletionShoutJobs');
  const checkpoint = await checkpointRef.get(), cursor = checkpoint.data()?.cursor ?? null;
  if (cursor !== null && (!(cursor.nextAttemptAt instanceof Timestamp) ||
      typeof cursor.id !== 'string' || !/^[a-f0-9]{64}$/.test(cursor.id))) throw new Error('invalid-account-deletion-job-scan-cursor');
  const base = db.collection('accountDeletionJobs').where('nextAttemptAt', '<=', now)
    .orderBy('nextAttemptAt').orderBy(FieldPath.documentId());
  const query = cursor && cursor.nextAttemptAt.toMillis() <= now.toMillis()
    ? base.startAfter(cursor.nextAttemptAt, cursor.id) : base;
  const page = await query.limit(maxJobs).get();
  const result = { scanned: page.size, processed: 0, failed: 0, hidden: 0, examined: 0,
    shoutsHidden: 0, needsReview: 0, ignored: 0, busy: 0, deferred: 0, leaseLost: 0,
    reachedLimit: page.size === maxJobs, checkpointConflict: false };
  for (const snapshot of page.docs) {
    const data = snapshot.data();
    try {
      const identity = { projectId: db.projectId, userId: data.userId, requestCreateTime: data.requestCreateTime };
      if (accountDeletionJobRef(db, identity).id !== snapshot.id) throw new Error('invalid-account-deletion-job-id');
      const item = await runAccountShoutHidingJob(identity, db, auth, options);
      result.processed++;
      result.hidden += item.hidden ?? 0; result.examined += item.examined ?? 0;
      const counter = { 'shouts-hidden': 'shoutsHidden', 'needs-review': 'needsReview',
        ignored: 'ignored', busy: 'busy', deferred: 'deferred', 'lease-lost': 'leaseLost' }[item.state];
      if (counter) result[counter]++;
    } catch {
      // No UID, error details, tokens or job IDs in the public summary.
      // Cursor rotation lets later jobs progress past a malformed record.
      result.failed++;
    }
  }
  const last = page.docs.at(-1);
  const next = { cursor: last && page.size === maxJobs
    ? { nextAttemptAt: last.get('nextAttemptAt'), id: last.id } : null, updatedAt: now };
  // Idle scans and short complete pages need no checkpoint write.
  if (cursor === null && next.cursor === null) return result;
  if (cursor && next.cursor && cursor.id === next.cursor.id && cursor.nextAttemptAt.isEqual(next.cursor.nextAttemptAt)) return result;
  try {
    if (checkpoint.exists) await checkpointRef.update(next, { lastUpdateTime: checkpoint.updateTime });
    else await checkpointRef.create(next);
  } catch (error) {
    if (![6, 9].includes(error.code)) throw error;
    result.checkpointConflict = true;
  }
  return result;
}
