import { Timestamp } from 'firebase-admin/firestore';
import { blockDefaults, encodedBytes, canonical } from './feed_block_index.js';
import { generationId } from './feed_generation_format.js';
import { feedSessionLifetimeMillis } from './feed_session_policy.js';

export const cardPhases = ['backfill', 'audit', 'auditing', 'ready', 'active', 'rolled-back', 'aborted'];
const integer = n => Number.isSafeInteger(n) && n >= 0;
const hash = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const stamp = s => Array.isArray(s) && s.length === 2 && integer(s[0]) && integer(s[1]) && s[1] < 1000000000;
const ids = v => Array.isArray(v) && v.every(generationId) && new Set(v).size === v.length;
const exact = (value, keys) => value && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export function validateCardJob(data, source, target) {
  const keys = ['v', 'source', 'target', 'sourceIncarnation', 'initialRevision', 'initialWriters', 'initialIncarnations', 'initialCardWriters', 'planDigest',
    'controlRevision', 'phase', 'version', 'after', 'batchSize', 'scanned', ...(data?.audit ? ['audit'] : [])];
  if (!exact(data, keys) || data.v !== 1 || data.source !== source || data.target !== target || !cardPhases.includes(data.phase) ||
      !stamp(data.sourceIncarnation) || !integer(data.initialRevision) || !integer(data.controlRevision) || !integer(data.version) ||
      data.version >= Number.MAX_SAFE_INTEGER || !integer(data.scanned) || !ids(data.initialWriters) || !data.initialWriters.includes(source) || data.initialWriters.includes(target) ||
      !ids(data.initialCardWriters) || data.initialCardWriters.length || !(data.planDigest === null || hash(data.planDigest)) ||
      !Number.isInteger(data.batchSize) || data.batchSize < 1 || data.batchSize > 50 ||
      !(data.after === null || typeof data.after === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.after))) throw new Error('invalid-card-job');
  if (!exact(data.initialIncarnations, data.initialWriters) || !Object.values(data.initialIncarnations).every(stamp) ||
      canonical(data.initialIncarnations[source]) !== canonical(data.sourceIncarnation)) throw new Error('invalid-card-job');
  if (['auditing', 'ready', 'active', 'rolled-back'].includes(data.phase) && !data.audit) throw new Error('invalid-card-job');
  if (data.audit) validateCardAudit(data.audit);
  if (['ready', 'active', 'rolled-back'].includes(data.phase) && data.audit.part !== 'done') throw new Error('invalid-card-job');
  return data;
}
export function validateCardAudit(pin) {
  if (!exact(pin, ['readTime', 'cutoff', 'sourceCutoff', 'erasureRevision', 'sourceErasure', 'part', 'after', 'rootAfter', 'rootsDone',
    'queue', 'sourcePublic', 'actualPublic', 'sourceIndex', 'actualIndex']) || !(pin.readTime instanceof Timestamp) ||
    !['source', 'states', 'index', 'done'].includes(pin.part) || !Number.isSafeInteger(pin.cutoff) || pin.cutoff < -1 ||
    !Number.isSafeInteger(pin.sourceCutoff) || pin.sourceCutoff < -1 || !integer(pin.erasureRevision) || !integer(pin.sourceErasure) ||
    typeof pin.rootsDone !== 'boolean' || !Array.isArray(pin.queue) || encodedBytes(pin) > blockDefaults.bytes ||
    !(pin.after === null || typeof pin.after === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(pin.after)) ||
    !(pin.rootAfter === null || typeof pin.rootAfter === 'string' && /^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(pin.rootAfter)) ||
    pin.queue.some(item => !exact(item, ['hash', 'path', 'exact', 'summary', 'minExpiry']) || !hash(item.hash) || typeof item.path !== 'string' ||
      !/^[0123456789abcdefghjkmnpqrstuvwxyz_#!]+$/.test(item.path) || typeof item.exact !== 'boolean' ||
      !Number.isFinite(item.minExpiry) || !(item.exact ? item.summary && typeof item.summary === 'object' : item.summary === null)) ||
    pin.part === 'done' && (!pin.rootsDone || pin.queue.length)) throw new Error('invalid-card-audit');
  for (const key of ['sourcePublic', 'actualPublic', 'sourceIndex', 'actualIndex']) {
    if (!exact(pin[key], ['count', 'xor', 'sum']) || !integer(pin[key].count) || !hash(pin[key].xor) || !hash(pin[key].sum)) throw new Error('invalid-card-audit');
  }
  return pin;
}
export function assertCardAuditCurrent(current, now) {
  const pin = validateCardAudit(current.data.audit);
  if (!integer(now) || now < Math.floor(pin.readTime.toMillis()) || now >= Math.floor(pin.readTime.toMillis()) + feedSessionLifetimeMillis) throw new Error('card-audit-expired');
  if (current.marker.get('activeErasure') || current.from.get('activeErasure') ||
      (current.marker.get('prunedThrough') ?? -1) !== pin.cutoff || (current.from.get('prunedThrough') ?? -1) !== pin.sourceCutoff ||
      (current.marker.get('erasureRevision') ?? 0) !== pin.erasureRevision || (current.from.get('erasureRevision') ?? 0) !== pin.sourceErasure) throw new Error('card-audit-retention-changed');
  return pin;
}
export const cardCoverageMatches = pin => canonical(pin.sourcePublic) === canonical(pin.actualPublic) && canonical(pin.sourceIndex) === canonical(pin.actualIndex);
