import { createRetentionRuntime } from './retention_runtime.js';

// Approved DEV pilot. Keep the existing Scheduler identity and resource limits.
export const retentionScheduleOptions = Object.freeze({
  schedule: '* * * * *', timeZone: 'Etc/UTC', region: 'europe-west3',
  minInstances: 0, maxInstances: 1, concurrency: 1, memory: '256MiB',
  timeoutSeconds: 60, retryCount: 0,
});

export async function runScheduledRetention(db) {
  if (db?.projectId !== 'shoutout-dev-46c81' &&
      !(db?.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) {
    throw new Error('retention-schedule-dev-target-required');
  }
  // Missing/off control is fail-closed. Never fall back to the old receipt runner.
  return createRetentionRuntime(db, { enabled: true }).run();
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
  return summary;
}
