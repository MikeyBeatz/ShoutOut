import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReadSyncIndexes, readSyncIndexTargets } from './read_sync_index_plan.mjs';
const project = 'shoutout-dev-46c81', base = `projects/${project}/databases/(default)/collectionGroups`;
const inherited = () => Object.fromEntries(readSyncIndexTargets.map(({ group, field }) => {
  const path = `${group}/fields/${field}`;
  return [path, { status: 200, data: { name: `${base}/${path}`, ttlConfig: { state: 'DISABLED' },
    indexConfig: { usesAncestorConfig: true, indexes: [{ queryScope: 'COLLECTION', fields: [{ fieldPath: field, order: 'ASCENDING' }], state: 'READY' }] } } }];
}));
test('four-field B2 plan is exact, digest-stable and never writes TTL/composite indexes', () => {
  const inventory = inherited(), original = structuredClone(inventory), plan = planReadSyncIndexes(project, inventory);
  assert.equal(plan.actions.length, 4); assert.equal(plan.ready, false); assert.equal(plan.digest.length, 64);
  assert.deepEqual(inventory, original); assert.equal(planReadSyncIndexes(project, inventory).digest, plan.digest);
  const saved = JSON.stringify(plan);
  for (const action of plan.actions) {
    assert.equal(action.method, 'PATCH'); assert.equal(action.updateMask, 'indexConfig'); assert(!Object.hasOwn(action.body, 'ttlConfig'));
    const key = action.resource.slice(base.length + 1);
    inventory[key].data.indexConfig = { indexes: action.body.indexConfig.indexes.map(row => ({ ...row, state: 'READY' })) };
  }
  const complete = planReadSyncIndexes(project, inventory); assert.equal(complete.actions.length, 0); assert.equal(complete.ready, true);
  assert.equal(JSON.stringify(plan), saved, 'a later inventory must not rewrite the reviewed plan');
  inventory['readBuckets/fields/day'].data.indexConfig.indexes[0].state = 'CREATING';
  assert.equal(planReadSyncIndexes(project, inventory).ready, false);
});
test('B2 planner refuses production, incomplete snapshots and unrelated explicit overrides', () => {
  const inventory = inherited();
  assert.throws(() => planReadSyncIndexes('shoutout-production-a1b34', inventory));
  assert.throws(() => planReadSyncIndexes(project, {}));
  inventory['readState/fields/*'].data.indexConfig.usesAncestorConfig = false;
  assert.throws(() => planReadSyncIndexes(project, inventory), /unreviewed/);
  inventory['readState/fields/*'].data.indexConfig.indexes = [];
  assert.equal(planReadSyncIndexes(project, inventory).actions.length, 3);
  inventory['readBuckets/fields/day'].data.name = 'projects/other/databases/(default)/collectionGroups/readBuckets/fields/day';
  assert.throws(() => planReadSyncIndexes(project, inventory), /incomplete/);
});
