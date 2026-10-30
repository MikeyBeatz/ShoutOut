import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { runOperationReceiptCleanup } from './cleanup_operation_receipts.js';

if (getApps().length === 0) initializeApp();

// New operational schedule: deploy only after timed-client verification and
// approval of this daily development cleanup. Account retention is unchanged.
export const cleanupOperationReceipts = onSchedule({
  schedule: '15 2 * * *',
  timeZone: 'Etc/UTC',
  region: 'europe-west3',
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 60,
  retryCount: 0,
}, async () => {
  const result = await runOperationReceiptCleanup(getFirestore());
  const summary = { scanned: result.scanned, deleted: result.deleted, skipped: result.skipped,
    conflict: result.conflict, checkpointConflict: result.checkpointConflict, reachedLimit: result.reachedLimit };
  // Never log receipt IDs, user IDs, content or the persisted scan cursor.
  const log = result.skipped || result.conflict || result.checkpointConflict || result.reachedLimit
    ? logger.warn : logger.info;
  log('operation-receipt-cleanup', summary);
});
