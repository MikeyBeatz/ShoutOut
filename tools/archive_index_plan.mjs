// Pure planning only: never performs network requests or changes index/TTL state.
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const project = 'shoutout-dev-46c81';
const base = `projects/${project}/databases/(default)/collectionGroups`;
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const same = (a, b) => canonical(a) === canonical(b);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const spec = index => {
  if (!Array.isArray(index.fields) || !['COLLECTION', 'COLLECTION_GROUP'].includes(index.queryScope)) throw new Error('unknown-index-spec');
  for (const field of index.fields) {
    if (Object.keys(field).some(k => !['fieldPath', 'order', 'arrayConfig'].includes(k))) throw new Error('unknown-index-field');
  }
  return { queryScope: index.queryScope, fields: index.fields };
};
function fieldSnapshot(snapshots, path) {
  const row = snapshots[path];
  if (row?.status !== 200 || row.data?.name !== `${base}/${path}` || !Array.isArray(row.data.indexConfig?.indexes)) {
    throw new Error('invalid-index-snapshot');
  }
  return row.data;
}

export function planArchiveIndexes(projectId, snapshots) {
  assert.equal(projectId, project, 'archive indexes are DEV-only');
  const actions = [];
  for (const field of ['authorId', 'recipientId']) {
    const path = `privateReplies/fields/${field}`, before = fieldSnapshot(snapshots, path);
    const indexes = before.indexConfig.indexes.map(spec);
    const desired = { queryScope: 'COLLECTION_GROUP', fields: [{ fieldPath: field, order: 'ASCENDING' }] };
    if (!indexes.some(row => same(row, desired))) {
      actions.push({ method: 'PATCH', resource: before.name, updateMask: 'indexConfig', before: before.indexConfig,
        body: { name: before.name, indexConfig: { indexes: [...indexes, desired] } } });
    }
  }
  const content = fieldSnapshot(snapshots, 'accountContentArchive/fields/content');
  if (content.indexConfig.indexes.length) {
    if (content.indexConfig.usesAncestorConfig !== true) throw new Error('archive-content-override-needs-review');
    actions.push({ method: 'PATCH', resource: content.name, updateMask: 'indexConfig', before: content.indexConfig,
      body: { name: content.name, indexConfig: { indexes: [] } } });
  }
  const comments = fieldSnapshot(snapshots, 'comments/fields/authorId');
  if (!comments.indexConfig.indexes.some(row => row.queryScope === 'COLLECTION_GROUP' && row.state === 'READY' &&
      row.fields?.some(f => f.fieldPath === 'authorId' && f.order === 'ASCENDING'))) throw new Error('comments-author-index-not-ready');
  const compositeRows = snapshots['accountContentArchive/indexes'];
  if (compositeRows?.status !== 200 || compositeRows.data?.nextPageToken) throw new Error('incomplete-composite-index-inventory');
  const composite = { queryScope: 'COLLECTION', fields: [{ fieldPath: 'sourcePath', order: 'ASCENDING' },
    { fieldPath: 'sourceCreateTime', order: 'DESCENDING' }] };
  const existing = (compositeRows.data.indexes ?? []).filter(row => row.name?.startsWith(`${base}/accountContentArchive/indexes/`));
  if (!existing.some(row => same({ ...spec(row), fields: row.fields.filter(f => f.fieldPath !== '__name__') }, composite))) {
    actions.push({ method: 'POST', resource: `${base}/accountContentArchive/indexes`, body: composite });
  }
  const plan = { schemaVersion: 1, projectId, database: '(default)', readOnlyPlan: true,
    commentsAuthorIndexReady: true, actions,
    preservesCollectionIndexes: true, changesTTL: false, deletesIndexes: false };
  return { ...plan, digest: digest(plan) };
}
