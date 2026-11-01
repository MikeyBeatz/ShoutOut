import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planArchiveIndexes as plan } from './archive_index_plan.mjs';
const project = 'shoutout-dev-46c81', base = `projects/${project}/databases/(default)/collectionGroups`;
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
});
