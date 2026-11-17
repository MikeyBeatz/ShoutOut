import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScheduledRetention, retentionLogSummary } from './receipt_cleanup_handler.js';

test('scheduled DEV retention rejects production before database access', async () => {
  for (const projectId of ['shoutout-production-a1b34', 'foreign-project', 'shoutout-rules-test', undefined]) {
    const db = { projectId, doc() { assert.fail('must reject before any read'); } };
    const previous = process.env.FIRESTORE_EMULATOR_HOST;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      await assert.rejects(runScheduledRetention(db), /retention-schedule-dev-target-required/);
    } finally {
      if (previous !== undefined) process.env.FIRESTORE_EMULATOR_HOST = previous;
    }
  }
});

test('scheduled DEV retention without control does not invoke a legacy cleanup', async () => {
  let reads = 0;
  const result = await runScheduledRetention({ projectId: 'shoutout-dev-46c81', doc(path) {
    assert.equal(path, 'maintenanceState/retentionControl');
    return { async get() { reads++; return { exists: false, data: () => undefined }; } };
  } });
  assert.equal(result.state, 'off'); assert.equal(reads, 1);
});

test('retention logs exclude source identifiers, cursors and arbitrary result fields', () => {
  const result = { state: 'checked', controlReads: 1, userId: 'secret', phases: {
    receipts: { state: 'yielded', scanned: 50, deleted: 49, needsContinuation: true,
      cursor: { path: 'secret' }, leaseToken: 'secret', metrics: { payload: 'secret' } },
    reads: { state: 'complete', pruned: 1, needsReview: true, userId: 'secret' },
  } };
  const summary = retentionLogSummary(result);
  assert.equal(summary.receipts.scanned, 50); assert.equal(summary.reads.pruned, 1);
  assert.equal(summary.receipts.needsContinuation, true); assert.equal(summary.reads.needsReview, true);
  assert.equal(JSON.stringify(summary).includes('secret'), false);
});
