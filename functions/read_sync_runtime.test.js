import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { consumeReadSyncCredit, deriveReadSyncCursorKey } from './read_sync_runtime.js';
import { readSyncCallableOptions } from './read_sync_host.js';

test('40 credits, fractional refill, backward clock and denied attempts preserve the bucket', () => {
  let data;
  for (let i = 0; i < 40; i++) { const result = consumeReadSyncCredit(data, 10000); assert(result.allowed); data = result.record; }
  assert.deepEqual(consumeReadSyncCredit(data, 10000), { allowed: false, retryAfterMs: 1000 });
  assert.deepEqual(consumeReadSyncCredit(data, 10250), { allowed: false, retryAfterMs: 750 });
  assert.deepEqual(consumeReadSyncCredit(data, 9000), { allowed: false, retryAfterMs: 2000 });
  const next = consumeReadSyncCredit(data, 11000); assert(next.allowed); assert.equal(next.record.creditMillis, 0);
  assert.equal(consumeReadSyncCredit(data, 100000).record.creditMillis, 39000);
  assert.equal(data.updatedAt.toMillis(), 10000);
});

test('rate records and clocks fail closed rather than minting fresh credits', () => {
  const valid = consumeReadSyncCredit(undefined, 1000).record;
  for (const data of [null, {}, { ...valid, v: 2 }, { ...valid, creditMillis: -1 }, { ...valid, creditMillis: 40001 },
    { ...valid, extra: true }, { ...valid, updatedAt: new Date() }, { ...valid, creditMillis: 1.5 }]) {
    assert.throws(() => consumeReadSyncCredit(data, 1000), /invalid-read-sync-rate-record/);
  }
  for (const now of [-1, NaN, 0.1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => consumeReadSyncCredit(valid, now));
  assert.equal(consumeReadSyncCredit({ ...valid, updatedAt: Timestamp.fromMillis(0) }, 1000).record.creditMillis, 39000);
});

test('read cursor key has a separate purpose and host always enforces App Check', () => {
  const projectKey = new Uint8Array(32).fill(6), derived = deriveReadSyncCursorKey(projectKey);
  assert.equal(derived.length, 32); assert.notDeepEqual(derived, projectKey);
  assert.deepEqual(deriveReadSyncCursorKey(projectKey), derived);
  assert.notDeepEqual(deriveReadSyncCursorKey(new Uint8Array(32).fill(7)), derived);
  assert.throws(() => deriveReadSyncCursorKey(new Uint8Array(31)));
  assert.equal(readSyncCallableOptions.enforceAppCheck, true);
  assert.equal(readSyncCallableOptions.region, 'europe-west3');
  assert.equal(readSyncCallableOptions.minInstances, 0);
});
