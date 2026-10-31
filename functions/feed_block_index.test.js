import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { encodeGeohash } from './create_shout.js';
import { metadataOf, treeBuilder, verifyNode, canonical, nodeHash, encodedBytes } from './feed_block_index.js';
import { blockCache, createLabBlockIndex, directoryWindows, cellGrid } from './feed_block_index_lab.js';
import { distanceKm } from './feed_spatial.js';

const point = { latitude: 50.66, longitude: 14.04 };
function row(i, extra = {}) {
  return metadataOf({ id: `row-${String(i).padStart(4, '0')}`, authorId: 'fixture', status: 'active',
    location: point, geohash: encodeGeohash(point.latitude, point.longitude),
    createdAt: i, expiresAt: 100000, categories: ['help'], ...extra });
}
function flatten(root, nodes) {
  const node = nodes.get(root.hash);
  return node.kind === 'leaf' ? node.rows : Object.values(node.children).flatMap(child => flatten(child, nodes));
}

test('metadata projects no text, private replies, reader location or read state', () => {
  const source = { ...row(1), title: 'private fixture', text: 'body', readIds: ['x'], readerLocation: point };
  const projected = metadataOf(source);
  assert(!('title' in projected)); assert(!('readIds' in projected)); assert(!('readerLocation' in projected));
  assert.throws(() => metadataOf({ ...source, geohash: '0000000' }), /location-mismatch/);
  assert.throws(() => metadataOf({ ...source, id: '../bad' }), /invalid-index-metadata/);
  const microseconds = new Timestamp(10, 123456000);
  assert.equal(metadataOf({ ...source, createdAt: microseconds }).createdAt, microseconds.toMillis());
});

test('compressed path expands and collapses for a new nearby point without changing old blocks', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(i));
  const original = treeBuilder(), path = rows[0].geohash.slice(0, 4), root = original.build(rows, path);
  const location = { latitude: point.latitude + .002, longitude: point.longitude };
  const added = row(400, { location, geohash: encodeGeohash(location.latitude, location.longitude) });
  assert.equal(added.geohash.slice(0, 4), path);
  const editor = treeBuilder();
  const next = await editor.edit(root, path, null, added, async key => original.writes.get(key));
  const nodes = new Map([...original.writes, ...editor.reachable([next])]);
  assert.equal(flatten(next, nodes).length, rows.length + 1);
  const revert = treeBuilder();
  const restored = await revert.edit(next, path, added, null, async key => nodes.get(key));
  assert.equal(restored.hash, root.hash);
  const moved = { ...rows[0], location, geohash: added.geohash };
  const mover = treeBuilder();
  const movedRoot = await mover.edit(root, path, rows[0], moved, async key => original.writes.get(key));
  const result = flatten(movedRoot, new Map([...original.writes, ...mover.reachable([movedRoot])]));
  assert.equal(result.length, rows.length);
  assert.deepEqual(result.find(value => value.id === moved.id).location, location);
});

test('same-point hotspot splits into bounded deterministic immutable blocks', () => {
  const rows = Array.from({ length: 300 }, (_, i) => row(i));
  const a = treeBuilder(), b = treeBuilder();
  const rootA = a.build(rows, rows[0].geohash.slice(0, 4));
  const rootB = b.build([...rows].reverse(), rows[0].geohash.slice(0, 4));
  assert.equal(rootA.hash, rootB.hash);
  for (const [key, node] of a.writes) {
    verifyNode(key, node);
    assert(encodedBytes(node) <= 65536);
    if (node.kind === 'leaf') assert(node.rows.length <= 64);
  }
  assert.deepEqual(flatten(rootA, a.writes).map(value => value.id).sort(), rows.map(value => value.id).sort());
});

test('one reaction copies only the affected path and old versions still reconstruct old order', async () => {
  const rows = Array.from({ length: 300 }, (_, i) => row(i));
  const original = treeBuilder(), path = rows[0].geohash.slice(0, 4), root = original.build(rows, path);
  const edit = treeBuilder(), changed = { ...rows[100], likesCount: 99 };
  const next = await edit.edit(root, path, rows[100], changed, async key => original.writes.get(key));
  const writes = edit.reachable([next]);
  assert(writes.size < original.writes.size);
  assert.equal(flatten(root, original.writes).find(value => value.id === changed.id).likesCount, 0);
  assert.equal(flatten(next, new Map([...original.writes, ...writes])).find(value => value.id === changed.id).likesCount, 99);
  await assert.rejects(treeBuilder().edit(root, path, { ...rows[100], likesCount: 1 }, changed,
    async key => original.writes.get(key)), /incomplete-index/);
});

test('byte budget subdivides large metadata before the document limit', () => {
  const rows = Array.from({ length: 70 }, (_, i) => row(i, {
    categories: Array.from({ length: 10 }, (_, j) => `${j}${'x'.repeat(127)}`),
  }));
  const builder = treeBuilder({ bytes: 16384 });
  builder.build(rows, rows[0].geohash.slice(0, 4));
  for (const node of builder.writes.values()) assert(encodedBytes(node) <= 16384);
});

test('content-address hash rejects mutation or summary corruption', () => {
  const builder = treeBuilder(), root = builder.build([row(1)], row(1).geohash.slice(0, 4));
  const node = builder.writes.get(root.hash);
  assert.equal(nodeHash(node), root.hash);
  const corrupt = JSON.parse(canonical(node)); corrupt.rows[0].likesCount = 2;
  assert.throws(() => verifyNode(root.hash, corrupt), /integrity/);
});

test('cache shares concurrent immutable loads and stays within both memory bounds', async () => {
  const cache = blockCache({ maxBytes: 100, maxEntries: 1 });
  let calls = 0;
  const fetcher = async () => { calls++; return { value: 'a'.repeat(20) }; };
  const [a, b] = await Promise.all([cache.load('a', fetcher), cache.load('a', fetcher)]);
  assert.equal(calls, 1); assert.equal(a.hit, false); assert.equal(b.hit, true);
  assert(Object.isFrozen(a.node));
  await cache.load('b', fetcher); assert.equal(cache.size, 1); assert(cache.bytes <= 100);
  await cache.load('a', fetcher); assert.equal(calls, 3);
  await cache.load('large', async () => ({ value: 'x'.repeat(200) }));
  assert(cache.bytes <= 100); assert.equal(cache.size, 1);
});

test('coarse directory ranges include nearby points at boundaries, dateline and exact poles', () => {
  for (const center of [point, { latitude: 0, longitude: 179.9999 },
    { latitude: 90, longitude: 0 }, { latitude: -90, longitude: 90 }]) {
    const ranges = directoryWindows(center, .5);
    for (const latitude of [Math.max(-90, center.latitude - .002), center.latitude, Math.min(90, center.latitude + .002)]) {
      for (const longitude of [-180, -90, 0, 90, 180, center.longitude]) {
        const location = { latitude, longitude };
        if (distanceKm(center, location) > .5) continue;
        const code = encodeGeohash(latitude, longitude).slice(0, 4), grid = cellGrid(code);
        assert(ranges.some(w => grid.latCell >= w.latStart && grid.latCell <= w.latEnd &&
          grid.lonCell >= w.lonStart && grid.lonCell <= w.lonEnd), `${JSON.stringify(location)} ${code}`);
      }
    }
  }
});

test('lab adapter refuses every non-emulator or non-test-project database', () => {
  assert.throws(() => createLabBlockIndex({ projectId: 'shoutout-dev-46c81' }, { namespace: 'fixture' }), /emulator-only/);
  assert.throws(() => createLabBlockIndex({ projectId: 'shoutout-production-a1b34' }, { namespace: 'fixture' }), /emulator-only/);
});

test('10000 small metadata records fit bounded cache without entry-count thrashing', async t => {
  const rows = Array.from({ length: 10000 }, (_, i) => row(i, { id: `row-${String(i).padStart(5, '0')}` }));
  const builder = treeBuilder();
  builder.build(rows, rows[0].geohash.slice(0, 4));
  const cache = blockCache(); let fetched = 0;
  const read = node => async () => { fetched++; return node; };
  for (const [key, node] of builder.writes) await cache.load(key, read(node));
  for (const [key, node] of builder.writes) assert.equal((await cache.load(key, read(node))).hit, true);
  assert.equal(fetched, builder.writes.size);
  assert(cache.bytes <= 4194304); assert(cache.size <= 1024);
  t.diagnostic(`BLOCK-SCALE ${JSON.stringify({ records: rows.length, nodes: builder.writes.size, cacheBytes: cache.bytes })}`);
});
