import { createRetentionRuntime } from './retention_runtime.js';
import { createModerationQueueHandlers } from './moderation_queue_runtime.js';
import { moderationQueueConfiguration } from './moderation_queue.js';

// Approved DEV pilot. Keep the existing Scheduler identity and resource limits.
export const retentionScheduleOptions = Object.freeze({
  schedule: '* * * * *', timeZone: 'Etc/UTC', region: 'europe-west3',
  minInstances: 0, maxInstances: 1, concurrency: 1, memory: '256MiB',
  timeoutSeconds: 60, retryCount: 0,
});

export async function runScheduledRetention(db, { moderationQueueEnabled = moderationQueueConfiguration.enabled } = {}) {
  if (typeof moderationQueueEnabled !== 'boolean') throw new Error('invalid-moderation-queue-cleanup-option');
  if (db?.projectId !== 'shoutout-dev-46c81' &&
      !(db?.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) {
    throw new Error('retention-schedule-dev-target-required');
  }
  // Missing/off control is fail-closed. Never fall back to the old receipt runner.
  const result = await createRetentionRuntime(db, { enabled: true }).run();
  if (!moderationQueueEnabled || !['checked', 'interrupted'].includes(result.state)) return result;
  try {
    const queue = await createModerationQueueHandlers(db, { enabled: true }).maintenance();
    return { ...result, moderationQueue: { state: 'checked', ...queue } };
  } catch (error) {
    return { ...result, state: 'interrupted', moderationQueue: { state: 'failed', needsReview: error.code === 'failed-precondition' } };
  }
}

export function retentionLogSummary(result) {
  const summary = { state: result.state, controlReads: result.controlReads };
  for (const kind of ['receipts', 'reads']) {
    const phase = result.phases?.[kind];
    if (!phase) continue;
    summary[kind] = { state: phase.state, scanned: phase.scanned ?? 0,
      deleted: phase.deleted ?? 0, pruned: phase.pruned ?? 0, skipped: phase.skipped ?? 0,
      needsContinuation: phase.needsContinuation === true, needsReview: phase.needsReview === true };
  }
  if (result.moderationQueue) summary.moderationQueue = {
    state: result.moderationQueue.state, examined: result.moderationQueue.examined ?? 0,
    deleted: result.moderationQueue.deleted ?? 0, needsReview: result.moderationQueue.needsReview === true,
  };
  return summary;
}
