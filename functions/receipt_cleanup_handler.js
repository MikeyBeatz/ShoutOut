import { createRetentionRuntime } from './retention_runtime.js';
import { createModerationQueueHandlers } from './moderation_queue_runtime.js';
import { moderationQueueConfiguration } from './moderation_queue.js';
import { performance } from 'node:perf_hooks';
import { getStorage } from 'firebase-admin/storage';
import { runBusinessLogoMaintenance } from './business_logo_cleanup_adapter.js';
import { businessLogoConfiguration } from './business_logo_runtime.js';
import { businessLogoStorage } from './business_logo_storage.js';

// Approved DEV pilot. Keep the existing Scheduler identity and resource limits.
export const retentionScheduleOptions = Object.freeze({
  schedule: '* * * * *', timeZone: 'Etc/UTC', region: 'europe-west3',
  minInstances: 0, maxInstances: 1, concurrency: 1, memory: '256MiB',
  timeoutSeconds: 60, retryCount: 0,
});

export async function runScheduledRetention(db, {
  moderationQueueEnabled = moderationQueueConfiguration.enabled, logoEnabled = businessLogoConfiguration.enabled,
  clock = () => new Date(), monotonic = () => performance.now(),
  runRetention = (db, clock) => createRetentionRuntime(db, { enabled: true, clock }).run(),
  runModeration = (db, clock) => createModerationQueueHandlers(db, { enabled: true, clock }).maintenance(),
  runLogo = (db, options) => runBusinessLogoMaintenance(db,
    () => businessLogoStorage(getStorage().bucket(`${db.projectId}.firebasestorage.app`), db.projectId), options),
} = {}) {
  if (typeof moderationQueueEnabled !== 'boolean' || typeof logoEnabled !== 'boolean' ||
      [clock, monotonic, runRetention, runModeration, runLogo].some(f => typeof f !== 'function')) throw new Error('invalid-moderation-queue-cleanup-option');
  if (db?.projectId !== 'shoutout-dev-46c81' &&
      !(db?.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) {
    throw new Error('retention-schedule-dev-target-required');
  }
  // Missing/off control is fail-closed. Never fall back to the old receipt runner.
  const started = monotonic();
  if (!Number.isFinite(started)) throw Error('invalid-retention-elapsed-clock');
  let result = await runRetention(db, clock);
  if (!['checked', 'interrupted'].includes(result.state)) return result;
  if (moderationQueueEnabled) {
    try {
      const queue = await runModeration(db, clock);
      result = { ...result, moderationQueue: { state: 'checked', ...queue } };
    } catch (error) {
      return { ...result, state: 'interrupted', moderationQueue: { state: 'failed', needsReview: error.code === 'failed-precondition' } };
    }
  }
  if (!logoEnabled || result.state !== 'checked') return result;
  const elapsed = monotonic() - started;
  // Preserve at least 15 s of the existing 60 s Function deadline. The logo
  // runner retains its own 5 s between-step budget and durable checkpoint.
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 45000) return {
    ...result, logo: { status: 'deferred-budget', examined: 0, needsContinuation: true },
  };
  try { return { ...result, logo: await runLogo(db, { enabled: true, clock, monotonic }) }; }
  catch (error) { return { ...result, state: 'interrupted', logo: { status: 'failed', needsReview: error.code === 'failed-precondition' } }; }
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
  if (result.logo) summary.logo = {
    status: result.logo.status, examined: result.logo.examined ?? 0, cleaned: result.logo.cleaned ?? 0,
    needsReview: result.logo.needsReview === true, needsContinuation: result.logo.needsContinuation === true,
  };
  return summary;
}
