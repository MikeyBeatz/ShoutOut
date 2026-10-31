import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGeohash } from './create_shout.js';
import { spatialSession, distanceKm, geohashBounds } from './feed_spatial.js';

const point = { latitude: 50.66, longitude: 14.04 };
const budget = { queries: 100, candidates: 1000 };
const ids = rows => rows.map(row => row.id);
function row(id, latitude, longitude, extra = {}) {
  return { id, location: { latitude, longitude }, geohash: encodeGeohash(latitude, longitude), createdAt: 1, ...extra };
}
function repository(source) {
  const rows = source.map(value => JSON.parse(JSON.stringify(value))).sort((a, b) =>
    a.geohash.localeCompare(b.geohash) || a.id.localeCompare(b.id));
  const snapshot = Object.freeze({});
  let queries = 0;
  return { snapshot, get queries() { return queries; },
    async readRange({ start, end, limit, after, snapshot: supplied }) {
      queries++;
      assert.equal(supplied, snapshot);
      const matches = rows.filter(value => value.geohash >= start && value.geohash <= end);
      const offset = after ? matches.findIndex(value => value.id === after) + 1 : 0;
      const result = matches.slice(offset, offset + limit);
      return { rows: result, exhausted: offset + result.length >= matches.length, next: result.at(-1)?.id };
    },
  };
}
function make(rows, options = {}) {
  const repo = repository(rows);
  return { repo, feed: spatialSession({ ...repo, point, radiusKm: 20, uid: 'user', project: 'fixture', ...options }) };
}
async function page(feed, token = feed.first, work = budget) {
  let result;
  do { result = await feed.page(token, work); } while (result.state === 'preparing');
  return result;
}
function oracle(rows, center, reads = new Set()) {
  return [...rows].sort((a, b) => Number(reads.has(a.id)) - Number(reads.has(b.id)) ||
    distanceKm(center, a.location) - distanceKm(center, b.location) || b.createdAt - a.createdAt ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

test('spherical distance and seven-character hash bounds include dateline and pole coordinates', () => {
  assert.equal(distanceKm(point, point), 0);
  assert(Math.abs(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111.1949) < .001);
  for (const center of [point, { latitude: 0, longitude: 179.999 }, { latitude: 89.999, longitude: -179.99 },
    { latitude: -89.9, longitude: 90 }]) {
    const bounds = geohashBounds(encodeGeohash(center.latitude, center.longitude));
    assert(center.latitude >= bounds.latitude[0] && center.latitude <= bounds.latitude[1]);
    assert(center.longitude >= bounds.longitude[0] && center.longitude <= bounds.longitude[1]);
  }
  assert.throws(() => geohashBounds('!'));
});

test('first 50 certify nearest frontier without scanning whole circle; later pages match oracle', async (t) => {
  const rows = Array.from({ length: 300 }, (_, i) => row(`s${String(i).padStart(4, '0')}`,
    point.latitude + (i % 20) * .003, point.longitude + Math.floor(i / 20) * .004));
  const { feed } = make(rows);
  const first = await page(feed);
  t.diagnostic(`first page: ${JSON.stringify(first.metrics)} / ${rows.length} total rows`);
  assert.equal(first.rows.length, 50);
  assert(first.metrics.candidates < rows.length, JSON.stringify(first.metrics));
  const actual = [...first.rows]; let cursor = first.next;
  while (cursor) { const next = await page(feed, cursor); actual.push(...next.rows); cursor = next.next; }
  assert.deepEqual(ids(actual), ids(oracle(rows, point)));
  assert.equal(new Set(ids(actual)).size, rows.length);
});

test('near a cell boundary and antimeridian no closer existing row is deferred to refresh', async () => {
  const center = { latitude: 0, longitude: 179.9999 };
  const rows = [row('west', 0, 179.99), row('across', 0, -179.9999), row('far', .01, 179.9999)];
  const { feed } = make(rows, { point: center, radiusKm: 5, pageSize: 1, queryBatch: 1 });
  const actual = []; let cursor = feed.first;
  while (cursor) { const next = await page(feed, cursor); actual.push(...next.rows); cursor = next.next; }
  assert.deepEqual(ids(actual), ['across', 'west', 'far']);
});

test('work exhaustion is preparing, retry and concurrent callers share one page', async () => {
  const rows = Array.from({ length: 75 }, (_, i) => row(`s${i}`, point.latitude + .001 * i, point.longitude));
  const { feed } = make(rows);
  const work = { queries: 1, candidates: 4 };
  const [a, b] = await Promise.all([feed.page(feed.first, work), feed.page(feed.first, work)]);
  assert.equal(a, b);
  assert.equal(a.state, 'preparing'); assert.equal(a.rows.length, 0);
  const result = await page(feed);
  const again = await feed.page(feed.first, work);
  assert.deepEqual(ids(again.rows), ids(result.rows));
  assert.deepEqual(again.metrics, result.metrics);
  again.rows[0].id = 'mutated';
  assert.notEqual((await feed.page(feed.first, work)).rows[0].id, 'mutated');
  await assert.rejects(feed.page({}, work), /invalid-cursor/);
  await assert.rejects(feed.page(feed.first, work, { uid: 'other', project: 'fixture' }), /invalid-cursor/);
  await assert.rejects(feed.page(feed.first, { queries: 0, candidates: 1 }), /invalid-budget/);
});

test('unread group stays first and uses immutable read snapshot', async () => {
  const rows = Array.from({ length: 80 }, (_, i) => row(`s${String(i).padStart(3, '0')}`, point.latitude + i * .001, point.longitude));
  const reads = rows.slice(0, 60).map(value => value.id), frozen = new Set(reads);
  const { feed } = make(rows, { unreadFirst: true, readIds: reads, pageSize: 7 });
  reads.push(...rows.map(value => value.id));
  const actual = []; let cursor = feed.first;
  while (cursor) { const result = await page(feed, cursor); actual.push(...result.rows); cursor = result.next; }
  assert.deepEqual(ids(actual), ids(oracle(rows, point, frozen)));
});

test('all-read dense seven-character cell exposes worst-case work rather than false cheap guarantee', async (t) => {
  const rows = Array.from({ length: 75 }, (_, i) => row(`s${String(i).padStart(3, '0')}`, point.latitude, point.longitude, { createdAt: i }));
  const { feed } = make(rows, { unreadFirst: true, readIds: ids(rows), queryBatch: 20 });
  const result = await page(feed);
  t.diagnostic(`all read, same cell: ${JSON.stringify(result.metrics)} / ${rows.length} total rows`);
  assert.equal(result.rows.length, 50);
  assert(result.metrics.candidates >= rows.length);
  assert.deepEqual(ids(result.rows), ids(oracle(rows, point, new Set(ids(rows)))).slice(0, 50));
});

test('eligibility, radius and frozen publication snapshot do not introduce duplicates or late insertions', async () => {
  const source = [row('allowed', point.latitude, point.longitude), row('blocked', point.latitude, point.longitude), row('distant', 0, 0)];
  const { feed } = make(source, { eligible: value => value.id !== 'blocked' });
  source.push(row('later', point.latitude, point.longitude));
  assert.deepEqual(ids((await page(feed)).rows), ['allowed']);
});

test('repository failure retains frontier and can retry without losing page contents', async () => {
  const repo = repository([row('one', point.latitude, point.longitude)]);
  let fail = true;
  const feed = spatialSession({ ...repo, uid: 'user', project: 'fixture', point, radiusKm: 5,
    readRange: args => { if (fail) { fail = false; throw new Error('unavailable'); } return repo.readRange(args); } });
  await assert.rejects(feed.page(feed.first, budget), /unavailable/);
  assert.deepEqual(ids((await page(feed)).rows), ['one']);
});

test('seeded geographies, narrow radii and read groups match complete reference at every page', async () => {
  for (const center of [point, { latitude: 0, longitude: 179.999 },
    { latitude: 89.99, longitude: 40 }, { latitude: -89.99, longitude: -160 }]) {
    for (let seed = 1; seed <= 4; seed++) {
      let randomState = seed;
      const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 2 ** 32; };
      const rows = Array.from({ length: 40 }, (_, i) => row(`s${String(i).padStart(3, '0')}`,
        Math.max(-90, Math.min(90, center.latitude + (random() - .5) * .08)),
        ((center.longitude + (random() - .5) * .08 + 540) % 360) - 180));
      const radiusKm = seed * .4, reads = new Set(rows.filter((_, i) => i % 3 === 0).map(value => value.id));
      const { feed } = make(rows, { point: center, radiusKm, unreadFirst: true, readIds: reads, pageSize: 3 });
      const actual = []; let cursor = feed.first;
      while (cursor) { const result = await page(feed, cursor, { queries: 3, candidates: 7 }); actual.push(...result.rows); cursor = result.next; }
      const expected = oracle(rows.filter(value => distanceKm(center, value.location) <= radiusKm), center, reads);
      assert.deepEqual(ids(actual), ids(expected), `${JSON.stringify(center)} seed ${seed}`);
    }
  }
});

test('centered grid measures geohash overfetch without assuming a fixed savings ratio', async (t) => {
  const rows = Array.from({ length: 300 }, (_, i) => row(`s${String(i).padStart(3, '0')}`,
    point.latitude + ((i % 20) - 10) * .005, point.longitude + (Math.floor(i / 20) - 7) * .008));
  const { feed } = make(rows);
  const first = await page(feed);
  t.diagnostic(`centered first page: ${JSON.stringify(first.metrics)} / ${rows.length} total rows`);
  assert.deepEqual(ids(first.rows), ids(oracle(rows, point)).slice(0, 50));
  assert(first.metrics.candidates >= first.rows.length && first.metrics.candidates <= rows.length);
});
