import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleCompositeIndexes, lifecycleIndexMaps, planLifecycleIndexes } from './content_lifecycle_index_plan.mjs';

const project = 'shoutout-dev-46c81', base = `projects/${project}/databases/(default)/collectionGroups`;
function snapshots() {
  const rows = {};
  for (const [collection, field] of lifecycleIndexMaps) {
    const path = `${collection}/fields/${field}`;
    rows[path] = { status: 200, data: { name: `${base}/${path}`, ttlConfig: { state: 'ACTIVE' },
      indexConfig: { usesAncestorConfig: true, indexes: [{ queryScope: 'COLLECTION', fields: [{ fieldPath: field, order: 'ASCENDING' }] }] } } };
  }
  for (const { collection } of lifecycleCompositeIndexes) rows[`${collection}/indexes`] = { status: 200, data: { indexes: [] } };
  return rows;
}
test('selective lifecycle plan disables only unqueried maps and adds the three declared query patterns without TTL changes', () => {
  const rows = snapshots(), original = structuredClone(rows), plan = planLifecycleIndexes(project, rows);
  assert.deepEqual(rows, original); assert.equal(plan.actions.length, lifecycleIndexMaps.length + 3);
  assert.equal(plan.actions.filter(a => a.method === 'POST').length, 3);
  for (const a of plan.actions.filter(a => a.method === 'PATCH')) {
    assert.equal(a.updateMask, 'indexConfig'); assert.deepEqual(a.body.indexConfig.indexes, []); assert.equal(a.body.ttlConfig, undefined);
  }
  assert.equal(plan.changesTTL, false); assert.equal(plan.deletesIndexes, false); assert.equal(plan.readOnlyPlan, true);
  assert.equal(plan.digest, planLifecycleIndexes(project, structuredClone(rows)).digest);
});
test('ready indexes and protobuf empty map exemptions produce no new actions and preserve unrelated indexes', () => {
  const rows = snapshots();
  for (const [c, f] of lifecycleIndexMaps) rows[`${c}/fields/${f}`].data.indexConfig = {};
  for (const { collection, ...spec } of lifecycleCompositeIndexes) {
    rows[`${collection}/indexes`].data.indexes = [
      { name: `${base}/${collection}/indexes/ready`, ...spec, state: 'READY', fields: [...spec.fields, { fieldPath: '__name__', order: spec.fields.at(-1).order }] },
      { name: `${base}/${collection}/indexes/other`, queryScope: 'COLLECTION', fields: [{ fieldPath: 'unrelated', order: 'DESCENDING' }], state: 'READY' },
    ];
  }
  assert.deepEqual(planLifecycleIndexes(project, rows).actions, []);
});
test('an in-progress matching index is reported as pending instead of created again', () => {
  const rows = snapshots(), { collection, ...spec } = lifecycleCompositeIndexes[0];
  rows[`${collection}/indexes`].data.indexes.push({ name: `${base}/${collection}/indexes/pending`, ...spec, state: 'CREATING' });
  const plan = planLifecycleIndexes(project, rows); assert.equal(plan.pending.length, 1); assert.equal(plan.actions.filter(a => a.method === 'POST').length, 2);
});
test('incomplete inventories, mixed projects and explicit nonempty field overrides require review', () => {
  for (const mutate of [
    rows => { delete rows['comments/indexes']; },
    rows => { rows['comments/indexes'].data.nextPageToken = 'more'; },
    rows => { rows['comments/indexes'].data = undefined; },
    rows => { rows['comments/indexes'].data.indexes.push({ name: 'projects/other/databases/(default)/collectionGroups/comments/indexes/x' }); },
    rows => { rows['contentLifecycleArchive/fields/content'].data.indexConfig.usesAncestorConfig = false; },
  ]) { const rows = snapshots(); mutate(rows); assert.throws(() => planLifecycleIndexes(project, rows)); }
  assert.throws(() => planLifecycleIndexes('shoutout-production-a1b34', snapshots()), /explicit-dev/);
});
test('a matching index needing repair is not deleted or silently treated as ready', () => {
  const rows = snapshots(), { collection, ...spec } = lifecycleCompositeIndexes[0];
  rows[`${collection}/indexes`].data.indexes.push({ name: `${base}/${collection}/indexes/broken`, ...spec, state: 'NEEDS_REPAIR' });
  assert.throws(() => planLifecycleIndexes(project, rows), /state-needs-review/);
});
test('an incompatible document-name tie-break index does not replace the required ordering', () => {
  const rows = snapshots(), { collection, ...spec } = lifecycleCompositeIndexes[0];
  rows[`${collection}/indexes`].data.indexes.push({ name: `${base}/${collection}/indexes/other-name-order`, ...spec,
    fields: [...spec.fields, { fieldPath: '__name__', order: 'ASCENDING' }], state: 'READY' });
  assert.equal(planLifecycleIndexes(project, rows).actions.filter(a => a.method === 'POST').length, 3);
});
