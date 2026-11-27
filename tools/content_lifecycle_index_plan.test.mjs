import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ownShoutsQuery } from '../functions/get_own_shouts.js';
import { lifecycleCompositeIndexes, lifecycleIndexMaps, planLifecycleIndexes } from './content_lifecycle_index_plan.mjs';

const project = 'shoutout-dev-46c81', base = `projects/${project}/databases/(default)/collectionGroups`;

test('real own-history SDK queries and cursors are covered by the planner and declarative index', async () => {
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { Firestore, Timestamp } = require('firebase-admin/firestore');
  const db = new Firestore({ projectId: 'shoutout-rules-test' });
  const configured = JSON.parse(readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8')).indexes;
  try {
    for (const section of ['active', 'expired']) for (const continuation of [false, true]) {
      const stamp = [1795800000, 0], after = continuation ? { id: 'cursor-shout', createdAt: stamp, expiresAt: stamp } : null;
      // Serialize the actual production query without executing it or opening a network connection.
      const query = ownShoutsQuery(db, 'actor', section, new Timestamp(...stamp), after, { contentLifecycleEnabled: true }).toStructuredQuery();
      const filters = query.where.compositeFilter.filters.map(f => f.fieldFilter);
      const equality = filters.filter(f => ['EQUAL', 'IN'].includes(f.op)).map(f => ({ fieldPath: f.field.fieldPath, order: 'ASCENDING' }));
      const order = query.orderBy.map(o => ({ fieldPath: o.field.fieldPath, order: o.direction }));
      const required = [...equality, ...order];
      assert.equal(query.from[0].collectionId, 'shouts'); assert.equal(query.limit.value, 50);
      assert.equal(Boolean(query.startAt), continuation);
      assert.deepEqual(filters.filter(f => !['EQUAL', 'IN'].includes(f.op)).map(f => f.field.fieldPath).filter((f, i, all) => all.indexOf(f) === i), ['createdAt', 'publicUntil']);
      const effective = fields => fields.some(f => f.fieldPath === '__name__') ? fields : [...fields, { fieldPath: '__name__', order: fields.at(-1).order }];
      const matches = fields => JSON.stringify(effective(fields)) === JSON.stringify(required);
      const planned = lifecycleCompositeIndexes.filter(i => i.collection === 'shouts' && i.queryScope === 'COLLECTION' && matches(i.fields));
      const declared = configured.filter(i => i.collectionGroup === 'shouts' && i.queryScope === 'COLLECTION' && matches(i.fields));
      assert.equal(planned.length, 1, `Planner does not cover ${section}/${continuation}`);
      assert.equal(declared.length, 1, `Configuration does not cover ${section}/${continuation}`);
      assert(!matches(planned[0].fields.filter(f => f.fieldPath !== 'publicUntil')), 'Missing history range must not pass');
      assert(!matches([...planned[0].fields, { fieldPath: '__name__', order: 'ASCENDING' }]), 'Wrong cursor tie-break must not pass');
      assert(!matches(planned[0].fields.map(f => f.fieldPath === 'publicUntil' ? { ...f, fieldPath: 'expiresAt' } : f)), 'Legacy expiry index must not pass');
    }
  } finally { await db.terminate(); }
});

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
test('selective lifecycle plan disables only unqueried maps and adds the four declared query patterns without TTL changes', () => {
  const rows = snapshots(), original = structuredClone(rows), plan = planLifecycleIndexes(project, rows);
  assert.deepEqual(rows, original); assert.equal(plan.actions.length, lifecycleIndexMaps.length + 4);
  assert.equal(plan.actions.filter(a => a.method === 'POST').length, 4);
  for (const a of plan.actions.filter(a => a.method === 'PATCH')) {
    assert.equal(a.updateMask, 'indexConfig'); assert.deepEqual(a.body.indexConfig.indexes, []); assert.equal(a.body.ttlConfig, undefined);
  }
  assert.equal(plan.changesTTL, false); assert.equal(plan.deletesIndexes, false); assert.equal(plan.readOnlyPlan, true);
  assert.equal(plan.digest, planLifecycleIndexes(project, structuredClone(rows)).digest);
});
test('ready indexes and protobuf empty map exemptions produce no new actions and preserve unrelated indexes', () => {
  const rows = snapshots();
  for (const [c, f] of lifecycleIndexMaps) rows[`${c}/fields/${f}`].data.indexConfig = {};
  for (const [i, { collection, ...spec }] of lifecycleCompositeIndexes.entries()) {
    rows[`${collection}/indexes`].data.indexes.push(
      { name: `${base}/${collection}/indexes/ready-${i}`, ...spec, state: 'READY', fields: [...spec.fields, { fieldPath: '__name__', order: spec.fields.at(-1).order }] },
      { name: `${base}/${collection}/indexes/other-${i}`, queryScope: 'COLLECTION', fields: [{ fieldPath: 'unrelated', order: 'DESCENDING' }], state: 'READY' },
    );
  }
  assert.deepEqual(planLifecycleIndexes(project, rows).actions, []);
});
test('an in-progress matching index is reported as pending instead of created again', () => {
  const rows = snapshots(), { collection, ...spec } = lifecycleCompositeIndexes[0];
  rows[`${collection}/indexes`].data.indexes.push({ name: `${base}/${collection}/indexes/pending`, ...spec, state: 'CREATING' });
  const plan = planLifecycleIndexes(project, rows); assert.equal(plan.pending.length, 1); assert.equal(plan.actions.filter(a => a.method === 'POST').length, 3);
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
  assert.equal(planLifecycleIndexes(project, rows).actions.filter(a => a.method === 'POST').length, 4);
});
