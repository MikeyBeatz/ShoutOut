import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { treeBuilder, metadataOf } from './feed_block_index.js';
import { encodeGeohash } from './geohash.js';
import { portableIndexPage } from './feed_portable_selection.js';

test('10000 same-cell records keep only 50 candidates and reconstruct later pages', async t => {
  const location = { latitude: 50.08, longitude: 14.44 };
  const rows = Array.from({ length: 10000 }, (_, i) => ({ id: `r-${String(i).padStart(5, '0')}`,
    authorId: 'author', geohash: encodeGeohash(location.latitude, location.longitude), location,
    createdAt: i, expiresAt: 100000, likesCount: 0, dislikesCount: 0, status: 'active', categories: ['Dotaz'] })).map(metadataOf);
  const builder = treeBuilder(), root = builder.build(rows, rows[0].geohash.slice(0, 4));
  const roots = [{ hash: root.hash, path: rows[0].geohash.slice(0, 4) }];
  const rowKey = row => [0, 0, 0, 0, -row.createdAt, row.id];
  const options = { roots, readNode: async key => builder.writes.get(key), eligible: () => true,
    rowKey, nodeKey: () => [-1, -1, -1, -Infinity, -Infinity, ''], assertSessionAlive() {} };
  let position, result, maximum = 0, largestCheckpointBytes = 0, steps = 0;
  for (let page = 0; page < 2; page++) {
    do {
      result = await portableIndexPage({ ...options, position }, { nodes: 31 });
      maximum = Math.max(maximum, result.metrics.maxRetainedCandidates);
      assert(result.metrics.nodesProcessed <= 31);
      largestCheckpointBytes = Math.max(largestCheckpointBytes, Buffer.byteLength(JSON.stringify(result.position)));
      position = JSON.parse(JSON.stringify(result.position)); steps++;
    } while (result.state === 'preparing');
    assert.deepEqual(result.rows.map(row => row.id), rows.slice().reverse().slice(page * 50, (page + 1) * 50).map(row => row.id));
  }
  assert.equal(maximum, 50); assert(largestCheckpointBytes < 262144); assert(steps > 2);
  t.diagnostic(`PORTABLE-BENCH ${JSON.stringify({ records: rows.length, pages: 2, steps, maximumCandidates: maximum, largestCheckpointBytes, blocks: builder.writes.size })}`);
});
