import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { assertReportEvidenceRetention, moderationEvidenceRetentionEnabled, prepareSanctionCopyScrub } from './moderation_retention.js';
import { accountPurgeStages } from './account_purge_policy.js';

test('retention preparation defaults off and only appends stages for existing purge checkpoints', () => {
  assert.equal(moderationEvidenceRetentionEnabled, true);
  const previous = accountPurgeStages('fixture'), next = accountPurgeStages('fixture', { moderationCopiesEnabled: true });
  assert.deepEqual(next.slice(0, previous.length), previous);
  assert.deepEqual(next.slice(previous.length).map(s => [s.collection, s.field, s.action]),
    [['bans', 'moderatorId', 'scrub'], ['contentRestrictions', 'moderatorId', 'scrub']]);
  assert.throws(() => accountPurgeStages('fixture', { moderationCopiesEnabled: 1 }), /invalid-moderation-copy-option/);
});
test('empty or oversized reporter sets never perform an unbounded read', async () => {
  let reads = 0; const tx = { getAll() { reads++; throw new Error('must-not-read'); } };
  await assertReportEvidenceRetention(tx, null, { docs: [] }, Timestamp.now());
  await assert.rejects(assertReportEvidenceRetention(tx, null, { docs: Array.from({ length: 51 }, (_, n) => ({ get: () => `reporter-${n}` })) }, Timestamp.now()), /invalid-report-retention-input/);
  assert.equal(reads, 0);
});
test('ambiguous sanction identity is rejected before querying copies', async () => {
  await assert.rejects(prepareSanctionCopyScrub(null, null, { exists: true, data: () => ({ userId: 'foreign/path', type: 'warning' }) }), /invalid-sanction-copy-source/);
});
