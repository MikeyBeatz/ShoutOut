import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import { planReadBlocks, readContentHash, readRetentionMillis, validateReadBlock, readKey } from './read_sync_blocks.js';

const expiry = Date.UTC(2030, 0, 1), row = i => ({ shoutId: `item-${i}`, contentHash: readContentHash('title', String(i)),
  expiresAt: expiry, retainUntil: expiry + readRetentionMillis, confirmedAt: expiry - 1000 });
function memory() {
  const nodes = new Map();
  return { nodes, read: async id => nodes.get(id), apply: plan => { for (const [id, value] of plan.writes) nodes.set(id, value); } };
}
test('split, replay and atomic plan budgets preserve all old entries', async () => {
  const db = memory(), rows = Array.from({ length: 140 }, (_, i) => row(i));
  for (let i = 0; i < rows.length; i += 32) db.apply(await planReadBlocks(rows.slice(i, i + 32), db.read));
  const leaves = [...db.nodes.values()].filter(n => n.kind === 'leaf');
  assert.equal(leaves.reduce((n, leaf) => n + Object.keys(leaf.entries).length, 0), 140);
  for (const node of db.nodes.values()) validateReadBlock(node, node.day, node.prefix);
  const retry = await planReadBlocks(rows.map(r => ({ ...r, confirmedAt: expiry })), db.read);
  assert.equal(retry.writes.size, 0);
  const snapshot = JSON.stringify([...db.nodes]);
  await assert.rejects(planReadBlocks([row(200)], db.read, { maxReads: 0 }), /budget/);
  await assert.rejects(planReadBlocks([row(200)], db.read, { maxWrites: 0 }), /budget/);
  assert.equal(JSON.stringify([...db.nodes]), snapshot);
});
test('malformed nodes, missing children and orphan split targets fail closed', async () => {
  const sample = row(1), day = Math.floor(expiry / 86400000);
  await assert.rejects(planReadBlocks([sample], async () => ({ v: 1, kind: 'branch', day, prefix: '', extra: true })), /invalid/);
  await assert.rejects(planReadBlocks([sample], async id => id.endsWith('_r') ? { v: 1, revision: 1, kind: 'branch', day, prefix: '' } : null), /missing/);
  const db = memory(); db.apply(await planReadBlocks(Array.from({ length: 128 }, (_, i) => row(i)), db.read));
  const prefix = `${[...db.nodes.keys()][0]}0`;
  db.nodes.set(prefix, { v: 1, revision: 1, kind: 'leaf', day, prefix: '0', entries: {} });
  await assert.rejects(planReadBlocks([row(129)], db.read), /orphan/);
  assert.equal(readKey(sample.shoutId, sample.contentHash).length, 64);
});
for (const count of [100, 1000, 10000]) test(`local private layout comparison ${count} metadata markers`, async () => {
  const db = memory(), rows = Array.from({ length: count }, (_, i) => row(i));
  let reads = 0, writes = 0, revisions = 0;
  const start = performance.now();
  for (let i = 0; i < rows.length; i += 32) {
    const plan = await planReadBlocks(rows.slice(i, i + 32), db.read, { revision: revisions + 1 });
    reads += plan.reads; writes += plan.writes.size; revisions++; db.apply(plan);
  }
  const leaves = [...db.nodes.values()].filter(node => node.kind === 'leaf');
  assert.equal(leaves.reduce((sum, node) => sum + Object.keys(node.entries).length, 0), count);
  for (const node of db.nodes.values()) validateReadBlock(node, node.day, node.prefix);
  const replay = await planReadBlocks(rows.slice(0, 32), db.read); assert.equal(replay.writes.size, 0);
  const single = await planReadBlocks([row(count)], db.read);
  const freshBatch = await planReadBlocks(Array.from({ length: 32 }, (_, i) => row(count + i)), db.read);
  const bytes = [...db.nodes.values()].reduce((n, node) => n + JSON.stringify(node).length, 0);
  console.log('READ_SYNC_LAYOUT_BENCH ' + JSON.stringify({ count, reference: { markerWrites: count, snapshotDocuments: count },
    blocks: { blockReadsDuringUpload: reads, blockWrites: writes, revisionWrites: revisions, snapshotDocuments: db.nodes.size,
      leafDocuments: leaves.length, replayBlockReads: replay.reads, replayWrites: 0, jsonCharacters: bytes,
      newSingle: { reads: single.reads, writesWithRevision: single.writes.size + 1 },
      newBatch32: { reads: freshBatch.reads, writesWithRevision: freshBatch.writes.size + 1 } },
    elapsedMs: Math.round(performance.now() - start),
    excludes: 'eligibility/source/author/blocklist checks, retries, Functions/network, cleanup; local layout counters, not a cloud bill' }));
});
