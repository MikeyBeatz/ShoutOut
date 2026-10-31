import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { log } from 'node:console';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { encodeGeohash } from './create_shout.js';
import { createLabBlockIndex, blockCache } from './feed_block_index_lab.js';
import { feedSessionLifetimeMillis as hour, FeedSessionExpired } from './feed_session_policy.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'index-retention-tests') : null;
const db = app ? getFirestore(app) : null, namespaces = [];
const point = { latitude: 50.66, longitude: 14.04 };
const cell = encodeGeohash(point.latitude, point.longitude).slice(0, 4);
const context = { point, radiusKm: 20, now: 500 };
function row(i, extra = {}) {
  return { id: `r-${i}`, authorId: 'author', status: 'active', location: point,
    geohash: encodeGeohash(point.latitude, point.longitude), createdAt: i,
    expiresAt: 10000, categories: ['help'], likesCount: 0, dislikesCount: 0, ...extra };
}
async function index(rows, options = {}) {
  const namespace = `retain-${randomUUID().slice(0, 8)}`; namespaces.push(namespace);
  const lab = createLabBlockIndex(db, { namespace, ...options }); await lab.seed(rows); return lab;
}
async function finish(job, work, hooks) {
  let result, iterations = 0;
  do { result = await job.step(work, hooks); assert(++iterations < 1000); }
  while (!['done', 'cancelled'].includes(result.state));
  return result;
}
after(async () => {
  if (!app) return;
  for (const namespace of namespaces) await db.recursiveDelete(db.collection('feedIndexLab').doc(namespace));
  await db.terminate(); await deleteApp(app);
});

test('one hour expires cached/next pages and deltas; cards can still hydrate; refresh renews', { skip: !enabled }, async () => {
  let clock = 0;
  const lab = await index(Array.from({ length: 60 }, (_, i) => row(i)), { elapsedClock: () => clock });
  const view = await lab.open(context), first = await view.page(view.first);
  assert.equal(first.rows.length, 50);
  clock = hour - 1; await view.page(view.first);
  clock = hour;
  await assert.rejects(view.page(view.first), FeedSessionExpired);
  await assert.rejects(view.page(first.next), FeedSessionExpired);
  assert.equal(first.rows.length, 50);
  assert.equal((await lab.hydrate(view, [first.rows[0].id], 500)).items[0].available, true);
  const refreshed = await lab.open(context);
  assert.equal((await refreshed.page(refreshed.first)).rows.length, 50);
  await assert.rejects(lab.indexChanges(view, refreshed), FeedSessionExpired);
});

test('root retirement is atomic, protects old sessions and adds a measured archive write', { skip: !enabled }, async () => {
  const original = row(1), lab = await index([original]);
  const old = await lab.open(context);
  await assert.rejects(lab.mutate(original.id, { ...original, likesCount: 1 }, { beforeCommit() { throw new Error('rollback'); } }), /rollback/);
  assert.equal((await lab.base.collection('retiredRoots').get()).size, 0);
  const mutation = await lab.mutate(original.id, { ...original, likesCount: 1 });
  assert.equal(mutation.historyWrites, 1);
  const archives = await lab.base.collection('retiredRoots').get();
  assert(archives.docs[0].data().retiredAt instanceof Timestamp);
  assert(archives.docs[0].createTime.isEqual(archives.docs[0].updateTime));
  const gc = await finish(await lab.beginGc(cell), { reads: 1, deletes: 1 });
  assert.equal(gc.metrics.nodesDeleted, 0);
  assert.equal((await old.page(old.first)).rows[0].likesCount, 0);
  assert.equal((await lab.audit()).valid, true);
  log('RETENTION-BENCH', JSON.stringify({ mutation, protectedGc: gc.metrics }));
});

test('expired histories are reclaimed, current roots survive, repeat and cancel are safe', { skip: !enabled }, async () => {
  let clock = 0;
  const original = row(1), lab = await index([original], { elapsedClock: () => clock });
  const old = await lab.open(context); await old.page(old.first);
  await lab.mutate(original.id, { ...original, likesCount: 1 });
  clock = hour;
  const cancelled = await lab.beginGc(cell); cancelled.cancel();
  assert.equal((await cancelled.step()).metrics.nodesDeleted, 0);
  const gc = await finish(await lab.beginGc(cell, { testTimeAdvanceMillis: hour + 60000 }), { reads: 1, deletes: 1 });
  assert.equal(gc.metrics.nodesDeleted, 1); assert.equal(gc.metrics.archivesDeleted, 1);
  assert.equal((await lab.audit()).historicalNodes, 0);
  await assert.rejects(old.page(old.first), FeedSessionExpired);
  assert.equal((await finish(await lab.beginGc(cell))).metrics.nodesDeleted, 0);
  log('RETENTION-BENCH', JSON.stringify({ reclaimedGc: gc.metrics }));
});

test('republishing an old hash during sweep aborts GC before it can delete the new tree', { skip: !enabled }, async () => {
  const original = row(1), lab = await index([original]);
  await lab.mutate(original.id, { ...original, likesCount: 1 });
  let changed = false;
  const gc = await lab.beginGc(cell, { testTimeAdvanceMillis: hour + 60000 });
  await assert.rejects(finish(gc, { reads: 32, deletes: 16 }, {
    async beforeDelete({ phase }) {
      if (phase === 'nodes' && !changed) { changed = true; await lab.mutate(original.id, original); }
    },
  }), /index-gc-root-changed/);
  assert(changed); assert.equal((await lab.audit()).valid, true);
  await finish(await lab.beginGc(cell));
  assert.equal((await lab.audit()).valid, true);
});

test('missing protected blocks fail marking before any deletion', { skip: !enabled }, async () => {
  const original = row(1), lab = await index([original]);
  await lab.mutate(original.id, { ...original, likesCount: 1 });
  const root = (await lab.base.collection('cells').doc(cell).get()).data();
  await lab.base.collection('nodes').doc(root.hash).delete();
  const before = await lab.inspect();
  await assert.rejects(finish(await lab.beginGc(cell)));
  assert.equal((await lab.inspect()).retainedNodes, before.retainedNodes);
});

test('expiry prunes index only; retained Shouts still accept reactions and can be reindexed', { skip: !enabled }, async () => {
  const expired = row(1, { expiresAt: 600 }), active = row(2);
  const lab = await index([expired, active]);
  assert.deepEqual(await lab.expiredCells(600), [cell]);
  const prune = await finish(await lab.beginExpiryPrune(cell, 600), { nodes: 1, entries: 1 });
  assert.equal(prune.metrics.sourceWrites, 0);
  assert.deepEqual((await lab.base.collection('source').doc(expired.id).get()).data(), { ...expired, businessSpotlight: false, businessHighlighted: false });
  assert.deepEqual(await lab.expiredCells(600), []);
  const reacted = { ...expired, likesCount: 1 };
  const mutation = await lab.mutate(expired.id, reacted);
  assert.equal(mutation.sourceWrites, 1); assert.equal(mutation.nodeWrites, 0);
  assert.equal((await lab.audit()).activeMetadata, 1);
  await lab.mutate(expired.id, { ...reacted, expiresAt: 20000 });
  assert.equal((await lab.audit()).activeMetadata, 2);
  log('RETENTION-BENCH', JSON.stringify({ expiryPrune: prune.metrics, expiredReaction: mutation }));
});

test('expiry collection rechecks current source and preserves a concurrent extension', { skip: !enabled }, async () => {
  const expired = row(1, { expiresAt: 600 }), lab = await index([expired]);
  const job = await lab.beginExpiryPrune(cell, 600);
  let extended = false;
  await finish(job, { nodes: 1, entries: 1 }, { async beforeReconcile() {
    if (!extended) { extended = true; await lab.mutate(expired.id, { ...expired, expiresAt: 20000 }); }
  } });
  assert(extended); assert.equal((await lab.audit()).activeMetadata, 1);
  assert.deepEqual(await lab.expiredCells(600), []);
});

test('cache invalidation evicts stored and pending blocks', async () => {
  const cache = blockCache(); let release;
  const loading = cache.load('hash', () => new Promise(resolve => { release = resolve; }));
  cache.invalidate('hash'); release({ value: 1 }); await loading;
  assert.equal(cache.size, 0);
  await cache.load('hash', async () => ({ value: 1 })); assert.equal(cache.size, 1);
  cache.invalidate('hash'); assert.equal(cache.size, 0);
});

test('multi-block old snapshots stay readable; sweep respects each work budget', { skip: !enabled }, async () => {
  let clock = 0;
  const rows = Array.from({ length: 80 }, (_, i) => row(i));
  const lab = await index(rows, { elapsedClock: () => clock });
  const old = await lab.open(context), first = await old.page(old.first);
  await lab.mutate(rows[0].id, { ...rows[0], likesCount: 5 });
  const noop = await lab.mutate(rows[0].id, { ...rows[0], likesCount: 5 });
  assert.equal(noop.historyWrites, 0);
  const protectedGc = await finish(await lab.beginGc(cell));
  assert.equal(protectedGc.metrics.nodesDeleted, 0);
  assert.equal((await old.page(first.next)).rows.length, 30);
  clock = hour;
  const gc = await lab.beginGc(cell, { testTimeAdvanceMillis: hour + 60000 });
  let previousReads = 0, previousDeletes = 0, result;
  do {
    result = await gc.step({ reads: 2, deletes: 1 });
    const m = result.metrics;
    const reads = m.historyReadUnits + m.markReads + m.scanReadUnits + m.archiveReadUnits;
    const deletes = m.nodesDeleted + m.archivesDeleted;
    assert(reads - previousReads <= 2); assert(deletes - previousDeletes <= 1);
    previousReads = reads; previousDeletes = deletes;
  } while (result.state !== 'done');
  assert(result.metrics.nodesDeleted > 0);
  assert.equal((await lab.audit()).historicalNodes, 0);
});

test('pruning the last row archives a deleted root and preserves the source', { skip: !enabled }, async () => {
  const original = row(1, { expiresAt: 600 }), lab = await index([original]);
  await finish(await lab.beginExpiryPrune(cell, 600));
  assert.equal((await lab.base.collection('cells').get()).size, 0);
  assert.equal((await lab.base.collection('source').get()).size, 1);
  assert.equal((await finish(await lab.beginGc(cell))).metrics.nodesDeleted, 0);
  const old = await lab.base.collection('retiredRoots').get();
  const retiredHash = old.docs[0].data().hash;
  await lab.mutate(original.id, { ...original, expiresAt: 20000 });
  await lab.mutate(original.id, original);
  assert.equal((await lab.base.collection('retiredRoots').get()).size, 2);
  assert.equal(old.docs[0].data().hash, retiredHash);
  assert.equal((await lab.audit()).valid, true);
  await finish(await lab.beginGc(cell, { testTimeAdvanceMillis: hour + 60000 }));
  assert.equal((await lab.inspect()).retainedNodes, 0);
  assert.equal((await lab.base.collection('source').get()).size, 1);
});
