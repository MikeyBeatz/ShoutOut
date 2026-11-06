import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createFeedRuntime, createFeedGenerationStore, feedRuntimeConfiguration, feedTransactionWriteBudget } from './feed_runtime.js';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { encodeGeohash } from './geohash.js';
import { canonical, metadataOf, treeBuilder } from './feed_block_index.js';
import { cellGrid } from './feed_block_index_store.js';
import { beginIndexGc } from './feed_index_gc_store.js';
import { runtimeIndexBinding } from './feed_index_paths.js';
import { prepareAccountDeletionOperation } from './prepare_account_deletion.js';
import { operationTestKey } from './test_helpers.js';
import { accountPurgeJobRef, accountRetentionMillis } from './account_purge_guard.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'feed-runtime-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const absent = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
const point = { latitude: 50.08, longitude: 14.44 };
function row(id, authorId, location = point) {
  return { id, authorId, location, geohash: encodeGeohash(location.latitude, location.longitude),
    status: 'active', createdAt: Date.now() - 1000, expiresAt: Date.now() + 3600000,
    categories: ['Dotaz'], likesCount: 0, dislikesCount: 0, title: 'Fixture title', text: 'Full body remains in source' };
}

async function fixture(t, { count = 2, generations = 2, separated = false } = {}) {
  const uid = randomUUID(), prefix = `rt-${uid.slice(0, 8)}-`, control = db.doc('feedIndexControl/current');
  assert.equal((await control.get()).exists, false);
  assert.equal((await db.collection('feedIndexGenerations').limit(1).get()).size, 0);
  assert.equal((await db.doc('feedIndexMaintenance/erasureQueue').get()).exists, false);
  const roots = [control, db.doc('feedIndexMaintenance/erasureQueue')], ids = [];
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  const rows = Array.from({ length: count }, (_, i) => row(prefix + String(i).padStart(3, '0'), uid,
    separated ? { latitude: -40 + i, longitude: 10 + i } : point));
  const sources = db.batch();
  for (const item of rows) {
    const ref = db.doc(`shouts/${item.id}`); roots.push(ref);
    sources.set(ref, { ...item, createdAt: Timestamp.fromMillis(item.createdAt), expiresAt: Timestamp.fromMillis(item.expiresAt) });
  }
  if (rows.length) await sources.commit();
  const register = async (input = rows) => {
    const id = `rtgen-${randomUUID().slice(0, 8)}`, base = db.doc(`feedIndexGenerations/${id}`); roots.push(base); ids.push(id);
    const regions = new Map(), builder = treeBuilder();
    input.map(metadataOf).forEach(item => {
      const cell = item.geohash.slice(0, 4); if (!regions.has(cell)) regions.set(cell, []); regions.get(cell).push(item);
    });
    const descriptors = [...regions].map(([cell, items]) => [cell, builder.build(items, cell)]);
    const batch = db.batch(); batch.create(base, { schemaVersion: 1, v: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
    for (const [key, node] of builder.writes) batch.create(base.collection('nodes').doc(key), node);
    for (const [cell, node] of descriptors) batch.create(base.collection('cells').doc(cell), {
      v: 1, hash: node.hash, minExpiry: node.minExpiry, revision: 1, ...cellGrid(cell),
    });
    await batch.commit(); return id;
  };
  for (let i = 0; i < generations; i++) await register();
  let revision = 0;
  const activate = () => control.set({ schemaVersion: 1, revision: revision++, mode: ids.length === 1 ? 'active' : 'building',
    readGenerationId: ids[0], writeGenerationIds: [...ids] });
  if (ids.length) await activate();
  const f = { uid, prefix, rows, roots, ids, control, register, activate, now: Date.now() + 1000 };
  f.runtime = () => createFeedRuntime(db, absent, { enabled: true, clock: () => new Date(f.now) });
  f.snapshot = async () => canonical(await Promise.all(ids.map(async id => {
    const ref = db.doc(`feedIndexGenerations/${id}`), records = {};
    for (const name of ['cells', 'nodes', 'retiredRoots']) records[name] = (await ref.collection(name).get()).docs.map(doc => ({
      id: doc.id, data: doc.data(), updateTime: [doc.updateTime.seconds, doc.updateTime.nanoseconds],
    }));
    return records;
  })));
  return f;
}

test('runtime defaults off with zero database access and rejects enabled production', () => {
  const unusable = new Proxy({}, { get() { throw new Error('unexpected-database-access'); } });
  const runtime = createFeedRuntime(unusable, null);
  assert.equal(feedRuntimeConfiguration.enabled, false); assert.equal(runtime.enabled, false);
  assert.equal(runtime.database, unusable);
  for (const option of ['indexWriter', 'earlyErasureQueue', 'indexErasureCoordinator']) assert.equal(runtime[option], null);
  assert.throws(() => createFeedRuntime({ projectId: 'shoutout-production-a1b34' }, absent, { enabled: true }), /dev-project-required/);
  assert.throws(() => createFeedRuntime({}, absent, { enabled: 'true' }), /invalid-feed-runtime-enabled/);
  assert.throws(() => createLabBlockIndex({ projectId: 'shoutout-dev-46c81' }, { namespace: 'fixture' }), /emulator-only/);
});

test('runtime interface uses actual generation paths and excludes fixture mutation/time hooks', { skip: !enabled }, async t => {
  const f = await fixture(t), store = createFeedGenerationStore(db, f.ids[0]), runtime = f.runtime();
  assert.equal(store.base.path, `feedIndexGenerations/${f.ids[0]}`);
  assert.equal(runtime.earlyErasureQueue.base.path, 'feedIndexMaintenance/erasureQueue');
  assert.equal(typeof runtime.indexWriter.prepare, 'function'); assert.equal(typeof runtime.indexErasureCoordinator.prepareFinish, 'function');
  for (const name of ['seed', 'mutate', 'beginGc', 'beginExpiryPrune', 'inspect', 'audit']) assert.equal(store[name], undefined);
  await assert.rejects(db.runTransaction(tx => runtime.indexWriter.prepareBatch(tx, [])), /budgeted-transaction-required/);
  await assert.rejects(beginIndexGc(db, runtimeIndexBinding(db, f.ids[0]), f.rows[0].geohash.slice(0, 4),
    { testTimeAdvanceMillis: 3600000 }), /gc-test-clock-emulator-only/);
});

test('one source change updates two generations atomically and a cold snapshot retains its earlier rows', { skip: !enabled }, async t => {
  const f = await fixture(t), runtime = f.runtime(), before = await db.doc(`shouts/${f.rows[0].id}`).get();
  const old = await createFeedGenerationStore(db, f.ids[0]).open({ point, radiusKm: 5, now: f.now });
  const after = { ...before.data(), likesCount: 3 };
  await runtime.database.runTransaction(async tx => {
    const source = await tx.get(before.ref);
    const plan = await runtime.indexWriter.prepare(tx, before.id, source.data(), after, { operationId: randomUUID() });
    assert.equal(plan.generations, 2); plan.apply(); tx.update(source.ref, { likesCount: 3 });
  });
  assert.equal((await before.ref.get()).get('likesCount'), 3);
  for (const id of f.ids) {
    const current = await createFeedGenerationStore(db, id).open({ point, radiusKm: 5, now: f.now });
    assert.equal((await current.page(current.first)).rows.find(item => item.id === before.id).likesCount, 3);
  }
  assert.equal((await old.page(old.first)).rows.find(item => item.id === before.id).likesCount, 0);
});

test('50-item account preparation and exact retry retain the existing client result contract in two generations', { skip: !enabled }, async t => {
  const f = await fixture(t, { count: 50 }), runtime = f.runtime(), user = db.doc(`users/${f.uid}`); f.roots.push(user);
  await user.set({ nickname: 'Runtime fixture' }); await user.collection('legal').doc('acceptance_2026_07_25').set({});
  const key = operationTestKey(randomUUID(), new Date(f.now));
  const receipt = db.doc(`serverOperations/${createHash('sha256').update(`${f.uid}\nprepareAccountDeletion\n${key}`).digest('hex')}`); f.roots.push(receipt);
  const request = { auth: { uid: f.uid, token: { email: 'runtime@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { expectedUserId: f.uid, idempotencyKey: key } };
  let loseAck = true;
  const lostResponse = new Proxy(runtime.database, { get(target, property) {
    if (property === 'runTransaction') return async (...args) => {
      const result = await target.runTransaction(...args);
      if (loseAck) { loseAck = false; throw Object.assign(new Error('simulated-lost-response'), { code: 'unavailable' }); }
      return result;
    };
    return typeof target[property] === 'function' ? target[property].bind(target) : target[property];
  } });
  const operation = () => prepareAccountDeletionOperation(request, lostResponse, () => new Date(f.now), { indexWriter: runtime.indexWriter });
  await assert.rejects(operation(), /simulated-lost-response/);
  assert.equal((await receipt.get()).get('result').hidden, 50);
  const snapshot = await f.snapshot(), receiptTime = (await receipt.get()).updateTime;
  assert.deepEqual(await operation(), { hidden: 50, hasMore: true });
  assert.equal(await f.snapshot(), snapshot); assert((await receipt.get()).updateTime.isEqual(receiptTime));
  for (const id of f.ids) assert.equal((await db.doc(`feedIndexGenerations/${id}`).collection('cells').get()).size, 0);
  assert.equal((await db.doc(`shouts/${f.rows[0].id}`).get()).get('text'), 'Full body remains in source');
});

test('concurrent source updates retry against current roots and keep both generations consistent', { skip: !enabled }, async t => {
  const f = await fixture(t), ref = db.doc(`shouts/${f.rows[0].id}`);
  const update = async field => {
    const runtime = f.runtime(), operationId = randomUUID();
    return runtime.database.runTransaction(async tx => {
      const source = await tx.get(ref), next = { ...source.data(), [field]: source.get(field) + 1 };
      const plan = await runtime.indexWriter.prepare(tx, ref.id, source.data(), next, { operationId });
      plan.apply(); tx.update(ref, { [field]: next[field] });
    });
  };
  await Promise.all([update('likesCount'), update('dislikesCount')]);
  const source = (await ref.get()).data(); assert.equal(source.likesCount, 1); assert.equal(source.dislikesCount, 1);
  for (const id of f.ids) {
    const view = await createFeedGenerationStore(db, id).open({ point, radiusKm: 5, now: f.now });
    const item = (await view.page(view.first)).rows.find(item => item.id === ref.id);
    assert.equal(item.likesCount, 1); assert.equal(item.dislikesCount, 1);
  }
});

test('paused mode maintains writers; off mode refuses retained generations and permits an empty registry', { skip: !enabled }, async t => {
  const f = await fixture(t), runtime = f.runtime();
  await f.control.set({ schemaVersion: 1, revision: 1, mode: 'paused', readGenerationId: null, writeGenerationIds: [...f.ids] });
  const paused = await runtime.database.runTransaction(tx => runtime.indexWriter.prepareBatch(tx, [])); assert.equal(paused.generations, 2);
  await f.control.set({ schemaVersion: 1, revision: 2, mode: 'off', readGenerationId: null, writeGenerationIds: [] });
  await assert.rejects(runtime.database.runTransaction(tx => runtime.indexWriter.prepareBatch(tx, [])), /off-with-maintained-generations/);
  for (const id of f.ids) await db.recursiveDelete(db.doc(`feedIndexGenerations/${id}`));
  const off = await runtime.database.runTransaction(tx => runtime.indexWriter.prepareBatch(tx, [])); assert.equal(off.generations, 0);
});

test('combined generation budget rejects a too-large plan without source, index or receipt changes', { skip: !enabled }, async t => {
  const f = await fixture(t, { count: 50, generations: 5, separated: true }), runtime = f.runtime(), snapshot = await f.snapshot();
  const originals = await db.getAll(...f.rows.map(item => db.doc(`shouts/${item.id}`)));
  const receipt = db.doc(`serverOperations/${randomUUID()}`); f.roots.push(receipt);
  await assert.rejects(runtime.database.runTransaction(async tx => {
    const plan = await runtime.indexWriter.prepareBatch(tx, originals.map(doc => ({ id: doc.id, before: doc.data(), after: { ...doc.data(), status: 'deleted' } })),
      { operationId: randomUUID(), additionalWrites: 1 });
    plan.apply(); originals.forEach(doc => tx.update(doc.ref, { status: 'deleted' })); tx.create(receipt, { success: true });
  }), /feed-transaction-write-budget-exceeded/);
  assert.equal(await f.snapshot(), snapshot); assert.equal((await receipt.get()).exists, false);
  for (const original of originals) assert((await original.ref.get()).updateTime.isEqual(original.updateTime));
});

test('shared budget also includes later caller writes and rollback preserves all prior queued mutations', { skip: !enabled }, async t => {
  const f = await fixture(t), runtime = f.runtime(), snapshot = await f.snapshot(), original = await db.doc(`shouts/${f.rows[0].id}`).get();
  const marker = db.doc(`serverOperations/${randomUUID()}`); f.roots.push(marker);
  await assert.rejects(runtime.database.runTransaction(async tx => {
    const plan = await runtime.indexWriter.prepare(tx, original.id, original.data(), { ...original.data(), likesCount: 1 }, { operationId: randomUUID() });
    plan.apply(); tx.update(original.ref, { likesCount: 1 });
    // A caller catching the immediate error still cannot commit the queued
    // prefix. The outer transaction fence rethrows before commit.
    try { for (let i = 0; i < feedTransactionWriteBudget; i++) tx.set(marker, { i }); } catch { /* Deliberately swallowed in fixture. */ }
  }), /feed-transaction-write-budget-exceeded/);
  assert.equal(await f.snapshot(), snapshot); assert.equal((await marker.get()).exists, false);
  assert((await original.ref.get()).updateTime.isEqual(original.updateTime));
});

test('failure after all plans apply rolls back every generation and an exact replay can commit once', { skip: !enabled }, async t => {
  const f = await fixture(t), snapshot = await f.snapshot(), original = await db.doc(`shouts/${f.rows[0].id}`).get();
  const key = randomUUID();
  const attempt = async fail => {
    const runtime = f.runtime();
    return runtime.database.runTransaction(async tx => {
      const doc = await tx.get(original.ref);
      const plan = await runtime.indexWriter.prepare(tx, doc.id, doc.data(), { ...doc.data(), likesCount: 4 }, { operationId: key });
      plan.apply(); tx.update(doc.ref, { likesCount: 4 }); if (fail) throw new Error('simulated-crash');
    });
  };
  await assert.rejects(attempt(true), /simulated-crash/); assert.equal(await f.snapshot(), snapshot);
  await attempt(false); assert.equal((await original.ref.get()).get('likesCount'), 4);
});

test('missing/malformed control and unavailable generation never fall back to unindexed writes', { skip: !enabled }, async t => {
  const f = await fixture(t), runtime = f.runtime();
  const attempt = () => runtime.database.runTransaction(tx => runtime.indexWriter.prepareBatch(tx, []));
  await f.control.delete(); await assert.rejects(attempt(), /control-required/);
  await f.control.set({ schemaVersion: 1 }); await assert.rejects(attempt(), /invalid-feed-index-control/);
  await f.activate(); await db.doc(`feedIndexGenerations/${f.ids[1]}`).update({ accountRetention: false });
  await assert.rejects(attempt(), /generation-unavailable/);
});

test('early queue survives cold restart on actual generation paths and produces proof consumed by final coordinator', { skip: !enabled }, async t => {
  const f = await fixture(t), request = db.doc(`accountDeletionRequests/${f.uid}`), profile = db.doc(`publicProfiles/${f.uid}`);
  f.roots.push(request, profile);
  await request.set({ userId: f.uid, status: 'pending' }); const created = (await request.get()).createTime;
  f.now = Math.ceil(created.toMillis()) + 1000;
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(f.now - 1) });
  await profile.set({ schemaVersion: 1, accountStatus: 'deleted' });
  const identity = { projectId: db.projectId, userId: f.uid, requestCreateTime: created };
  const unchanged = await db.getAll(request, ...f.rows.map(item => db.doc(`shouts/${item.id}`)));
  await f.runtime().earlyErasureQueue.enqueue(identity);
  let result;
  for (let i = 0; i < 100; i++) {
    result = await f.runtime().earlyErasureQueue.run(identity);
    if (result.state === 'complete') break;
    f.now += 60001;
  }
  assert.equal(result.state, 'complete');
  const runtime = f.runtime(), proof = await runtime.earlyErasureQueue.verify(identity);
  assert(proof.valid); assert.equal(proof.generations, 2);
  assert.equal(proof.retainUntil.toMillis(), created.toMillis() + accountRetentionMillis);
  for (const id of f.ids) assert.equal((await db.doc(`feedIndexGenerations/${id}`).collection('cells').get()).size, 0);
  for (const original of unchanged) assert((await original.ref.get()).updateTime.isEqual(original.updateTime));
  // Exercise the coordinator with the actual outer transaction guard shape.
  f.now = Math.ceil(created.toMillis() + accountRetentionMillis) + 1000;
  const purge = accountPurgeJobRef(db, identity); f.roots.push(purge);
  await purge.set({ phase: 'purging', userId: f.uid, requestCreateTime: created, retainUntil: proof.retainUntil,
    leaseToken: 'runtime-test-lease', leaseUntil: Timestamp.fromMillis(f.now + 120000) });
  const guard = async tx => ({ job: (await tx.get(purge)).data() });
  let step;
  for (let i = 0; i < 5; i++) {
    step = await f.runtime().indexErasureCoordinator.step(identity, { guard, limit: 1 });
    if (step.state === 'ready') break;
  }
  assert.equal(step.state, 'ready');
  const final = f.runtime();
  await final.database.runTransaction(async tx => {
    const plan = await final.indexErasureCoordinator.prepareFinish(tx, identity, { guard }); plan.apply(); tx.delete(request); tx.delete(purge);
  });
  assert.equal((await final.earlyErasureQueue.jobFor(identity).get()).exists, false);
  assert.equal((await request.get()).exists, false);
});
