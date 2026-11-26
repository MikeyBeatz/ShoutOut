import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { createFeedRuntime } from './feed_runtime.js';
import { createContentLifecycleMaintenance } from './content_lifecycle_runtime.js';
import { runContentLifecycleMaintenance } from './content_lifecycle_maintenance.js';
import { runAccountMaintenanceTick } from './shout_expiration.js';
import { lifecycleDay } from './content_lifecycle.js';
import { createPurgeDocumentPager } from './account_purge_pager.js';
import { encodeGeohash } from './geohash.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const absent = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };

// Counts document results (including an empty query as one read), SDK get/
// transaction/list calls and attempted/committed writes. Not index entries,
// bytes, billing, notifications, or a cloud capacity benchmark.
function meter(raw) {
  const stats = { reads: 0, getCalls: 0, listingCalls: 0, metadataListCalls: 0, listedMetadataPaths: 0,
    attempts: 0, commits: 0, attemptedWrites: 0, committedWrites: 0, directWrites: 0, maxTransactionWrites: 0 };
  const snapshot = value => Array.isArray(value) ? value.map(snapshot) : new Proxy(value, { get(real, key) {
    if (key === 'docs' && Array.isArray(real.docs)) return real.docs.map(snapshot);
    if (key === 'ref' && real.ref) return wrap(real.ref);
    return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
  } });
  const count = result => { stats.getCalls++; stats.reads += Array.isArray(result) ? result.length : result.docs ? Math.max(1, result.size) : 1; return snapshot(result); };
  const wrap = target => new Proxy(target, { get(real, key) {
    if (key === 'get') return async (...args) => count(await real.get(...args));
    if (['listCollections', 'listDocuments'].includes(key)) return async (...args) => { stats.listingCalls++; return (await real[key](...args)).map(wrap); };
    if (['set', 'create', 'update', 'delete'].includes(key)) return async (...args) => {
      stats.attemptedWrites++; const result = await real[key](...args);
      stats.committedWrites++; stats.directWrites++; return result;
    };
    if (['doc', 'collection', 'where', 'orderBy', 'limit', 'startAfter', 'select'].includes(key)) return (...args) => wrap(real[key](...args));
    return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
  } });
  const db = new Proxy(raw, { get(real, key) {
    if (['doc', 'collection'].includes(key)) return (...args) => wrap(real[key](...args));
    if (key === 'runTransaction') return async (callback, ...options) => {
      let finalWrites = 0;
      const result = await real.runTransaction(async tx => {
        stats.attempts++; let writes = 0;
        const observed = new Proxy(tx, { get(transaction, method) {
          if (['get', 'getAll'].includes(method)) return async (...args) => count(await transaction[method](...args));
          if (['set', 'create', 'update', 'delete'].includes(method)) return (...args) => {
            writes++; stats.attemptedWrites++; transaction[method](...args); return observed;
          };
          return typeof transaction[method] === 'function' ? transaction[method].bind(transaction) : transaction[method];
        } });
        const value = await callback(observed); finalWrites = writes; return value;
      }, ...options);
      stats.commits++; stats.committedWrites += finalWrites;
      stats.maxTransactionWrites = Math.max(stats.maxTransactionWrites, finalWrites);
      return result;
    };
    return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
  } });
  return { db, stats, reset() { for (const key of Object.keys(stats)) stats[key] = 0; } };
}

async function fixture(t, { reports = 0, measured = false } = {}) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), nonce = randomUUID().replaceAll('-', '');
  const root = raw.doc(`shouts/liferun_${nonce}`), header = raw.doc(`contentLifecycleThreads/${root.id}`);
  const generations = [0, 1].map(n => raw.doc(`feedIndexGenerations/liferun-${nonce.slice(0, 20)}-${n}`));
  const controls = [raw.doc('contentLifecycleControl/current'), raw.doc('feedIndexControl/current')];
  const busy = raw.doc(`accountDeletionJobs/${'a'.repeat(64)}`), protectedRef = raw.doc(`shouts/protected_${nonce}`);
  const metrics = meter(raw); let now = new Date('2026-11-01T12:00:00Z');
  const clock = () => now;
  const runtime = (database = measured ? metrics.db : raw) => createFeedRuntime(database, absent, {
    enabled: true, clock, cardStateEnabled: true, newsRuntimeEnabled: false,
    contentLifecycleEnabled: true, contentMaintenanceEnabled: true,
  });
  t.after(async () => {
    for (const ref of [root, header, busy, protectedRef, ...controls, ...generations,
      raw.doc('maintenanceState/accountDeletionShoutJobs'), raw.doc('maintenanceState/accountPurgeJobs')]) await raw.recursiveDelete(ref);
    for (const name of ['contentLifecycleArchive', 'contentLifecycleJobs', 'reports']) {
      const field = name === 'contentLifecycleArchive' ? 'threadId' : name === 'reports' ? 'shoutId' : 'threadId';
      for (const doc of (await raw.collection(name).where(field, '==', root.id).get()).docs) await raw.recursiveDelete(doc.ref);
    }
    for (const doc of (await raw.collection('lifecycleBudgetProbe').get()).docs) await doc.ref.delete();
    await raw.terminate();
  });
  assert(!(await controls[0].get()).exists); assert(!(await controls[1].get()).exists);
  const batch = raw.batch();
  batch.create(controls[0], { schemaVersion: 1, mode: 'active', revision: 1 });
  for (const ref of generations) batch.create(ref, { schemaVersion: 1, v: 2, cardProjection: 1,
    readIdentity: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1, cardReady: true });
  batch.create(controls[1], { schemaVersion: 2, revision: 1, mode: 'building', readGenerationId: generations[0].id,
    writeGenerationIds: generations.map(g => g.id), cardWriteGenerationIds: generations.map(g => g.id), cardReadGenerationId: generations[0].id });
  batch.create(protectedRef, { text: 'Unrelated legacy content must stay unchanged' });
  await batch.commit();
  const body = { id: root.id, authorId: `author_${nonce}`, authorNickname: 'Synthetic', title: 'Runtime fixture', text: 'Retain original',
    createdAt: Timestamp.fromDate(now), expiresAt: Timestamp.fromMillis(now.getTime() + lifecycleDay),
    location: new GeoPoint(50.53, 14.13), geohash: encodeGeohash(50.53, 14.13), categories: ['Dotaz'],
    geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, status: 'active',
    likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: 0 };
  const rt = runtime();
  await rt.database.runTransaction(async tx => {
    const plan = await rt.indexWriter.prepare(tx, root.id, null, body); plan.apply(); tx.create(root, body);
  });
  if (measured) await rt.database.runTransaction(async tx => {
    const before = (await tx.get(root)).data(), after = { ...before, commentsCount: 1 };
    const plan = await rt.indexWriter.prepare(tx, root.id, before, after); plan.apply();
    tx.create(root.collection('comments').doc('bounded'), { authorId: body.authorId, text: 'Synthetic retained comment', createdAt: body.createdAt });
    tx.update(root, { commentsCount: 1 });
  });
  const archiveKey = (await root.get()).get('contentArchiveKey');
  if (reports) {
    const seed = raw.batch();
    for (let i = 0; i < reports; i++) seed.create(raw.doc(`reports/liferun_${nonce}_${i}`), {
      shoutId: root.id, contentArchiveKey: archiveKey, status: 'open', reason: 'Synthetic bounded cleanup',
    });
    await seed.commit();
  }
  metrics.reset();
  return { raw, root, header, generations, controls, protectedRef, busy, metrics, runtime, clock, archiveKey,
    setNow(value) { now = value; }, options: { clock, pageSize: 50, maxJobs: 1, leaseMillis: 120000,
      retryDelayMillis: 60000, authWaitMillis: 86400000, retentionPurgeEnabled: false, shoutExpirationEnabled: false } };
}

for (const pageSize of [6, 50]) test(`combined worker page ${pageSize} makes bounded progress across cold restarts despite an occupied account queue; two generations stay atomic`, { skip: !enabled }, async t => {
  const f = await fixture(t, { reports: 65, measured: true }), h = (await f.header.get()).data();
  const protectedBefore = await f.protectedRef.get();
  f.setNow(h.historyUntil.toDate()); let ticks = 0, steps = 0;
  const invoke = async () => {
    // This malformed account record remains due on every tick. Its failure
    // must be visible and must not starve the independent ordinary queue.
    await f.busy.set({ userId: 'synthetic-invalid-job', requestCreateTime: Timestamp.fromDate(f.clock()), nextAttemptAt: Timestamp.fromDate(f.clock()) });
    const rt = f.runtime();
    // Use the same real metadata pager, adding only observation. The normal
    // runtime path without injected collaborators is exercised below.
    const realPager = createPurgeDocumentPager(rt.database);
    const contentMaintenance = createContentLifecycleMaintenance(rt.database, rt.indexWriter, { enabled: true, clock: f.clock,
      pager: { async list(...args) {
        const page = await realPager.list(...args); f.metrics.stats.metadataListCalls++;
        f.metrics.stats.listedMetadataPaths += page.paths.length; return page;
      } } });
    const result = await runAccountMaintenanceTick(rt.database, absent, { ...f.options, pageSize, indexWriter: rt.indexWriter,
      contentMaintenance }).finally(() => realPager.close());
    assert.equal(result.scanned, 1); assert.equal(result.failed, 1);
    assert.equal(result.sourcePageBudget + result.lifecycleWorkBudget, pageSize);
    assert(result.lifecycleWorkUnits <= Math.floor(pageSize / 2)); assert(result.lifecycleDeleted <= Math.floor(pageSize / 2)); assert.equal(result.lifecycleFailed, 0);
    steps += result.lifecycleSteps; ticks++;
    // The normal checkpoint rotates through due jobs rather than repeatedly
    // selecting one path. Advancing its due time keeps this one front busy.
    f.setNow(new Date(f.clock().getTime() + 1));
    return result;
  };
  while ((await f.root.get()).exists) { await invoke(); assert(ticks < 20); }
  assert.equal((await f.raw.collection('reports').where('shoutId', '==', f.root.id).get()).size, 65);
  assert((await f.raw.doc(`contentLifecycleArchive/${f.archiveKey}`).get()).exists);
  for (const generation of f.generations) {
    const state = await generation.collection('publicStates').doc(f.root.id).get();
    assert(!state.exists || state.get('status') === 'unavailable');
    assert.equal((await generation.collection('cells').get()).size, 0);
  }
  f.setNow(h.retainUntil.toDate());
  while ((await f.header.get()).exists) { await invoke(); assert(ticks < 60); }
  assert.equal((await f.raw.collection('reports').where('shoutId', '==', f.root.id).get()).size, 0);
  assert(!(await f.raw.doc(`contentLifecycleArchive/${f.archiveKey}`).get()).exists);
  assert((await f.protectedRef.get()).updateTime.isEqual(protectedBefore.updateTime));
  assert(f.metrics.stats.maxTransactionWrites <= 450);
  process.stdout.write('LIFECYCLE_RUNTIME_TRACE ' + JSON.stringify({ pageSize, ticks, steps, sources: 2, reports: 65, generations: 2,
    ...f.metrics.stats, scope: 'emulator-sdk-operations-not-cloud-capacity' }) + '\n');
});

test('report and final technical pages respect the remaining work allocation, including a one-unit finish', { skip: !enabled }, async t => {
  const f = await fixture(t, { reports: 7 });
  const h = (await f.header.get()).data(); f.setNow(h.retainUntil.toDate());
  let calls = 0, deleted = 0;
  while ((await f.header.get()).exists) {
    const rt = f.runtime(), result = await rt.contentMaintenance({ maxWork: 1 });
    assert.equal(result.lifecycleFailed, 0); assert(result.lifecycleDeleted <= 1); assert(result.lifecycleWorkUnits <= 1);
    deleted += result.lifecycleDeleted; assert(++calls < 80);
  }
  assert(deleted >= 11); // source + reports + archive + source/archive journals + header
  assert.equal((await f.raw.collection('reports').where('shoutId', '==', f.root.id).get()).size, 0);
});

test('lost response after a committed delete resumes from the durable cursor and never restores an old body', { skip: !enabled }, async t => {
  const f = await fixture(t), h = (await f.header.get()).data(); f.setNow(h.historyUntil.toDate());
  let lost = false;
  const lossy = new Proxy(f.raw, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => {
      const result = await target.runTransaction(...args);
      if (!lost && result?.sourceBody) { lost = true; throw Object.assign(new Error('Synthetic response lost'), { code: 14 }); }
      return result;
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  const first = f.runtime(lossy); const result = await first.contentMaintenance({ maxWork: 25 });
  assert.equal(lost, true); assert.equal(result.lifecycleFailed, 1); assert.equal(result.lifecycleState, 'failed');
  assert(!(await f.root.get()).exists);
  const recovered = await f.runtime().contentMaintenance({ maxWork: 25 });
  assert.equal(recovered.lifecycleFailed, 0); assert.equal(recovered.lifecycleState, 'idle');
  assert(!(await f.root.get()).exists); assert((await f.raw.doc(`contentLifecycleArchive/${f.archiveKey}`).get()).exists);
});

test('the full transaction budget rejects an oversized two-generation plan without partial source or index writes', { skip: !enabled }, async t => {
  const f = await fixture(t), h = (await f.header.get()).data(); f.setNow(h.historyUntil.toDate());
  const rt = f.runtime();
  const oversized = { async prepare(...args) {
    const plan = await rt.indexWriter.prepare(...args);
    return { apply() {
      for (let n = 0; n < 450; n++) args[0].set(f.raw.doc(`lifecycleBudgetProbe/p${n}`), { synthetic: true });
      plan.apply();
    } };
  } };
  const run = createContentLifecycleMaintenance(rt.database, oversized, { enabled: true, clock: f.clock });
  const result = await run({ maxWork: 25 });
  assert.equal(result.lifecycleNeedsReview, 1); assert((await f.root.get()).exists);
  assert.equal((await f.raw.collection('lifecycleBudgetProbe').get()).size, 0);
  for (const generation of f.generations) assert.equal((await generation.collection('cells').get()).size, 1);
});

test('elapsed work stops before another transaction and pause retains cleanup while off blocks it', { skip: !enabled }, async t => {
  const f = await fixture(t), h = (await f.header.get()).data(); f.setNow(h.historyUntil.toDate());
  const rt = f.runtime(); let elapsed = 0;
  const bounded = await runContentLifecycleMaintenance(rt.database, { maxSteps: 32, maxWork: 25, maxElapsedMillis: 1,
    retryDelayMillis: 60000, clock: f.clock, workClock: () => ++elapsed, indexWriter: rt.indexWriter });
  assert.equal(bounded.workUnits, 0); assert((await f.root.get()).exists);
  await f.controls[0].update({ mode: 'off', revision: 2 });
  assert.equal((await rt.contentMaintenance({ maxWork: 25 })).lifecycleState, 'paused');
  await f.controls[0].update({ mode: 'paused', revision: 3 });
  assert.equal((await rt.contentMaintenance({ maxWork: 25 })).lifecycleFailed, 0);
  assert(!(await f.root.get()).exists);
});

test('concurrent runtime slices preserve the single durable traversal and complete after another cold restart', { skip: !enabled }, async t => {
  const f = await fixture(t), h = (await f.header.get()).data(); f.setNow(h.retainUntil.toDate());
  for (let tick = 0; (await f.header.get()).exists; tick++) {
    assert(tick < 15);
    const results = await Promise.all([0, 1].map(() => f.runtime().contentMaintenance({ maxWork: 3 })));
    for (const result of results) {
      assert.equal(result.lifecycleFailed, 0); assert.equal(result.lifecycleNeedsReview, 0);
      assert(result.lifecycleWorkUnits <= 3); assert(result.lifecycleDeleted <= 3);
    }
  }
  assert(!(await f.root.get()).exists);
  assert(!(await f.raw.doc(`contentLifecycleArchive/${f.archiveKey}`).get()).exists);
});
