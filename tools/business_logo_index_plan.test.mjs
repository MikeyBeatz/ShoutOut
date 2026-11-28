import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBusinessLogoIndex } from './business_logo_index_plan.mjs';
const project = 'shoutout-dev-46c81', name = `projects/${project}/databases/(default)/collectionGroups/logoState/fields/cleanupAt`;
test('selective logo collection-group plan preserves all TTL metadata and requires an exact complete inventory', () => {
  const row = { status: 200, data: { name, ttlConfig: { state: 'ACTIVE' }, indexConfig: { usesAncestorConfig: true } } };
  const before = JSON.stringify(row), plan = planBusinessLogoIndex(project, row);
  assert.equal(plan.actions.length, 1); assert.equal(plan.actions[0].updateMask, 'indexConfig');
  assert.equal(plan.actions[0].body.ttlConfig, undefined); assert.equal(plan.changesTTL, false);
  plan.actions[0].body.indexConfig.indexes[0].fields[0].order = 'DESCENDING';
  assert.equal(planBusinessLogoIndex(project, row).actions[0].body.indexConfig.indexes[0].fields[0].order, 'ASCENDING');
  plan.actions[0].body.indexConfig.indexes[0].fields[0].order = 'ASCENDING';
  assert.equal(JSON.stringify(row), before); assert.equal(plan.digest, planBusinessLogoIndex(project, row).digest);
  const ready = { status: 200, data: { name, indexConfig: { indexes: plan.actions[0].body.indexConfig.indexes.map(i => ({ ...i, state: 'READY' })) } } };
  ready.data.indexConfig.indexes.reverse();
  assert.equal(planBusinessLogoIndex(project, ready).ready, true); assert.equal(planBusinessLogoIndex(project, ready).actions.length, 0);
  for (const bad of [null, { ...row, status: 404 }, { ...row, nextPageToken: 'more' },
    { status: 200, data: { name, indexConfig: { indexes: [] } } }]) assert.throws(() => planBusinessLogoIndex(project, bad));
  assert.throws(() => planBusinessLogoIndex('production', row));
});
