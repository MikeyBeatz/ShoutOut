import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { getFeedPageOperation } from './get_feed_page.js';
import { createFeedRuntime } from './feed_runtime.js';
import { metadataOf, treeBuilder } from './feed_block_index.js';
import { cellGrid } from './feed_block_index_store.js';
import { encodeGeohash } from './geohash.js';
import { feedCursorCodec } from './feed_cursor.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'feed-page-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const point = { latitude: 50.08, longitude: 14.44 };
const context = { point, radiusKm: 5, order: 'nearest', category: null };

async function fixture(t, count = 120) {
  const uid = randomUUID(), generation = `page-${uid.slice(0, 8)}`, roots = [], key = randomBytes(32);
  const control = db.doc('feedIndexControl/current'), base = db.doc(`feedIndexGenerations/${generation}`);
  assert.equal((await control.get()).exists, false); assert.equal((await db.collection('feedIndexGenerations').limit(1).get()).size, 0);
  roots.push(control, base); t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  const profile = db.doc(`users/${uid}`); roots.push(profile);
  await profile.set({ nickname: 'Page fixture' }); await profile.collection('legal').doc('acceptance_2026_07_25').set({});
  const now = Date.now(), rows = Array.from({ length: count }, (_, i) => {
    const location = { latitude: point.latitude + i * .0001, longitude: point.longitude };
    return { id: `${uid}-${String(i).padStart(3, '0')}`, authorId: `${uid}-author-${i % 3}`, authorNickname: `Author ${i % 3}`,
      title: `Title ${i}`, text: `Full body ${i}`, status: 'active', location,
      geohash: encodeGeohash(location.latitude, location.longitude), createdAt: now - 1000, expiresAt: now + 7200000,
      categories: [i % 2 ? 'Dotaz' : 'Pomoc'], likesCount: i % 7, dislikesCount: 0, commentsCount: 0, savesCount: 0,
      privateFixture: 'Must not be returned', geography: { countryCode: 'CZ', internalFixture: 'Never public' } };
  });
  const batch = db.batch(), regions = new Map(), builder = treeBuilder();
  for (const row of rows) {
    const ref = db.doc(`shouts/${row.id}`); roots.push(ref);
    batch.set(ref, { ...row, location: new GeoPoint(row.location.latitude, row.location.longitude),
      createdAt: Timestamp.fromMillis(row.createdAt), expiresAt: Timestamp.fromMillis(row.expiresAt) });
    const metadata = metadataOf(row), cell = row.geohash.slice(0, 4);
    if (!regions.has(cell)) regions.set(cell, []); regions.get(cell).push(metadata);
  }
  batch.create(base, { schemaVersion: 1, v: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
  for (const [cell, items] of regions) {
    const descriptor = builder.build(items, cell);
    batch.create(base.collection('cells').doc(cell), { v: 1, hash: descriptor.hash, minExpiry: descriptor.minExpiry, revision: 1, ...cellGrid(cell) });
  }
  for (const [hash, node] of builder.writes) batch.create(base.collection('nodes').doc(hash), node);
  batch.create(control, { schemaVersion: 1, revision: 0, mode: 'active', readGenerationId: generation, writeGenerationIds: [generation] });
  await batch.commit();
  const f = { uid, generation, roots, rows, profile, base, control, key, now: now + 10 };
  f.request = data => ({ auth: { uid, token: { email: 'page@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { expectedUserId: uid, ...data } });
  f.step = (data = { context }, options = {}) => getFeedPageOperation(f.request(data), db,
    { key, clock: () => new Date(f.now), ...options });
  f.page = async (data = { context }, options = {}) => {
    for (let i = 0; i < 32; i++) {
      const result = await f.step(data, options);
      if (result.state === 'ready') return result;
      assert.equal(result.items.length, 0); assert(result.next); data = { cursor: result.next };
    }
    assert.fail('Fixture exceeded its bounded page work');
  };
  return f;
}

test('page operation rejects missing Auth/App Check before accessing data', async () => {
  const database = { projectId: 'shoutout-dev-46c81', doc() { assert.fail('Unexpected database access'); } };
  await assert.rejects(getFeedPageOperation({}, database, { key: randomBytes(32) }), { code: 'unauthenticated' });
  await assert.rejects(getFeedPageOperation({ auth: { uid: 'fixture' } }, database, { key: randomBytes(32) }), { code: 'unauthenticated' });
});

test('real index pages return 50, 50, 20 ordered full cards and no internal source fields', { skip: !enabled }, async t => {
  const f = await fixture(t), ids = []; let next = null;
  for (const size of [50, 50, 20]) {
    const page = await f.page(next ? { cursor: next } : { context });
    assert.equal(page.items.length, size); ids.push(...page.items.map(item => item.id)); next = page.next;
    for (const item of page.items) {
      assert.equal(typeof item.data.title, 'string'); assert.equal(typeof item.data.text, 'string');
      assert.equal(typeof item.data.createdAt, 'number'); assert.equal(item.data.privateFixture, undefined);
      assert.deepEqual(item.data.geography, { countryCode: 'CZ' });
    }
  }
  assert.equal(next, null); assert.equal(new Set(ids).size, 120); assert.deepEqual(ids, f.rows.map(row => row.id));
});

test('cold continuation and replay keep one snapshot while a refresh discovers a new closer Shout', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await f.page(), source = { ...f.rows[0], id: `${f.uid}-new`,
    location: { latitude: point.latitude, longitude: point.longitude + .000001 }, title: 'New closer Shout' };
  source.geohash = encodeGeohash(source.location.latitude, source.location.longitude);
  const ref = db.doc(`shouts/${source.id}`); f.roots.push(ref);
  const runtime = createFeedRuntime(db, { getUser() {} }, { enabled: true });
  await runtime.database.runTransaction(async tx => {
    const body = { ...source, location: new GeoPoint(source.location.latitude, source.location.longitude),
      createdAt: Timestamp.fromMillis(source.createdAt), expiresAt: Timestamp.fromMillis(source.expiresAt) };
    const plan = await runtime.indexWriter.prepare(tx, ref.id, null, body, { operationId: randomUUID() }); plan.apply(); tx.create(ref, body);
  });
  const second = await f.page({ cursor: first.next }), replay = await f.page({ cursor: first.next });
  assert.deepEqual(second, replay); assert.equal(second.baseline, first.baseline);
  assert(!second.items.some(item => item.id === source.id));
  const refreshed = await f.page(); assert(refreshed.items.some(item => item.id === source.id));
  assert.notEqual(refreshed.baseline, first.baseline);
});

test('bounded preparing checkpoints never look like an empty completed feed', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await f.step({ context }, { workNodes: 1 });
  assert.equal(first.state, 'preparing'); assert.deepEqual(first.items, []); assert(first.next);
  const ready = await f.page({ cursor: first.next }, { workNodes: 1 });
  assert.equal(ready.items.length, 50); assert.equal(ready.baseline, first.baseline);
});

test('current block and source availability filter bodies without a false end or index/source mutations', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await f.page();
  const source = db.doc(`shouts/${f.rows[50].id}`); await source.update({ status: 'deleted' });
  await f.profile.collection('blocked').doc(f.rows[51].authorId).set({ createdAt: Timestamp.now() });
  const before = await db.getAll(f.base, f.control, source);
  const page = await f.page({ cursor: first.next }); assert(page.next); assert(page.items.length < 50);
  assert(page.items.every(item => item.id !== source.id && item.data.authorId !== f.rows[51].authorId));
  for (const original of before) assert((await original.ref.get()).updateTime.isEqual(original.updateTime));
});

test('filters and following are server-controlled; client-supplied private lists and modified cursors fail', { skip: !enabled }, async t => {
  const f = await fixture(t), followed = f.rows[2].authorId;
  await f.profile.collection('following').doc(followed).set({});
  const page = await f.page({ context: { ...context, category: 'Pomoc', order: 'followed' } });
  assert(page.items.every(item => item.data.categories.includes('Pomoc'))); assert.equal(page.items[0].data.authorId, followed);
  for (const invalid of [{ ...context, blocked: [] }, { ...context, radiusKm: 2 }, { ...context, point: { latitude: 91, longitude: 14 } }]) {
    await assert.rejects(f.step({ context: invalid }), { code: 'invalid-argument' });
  }
  const first = await f.page();
  await assert.rejects(f.step({ cursor: first.next + 'x' }), { code: 'invalid-argument' });
  await assert.rejects(f.step({ cursor: first.next, context }), { code: 'invalid-argument' });
  const alien = f.request({ cursor: first.next }); alien.auth.uid = randomUUID(); alien.data.expectedUserId = alien.auth.uid;
  await assert.rejects(getFeedPageOperation(alien, db, { key: f.key }), { code: 'invalid-argument' });
});

test('expired or replaced generation asks for refresh and paused control stops reads', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await f.page(); f.now = first.expiresAt;
  await assert.rejects(f.step({ cursor: first.next }), error => error.code === 'failed-precondition' && error.details.reason === 'feed-session-expired');
  f.now -= 1000; const marker = (await f.base.get()).data(); await f.base.delete(); await f.base.set(marker);
  await assert.rejects(f.step({ cursor: first.next }), { code: 'failed-precondition' });
  await f.control.update({ mode: 'paused', readGenerationId: null }); await assert.rejects(f.step(), { code: 'unavailable' });
});

test('deleted author metadata cannot be returned inside a newly issued preparing token', { skip: !enabled }, async t => {
  const f = await fixture(t); let page = await f.step({ context }, { workNodes: 1 }), buffered;
  const codec = feedCursorCodec({ key: f.key });
  for (let i = 0; i < 20 && page.state === 'preparing'; i++) {
    const decoded = codec.decode(page.next, { uid: f.uid, project: db.projectId, now: f.now });
    buffered = [...(decoded.position.pending ?? []), ...(decoded.position.candidates ?? [])];
    if (buffered.length) break;
    page = await f.step({ cursor: page.next }, { workNodes: 1 });
  }
  assert(buffered?.length, 'Fixture must expose the preparing-cursor branch');
  const profile = db.doc(`publicProfiles/${buffered[0].authorId}`); f.roots.push(profile);
  await profile.set({ schemaVersion: 1, accountStatus: 'deleted' });
  await assert.rejects(f.step({ cursor: page.next }, { workNodes: 1 }), { code: 'failed-precondition' });
});

test('pending deletion or an active ban rejects the reader', { skip: !enabled }, async t => {
  const f = await fixture(t, 2), request = db.doc(`accountDeletionRequests/${f.uid}`), ban = db.doc(`bans/${f.uid}`); f.roots.push(request, ban);
  await request.set({ userId: f.uid, status: 'pending' }); await assert.rejects(f.step(), { code: 'failed-precondition' });
  await request.delete(); await ban.set({ reason: 'fixture' }); await assert.rejects(f.step(), { code: 'permission-denied' });
});
