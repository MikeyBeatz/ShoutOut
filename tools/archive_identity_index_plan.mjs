// Pure proposal only; no SDK, credentials, network or apply entry point.
import { createHash } from 'node:crypto';
import { canonical } from '../functions/feed_block_index.js';
import { planLifecycleIndexes } from './content_lifecycle_index_plan.mjs';

export const archiveIdentityCompositeIndexes = Object.freeze([
  { collection: 'contentLifecycleArchive', queryScope: 'COLLECTION', fields: [{ fieldPath: 'authorAccountKey', order: 'ASCENDING' }, { fieldPath: 'kind', order: 'ASCENDING' }] },
  { collection: 'contentLifecycleArchive', queryScope: 'COLLECTION', fields: [{ fieldPath: 'threadId', order: 'ASCENDING' }, { fieldPath: 'kind', order: 'ASCENDING' }] },
]);
export function planArchiveIdentityIndexes(projectId, snapshots) {
  const core = planLifecycleIndexes(projectId, snapshots, { maps: [], composites: archiveIdentityCompositeIndexes });
  const name = `projects/${projectId}/databases/(default)/collectionGroups/accessAudits/fields/subjectUserIds`;
  const row = snapshots?.['accessAudits/fields/subjectUserIds'];
  if (row?.status !== 200 || row.data?.name !== name || !Array.isArray(row.data.indexConfig?.indexes)) throw new Error('archive-identity-audit-index-snapshot-required');
  const indexes = row.data.indexConfig.indexes.map(index => {
    if (!['COLLECTION', 'COLLECTION_GROUP'].includes(index.queryScope) || !Array.isArray(index.fields) || index.fields.length !== 1 ||
        index.fields[0].fieldPath !== 'subjectUserIds' ||
        !['ASCENDING', 'DESCENDING'].includes(index.fields[0].order) && index.fields[0].arrayConfig !== 'CONTAINS' ||
        Object.keys(index.fields[0]).some(key => !['fieldPath', 'order', 'arrayConfig'].includes(key))) throw new Error('archive-identity-unknown-audit-index');
    // Field REST inventory also includes read-only name/state metadata. Only
    // the proven writable definition belongs in an indexConfig PATCH.
    return { queryScope: index.queryScope, fields: structuredClone(index.fields) };
  });
  const desired = { queryScope: 'COLLECTION_GROUP', fields: [{ fieldPath: 'subjectUserIds', arrayConfig: 'CONTAINS' }] };
  const present = indexes.some(index => canonical(index) === canonical(desired));
  const pending = [...core.pending];
  if (present && row.data.indexConfig.indexes[indexes.findIndex(index => canonical(index) === canonical(desired))].state !== 'READY') pending.push(name);
  const actions = [...core.actions, ...(present ? [] : [{ method: 'PATCH', resource: name, updateMask: 'indexConfig', before: row.data.indexConfig,
    body: { name, indexConfig: { indexes: [...indexes, desired] } } }])];
  const result = { projectId, readOnlyPlan: true, changesTTL: false, actions, pending, observations: [core, row.data.indexConfig] };
  return { ...result, digest: createHash('sha256').update(canonical(result)).digest('hex') };
}
