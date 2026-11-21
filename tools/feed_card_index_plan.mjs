// Pure selective planner. No credentials, network calls or live index mutations.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const proposal = JSON.parse(readFileSync(new URL('../docs/plans/feed/B4_CLIENT_INDEX_PLAN.json', import.meta.url)));
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const same = (a, b) => canonical(a) === canonical(b);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const spec = index => ({ queryScope: index.queryScope, fields: index.fields.filter(field => field.fieldPath !== '__name__') });
const targetIndex = proposal.indexes[0];
const fieldPath = (base, row) => `${base}/${row.collectionGroup}/fields/${row.fieldPath}`;
export function planCardIndexes(projectId, inventory) {
  if (!['shoutout-dev-46c81', 'shoutout-production-a1b34'].includes(projectId)) throw new Error('card-index-project-required');
  const base = `projects/${projectId}/databases/(default)/collectionGroups`;
  if (!inventory || inventory.complete !== true || inventory.nextPageToken || !Array.isArray(inventory.indexes)) throw new Error('card-index-complete-inventory-required');
  const composite = inventory.indexes.filter(row => row.name?.startsWith(`${base}/publicStates/indexes/`) && same(spec(row), spec(targetIndex)));
  if (composite.length > 1 || composite.some(row => !['READY', 'CREATING'].includes(row.state))) throw new Error('card-index-composite-conflict');
  const actions = [{ kind: 'composite', resource: `${base}/publicStates/indexes`, before: composite[0] ?? null,
    desired: spec(targetIndex), method: 'POST' }];
  for (const field of proposal.fieldOverrides) {
    const path = fieldPath(base, field), row = inventory.fields?.[path];
    if (!row || row.name !== path || !row.indexConfig || row.nextPageToken || !Array.isArray(row.indexConfig.indexes ?? [])) throw new Error('card-index-field-inventory-required');
    if (row.indexConfig.usesAncestorConfig !== true && (row.indexConfig.indexes ?? []).length) throw new Error('card-index-unreviewed-explicit-override');
    actions.push({ kind: 'field', resource: path, method: 'PATCH', updateMask: 'indexConfig', before: structuredClone(row),
      desired: { name: path, indexConfig: { indexes: [] } } });
  }
  const data = { v: 1, projectId, database: '(default)', changesTTL: false, actions,
    // Unrelated inventory is retained as evidence, never submitted to an API.
    inventoryDigest: digest(inventory) };
  return { ...data, digest: digest(data) };
}
export function inspectCardIndexProgress(plan, inventory, approvedDigest) {
  const { digest: saved, ...data } = plan ?? {};
  if (saved !== approvedDigest || digest(data) !== saved) throw new Error('card-index-approved-digest-required');
  if (inventory?.complete !== true || inventory.nextPageToken || !Array.isArray(inventory.indexes)) throw new Error('card-index-complete-inventory-required');
  const result = plan.actions.map(action => {
    if (action.kind === 'composite') {
      const rows = inventory.indexes.filter(row => row.name?.startsWith(action.resource + '/') && same(spec(row), action.desired));
      if (!rows.length) {
        if (action.before) throw new Error('card-index-composite-drift');
        return { resource: action.resource, state: 'planned', request: { method: 'POST', body: action.desired } };
      }
      if (rows.length !== 1 || !['READY', 'CREATING'].includes(rows[0].state)) throw new Error('card-index-composite-drift');
      return { resource: action.resource, state: rows[0].state === 'READY' ? 'ready' : 'pending' };
    }
    const row = inventory.fields?.[action.resource];
    if (!row || row.name !== action.resource) throw new Error('card-index-field-drift');
    // Never overwrite a TTL update or a changed inherited/explicit configuration.
    const before = { ...action.before }, current = { ...row }; delete before.indexConfig; delete current.indexConfig;
    if (!same(before, current)) throw new Error('card-index-nonindex-field-drift');
    if (row.indexConfig.usesAncestorConfig !== true && !(row.indexConfig.indexes ?? []).length) return { resource: action.resource, state: 'ready' };
    if (!same(row, action.before)) throw new Error('card-index-field-drift');
    return { resource: action.resource, state: 'planned', request: { method: 'PATCH', updateMask: 'indexConfig', body: action.desired } };
  });
  return { digest: saved, complete: result.every(row => row.state === 'ready'), actions: result };
}
