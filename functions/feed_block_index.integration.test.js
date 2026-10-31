import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { encodeGeohash } from './create_shout.js';
import { createLabBlockIndex, blockCache } from './feed_block_index_lab.js';
import { lowRated } from './feed_block_index.js';
import { distanceKm, spatialSession } from './feed_spatial.js';
import { openSpatialRepository } from './feed_spatial_repository.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'block-index-tests') : null;
const db = app ? getFirestore(app) : null;
const namespaces = [];
const point = { latitude: 50.66, longitude: 14.04 };
const now = 500;
after(async () => {
  if (app) {
    for (const namespace of namespaces) await db.recursiveDelete(db.collection('feedIndexLab').doc(namespace));
    await db.terminate(); await deleteApp(app);
  }
});
function fixture(i, location = point, extra = {}) {
  return { id: `row-${String(i).padStart(4, '0')}`, authorId: `author-${i % 7}`, status: 'active',
    geohash: encodeGeohash(location.latitude, location.longitude), location,
    createdAt: i, expiresAt: 100000 + i, likesCount: i % 13, dislikesCount: 0,
    categories: ['help'], ...extra };
}
async function index(rows, options = {}) {
  const namespace = `block-${randomUUID().slice(0, 8)}`;
  namespaces.push(namespace);
  const lab = createLabBlockIndex(db, { namespace, ...options });
  const seeded = await lab.seed(rows);
  return { lab, namespace, seeded };
}
const viewReads = new WeakMap();
async function page(view, token = view.first, work = { nodes: 32 }) {
  let result;
  do {
    result = await view.page(token, work);
    assert(result.metrics.nodeReads - (viewReads.get(view) ?? 0) <= work.nodes);
    viewReads.set(view, result.metrics.nodeReads);
  } while (result.state === 'preparing');
  return result;
}
const ids = rows => rows.map(row => row.id);
async function all(view) {
  const result = []; let cursor = view.first;
  while (cursor) { const next = await page(view, cursor, { nodes: 3 }); result.push(...next.rows); cursor = next.next; }
  return result;
}
function oracle(rows, c = {}) {
  const options = { point, radiusKm: 20, now, order: 'nearest', readIds: [], blocked: [], followed: [], lowRatedLast: true, ...c };
  const reads = new Set(options.readIds), blocked = new Set(options.blocked), followed = new Set(options.followed);
  const filtered = rows.filter(row => row.status === 'active' && row.expiresAt > options.now && row.createdAt <= options.now &&
    !blocked.has(row.authorId) && (!options.category || row.categories.includes(options.category)) &&
    (!row.businessSpotlight || row.businessHighlighted) && distanceKm(options.point, row.location) <= options.radiusKm);
  return filtered.sort((a, b) => {
    const low = options.order === 'popular' ? Number(lowRated(a)) - Number(lowRated(b)) : 0;
    const read = options.order === 'nearest' && options.unreadFirst ? Number(reads.has(a.id)) - Number(reads.has(b.id)) : 0;
    const follow = options.order === 'followed' ? Number(!followed.has(a.authorId)) - Number(!followed.has(b.authorId)) : 0;
    const primary = options.order === 'popular' ? b.likesCount - a.likesCount : options.order === 'endingSoon' ? a.expiresAt - b.expiresAt :
      distanceKm(options.point, a.location) - distanceKm(options.point, b.location);
    return low || read || follow || primary || b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
const metaReads = metrics => metrics.rootDocuments + metrics.emptyRootQueries + metrics.nodeReads;

async function directBaseline(lab, rows, unreadFirst = false) {
  // Same emulator fixture documents and same SDK queries as the direct-Shout
  // prototype. Only adapt numeric fixture times to its Timestamp input shape.
  const proxy = { collection: () => lab.base.collection('source'),
    runTransaction: (callback, options) => db.runTransaction(tx => callback({
      async get(query) {
        const result = await tx.get(query);
        return { docs: result.docs.map(doc => ({ id: doc.id, data: () => {
          const data = doc.data();
          return { ...data, createdAt: Timestamp.fromMillis(data.createdAt), expiresAt: Timestamp.fromMillis(data.expiresAt) };
        } })) };
      },
    }), options),
  };
  const repo = await openSpatialRepository(proxy);
  const view = spatialSession({ ...repo, uid: 'fixture', project: 'shoutout-rules-test', point,
    radiusKm: 20, unreadFirst, readIds: unreadFirst ? ids(rows) : [] });
  let result;
  do { result = await view.page(view.first, { queries: 100, candidates: 1000 }); } while (result.state === 'preparing');
  assert.deepEqual(ids(result.rows), ids(oracle(rows, { unreadFirst, readIds: unreadFirst ? ids(rows) : [] }).slice(0, 50)));
  return { ...result.metrics, snapshotReads: 1,
    metadataDocumentReads: result.metrics.candidates + result.metrics.emptyQueries + 1 };
}

test('300-row grid: cold/warm metadata reads, all modes and pages match complete reference', { skip: !enabled }, async t => {
  const rows = Array.from({ length: 300 }, (_, i) => fixture(i, {
    latitude: point.latitude + (i % 20) * .003, longitude: point.longitude + Math.floor(i / 20) * .004,
  }));
  const { lab, seeded } = await index(rows);
  const baseline = await directBaseline(lab, rows);
  const coldView = await lab.open({ point, radiusKm: 20, now });
  const cold = await page(coldView), hydration = await lab.hydrate(coldView, ids(cold.rows), now);
  const warm = await page(await lab.open({ point, radiusKm: 20, now }));
  assert.deepEqual(ids(cold.rows), ids(oracle(rows).slice(0, 50)));
  assert(hydration.items.every(item => item.available));
  assert(metaReads(cold.metrics) < 270);
  assert.equal(warm.metrics.nodeReads, 0);
  t.diagnostic(`BLOCK-BENCH ${JSON.stringify({ scenario: 'grid300', rows: 300, seeded, baseline,
    cold: cold.metrics, warm: warm.metrics, sourceReads: hydration.sourceReads, storage: await lab.inspect() })}`);
  for (const order of ['nearest', 'popular', 'endingSoon', 'followed']) {
    const c = { point, radiusKm: 20, now, order, unreadFirst: true, readIds: ids(rows.slice(0, 230)),
      blocked: ['author-2'], followed: ['author-4'] };
    const view = await lab.open(c), actual = await all(view);
    assert.deepEqual(ids(actual), ids(oracle(rows, c)), order);
    assert.equal(new Set(ids(actual)).size, actual.length);
    await assert.rejects(view.page({}), /invalid-index-cursor/);
  }
  // Shared blocks never contain the requesting user's identity or read history.
  const privateView = await lab.open({ point, radiusKm: 20, now, uid: 'reader-secret', readIds: ids(rows) });
  await page(privateView);
  const persisted = await lab.base.collection('nodes').get();
  assert(!JSON.stringify(persisted.docs.map(doc => doc.data())).includes('reader-secret'));
  assert(!JSON.stringify(persisted.docs.map(doc => doc.data())).includes('readIds'));
});

test('negative unread content retains spatial/time position and only Top demotes ratings', { skip: !enabled }, async () => {
  const negative = fixture(1, point, { likesCount: 1, dislikesCount: 99, expiresAt: 10000, authorId: 'followed-author' });
  const positive = fixture(2, { latitude: point.latitude + .005, longitude: point.longitude }, { likesCount: 30, expiresAt: 11000 });
  const read = fixture(3, point, { likesCount: 20, expiresAt: 9000 });
  const { lab } = await index([negative, positive, read]);
  for (const [order, expected] of [
    ['nearest', [negative.id, positive.id, read.id]],
    ['endingSoon', [read.id, negative.id, positive.id]],
    ['followed', [negative.id, read.id, positive.id]],
    ['popular', [positive.id, read.id, negative.id]],
  ]) {
    const view = await lab.open({ point, radiusKm: 20, now, order, unreadFirst: true,
      readIds: [read.id], followed: ['followed-author'] });
    assert.deepEqual(ids(await all(view)), expected, order);
  }
});

test('same-point all-read hotspot pays block reads rather than one metadata read per Shout', { skip: !enabled }, async t => {
  const rows = Array.from({ length: 75 }, (_, i) => fixture(i));
  const { lab, seeded } = await index(rows);
  const baseline = await directBaseline(lab, rows, true);
  const c = { point, radiusKm: 20, now, unreadFirst: true, readIds: ids(rows) };
  const view = await lab.open(c), cold = await page(view), warm = await page(await lab.open(c));
  assert.deepEqual(ids(cold.rows), ids(oracle(rows, c).slice(0, 50)));
  assert(metaReads(cold.metrics) < rows.length);
  assert.equal(warm.metrics.nodeReads, 0);
  t.diagnostic(`BLOCK-BENCH ${JSON.stringify({ scenario: 'allRead75', rows: 75, seeded, baseline,
    cold: cold.metrics, warm: warm.metrics, sourceReads: (await lab.hydrate(view, ids(cold.rows), now)).sourceReads,
    storage: await lab.inspect() })}`);
});

test('atomic mutations, rollback, old snapshots, movement and current-source hydration', { skip: !enabled }, async t => {
  const rows = Array.from({ length: 80 }, (_, i) => fixture(i));
  const { lab } = await index(rows);
  const original = await lab.open({ point, radiusKm: 20, now });
  const first = await page(original), selected = first.rows[0];
  const updated = { ...selected, likesCount: 999 };
  const reaction = await lab.mutate(selected.id, updated);
  const hydration = await lab.hydrate(original, [selected.id], now);
  assert.equal(hydration.items[0].row.likesCount, 999);
  const noop = await lab.mutate(selected.id, updated);
  assert.equal(noop.nodeWrites + noop.directoryWrites + noop.sourceWrites, 0);
  const before = await lab.inspect();
  await assert.rejects(lab.mutate(selected.id, { ...updated, likesCount: 2 }, {
    beforeCommit: () => { throw new Error('rollback-fixture'); },
  }), /rollback-fixture/);
  assert.deepEqual(await lab.inspect(), before);
  assert.equal((await lab.hydrate(original, [selected.id], now)).items[0].row.likesCount, 999);
  const deleted = await lab.mutate(selected.id, { ...updated, status: 'deleted' });
  assert.equal((await lab.hydrate(original, [selected.id], now)).items[0].available, false);
  const newRow = fixture(400);
  const created = await lab.mutate(newRow.id, newRow);
  const moved = { ...rows[0], location: { latitude: 0, longitude: -120 }, geohash: encodeGeohash(0, -120) };
  const move = await lab.mutate(moved.id, moved);
  const oldRows = [...first.rows]; let cursor = first.next;
  while (cursor) { const next = await page(original, cursor); oldRows.push(...next.rows); cursor = next.next; }
  assert.deepEqual(ids(oldRows), ids(oracle(rows)));
  const current = rows.filter(row => row.id !== selected.id && row.id !== moved.id).concat(newRow);
  assert.deepEqual(ids(await all(await lab.open({ point, radiusKm: 20, now }))), ids(oracle(current)));
  assert.equal((await lab.audit()).activeMetadata, 80);
  t.diagnostic(`BLOCK-WRITES ${JSON.stringify({ reaction, noop, deleted, created, move, retainedAfterUpdates: await lab.inspect() })}`);
});

test('concurrent same-cell inserts do not lose entries; expiry needs no index write for visibility', { skip: !enabled }, async () => {
  const { lab } = await index([fixture(1, point, { expiresAt: 550 })]);
  const changes = await Promise.all([lab.mutate(fixture(2).id, fixture(2)), lab.mutate(fixture(3).id, fixture(3))]);
  assert(changes.every(change => change.attempts >= 1));
  const view = await lab.open({ point, radiusKm: 20, now });
  assert.equal((await all(view)).length, 3);
  assert.equal((await lab.hydrate(view, [fixture(1).id], 551)).items[0].available, false);
  assert.equal((await all(await lab.open({ point, radiusKm: 20, now: 551 }))).length, 2);
});

test('directory snapshot stays consistent when a write occurs between the two dateline queries', { skip: !enabled }, async () => {
  const center = { latitude: 0, longitude: 179.9999 };
  const rows = [fixture(1, { latitude: 0, longitude: 179.999 }), fixture(2, { latitude: 0, longitude: -179.999 })];
  const { lab, namespace } = await index(rows);
  let inserted = false;
  const late = fixture(3, { latitude: 0, longitude: -179.999 });
  const proxy = { projectId: db.projectId, collection: name => db.collection(name), getAll: (...refs) => db.getAll(...refs),
    runTransaction: (callback, options) => db.runTransaction(tx => callback({
      async get(query) {
        const result = await tx.get(query);
        if (!inserted) { inserted = true; await lab.mutate(late.id, late); }
        return result;
      },
    }), options),
  };
  const snapshot = await createLabBlockIndex(proxy, { namespace }).open({ point: center, radiusKm: 5, now });
  assert.deepEqual(ids(await all(snapshot)).sort(), ids(rows).sort());
  assert.equal((await all(await lab.open({ point: center, radiusKm: 5, now }))).length, 3);
});

test('corrupt block fails closed without falling back to whole Shout scans', { skip: !enabled }, async () => {
  const { lab, namespace } = await index([fixture(1)]);
  const root = (await lab.base.collection('cells').get()).docs[0].data();
  await lab.base.collection('nodes').doc(root.hash).update({ 'summary.count': 999 });
  const fresh = createLabBlockIndex(db, { namespace, cache: blockCache() });
  const view = await fresh.open({ point, radiusKm: 20, now });
  await assert.rejects(page(view), /integrity/);
});

test('version diff skips unchanged blocks and distinguishes new posts from reaction updates', { skip: !enabled }, async t => {
  const rows = Array.from({ length: 160 }, (_, i) => fixture(i));
  const { lab } = await index(rows);
  const a = await lab.open({ point, radiusKm: 20, now });
  const unchanged = await lab.indexChanges(a, await lab.open({ point, radiusKm: 20, now }));
  assert.equal(unchanged.metrics.nodeReads, 0);
  assert.deepEqual(unchanged.added, []);
  const reaction = await lab.mutate(rows[10].id, { ...rows[10], likesCount: 500 });
  const b = await lab.open({ point, radiusKm: 20, now });
  const changed = await lab.indexChanges(a, b);
  assert.equal(changed.added.length, 0);
  assert.deepEqual(changed.updated.map(item => item.after.id), [rows[10].id]);
  assert(changed.metrics.metadataExamined < rows.length * 2);
  const newRow = fixture(400);
  await lab.mutate(newRow.id, newRow);
  const c = await lab.open({ point, radiusKm: 20, now });
  const publication = await lab.indexChanges(b, c);
  assert.deepEqual(ids(publication.added), [newRow.id]);
  t.diagnostic(`BLOCK-DELTA ${JSON.stringify({ reaction, reactionDelta: changed.metrics, publicationDelta: publication.metrics })}`);
});

test('category, rating and Business visibility update atomically and expiry is checked at hydration time', { skip: !enabled }, async () => {
  const row = fixture(1);
  const { lab } = await index([row]);
  const c = { point, radiusKm: 20, now, category: 'help' };
  const original = await lab.open(c);
  const recategorized = { ...row, categories: ['event'] };
  await lab.mutate(row.id, recategorized);
  assert.equal((await lab.hydrate(original, [row.id], now)).items[0].available, false);
  assert.equal((await all(await lab.open(c))).length, 0);
  const spotlight = { ...row, businessSpotlight: true, businessHighlighted: false };
  await lab.mutate(row.id, spotlight);
  assert.equal((await all(await lab.open(c))).length, 0);
  await lab.mutate(row.id, { ...spotlight, businessHighlighted: true, dislikesCount: 20 });
  assert.equal((await all(await lab.open(c))).length, 1);
  assert.equal((await lab.audit()).valid, true);
});

test('coverage audit detects a directory moved outside its correct grid window', { skip: !enabled }, async () => {
  const { lab } = await index([fixture(1)]);
  const directory = (await lab.base.collection('cells').get()).docs[0];
  await directory.ref.update({ latCell: 0 });
  await assert.rejects(lab.audit(), /invalid-index-directory/);
});
