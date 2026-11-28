// Pure candidate. Does not contact Firestore or mutate the live index config.
import { createHash } from 'node:crypto';
import { canonical } from '../functions/feed_block_index.js';
import { moderationQueueOrders } from '../functions/moderation_queue.js';
export const moderationQueueIndexes = Object.freeze([
  ...Object.values(moderationQueueOrders).map(fields => ({ collectionGroup: 'moderationCases', queryScope: 'COLLECTION', fields: [
    { fieldPath: 'filterTokens', arrayConfig: 'CONTAINS' },
    ...fields.map(([fieldPath, direction]) => ({ fieldPath, order: direction === 'asc' ? 'ASCENDING' : 'DESCENDING' })),
  ] })),
  { collectionGroup: 'sanctions', queryScope: 'COLLECTION', fields: [
    { fieldPath: 'userId', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' }, { fieldPath: '__name__', order: 'DESCENDING' },
  ] },
]);
export function planModerationQueueIndexes(config) {
  if (!config || !Array.isArray(config.indexes) || !Array.isArray(config.fieldOverrides)) throw new Error('moderation-index-config-required');
  const indexes = [...config.indexes], added = [];
  const normalize = v => ({ ...v, fields: v.fields.at(-1)?.fieldPath === '__name__' ? v.fields : [...v.fields,
    { fieldPath: '__name__', order: v.fields.filter(f => f.order).at(-1)?.order ?? 'ASCENDING' }] });
  for (const item of moderationQueueIndexes) if (!indexes.some(i => canonical(normalize(i)) === canonical(item))) { indexes.push(item); added.push(item); }
  const result = { ...config, indexes, fieldOverrides: config.fieldOverrides };
  return { schemaVersion: 1, added, config: result, ttlChanged: false, digest: createHash('sha256').update(canonical(result)).digest('hex') };
}
