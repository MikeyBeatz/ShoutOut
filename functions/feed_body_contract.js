// Inactive B4a contract. No host registration, live collection or default key.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { publicFeedBody } from './feed_public_body.js';

export const bodySchema = 1;
export function canonicalBody(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalBody).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalBody(value[key])}`).join(',')}}`;
  }
  throw new Error('invalid-body-value');
}
// Typed tokens avoid JS/Dart floating-point JSON spelling differences and
// preserve array order. IEEE-754 big-endian numbers have the same identity.
function identityTokens(value) {
  if (value === null) return ['null'];
  if (typeof value === 'number' && Number.isFinite(value)) {
    const bytes = Buffer.alloc(8); bytes.writeDoubleBE(Object.is(value, -0) ? 0 : value);
    return ['number', bytes.toString('hex')];
  }
  if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value];
  if (Array.isArray(value)) return ['array', value.map(identityTokens)];
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return ['object', Object.keys(value).sort().map(key => [key, identityTokens(value[key])])];
  }
  throw new Error('invalid-body-value');
}
export const bodyDigest = value => createHash('sha256').update(canonicalBody(identityTokens(value))).digest('hex');
const counters = ['likesCount', 'dislikesCount', 'commentsCount', 'savesCount'];
function validState(state) {
  return state?.schema === 1 && /^[a-f0-9]{64}$/.test(state.bodyVersion) &&
    typeof state.authorId === 'string' && !!state.authorId && typeof state.status === 'string' &&
    Number.isFinite(state.expiresAt) && state.expiresAt >= 0 &&
    counters.every(key => Number.isSafeInteger(state[key]) && state[key] >= 0);
}
export function bodyProjection(source) {
  const publicData = publicFeedBody(source);
  const body = Object.fromEntries(Object.entries(publicData).filter(([key]) => !['status', ...counters].includes(key)));
  const version = bodyDigest({ schema: bodySchema, body });
  const state = { schema: bodySchema, bodyVersion: version, authorId: source.authorId,
    status: source.status, expiresAt: publicData.expiresAt };
  for (const key of counters) {
    if (!Number.isSafeInteger(source[key] ?? 0) || (source[key] ?? 0) < 0) throw new Error('invalid-body-counter');
    state[key] = source[key] ?? 0;
  }
  canonicalBody(state);
  return { body, state, version };
}
const idValid = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
export function validateDescriptors(rows, { stateRequired = true, unreadFirst = true } = {}) {
  if (!Array.isArray(rows) || rows.length > 50 || new Set(rows.map(row => row?.id)).size !== rows.length) throw new Error('invalid-body-selection');
  let read = false;
  for (const row of rows) {
    if (!idValid(row.id) || !/^[a-f0-9]{64}$/.test(row.bodyVersion) || typeof row.read !== 'boolean' ||
        (stateRequired && !row.state) || (row.state && (!validState(row.state) || row.bodyVersion !== row.state.bodyVersion)) ||
        (row.distanceKm !== undefined && (!Number.isFinite(row.distanceKm) || row.distanceKm < 0))) throw new Error('invalid-body-descriptor');
    for (const key of ['selectionVersion', 'frozenContentHash']) {
      if (row[key] !== undefined && !/^[a-f0-9]{64}$/.test(row[key])) throw new Error('invalid-body-descriptor');
    }
    if (unreadFirst && read && !row.read) throw new Error('invalid-body-read-order');
    read ||= row.read;
    canonicalBody(row);
  }
}

// Domain-separated proof of a server-selected page. A proof never bypasses
// authorization or current availability. Its original deadline cannot slide.
export function bodySelectionCodec(key) {
  if (!(key instanceof Uint8Array) || key.length < 32) throw new Error('body-key-required');
  key = Buffer.from(key);
  const mac = payload => createHmac('sha256', key).update(`b4-body-v1.${payload}`).digest();
  function validate(value) {
    if (value?.v !== 1 || typeof value.uid !== 'string' || !value.uid.length || value.uid.length > 128 || typeof value.project !== 'string' ||
        !/^[a-z][a-z0-9-]{4,29}$/.test(value.project) || typeof value.generation !== 'string' || !value.generation ||
        typeof value.incarnation !== 'string' || !value.incarnation || typeof value.context !== 'string' || !value.context ||
        !Number.isSafeInteger(value.startedAt) || value.startedAt < 0 || !Number.isSafeInteger(value.expiresAt) ||
        value.expiresAt <= value.startedAt || value.expiresAt - value.startedAt > 3600000) throw new Error('invalid-body-proof');
    if (typeof value.unreadFirst !== 'boolean') throw new Error('invalid-body-read-policy');
    validateDescriptors(value.rows, { stateRequired: false, unreadFirst: value.unreadFirst });
  }
  return {
    encode(selection) {
      // The proof binds the ordered versions/read groups, not a second copy of
      // mutable counters. Current state is always checked separately.
      const { project, uid, generation, incarnation, context, startedAt, expiresAt } = selection;
      const value = { project, uid, generation, incarnation, context, startedAt, expiresAt,
        unreadFirst: selection.unreadFirst ?? false,
        rows: selection.rows.map(({ id, bodyVersion, read, distanceKm, selectionVersion, frozenContentHash }) => ({ id, bodyVersion, read,
          ...(distanceKm === undefined ? {} : { distanceKm }),
          ...(selectionVersion === undefined ? {} : { selectionVersion }),
          ...(frozenContentHash === undefined ? {} : { frozenContentHash }) })), v: 1 }; validate(value);
      const payload = Buffer.from(canonicalBody(value)).toString('base64url');
      if (payload.length > 131072) throw new Error('body-proof-too-large');
      return `${payload}.${mac(payload).toString('base64url')}`;
    },
    decode(token, scope, now) {
      if (typeof token !== 'string' || token.length > 131116 || !Number.isSafeInteger(now)) throw new Error('invalid-body-proof');
      const parts = token.split('.');
      if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw new Error('invalid-body-proof');
      const signature = Buffer.from(parts[1], 'base64url');
      if (!timingSafeEqual(signature, mac(parts[0]))) throw new Error('invalid-body-proof');
      const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); validate(value);
      for (const field of ['project', 'uid', 'generation', 'incarnation', 'context']) {
        if (value[field] !== scope[field]) throw new Error('body-proof-scope');
      }
      if (now < value.startedAt || now >= value.expiresAt) throw new Error('body-proof-expired');
      return value;
    },
  };
}

// Host must check Auth/App Check, actor, current blocks, generation incarnation
// and R5 before/after waits. No default permissive guard, no direct callable.
export function bodyPageCore({ codec, store, guard, clock }) {
  if (!codec || !store || typeof guard !== 'function' || typeof clock !== 'function') throw new Error('body-host-required');
  const alive = selection => {
    const now = clock();
    if (!Number.isSafeInteger(now) || now < selection.startedAt || now >= selection.expiresAt) throw new Error('body-proof-expired');
  };
  async function hydrate(selection, missing) {
    if (!Array.isArray(missing) || missing.length > 50 || new Set(missing).size !== missing.length ||
        missing.some(id => !selection.rows.some(row => row.id === id))) throw new Error('invalid-body-missing');
    await guard(selection);
    const current = await store.states(selection.rows.map(row => row.id));
    const check = states => {
      alive(selection);
      for (const row of selection.rows) {
        const state = states.get(row.id);
        if (!validState(state) || state.bodyVersion !== row.bodyVersion || state.status !== 'active' || state.expiresAt <= clock()) throw new Error('body-selection-stale');
      }
    };
    check(current);
    const sources = missing.length ? await store.bodies(missing) : new Map();
    const bodies = missing.map(id => {
      const source = sources.get(id);
      if (!source) throw new Error('body-selection-stale');
      const projection = bodyProjection(source), row = selection.rows.find(row => row.id === id);
      if (projection.version !== row.bodyVersion || projection.state.status !== 'active' || projection.state.expiresAt <= clock()) throw new Error('body-selection-stale');
      return { id, bodyVersion: projection.version, body: projection.body };
    });
    // Counter-only changes do not invalidate the frozen body or read group.
    const latest = await store.states(selection.rows.map(row => row.id)); check(latest);
    await guard(selection);
    alive(selection);
    const { project, uid, generation, incarnation, context } = selection;
    return { schema: 1, project, uid, generation, incarnation, context, unreadFirst: selection.unreadFirst ?? false,
      rows: selection.rows.map(row => ({ ...row, state: latest.get(row.id) })), bodies, expiresAt: selection.expiresAt };
  }
  return {
    async select(selection, { cold = false } = {}) {
      const token = codec.encode(selection);
      codec.decode(token, selection, clock());
      const page = await hydrate(selection, cold ? selection.rows.map(row => row.id) : []);
      return { ...page, token };
    },
    async complete(token, scope, missing) {
      const selection = codec.decode(token, scope, clock());
      return { ...await hydrate(selection, missing), token };
    },
  };
}
