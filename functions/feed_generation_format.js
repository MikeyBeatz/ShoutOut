// Server-owned format and building-generation capability. No live activation.
import { validateFeedIndexControl } from './feed_index_admin_guard.js';

export const generationId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value);
export const generationStamp = doc => [doc.createTime.seconds, doc.createTime.nanoseconds];
export const sameGenerationStamp = (doc, stamp) => doc?.exists && Array.isArray(stamp) &&
  doc.createTime.seconds === stamp[0] && doc.createTime.nanoseconds === stamp[1];
export function generationContentIdentity(marker) {
  if (!marker || !(marker.readIdentity === undefined || marker.readIdentity === 1)) throw new Error('invalid-index-content-identity-mode');
  return marker.readIdentity === 1;
}
export function generationCardProjection(marker) {
  if (!marker || !(marker.cardProjection === undefined || marker.cardProjection === 1) ||
      (marker.v !== (marker.cardProjection === 1 ? 2 : 1))) throw new Error('invalid-index-card-format');
  if (marker.cardProjection === 1 && marker.readIdentity !== 1) throw new Error('invalid-index-card-format');
  return marker.cardProjection === 1;
}
export function transitionRef(db, target) {
  if (!generationId(target)) throw new Error('invalid-transition-generation');
  return db.doc(`feedIndexMaintenance/transitions/jobs/${target}`);
}

// The optional context is created inside ONE caller transaction attempt, never
// cached globally: SDK retries must re-read control and generation documents.
export async function buildingGeneration(tx, db, marker, context = null, onRead = () => {}) {
  const card = marker.get('cardBackfillId') !== undefined;
  if (!card && marker.get('transitionId') === undefined) return false;
  const get = ref => { onRead(); return tx.get(ref); };
  const target = marker.id;
  if (marker.get(card ? 'cardBackfillId' : 'transitionId') !== target || !generationId(target)) throw new Error('invalid-building-generation');
  if (context && context.transaction !== tx) throw new Error('foreign-generation-transaction');
  const control = context?.control ?? validateFeedIndexControl((await get(db.doc('feedIndexControl/current'))).data());
  const job = context?.jobs?.get(target) ?? await get(card ? db.doc(`feedIndexMaintenance/cardBackfills/jobs/${target}`) : transitionRef(db, target));
  context?.jobs?.set(target, job);
  if (!job.exists || job.get('v') !== 1 || job.get('target') !== target ||
      !job.createTime.isEqual(marker.createTime) || !generationId(job.get('source'))) throw new Error('invalid-building-generation');
  if (job.get('phase') !== 'backfill') return false;
  if (control.mode !== 'building' || control.readGenerationId !== job.get('source') ||
      !control.writeGenerationIds.includes(target) || control.revision !== job.get('controlRevision')) throw new Error('stale-building-generation');
  const source = context?.markers.get(job.get('source')) ?? await get(db.doc(`feedIndexGenerations/${job.get('source')}`));
  if (!sameGenerationStamp(source, job.get('sourceIncarnation'))) throw new Error('stale-building-generation');
  return true;
}
