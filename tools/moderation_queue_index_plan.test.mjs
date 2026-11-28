import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planModerationQueueIndexes } from './moderation_queue_index_plan.mjs';
test('queue orders share three bounded token indexes; history and TTL are preserved', () => {
  const config = JSON.parse(readFileSync(new URL('../firestore.indexes.json', import.meta.url)));
  const before = JSON.stringify(config), plan = planModerationQueueIndexes(config);
  assert.equal(JSON.stringify(config), before); assert.deepEqual(plan.config.fieldOverrides, config.fieldOverrides);
  assert(plan.added.length <= 4); assert.equal(plan.ttlChanged, false);
  assert.equal(plan.config.indexes.filter(i => i.collectionGroup === 'moderationCases').length, 3);
  assert.equal(planModerationQueueIndexes(plan.config).added.length, 0);
});
