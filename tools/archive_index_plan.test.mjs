import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planArchiveIndexes as plan, planOwnedActivityIndexes, accountPurgeIndexFields, planAccountPurgeIndexes, planPurgeBucketChange } from './archive_index_plan.mjs';
const project = 'shoutout-dev-46c81', base = `projects/${project}/databases/(default)/collectionGroups`;

test('purge index delta preserves old indexes and TTL and requires a complete bounded inventory', () => {
  const state = {};
  for (const [group, field] of accountPurgeIndexFields) state[`${group}/fields/${field}`] = { status: 200, data: {
    name: `${base}/${group}/fields/${field}`, ttlConfig: { state: 'DISABLED' }, indexConfig: { indexes: [
      { queryScope: 'COLLECTION', fields: [{ fieldPath: field, order: 'DESCENDING' }] },
    ] } } };
  const result = planAccountPurgeIndexes(project, state); assert.equal(result.actions.length, 6);
  for (const action of result.actions) {
    assert.equal(action.updateMask, 'indexConfig'); assert.equal('ttlConfig' in action.body, false);
    const old = state[action.resource.slice(base.length + 1)].data;
    assert.deepEqual(action.body.indexConfig.indexes[0], old.indexConfig.indexes[0]); old.indexConfig = action.body.indexConfig;
  }
  assert.equal(planAccountPurgeIndexes(project, state).actions.length, 0);
  assert.throws(() => planAccountPurgeIndexes('shoutout-production-a1b34', state));
  delete state['blocked/fields/targetUserId']; assert.throws(() => planAccountPurgeIndexes(project, state));
});

test('approved soft-delete plan is DEV-only, CAS-protected and cannot change any other bucket setting', () => {
  const bucket = { name: `${project}.firebasestorage.app`, metageneration: '17', softDeletePolicy: { retentionDurationSeconds: '604800' } };
  const result = planPurgeBucketChange(project, bucket); assert.equal(result.actions.length, 1);
  assert.deepEqual(result.actions[0].body, { softDeletePolicy: { retentionDurationSeconds: '0' } });
  assert.equal(result.actions[0].ifMetagenerationMatch, '17');
  assert.equal(planPurgeBucketChange(project, { ...bucket, softDeletePolicy: { retentionDurationSeconds: '0' } }).actions.length, 0);
  assert.throws(() => planPurgeBucketChange('shoutout-production-a1b34', bucket));
  assert.throws(() => planPurgeBucketChange(project, { ...bucket, versioning: { enabled: true } }));
  assert.throws(() => planPurgeBucketChange(project, { ...bucket, softDeletePolicy: { retentionDurationSeconds: '7776000' } }));
});
test('owned activity indexes preserve every existing index and never include TTL writes', () => {
  const state = {};
  for (const group of ['reactions', 'saves']) {
    const key = `${group}/fields/userId`;
    state[key] = { status: 200, data: { name: `${base}/${key}`, ttlConfig: { state: 'DISABLED' }, indexConfig: { indexes: [
      { queryScope: 'COLLECTION', fields: [{ fieldPath: 'userId', order: 'DESCENDING' }] },
    ] } } };
  }
  const result = planOwnedActivityIndexes(project, state); assert.equal(result.actions.length, 2);
  for (const action of result.actions) {
    assert.equal(action.updateMask, 'indexConfig'); assert.equal('ttlConfig' in action.body, false);
    assert.deepEqual(action.body.indexConfig.indexes[0], state[action.resource.slice(base.length + 1)].data.indexConfig.indexes[0]);
    state[action.resource.slice(base.length + 1)].data.indexConfig = action.body.indexConfig;
  }
  assert.equal(planOwnedActivityIndexes(project, state).actions.length, 0);
  assert.throws(() => planOwnedActivityIndexes('shoutout-production-a1b34', state));
  delete state['saves/fields/userId']; assert.throws(() => planOwnedActivityIndexes(project, state));
});
function snapshots() {
  const result = {};
  for (const [group, field] of [['privateReplies', 'authorId'], ['privateReplies', 'recipientId'], ['accountContentArchive', 'content'], ['comments', 'authorId']]) {
    const path = `${group}/fields/${field}`;
    result[path] = { status: 200, data: { name: `${base}/${path}`, indexConfig: { usesAncestorConfig: group !== 'comments',
      indexes: [{ queryScope: group === 'comments' ? 'COLLECTION_GROUP' : 'COLLECTION', fields: [{ fieldPath: field, order: 'ASCENDING' }], state: 'READY' },
        { queryScope: 'COLLECTION', fields: [{ fieldPath: field, order: 'DESCENDING' }], state: 'READY' }] } } };
  }
  result['accountContentArchive/indexes'] = { status: 200, data: { indexes: [] } };
  return result;
}
test('archive delta preserves existing collection indexes and never touches TTL or deletes an index', () => {
  const state = snapshots(), result = plan(project, state);
  assert.equal(result.actions.length, 4); assert.equal(result.changesTTL, false); assert.equal(result.deletesIndexes, false);
  for (const field of ['authorId', 'recipientId']) {
    const action = result.actions.find(a => a.resource.endsWith(`privateReplies/fields/${field}`));
    assert.deepEqual(action.body.indexConfig.indexes.slice(0, 2), state[`privateReplies/fields/${field}`].data.indexConfig.indexes.map(({ state, ...spec }) => spec));
    assert.equal(action.body.indexConfig.indexes.at(-1).queryScope, 'COLLECTION_GROUP');
    assert.equal(action.updateMask, 'indexConfig'); assert.equal('ttlConfig' in action.body, false);
  }
  assert.match(result.digest, /^[a-f0-9]{64}$/); assert.equal(plan(project, state).digest, result.digest);
});
test('archive delta rejects production, incomplete inventories and existing custom archive body indexes', () => {
  assert.throws(() => plan('shoutout-production-a1b34', snapshots()));
  const missing = snapshots(); delete missing['privateReplies/fields/authorId']; assert.throws(() => plan(project, missing));
  const custom = snapshots(); custom['accountContentArchive/fields/content'].data.indexConfig.usesAncestorConfig = false;
  assert.throws(() => plan(project, custom), /override-needs-review/);
});
test('an already applied delta plans no repeated changes', () => {
  const state = snapshots(), first = plan(project, state);
  for (const action of first.actions) {
    if (action.method === 'PATCH') state[action.resource.slice(base.length + 1)].data.indexConfig = action.body.indexConfig;
    else state['accountContentArchive/indexes'].data.indexes.push({ ...action.body, name: `${base}/accountContentArchive/indexes/new` });
  }
  assert.equal(plan(project, state).actions.length, 0);
  delete state['accountContentArchive/fields/content'].data.indexConfig.indexes;
  assert.equal(plan(project, state).actions.length, 0, 'REST omits an empty repeated indexes field');
  state['accountContentArchive/fields/content'].data.indexConfig.usesAncestorConfig = true;
  assert.throws(() => plan(project, state), /invalid-index-snapshot/);
});
