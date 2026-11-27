// Pure snapshot planner. Never contacts Firestore, changes TTL, or applies a
// live index action. Existing unrelated/explicit index choices are preserved.
import { createHash } from 'node:crypto';
import { canonical } from '../functions/feed_block_index.js';

export const lifecycleIndexMaps = Object.freeze([
  ['contentLifecycleArchive', 'content'], ['contentLifecycleArchive', 'state'], ['contentLifecycleThreads', 'geography'],
  ['accountContentArchive', 'lifecycleAccountBinding'],
  ...['reports', 'commentReports', 'privateReplyReports'].flatMap(c => [[c, 'legacyEvidenceBinding'], [c, 'reportCompatibilityBinding']]),
  ...['commentReports', 'privateReplyReports'].map(c => [c, 'accountEvidenceBinding']),
]);
export const lifecycleCompositeIndexes = Object.freeze([
  { collection: 'comments', queryScope: 'COLLECTION_GROUP', fields: [{ fieldPath: 'authorId', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' }] },
  { collection: 'shouts', queryScope: 'COLLECTION', fields: [{ fieldPath: 'authorId', order: 'ASCENDING' }, { fieldPath: 'status', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' }] },
  { collection: 'contentLifecycleThreads', queryScope: 'COLLECTION', fields: [{ fieldPath: 'maintenanceState', order: 'ASCENDING' }, { fieldPath: 'nextMaintenanceAt', order: 'ASCENDING' }] },
]);
const same = (a, b) => canonical(a) === canonical(b);
const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
export function planLifecycleIndexes(projectId, snapshots, { maps = lifecycleIndexMaps, composites = lifecycleCompositeIndexes } = {}) {
  if (projectId !== 'shoutout-dev-46c81') throw new Error('lifecycle-indexes-explicit-dev-required');
  const base = `projects/${projectId}/databases/(default)/collectionGroups`, actions = [], pending = [], observations = [];
  for (const [collection, field] of maps) {
    const path = `${collection}/fields/${field}`, row = snapshots?.[path], name = `${base}/${path}`, data = row?.data;
    if (row?.status !== 200 || data?.name !== name || !data.indexConfig ||
        data.indexConfig.indexes !== undefined && !Array.isArray(data.indexConfig.indexes) ||
        data.indexConfig.indexes === undefined && data.indexConfig.usesAncestorConfig === true) throw new Error('lifecycle-index-field-snapshot-required');
    observations.push({ path, indexConfig: data.indexConfig });
    if (data.indexConfig.indexes?.length) {
      if (data.indexConfig.usesAncestorConfig !== true) throw new Error('lifecycle-explicit-index-override-needs-review');
      actions.push({ method: 'PATCH', resource: name, updateMask: 'indexConfig', before: data.indexConfig,
        body: { name, indexConfig: { indexes: [] } } });
    }
  }
  for (const desired of composites) {
    const { collection, ...spec } = desired, path = `${collection}/indexes`, row = snapshots?.[path];
    if (row?.status !== 200 || !row.data || typeof row.data !== 'object' || row.data?.nextPageToken || !Array.isArray(row.data?.indexes ?? [])) throw new Error('lifecycle-composite-inventory-required');
    if ((row.data.indexes ?? []).some(v => !v.name?.startsWith(`${base}/${collection}/indexes/`))) throw new Error('lifecycle-composite-project-mismatch');
    const found = (row.data.indexes ?? []).filter(v => v.name?.startsWith(`${base}/${collection}/indexes/`) &&
      same({ queryScope: v.queryScope, fields: v.fields?.filter(f => f.fieldPath !== '__name__') }, spec) &&
      v.fields.filter(f => f.fieldPath === '__name__').every(f => f.order === spec.fields.at(-1).order));
    if (found.length > 1 || found.some(v => !['READY', 'CREATING'].includes(v.state))) throw new Error('lifecycle-index-state-needs-review');
    observations.push({ path, matches: found });
    if (!found.length) actions.push({ method: 'POST', resource: `${base}/${path}`, body: spec });
    else if (found[0].state === 'CREATING') pending.push(found[0].name);
  }
  const plan = { v: 1, kind: 'content-lifecycle-indexes', projectId, database: '(default)', observations, actions, pending,
    readOnlyPlan: true, changesTTL: false, deletesIndexes: false, preservesUnrelatedIndexes: true };
  return { ...plan, digest: hash(plan) };
}
