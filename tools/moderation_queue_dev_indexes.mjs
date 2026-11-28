import { createHash } from 'node:crypto';
import { canonical } from '../functions/feed_block_index.js';
import { moderationQueueIndexes } from './moderation_queue_index_plan.mjs';
import { moderationQueueProject as project } from './moderation_queue_dev_release.mjs';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups`;
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const spec = value => ({ queryScope: value.queryScope, fields: value.fields });
export async function collectModerationIndexPlan(call) {
  const inventory = [];
  for (const group of new Set(moderationQueueIndexes.map(i => i.collectionGroup))) {
    let pageToken, pages = 0;
    do {
      if (++pages > 100) throw Error('moderation-queue-index-inventory-budget');
      // Firestore Admin currently accepts only the default page size (0).
      const url = new URL(`${base}/${group}/indexes`);
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await call('GET', url.href);
      for (const i of page.indexes ?? []) {
        const prefix = base.slice(base.indexOf('/v1/') + 4);
        if (!i.name.startsWith(prefix + '/')) throw Error('moderation-queue-foreign-index');
        // The live Admin API can return the project's complete index list.
        // Filter by the returned resource name, never assume the URL filtered it.
        if (i.name.startsWith(`${prefix}/${group}/indexes/`)) inventory.push({ collectionGroup: group, ...spec(i), state: i.state });
      }
      pageToken = page.nextPageToken;
      if (inventory.length > 1000) throw Error('moderation-queue-index-inventory-budget');
    } while (pageToken);
  }
  const actions = moderationQueueIndexes.filter(i => !inventory.some(old => old.collectionGroup === i.collectionGroup && canonical(spec(old)) === canonical(spec(i))))
    .map(i => ({ method: 'POST', resource: `${base}/${i.collectionGroup}/indexes`, body: spec(i) }));
  const body = { schemaVersion: 1, projectId: project, changesTTL: false, actions };
  return { ...body, digest: hash(body), ready: moderationQueueIndexes.every(i => inventory.some(old => old.collectionGroup === i.collectionGroup && old.state === 'READY' && canonical(spec(old)) === canonical(spec(i)))) };
}
export function validateModerationIndexPlan(plan) {
  const { digest, ready, ...body } = plan ?? {};
  if (typeof ready !== 'boolean' || digest !== hash(body) || body.schemaVersion !== 1 || body.projectId !== project || body.changesTTL !== false || !Array.isArray(body.actions) || body.actions.length > 4 ||
      new Set(body.actions.map(a => canonical(a))).size !== body.actions.length || body.actions.some(a => !moderationQueueIndexes.some(i => a.method === 'POST' && a.resource === `${base}/${i.collectionGroup}/indexes` && canonical(a.body) === canonical(spec(i))))) throw Error('moderation-queue-invalid-index-plan');
}
export async function applyModerationIndexPlan(plan, call) {
  validateModerationIndexPlan(plan);
  const current = await collectModerationIndexPlan(call);
  if (current.actions.some(a => !plan.actions.some(old => canonical(old) === canonical(a)))) throw Error('moderation-queue-index-plan-drift');
  const operations = [];
  for (const a of current.actions) operations.push((await call(a.method, a.resource, a.body)).name);
  return { submitted: operations.length, operations, changesTTL: false };
}
