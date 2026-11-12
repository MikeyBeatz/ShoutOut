// Small, bounded correctness/operation probes. NEVER a cloud throughput benchmark.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { createShoutOperation } from './create_shout.js';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';
import { syncReadBatchOperation, getReadStatePageOperation } from './read_sync.js';
import { readContentHash } from './read_sync_blocks.js';
import { runOperationReceiptCleanup } from './cleanup_operation_receipts.js';
import { operationRetryWindowMillis } from './operation_retention.js';
import { operationTestKey } from './test_helpers.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'capacity-probes') : null;
const db = app ? getFirestore(app) : null, roots = [], actorIds = [];
const now = new Date('2026-11-12T12:00:00Z'), clock = () => now;
const point = { latitude: 50.08, longitude: 14.44 }, signingKey = new Uint8Array(32).fill(11);
after(async () => {
  if (!db) return;
  for (const uid of actorIds) {
    const receipts = await db.collection('serverOperations').where('userId', '==', uid).get();
    if (receipts.size) { const batch = db.batch(); receipts.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); }
  }
  for (const ref of roots) await db.recursiveDelete(ref);
  await db.terminate(); await deleteApp(app);
});

// Counts actual SDK transaction attempts (including retries), point reads,
// query result docs (empty query minimum 1), and mutations. Not billed index
// entries, RPCs, bytes, notification listeners or deployment resource costs.
function measured(database, remap = path => database.doc(path)) {
  const stats = { reads: 0, attemptedWrites: 0, committedWrites: 0, attempts: 0, commits: 0 };
  const count = value => { stats.reads += Array.isArray(value) ? value.length : value.docs ? Math.max(1, value.size) : 1; return value; };
  const wrapper = new Proxy(database, { get(target, method) {
    if (method === 'doc') return remap;
    if (method === 'getAll') return async (...args) => count(await target.getAll(...args));
    if (method === 'runTransaction') return async (operation, ...options) => {
      let finalWrites = 0;
      const result = await target.runTransaction(async tx => {
        stats.attempts++; let writes = 0;
        const observed = new Proxy(tx, { get(real, key) {
          if (key === 'get' || key === 'getAll') return async (...args) => count(await real[key](...args));
          if (['set', 'update', 'create', 'delete'].includes(key)) return (...args) => {
            stats.attemptedWrites++; writes++; real[key](...args); return observed;
          };
          return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
        } });
        const value = await operation(observed); finalWrites = writes; return value;
      }, ...options);
      stats.commits++; stats.committedWrites += finalWrites; return result;
    };
    return typeof target[method] === 'function' ? target[method].bind(target) : target[method];
  } });
  return { db: wrapper, stats };
}
function trace(label, stats, started) {
  console.log('CAPACITY_EMULATOR_TRACE ' + JSON.stringify({ label, ...stats,
    retries: stats.attempts - stats.commits, elapsedMillisLocal: Math.round(performance.now() - started),
    usersInCloudLoadTest: 0, authAccountsCreated: 0 }));
}
function reset(stats) { for (const key of Object.keys(stats)) stats[key] = 0; }
async function actor() {
  const uid = randomUUID(); actorIds.push(uid);
  const user = db.doc(`users/${uid}`); roots.push(user, db.doc(`rateLimits/${uid}`));
  await user.set({ nickname: 'Capacity', avatarId: 'avatar_01', avatarBackgroundStart: 1,
    avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
  await user.collection('legal').doc('acceptance_2026_07_25').set({});
  return { uid, user, request(data) { return { auth: { uid, token: { email: 'capacity@example.test', email_verified: true } },
    app: { appId: 'fixture' }, data: { expectedUserId: uid, ...data } }; } };
}
async function indexFixture() {
  const namespace = `capacity-${randomUUID().slice(0, 8)}`, lab = createLabBlockIndex(db, { namespace });
  roots.push(lab.base); await lab.seed([]);
  const m = measured(db, path => path.startsWith('shouts/') ? lab.base.collection('source').doc(path.slice(7)) : db.doc(path));
  return { lab, m, options: { indexWriter: lab } };
}
const publish = (f, a, i) => createShoutOperation(a.request({ title: `Capacity ${i}`, text: 'Full source',
  categories: ['Dotaz'], durationMinutes: 120, location: point,
  idempotencyKey: operationTestKey(`capacity-create-${i}`, now) }), f.m.db, clock, f.options);
async function rows(lab, order = 'nearest') {
  const view = await lab.open({ point, radiusKm: 5, order, now: now.getTime() });
  return (await view.page(view.first)).rows;
}

test('capacity probe: concurrent publishers in one cell preserve all rows and the earlier snapshot', { skip: !enabled }, async () => {
  const f = await indexFixture(), actors = await Promise.all(Array.from({ length: 4 }, actor));
  await publish(f, await actor(), 'initial');
  const old = await f.lab.open({ point, radiusKm: 5, now: now.getTime() });
  reset(f.m.stats);
  const started = performance.now();
  const created = await Promise.all(actors.map((a, i) => publish(f, a, i)));
  assert.equal(new Set(created.map(r => r.shoutId)).size, 4);
  assert.equal((await rows(f.lab)).length, 5);
  assert.equal((await old.page(old.first)).rows.length, 1);
  assert.equal((await f.lab.audit()).activeMetadata, 5);
  assert.equal((await f.lab.base.collection('cells').get()).size, 1);
  trace('same-cell-publication', f.m.stats, started);
});

test('capacity probe: independent accounts on one Shout keep counters, index and duplicate receipts consistent', { skip: !enabled }, async () => {
  const f = await indexFixture(), author = await actor(), actors = await Promise.all(Array.from({ length: 4 }, actor));
  const { shoutId } = await publish(f, author, 'reaction');
  reset(f.m.stats);
  const started = performance.now();
  const requests = actors.map((a, i) => a.request({ shoutId, button: 'like',
    idempotencyKey: operationTestKey(`capacity-react-${i}`, now) }));
  const results = await Promise.all(requests.map(r => toggleShoutReactionOperation(r, f.m.db, clock, f.options)));
  assert(results.every(r => r.type === 'like'));
  const before = { ...f.m.stats };
  await Promise.all(requests.map(r => toggleShoutReactionOperation(r, f.m.db, clock, f.options)));
  assert.equal(f.m.stats.committedWrites, before.committedWrites);
  const source = await f.lab.base.collection('source').doc(shoutId).get();
  assert.equal(source.get('likesCount'), 4); assert.equal(source.get('dislikesCount'), 0);
  assert.equal((await source.ref.collection('reactions').get()).size, 4);
  assert.equal((await rows(f.lab, 'popular'))[0].likesCount, 4);
  for (const a of actors) assert.equal((await db.collection('serverOperations').where('userId', '==', a.uid).get()).size, 1);
  assert.equal((await f.lab.audit()).activeMetadata, 1);
  trace('same-shout-reaction-and-replay', f.m.stats, started);
});

test('capacity probe: two devices share a UID revision without leaking read history to another account', { skip: !enabled }, async () => {
  const a = await actor(), b = await actor(), author = await actor();
  const readClock = () => new Date(); // Cursor readTime is the real emulator clock.
  const items = [];
  for (let i = 0; i < 4; i++) {
    const ref = db.collection('shouts').doc(); roots.push(ref);
    const title = `Read ${i}`, text = 'Capacity content', expiresAt = Date.now() + 3600000;
    await ref.set({ authorId: author.uid, title, text, status: 'active', expiresAt: Timestamp.fromMillis(expiresAt) });
    items.push({ shoutId: ref.id, contentHash: readContentHash(title, text), expiresAt });
  }
  const m = measured(db), started = performance.now();
  await Promise.all([
    syncReadBatchOperation(a.request({ items: items.slice(0, 2) }), m.db, { clock: readClock }),
    syncReadBatchOperation(a.request({ items: items.slice(1, 3) }), m.db, { clock: readClock }),
    syncReadBatchOperation(b.request({ items: [items[3]] }), m.db, { clock: readClock }),
  ]);
  const download = a => getReadStatePageOperation(a.request({}), m.db, { key: signingKey, clock: readClock, pageSize: 32 });
  const [first, other] = await Promise.all([download(a), download(b)]);
  assert.deepEqual(first.items.map(r => r.shoutId).sort(), items.slice(0, 3).map(r => r.shoutId).sort());
  assert.deepEqual(other.items.map(r => r.shoutId), [items[3].shoutId]);
  assert.equal(first.revision, 2); assert.equal(other.revision, 1);
  const before = m.stats.committedWrites;
  await syncReadBatchOperation(a.request({ items: items.slice(0, 3) }), m.db, { clock: readClock });
  assert.equal(m.stats.committedWrites, before);
  trace('per-uid-read-sync', m.stats, started);
});

test('capacity probe: more than one daily receipt budget survives a cold restart and preserves fresh or unknown data', { skip: !enabled }, async () => {
  const base = db.collection('cleanupTestScopes').doc(randomUUID()); roots.push(base);
  const collection = base.collection('serverOperations'), checkpoint = base.collection('maintenanceState').doc('operationReceiptCleanup');
  const old = Timestamp.fromMillis(now.getTime() - operationRetryWindowMillis);
  for (let offset = 0; offset < 503; offset += 250) {
    const batch = db.batch();
    for (let i = offset; i < Math.min(503, offset + 250); i++) batch.set(collection.doc(`old-${String(i).padStart(4, '0')}`), {
      userId: 'fixture', action: 'toggleShoutSave', createdAt: old,
    });
    await batch.commit();
  }
  await collection.doc('unknown').set({ action: 'futureOperation', createdAt: Timestamp.fromMillis(old.toMillis() - 1) });
  await collection.doc('fresh').set({ action: 'toggleShoutSave', userId: 'fixture', createdAt: Timestamp.fromDate(now) });
  const connect = () => ({ collection(name) { assert.equal(name, 'serverOperations'); return collection; },
    doc(path) { assert.equal(path, 'maintenanceState/operationReceiptCleanup'); return checkpoint; }, batch: () => db.batch() });
  const first = await runOperationReceiptCleanup(connect(), { clock });
  assert.equal(first.scanned, 500); assert.equal(first.deleted, 499); assert.equal(first.skipped, 1);
  assert.equal(first.reachedLimit, true);
  const second = await runOperationReceiptCleanup(connect(), { clock });
  assert.equal(second.deleted, 4); assert.equal(second.nextCursor, null);
  assert.deepEqual((await collection.get()).docs.map(d => d.id).sort(), ['fresh', 'unknown']);
  const repeat = await runOperationReceiptCleanup(connect(), { clock });
  assert.equal(repeat.deleted, 0); assert.equal(repeat.skipped, 1);
  console.log('CAPACITY_EMULATOR_CLEANUP ' + JSON.stringify({ fixtureMatureReceipts: 503,
    firstScanned: first.scanned, firstDeleted: first.deleted, secondDeleted: second.deleted,
    coldRestart: true, productionThroughputClaim: false }));
});
