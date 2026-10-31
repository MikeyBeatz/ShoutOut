// Pure experimental, content-addressed index. Not part of any live callable.
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { geohashBounds } from './feed_spatial.js';

export const blockDefaults = Object.freeze({ entries: 64, bytes: 65536 });
export const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const millis = value => typeof value?.toMillis === 'function' ? value.toMillis() : value;
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const encodedBytes = value => Buffer.byteLength(canonical(value));
export const nodeHash = node => hash(canonical(node));

export function metadataOf(source) {
  if (!source || !identifier(source.id) || typeof source.authorId !== 'string' ||
      !source.authorId.length || source.authorId.length > 128 ||
      typeof source.geohash !== 'string' || !/^[0123456789bcdefghjkmnpqrstuvwxyz]{7}$/.test(source.geohash) ||
      !source.location || !Number.isFinite(source.location.latitude) || !Number.isFinite(source.location.longitude) ||
      Math.abs(source.location.latitude) > 90 || Math.abs(source.location.longitude) > 180 ||
      !Array.isArray(source.categories) || source.categories.length > 10 ||
      source.categories.some(value => typeof value !== 'string' || !value.length || value.length > 128) ||
      typeof source.status !== 'string' || source.status.length > 32 || !source.status.length) throw new Error('invalid-index-metadata');
  const bounds = geohashBounds(source.geohash);
  if (source.location.latitude < bounds.latitude[0] || source.location.latitude > bounds.latitude[1] ||
    source.location.longitude < bounds.longitude[0] || source.location.longitude > bounds.longitude[1]) throw new Error('index-location-mismatch');
  const createdAt = millis(source.createdAt), expiresAt = millis(source.expiresAt);
  const likesCount = source.likesCount ?? 0, dislikesCount = source.dislikesCount ?? 0;
  if (![createdAt, expiresAt].every(value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) ||
    ![likesCount, dislikesCount].every(Number.isSafeInteger) || createdAt < 0 ||
    expiresAt < createdAt || likesCount < 0 || dislikesCount < 0) throw new Error('invalid-index-metadata');
  return { id: source.id, authorId: source.authorId, geohash: source.geohash,
    location: { latitude: source.location.latitude, longitude: source.location.longitude },
    createdAt, expiresAt, likesCount, dislikesCount, status: source.status,
    categories: [...new Set(source.categories)].sort(),
    businessHighlighted: source.businessHighlighted === true, businessSpotlight: source.businessSpotlight === true };
}

export function lowRated(row) {
  const total = row.likesCount + row.dislikesCount;
  return total >= 10 && row.dislikesCount / total >= .7;
}

export function summarize(rows) {
  if (!rows.length) return null;
  return { count: rows.length,
    south: Math.min(...rows.map(row => row.location.latitude)), north: Math.max(...rows.map(row => row.location.latitude)),
    west: Math.min(...rows.map(row => row.location.longitude)), east: Math.max(...rows.map(row => row.location.longitude)),
    normal: rows.filter(row => !lowRated(row)).length,
    maxLikes: Math.max(...rows.map(row => row.likesCount)), minExpiry: Math.min(...rows.map(row => row.expiresAt)),
    maxCreated: Math.max(...rows.map(row => row.createdAt)), minId: rows.map(row => row.id).sort()[0] };
}

export function combine(children) {
  const rows = Object.values(children);
  return { count: rows.reduce((sum, row) => sum + row.count, 0),
    south: Math.min(...rows.map(row => row.south)), north: Math.max(...rows.map(row => row.north)),
    west: Math.min(...rows.map(row => row.west)), east: Math.max(...rows.map(row => row.east)),
    normal: rows.reduce((sum, row) => sum + row.normal, 0),
    maxLikes: Math.max(...rows.map(row => row.maxLikes)), minExpiry: Math.min(...rows.map(row => row.minExpiry)),
    maxCreated: Math.max(...rows.map(row => row.maxCreated)), minId: rows.map(row => row.minId).sort()[0] };
}

// Spatial subdivision first. Same-point hotspots then split by stable ID hash.
// The full ID suffix makes termination deterministic even under hash collision.
const geoAlphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
const route = row => `${row.geohash.slice(0, 4)}#${[...row.geohash.slice(4)]
  .map(c => geoAlphabet.indexOf(c).toString(2).padStart(5, '0')).join('')}#${[...hash(row.id)]
  .map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('')}#${Buffer.from(row.id).toString('hex')}!`;
const commonPrefix = (a, b, start) => {
  let end = start.length;
  while (end < a.length && a[end] === b[end]) end++;
  return a.slice(0, end);
};

export function treeBuilder(options = {}) {
  const config = { ...blockDefaults, ...options };
  if (!Number.isInteger(config.entries) || config.entries < 1 || config.entries > 64 ||
      !Number.isInteger(config.bytes) || config.bytes < 8192 || config.bytes > 65536) throw new Error('invalid-lab-block-config');
  const writes = new Map();
  function store(node) {
    if (encodedBytes(node) > config.bytes) throw new Error('index-node-too-large');
    const key = nodeHash(node); writes.set(key, node);
    return { hash: key, path: node.path, ...node.summary };
  }
  function branch(path, children) {
    if (!Object.keys(children).length) return null;
    if (Object.keys(children).length === 1) return Object.values(children)[0];
    return store({ v: 1, kind: 'branch', path, summary: combine(children), children });
  }
  function build(input, path) {
    if (!input.length) return null;
    const rows = [...input].sort((a, b) => ordinal(a.id, b.id));
    if (rows.some(row => !route(row).startsWith(path))) throw new Error('index-path-mismatch');
    const leaf = { v: 1, kind: 'leaf', path, summary: summarize(rows), rows };
    if (rows.length <= config.entries && encodedBytes(leaf) <= config.bytes) return store(leaf);
    if (rows.length === 1) throw new Error('index-entry-too-large');
    const routes = rows.map(route).sort();
    path = commonPrefix(routes[0], routes.at(-1), path);
    const groups = new Map();
    for (const row of rows) {
      const key = route(row)[path.length];
      if (!key) throw new Error('duplicate-index-id');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return branch(path, Object.fromEntries([...groups].sort(([a], [b]) => ordinal(a, b))
      .map(([key, items]) => [key, build(items, path + key)])));
  }
  async function edit(descriptor, path, oldRow, newRow, load) {
    if (!descriptor) {
      if (oldRow) throw new Error('incomplete-index');
      return build(newRow ? [newRow] : [], path);
    }
    const node = writes.get(descriptor.hash) ?? await load(descriptor.hash);
    if (!node.path.startsWith(path)) throw new Error('index-path-mismatch');
    if (node.kind === 'leaf') {
      const existing = node.rows.find(row => row.id === (oldRow ?? newRow).id);
      if ((oldRow && (!existing || canonical(existing) !== canonical(oldRow))) || (!oldRow && existing)) throw new Error('incomplete-index');
      const rows = node.rows.filter(row => row.id !== (oldRow ?? newRow).id);
      if (newRow) rows.push(newRow);
      return build(rows, path);
    }
    if (oldRow && !route(oldRow).startsWith(node.path)) throw new Error('incomplete-index');
    if (newRow && !route(newRow).startsWith(node.path)) {
      const existing = oldRow ? await edit(descriptor, node.path, oldRow, null, load) :
        { hash: descriptor.hash, path: node.path, ...node.summary };
      if (!existing) return build([newRow], path);
      const parent = commonPrefix(existing.path, route(newRow), path);
      const key = route(newRow)[parent.length];
      return branch(parent, { [existing.path[parent.length]]: existing,
        [key]: build([newRow], parent + key) });
    }
    path = node.path;
    const children = { ...node.children };
    const oldKey = oldRow ? route(oldRow)[path.length] : null;
    const newKey = newRow ? route(newRow)[path.length] : null;
    if (oldKey && oldKey === newKey) {
      children[oldKey] = await edit(children[oldKey], path + oldKey, oldRow, newRow, load);
    } else {
      if (oldKey) children[oldKey] = await edit(children[oldKey], path + oldKey, oldRow, null, load);
      if (newKey) children[newKey] = await edit(children[newKey], path + newKey, null, newRow, load);
    }
    for (const key of Object.keys(children)) if (!children[key]) delete children[key];
    return branch(path, children);
  }
  function reachable(descriptors) {
    const result = new Map();
    function visit(descriptor) {
      const node = writes.get(descriptor?.hash);
      if (!node || result.has(descriptor.hash)) return;
      result.set(descriptor.hash, node);
      if (node.children) Object.values(node.children).forEach(visit);
    }
    descriptors.forEach(visit); return result;
  }
  return { build, edit, reachable, writes, config };
}

export function verifyNode(key, node) {
  if (!node || node.v !== 1 || !['leaf', 'branch'].includes(node.kind) || nodeHash(node) !== key ||
      encodedBytes(node) > blockDefaults.bytes) throw new Error('index-integrity-failed');
  const s = node.summary;
  if (!s || !Number.isSafeInteger(s.count) || s.count < 1 || !Number.isSafeInteger(s.normal) ||
      s.normal < 0 || s.normal > s.count || !identifier(s.minId) ||
      ![s.south, s.north, s.west, s.east, s.minExpiry, s.maxCreated].every(Number.isFinite) ||
      s.south < -90 || s.north > 90 || s.south > s.north || s.west < -180 || s.east > 180 || s.west > s.east ||
      !Number.isSafeInteger(s.maxLikes) || s.maxLikes < 0 || typeof node.path !== 'string') throw new Error('index-integrity-failed');
  if (node.kind === 'branch' && (!node.children || Object.keys(node.children).length < 2 ||
      Object.keys(node.children).length > 32 || Object.entries(node.children).some(([part, child]) =>
        part.length !== 1 || !child || typeof child.path !== 'string' || !child.path.startsWith(node.path + part) ||
        !/^[a-f0-9]{64}$/.test(child.hash)))) throw new Error('index-integrity-failed');
  if (node.kind === 'leaf' && (!Array.isArray(node.rows) || node.rows.length > blockDefaults.entries ||
      new Set(node.rows.map(row => row.id)).size !== node.rows.length ||
      node.rows.some(row => row.status !== 'active' || canonical(metadataOf(row)) !== canonical(row) || !route(row).startsWith(node.path)))) throw new Error('index-integrity-failed');
  const summary = node.kind === 'leaf' ? summarize(node.rows) : combine(node.children);
  if (canonical(summary) !== canonical(node.summary)) throw new Error('index-integrity-failed');
  return node;
}
