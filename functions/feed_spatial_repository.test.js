import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { openSpatialRepository } from './feed_spatial_repository.js';

function database() {
  const calls = [];
  const readTime = Timestamp.fromMillis(1000);
  const query = new Proxy({}, { get: (_, key) => (...args) => {
    calls.push([key, ...args]);
    if (key === 'get') return Promise.resolve({ readTime });
    return query;
  } });
  const db = {
    collection(name) { calls.push(['collection', name]); return query; },
    async runTransaction(callback, options) {
      calls.push(['transaction', options]);
      return callback({ get(q) {
        assert.equal(q, query);
        return { docs: [{ id: 'one', data: () => ({ status: 'active', geohash: 'u2d0000',
          location: new GeoPoint(50, 14), createdAt: Timestamp.fromMillis(5), expiresAt: Timestamp.fromMillis(10) }) }] };
      } });
    },
  };
  return { db, calls, readTime };
}

test('every spatial range pins the same read-only snapshot, applies cursor and normalizes documents', async () => {
  const { db, calls, readTime } = database();
  const repo = await openSpatialRepository(db);
  const result = await repo.readRange({ start: 'u200000', end: 'u2zzzzz', limit: 1,
    after: { hash: 'u2c0000', id: 'previous' }, snapshot: repo.snapshot });
  assert.equal(result.rows[0].createdAt, 5);
  assert.deepEqual(result.rows[0].location, { latitude: 50, longitude: 14 });
  assert.equal(result.exhausted, false);
  assert.deepEqual(result.next, { hash: 'u2d0000', id: 'one' });
  assert.deepEqual(calls.find(call => call[0] === 'transaction')[1], { readOnly: true, readTime });
  assert.deepEqual(calls.find(call => call[0] === 'startAfter'), ['startAfter', 'u2c0000', 'previous']);
  assert(calls.some(call => call[0] === 'where' && call[1] === 'status' && call[3] === 'active'));
  await assert.rejects(repo.readRange({ start: 'u200000', end: 'u2zzzzz', limit: 1, snapshot: {} }), /invalid-range/);
});

test('snapshot errors propagate with no retry using unpinned current data', async () => {
  const { db } = database(); let count = 0;
  db.runTransaction = async () => { count++; throw new Error('snapshot-expired'); };
  const repo = await openSpatialRepository(db);
  await assert.rejects(repo.readRange({ start: '0000000', end: 'zzzzzzz', limit: 5, snapshot: repo.snapshot }), /snapshot-expired/);
  assert.equal(count, 1);
});
