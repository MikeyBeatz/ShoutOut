// Pure selective plan. Never contacts Firebase and never updates TTL.
import { createHash } from 'node:crypto';
const canonical = value => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const expected = [
  { queryScope: 'COLLECTION', fields: [{ fieldPath: 'cleanupAt', order: 'ASCENDING' }] },
  { queryScope: 'COLLECTION', fields: [{ fieldPath: 'cleanupAt', order: 'DESCENDING' }] },
  { queryScope: 'COLLECTION_GROUP', fields: [{ fieldPath: 'cleanupAt', order: 'ASCENDING' }] },
];
export function planBusinessLogoIndex(projectId, snapshot) {
  if (projectId !== 'shoutout-dev-46c81') throw Error('logo-index-dev-only');
  const name = `projects/${projectId}/databases/(default)/collectionGroups/logoState/fields/cleanupAt`;
  if (snapshot?.status !== 200 || snapshot.data?.name !== name || !snapshot.data.indexConfig ||
      snapshot.nextPageToken || snapshot.data.nextPageToken) throw Error('logo-index-inventory-required');
  const config = snapshot.data.indexConfig, indexes = config.indexes ?? [];
  if (!Array.isArray(indexes)) throw Error('logo-index-shape');
  const shape = indexes.map(({ queryScope, fields }) => ({ queryScope, fields }));
  const same = canonical(shape.map(canonical).sort()) === canonical(expected.map(canonical).sort());
  if (config.usesAncestorConfig !== true && !same) throw Error('logo-index-foreign-override');
  const plan = { schemaVersion: 1, projectId, database: '(default)', changesTTL: false,
    before: structuredClone(snapshot.data),
    actions: same && config.usesAncestorConfig !== true ? [] : [{
      method: 'PATCH', resource: name, updateMask: 'indexConfig',
      body: { name, indexConfig: { indexes: structuredClone(expected) } },
    }],
    ready: same && config.usesAncestorConfig !== true && indexes.every(i => i.state === 'READY'),
  };
  return { ...plan, digest: createHash('sha256').update(canonical(plan)).digest('hex') };
}
