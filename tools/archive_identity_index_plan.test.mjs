import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planArchiveIdentityIndexes } from './archive_identity_index_plan.mjs';

test('identity proposal preserves unrelated single indexes and never writes TTL', () => {
  const project = 'shoutout-dev-46c81', base = `projects/${project}/databases/(default)/collectionGroups`;
  const snapshots = { 'contentLifecycleArchive/indexes': { status: 200, data: { indexes: [] } },
    'accessAudits/fields/subjectUserIds': { status: 200, data: { name: `${base}/accessAudits/fields/subjectUserIds`, ttlConfig: { state: 'ACTIVE' },
      indexConfig: { indexes: [{ queryScope: 'COLLECTION', fields: [{ fieldPath: 'subjectUserIds', arrayConfig: 'CONTAINS' }] }] } } } };
  const result = planArchiveIdentityIndexes(project, snapshots);
  assert.equal(result.actions.length, 3); assert.equal(result.digest.length, 64);
  const patch = result.actions.at(-1);
  assert.deepEqual(patch.body.indexConfig.indexes[0], snapshots['accessAudits/fields/subjectUserIds'].data.indexConfig.indexes[0]);
  assert.equal(patch.updateMask, 'indexConfig'); assert(!JSON.stringify(result.actions).includes('ttl'));
  assert.throws(() => planArchiveIdentityIndexes('shoutout-production-a1b34', snapshots));
  assert.throws(() => planArchiveIdentityIndexes(project, {}));
  snapshots['accessAudits/fields/subjectUserIds'].data.indexConfig.indexes.push({ queryScope: 'COLLECTION_GROUP',
    fields: [{ fieldPath: 'subjectUserIds', arrayConfig: 'CONTAINS' }], state: 'CREATING' });
  assert(planArchiveIdentityIndexes(project, snapshots).pending.includes(`${base}/accessAudits/fields/subjectUserIds`));
  snapshots['accessAudits/fields/subjectUserIds'].data.indexConfig.indexes.at(-1).state = 'READY';
  assert.equal(planArchiveIdentityIndexes(project, snapshots).pending.length, 0);
});
