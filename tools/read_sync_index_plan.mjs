// Pure DEV-only planner: accepts a complete four-field inventory, performs no
// network access and never applies index/TTL changes.
import { createHash } from 'node:crypto';

const project = 'shoutout-dev-46c81';
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const equal = (a, b) => canonical(a) === canonical(b);
export const readSyncIndexTargets = Object.freeze([
  { group: 'readBuckets', field: '*', indexes: [] },
  { group: 'readBuckets', field: 'revision', indexes: [{ queryScope: 'COLLECTION', fields: [{ fieldPath: 'revision', order: 'ASCENDING' }] }] },
  { group: 'readBuckets', field: 'day', indexes: [{ queryScope: 'COLLECTION_GROUP', fields: [{ fieldPath: 'day', order: 'ASCENDING' }] }] },
  { group: 'readState', field: '*', indexes: [] },
]);
const spec = row => {
  if (!row || !['COLLECTION', 'COLLECTION_GROUP'].includes(row.queryScope) || !Array.isArray(row.fields) || row.fields.length !== 1) throw new Error('unknown-read-index-spec');
  const field = row.fields[0];
  if (Object.keys(field).some(key => !['fieldPath', 'order', 'arrayConfig'].includes(key)) ||
      typeof field.fieldPath !== 'string' || !(field.order === 'ASCENDING' || field.order === 'DESCENDING' || field.arrayConfig === 'CONTAINS')) throw new Error('unknown-read-index-field');
  return { queryScope: row.queryScope, fields: row.fields };
};

export function planReadSyncIndexes(projectId, snapshots) {
  if (projectId !== project) throw new Error('read-index-plan-dev-only');
  const base = `projects/${project}/databases/(default)/collectionGroups`, actions = [], before = {}, ready = [];
  for (const target of readSyncIndexTargets) {
    const path = `${target.group}/fields/${target.field}`, row = snapshots?.[path];
    if (row?.status !== 200 || row.data?.name !== `${base}/${path}` || !row.data.indexConfig || row.nextPageToken || row.data.nextPageToken) throw new Error('incomplete-read-index-inventory');
    const config = row.data.indexConfig;
    if (config.indexes !== undefined && !Array.isArray(config.indexes)) throw new Error('invalid-read-index-config');
    const indexes = config.indexes ?? [], current = indexes.map(spec);
    const matches = equal(current, target.indexes);
    // An explicit foreign override needs a separate review. Only replace
    // inherited automatic defaults or our exact previously installed shape.
    if (config.usesAncestorConfig !== true && !matches) throw new Error('unreviewed-read-index-override');
    before[path] = structuredClone(row.data);
    if (config.usesAncestorConfig === true || !matches) actions.push({ method: 'PATCH', resource: row.data.name,
      updateMask: 'indexConfig', before: structuredClone(config),
      body: { name: row.data.name, indexConfig: { indexes: structuredClone(target.indexes) } } });
    ready.push(config.usesAncestorConfig !== true && matches && indexes.every(index => index.state === 'READY'));
  }
  const plan = { schemaVersion: 1, projectId, database: '(default)', readOnlyPlan: true,
    before, actions, ready: ready.every(Boolean), changesTTL: false, modifiesCompositeIndexes: false,
    scope: 'exactly four field overrides; explicit unknown overrides require review' };
  return { ...plan, digest: createHash('sha256').update(canonical(plan)).digest('hex') };
}
