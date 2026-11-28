import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { runScheduledRetention, retentionScheduleOptions, retentionLogSummary } from './receipt_cleanup_handler.js';

if (getApps().length === 0) initializeApp();

// Replace, rather than supplement, the old daily receipt runner.
export const cleanupOperationReceipts = onSchedule(retentionScheduleOptions, async () => {
  const result = await runScheduledRetention(getFirestore());
  const summary = retentionLogSummary(result);
  // Never log receipt IDs, user IDs, content or persisted scan cursors.
  const log = result.state === 'interrupted' || result.logo?.needsReview || Object.values(result.phases ?? {}).some(phase => phase.needsReview)
    ? logger.warn : logger.info;
  log('retention-maintenance', summary);
});
