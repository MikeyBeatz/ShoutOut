import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { accountPurgeJobRef } from './account_purge_guard.js';
import { runAccountPurgeJob } from './account_purge_job.js';

export async function scanDueAccountPurges(db, auth, options) {
  if (options.maxJobs !== 1 || typeof options.clock !== 'function') throw new Error('invalid-purge-scan-options');
  const now = Timestamp.fromDate(options.clock()), checkpointRef = db.doc('maintenanceState/accountPurgeJobs');
  const checkpoint = await checkpointRef.get(), cursor = checkpoint.get('cursor') ?? null;
  if (cursor && (!(cursor.time instanceof Timestamp) || typeof cursor.id !== 'string' || !/^[a-f0-9]{64}$/.test(cursor.id))) {
    throw new Error('invalid-purge-scan-checkpoint');
  }
  let query = db.collection('accountPurgeJobs').where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt').orderBy(FieldPath.documentId());
  if (cursor && cursor.time.toMillis() <= now.toMillis()) query = query.startAfter(cursor.time, cursor.id);
  const page = await query.limit(1).get(), result = { purgeScanned: page.size, purgeExamined: 0, purged: 0, purgeFailed: 0, purgeNeedsReview: 0 };
  for (const row of page.docs) {
    try {
      const identity = { projectId: db.projectId, userId: row.get('userId'), requestCreateTime: row.get('requestCreateTime') };
      if (accountPurgeJobRef(db, identity).path !== row.ref.path) throw new Error('invalid-purge-job-id');
      const item = await runAccountPurgeJob(identity, db, auth, options);
      result.purgeExamined += item.examined ?? 0;
      if (item.state === 'purged') result.purged++;
      if (item.state === 'needs-review' || item.state === 'auth-still-exists') result.purgeNeedsReview++;
    } catch { result.purgeFailed++; }
  }
  const last = page.docs.at(-1), next = last ? { time: last.get('nextAttemptAt'), id: last.id } : null;
  if (next || cursor) {
    try {
      const patch = { cursor: next, updatedAt: now };
      if (checkpoint.exists) await checkpointRef.update(patch, { lastUpdateTime: checkpoint.updateTime });
      else await checkpointRef.create(patch);
    } catch (error) { if (![6, 9].includes(error.code)) throw error; result.purgeFailed++; }
  }
  return result;
}
