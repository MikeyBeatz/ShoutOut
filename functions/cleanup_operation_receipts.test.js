import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { cleanupExpiredOperationReceipts, receiptMayBePurged } from './cleanup_operation_receipts.js';
import { operationRetryWindowMillis as week } from './operation_retention.js';

const created = Timestamp.fromDate(new Date('2026-10-25T12:00:00Z'));
const now = Timestamp.fromMillis(created.toMillis() + week);
const legacy = { userId: 'actor', action: 'createShout', createdAt: created };

test('only supported, expired operation receipts qualify for cleanup', () => {
  assert.equal(receiptMayBePurged(legacy, now), true);
  assert.equal(receiptMayBePurged({ ...legacy, keyVersion: 1, expiresAt: now }, now), true);
  assert.equal(receiptMayBePurged(legacy, Timestamp.fromMillis(now.toMillis() - 1)), false);
  for (const bad of [null, {}, { ...legacy, action: 'futureUnknownOperation' },
    { ...legacy, userId: null }, { ...legacy, createdAt: 'old' }, { ...legacy, keyVersion: 2 },
    { ...legacy, keyVersion: 1 }, { ...legacy, keyVersion: 1, expiresAt: 'old' },
    { ...legacy, expiresAt: Timestamp.fromMillis(now.toMillis() + 1) }]) {
    assert.equal(receiptMayBePurged(bad, now), false);
  }
});

test('cleanup rejects unbounded work before accessing Firestore', async () => {
  for (const options of [{ pageSize: 0 }, { pageSize: 51 }, { maximum: 0 }, { maximum: 501 }, { maximum: 1.5 }]) {
    await assert.rejects(cleanupExpiredOperationReceipts({}, options), TypeError);
  }
});

test('cleanup rejects malformed or future scan checkpoints before reading receipts', async () => {
  for (const cursor of [{}, { createdAt: now, id: 'actor' },
    { createdAt: created, id: '../other' }, { createdAt: created, id: '' }]) {
    await assert.rejects(cleanupExpiredOperationReceipts({}, {
      clock: () => now.toDate(), cursor,
    }), TypeError);
  }
});
