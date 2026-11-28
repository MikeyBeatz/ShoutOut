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
test('disabled retention never starts prepared queue maintenance, even if explicitly selected', async () => {
  let reads = 0;
  const result = await runScheduledRetention({ projectId: 'shoutout-dev-46c81', doc(path) {
    assert.equal(path, 'maintenanceState/retentionControl');
    return { async get() { reads++; return { exists: false, data: () => undefined }; } };
  } }, { moderationQueueEnabled: true });
  assert.equal(result.state, 'off'); assert.equal(reads, 1);
  await assert.rejects(runScheduledRetention({}, { moderationQueueEnabled: 'true' }), /invalid-moderation-queue/);
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


test('shared maintenance preserves order and defers logo at the fifteen-second deadline reserve', async () => {
  for (const elapsed of [0, 44999, 45000, 59000]) {
    const calls = []; let now = 0;
    const result = await runScheduledRetention({ projectId: 'shoutout-dev-46c81' }, {
      logoEnabled: true, moderationQueueEnabled: true, monotonic: () => now,
      runRetention: async () => { calls.push('retention'); now = elapsed / 2; return { state: 'checked' }; },
      runModeration: async () => { calls.push('queue'); now = elapsed; return { examined: 0 }; },
      runLogo: async (_, options) => { assert.equal(options.enabled, true); calls.push('logo'); return { status: 'checked', examined: 1 }; },
    });
    assert.deepEqual(calls, elapsed < 45000 ? ['retention', 'queue', 'logo'] : ['retention', 'queue']);
    assert.equal(result.logo.status, elapsed < 45000 ? 'checked' : 'deferred-budget');
  }
});
test('failed/paused parent maintenance and disabled logo never construct a Storage client or skip the queue', async () => {
  for (const state of ['off', 'paused', 'interrupted']) {
    const calls = [];
    await runScheduledRetention({ projectId: 'shoutout-dev-46c81' }, { logoEnabled: true, moderationQueueEnabled: true,
      runRetention: async () => ({ state }), runModeration: async () => { calls.push('queue'); return {}; },
      runLogo: async () => assert.fail('no logo after unconfirmed parent maintenance') });
    assert.deepEqual(calls, state === 'interrupted' ? ['queue'] : []);
  }
  const result = await runScheduledRetention({ projectId: 'shoutout-dev-46c81' }, { logoEnabled: false, moderationQueueEnabled: false,
    runRetention: async () => ({ state: 'checked' }), runLogo: async () => assert.fail('disabled') });
  assert.equal(result.logo, undefined);
});
test('logo errors preserve earlier successful phases and log only aggregate progress', async () => {
  const result = await runScheduledRetention({ projectId: 'shoutout-dev-46c81' }, { logoEnabled: true, moderationQueueEnabled: false,
    runRetention: async () => ({ state: 'checked', phases: { receipts: { state: 'complete' } } }),
    runLogo: async () => { throw Object.assign(Error('private path'), { code: 'failed-precondition' }); } });
  assert.equal(result.state, 'interrupted'); assert.equal(result.phases.receipts.state, 'complete');
  assert.equal(result.logo.needsReview, true);
  const summary = retentionLogSummary({ ...result, logo: { ...result.logo, cursor: 'private', userId: 'private' } });
  assert.equal(JSON.stringify(summary).includes('private'), false);
});
