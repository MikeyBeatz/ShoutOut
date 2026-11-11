// Bounded private layout. No Firebase initialization, callable or scheduler.
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

export const readRetentionMillis = 7 * 86400000;
export const readBlockEntries = 128;
export const readBlockBytes = 65536;
export const readKey = (shoutId, contentHash) => createHash('sha256').update(JSON.stringify([shoutId, contentHash])).digest('hex');
export const readContentHash = (title, text) => createHash('sha256').update(JSON.stringify([title, text])).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validReadId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const bits = key => [...key].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
export const readBucketId = (day, prefix = '') => `d${day}_r${prefix}`;
export function validReadRecord(row) {
  return row && Object.keys(row).sort().join(',') === 'confirmedAt,contentHash,expiresAt,retainUntil,shoutId' &&
    validReadId(row.shoutId) && hex(row.contentHash) && [row.expiresAt, row.retainUntil, row.confirmedAt].every(integer) &&
    row.retainUntil === row.expiresAt + readRetentionMillis && row.confirmedAt < row.retainUntil;
}
export function validateReadBlock(node, day, prefix) {
  if (!node || node.v !== 1 || node.day !== day || node.prefix !== prefix || !['leaf', 'branch'].includes(node.kind) ||
      !integer(day) || !/^[01]{0,256}$/.test(prefix)) throw new Error('invalid-read-block');
  const fields = node.kind === 'leaf' ? 'day,entries,kind,prefix,revision,v' : 'day,kind,prefix,revision,v';
  if (Object.keys(node).sort().join(',') !== fields || !Number.isSafeInteger(node.revision) || node.revision < 1 ||
      Buffer.byteLength(JSON.stringify(node)) > readBlockBytes ||
      node.kind === 'branch' && prefix.length === 256) throw new Error('invalid-read-block');
  if (node.kind === 'leaf') {
    if (!node.entries || typeof node.entries !== 'object' || Array.isArray(node.entries) || Object.keys(node.entries).length > readBlockEntries) throw new Error('invalid-read-block');
    for (const [key, row] of Object.entries(node.entries)) {
      if (!hex(key) || !validReadRecord(row) || readKey(row.shoutId, row.contentHash) !== key ||
          !bits(key).startsWith(prefix) || Math.floor(row.expiresAt / 86400000) !== day) throw new Error('invalid-read-block');
    }
  }
  return node;
}

// Read all affected nodes before the caller applies any write. Mutating a leaf
// into a branch needs no growing account-wide directory or per-marker locator.
export async function planReadBlocks(records, readNode, { maxReads = 200, maxWrites = 128, revision = 1 } = {}) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('invalid-read-revision');
  const cache = new Map(), writes = new Map();
  let reads = 0;
  async function load(day, prefix, required = false) {
    const id = readBucketId(day, prefix);
    if (!cache.has(id)) {
      if (++reads > maxReads) throw new Error('read-block-work-budget');
      const raw = await readNode(id);
      if (raw) validateReadBlock(raw, day, prefix);
      cache.set(id, raw ?? null);
    }
    const node = cache.get(id);
    if (!node && required) throw new Error('missing-read-block-child');
    return node;
  }
  function stage(node) {
    node = { ...node, revision };
    const id = readBucketId(node.day, node.prefix);
    writes.set(id, node); cache.set(id, node);
    if (writes.size > maxWrites) throw new Error('read-block-work-budget');
  }
  async function storeLeaf(node) {
    if (Object.keys(node.entries).length <= readBlockEntries && Buffer.byteLength(JSON.stringify(node)) <= readBlockBytes) {
      validateReadBlock(node, node.day, node.prefix); stage(node); return;
    }
    if (node.prefix.length >= 256) throw new Error('read-block-hash-collision');
    const children = [0, 1].map(bit => ({ v: 1, revision, kind: 'leaf', day: node.day, prefix: node.prefix + bit, entries: {} }));
    for (const child of children) if (await load(child.day, child.prefix)) throw new Error('orphan-read-block');
    for (const [key, row] of Object.entries(node.entries)) children[Number(bits(key)[node.prefix.length])].entries[key] = row;
    stage({ v: 1, kind: 'branch', day: node.day, prefix: node.prefix });
    for (const child of children) await storeLeaf(child);
  }
  for (const row of records) {
    if (!validReadRecord(row)) throw new Error('invalid-read-record');
    const key = readKey(row.shoutId, row.contentHash), path = bits(key), day = Math.floor(row.expiresAt / 86400000);
    let prefix = '', node = await load(day, prefix);
    while (node?.kind === 'branch') {
      prefix += path[prefix.length]; node = await load(day, prefix, true);
    }
    node ??= { v: 1, revision, kind: 'leaf', day, prefix, entries: {} };
    const previous = node.entries[key];
    if (previous) {
      if (previous.expiresAt !== row.expiresAt) throw new Error('read-record-expiry-changed');
      continue; // Retry never changes original confirmation or retention.
    }
    await storeLeaf({ ...node, entries: { ...node.entries, [key]: row } });
  }
  return { writes, reads };
}
