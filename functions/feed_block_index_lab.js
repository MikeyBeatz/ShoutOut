// Emulator-only fixture entry point. Never part of a Functions artifact.
import { treeBuilder, metadataOf } from './feed_block_index.js';
import { createBlockIndexStore, cellGrid } from './feed_block_index_store.js';
import { labIndexBinding } from './feed_index_paths.js';
export { blockCache, directoryWindows, cellGrid } from './feed_block_index_store.js';

export function createLabBlockIndex(db, { namespace, sourceCollection = null, ...options }) {
  const binding = labIndexBinding(db, namespace, sourceCollection);
  const adapter = createBlockIndexStore(db, { ...options, binding });
  const { base, source } = binding, cells = base.collection('cells'), nodes = base.collection('nodes');
  const { accountRetention = false, ...blockOptions } = options;
  async function seed(input) {
    const rows = input.map(metadataOf);
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('duplicate-index-id');
    const builder = treeBuilder(blockOptions), regions = new Map();
    for (const row of rows.filter(row => row.status === 'active')) {
      const cell = row.geohash.slice(0, 4);
      if (!regions.has(cell)) regions.set(cell, []);
      regions.get(cell).push(row);
    }
    const roots = [...regions].map(([cell, entries]) => [cell, builder.build(entries, cell)]);
    const writes = rows.length + builder.writes.size + roots.length + 1;
    if (writes > 450) throw new Error('lab-seed-too-large');
    await db.runTransaction(async tx => {
      if ((await tx.get(base)).exists) throw new Error('index-already-seeded');
      tx.create(base, { v: 1, prunedThrough: -1, ...(accountRetention ? { accountRetention: true, erasureRevision: 0 } : {}) });
      for (const row of rows) tx.create(source.doc(row.id), row);
      for (const [key, node] of builder.writes) tx.set(nodes.doc(key), node);
      for (const [cell, descriptor] of roots) tx.create(cells.doc(cell), { v: 1, hash: descriptor.hash, minExpiry: descriptor.minExpiry, revision: 1, ...cellGrid(cell) });
    });
    return { sourceWrites: rows.length, nodeWrites: builder.writes.size, directoryWrites: roots.length, guardWrites: 1 };
  }

  return { ...adapter, seed };
}
