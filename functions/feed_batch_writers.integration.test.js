import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { log } from 'node:console';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { canonical } from './feed_block_index.js';
import { encodeGeohash } from './geohash.js';
import { prepareAccountDeletionOperation as prepare } from './prepare_account_deletion.js';
import { operationTestKey } from './test_helpers.js';
import { operationRetryWindowMillis as week } from './operation_retention.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'batch-index-writers') : null;
const db = app ? getFirestore(app) : null, roots = [];
const now = new Date('2026-11-05T12:00:00Z'), clock = () => now;
const point = { latitude: 50.08, longitude: 14.44 }, far = { latitude: 50.66, longitude: 14.04 };
const key = () => operationTestKey(randomUUID(), now);
function row(id, authorId, location = point, extra = {}) {
  return { id, authorId, location, geohash: encodeGeohash(location.latitude, location.longitude),
    createdAt: now.getTime(), expiresAt: now.getTime() + 3600000, status: 'active',
    categories: ['Dotaz'], likesCount: 0, dislikesCount: 0, ...extra };
}
after(async () => {
  if (!app) return;
  for (const root of roots) await db.recursiveDelete(root);
  await db.terminate(); await deleteApp(app);
});
async function fixture(count = 2, { multipleCells = false } = {}) {
  const uid = randomUUID(), other = randomUUID();
  const lab = createLabBlockIndex(db, { namespace: `batch-${randomUUID().slice(0, 12)}` }); roots.push(lab.base);
  for (const id of [uid, other]) {
    const profile = db.doc(`users/${id}`); roots.push(profile, db.doc(`accountDeletionRequests/${id}`));
    await profile.set({ nickname: 'Batch fixture' });
    await profile.collection('legal').doc('acceptance_2026_07_25').set({});
  }
  const own = Array.from({ length: count }, (_, i) => row(`own-${String(i).padStart(3, '0')}`, uid,
    multipleCells && i % 2 ? far : point));
  const foreign = [row('foreign-0', other, point, { expiresAt: now.getTime() + 7200000 }),
    row('foreign-1', other, multipleCells ? far : point, { expiresAt: now.getTime() + 7200000 })];
  await lab.seed([...own, ...foreign]);
  const bodies = db.batch();
  for (const item of [...own, ...foreign]) bodies.update(lab.base.collection('source').doc(item.id), {
    title: `Title ${item.id}`, text: `Full source body ${item.id}`, commentsCount: 0, savesCount: 0,
  });
  await bodies.commit();
  const scoped = { projectId: db.projectId, runTransaction: db.runTransaction.bind(db),
    doc: path => path.startsWith('shouts/') ? lab.base.collection('source').doc(path.slice(7)) : db.doc(path),
    collection: name => name === 'shouts' ? lab.base.collection('source') : db.collection(name) };
  const requestFor = (id = uid, operationKey = key()) => {
    const receipt = db.doc(`serverOperations/${createHash('sha256').update(`${id}\nprepareAccountDeletion\n${operationKey}`).digest('hex')}`);
    roots.push(receipt);
    return { auth: { uid: id, token: { email: 'batch@example.test', email_verified: true } }, app: { appId: 'fixture' },
      data: { expectedUserId: id, idempotencyKey: operationKey } };
  };
  const request = requestFor(), plans = [];
  const writer = { async prepareBatch(...args) {
    const plan = await lab.prepareBatch(...args);
    plans.push({ reads: plan.reads, sourceChanges: plan.sourceChanges, nodeWrites: plan.nodeWrites,
      directoryWrites: plan.directoryWrites, historyWrites: plan.historyWrites, totalWrites: plan.totalWrites });
    return plan;
  } };
  const receiptFor = r => db.doc(`serverOperations/${createHash('sha256').update(`${r.auth.uid}\nprepareAccountDeletion\n${r.data.idempotencyKey}`).digest('hex')}`);
  return { uid, other, lab, scoped, own, foreign, request, requestFor, receiptFor, plans, writer,
    run: (r = request, options = {}) => prepare(r, scoped, clock, { indexWriter: writer, ...options }) };
}
async function snapshot(lab) {
  const records = {};
  for (const name of ['source', 'cells', 'nodes', 'retiredRoots']) {
    records[name] = (await lab.base.collection(name).get()).docs.map(d => ({ id: d.id, data: d.data(),
      seconds: d.updateTime.seconds, nanos: d.updateTime.nanoseconds }));
  }
  return canonical(records);
}
async function ids(lab, view = null) {
  const current = view ?? await lab.open({ point, radiusKm: 100, now: now.getTime() });
  let cursor = current.first, turns = 0;
  const result = [];
  do { const page = await current.page(cursor); result.push(...page.rows.map(item => item.id)); cursor = page.next; assert(++turns < 100); } while (cursor);
  return result.sort();
}

test('50 same-cell deletions share one root and preserve full source, children and a cold historical snapshot', { skip: !enabled }, async () => {
  const f = await fixture(50), old = await f.lab.open({ point, radiusKm: 100, now: now.getTime() });
  const oldIds = await ids(f.lab, old), before = await f.lab.base.collection('source').get();
  const child = f.lab.base.collection('source').doc(f.own[0].id).collection('comments').doc('foreign');
  await child.set({ authorId: f.other, text: 'Keep conversation' });
  assert.deepEqual(await f.run(), { hidden: 50, hasMore: true });
  assert.equal(f.plans.length, 1); assert.equal(f.plans[0].directoryWrites, 1); assert.equal(f.plans[0].historyWrites, 1);
  assert.equal(f.plans[0].reads, 3); assert.equal(f.plans[0].totalWrites, 54);
  for (const d of before.docs) assert.deepEqual((await d.ref.get()).data(), {
    ...d.data(), ...(d.get('authorId') === f.uid ? { status: 'deleted' } : {}),
  });
  assert.equal((await child.get()).get('text'), 'Keep conversation');
  assert.deepEqual(await ids(f.lab), f.foreign.map(item => item.id).sort());
  f.lab.cache.clear(); assert.deepEqual(await ids(f.lab, old), oldIds);
  assert.equal((await f.lab.hydrate(old, [f.own[0].id], now.getTime())).items[0].available, false);
  let gc; do { gc = await (f.gc ??= await f.lab.beginGc(f.own[0].geohash.slice(0, 4))).step(); } while (gc.state !== 'done');
  assert.equal(gc.metrics.nodesDeleted, 0); assert.equal((await f.lab.audit()).activeMetadata, 2);
  log('BATCH-INDEX-BENCH', JSON.stringify({ case: '50-one-cell', ...f.plans[0] }));
});

test('51 Shouts span two cells, replay does not consume another page and an empty page bypasses the writer', { skip: !enabled }, async () => {
  const f = await fixture(51, { multipleCells: true });
  assert.deepEqual(await f.run(), { hidden: 50, hasMore: true });
  const receipt = await f.receiptFor(f.request).get(), after = await snapshot(f.lab);
  assert.deepEqual(await f.run(), { hidden: 50, hasMore: true });
  assert.equal(await snapshot(f.lab), after); assert((await f.receiptFor(f.request).get()).updateTime.isEqual(receipt.updateTime));
  assert.equal(f.plans[0].directoryWrites, 2); assert.equal(f.plans[0].historyWrites, 2);
  assert.deepEqual(await f.run(f.requestFor()), { hidden: 1, hasMore: false });
  const emptyState = await snapshot(f.lab);
  assert.deepEqual(await f.run(f.requestFor()), { hidden: 0, hasMore: false });
  assert.equal(f.plans.length, 2); assert.equal(await snapshot(f.lab), emptyState);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
  log('BATCH-INDEX-BENCH', JSON.stringify({ case: '50-two-cells', ...f.plans[0] }));
});

test('two bounded batches traverse a branched hotspot without losing rows or the historical root', { skip: !enabled }, async () => {
  const f = await fixture(100), old = await f.lab.open({ point, radiusKm: 100, now: now.getTime() });
  const before = await ids(f.lab, old);
  assert((await f.lab.inspect()).retainedNodes > 1);
  await f.run(); assert.equal((await f.lab.audit()).activeMetadata, 52);
  assert.equal(f.plans[0].historyWrites, 1); assert.equal(f.plans[0].directoryWrites, 1);
  await f.run(f.requestFor()); assert.equal((await f.lab.audit()).activeMetadata, 2);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 2);
  f.lab.cache.clear(); assert.deepEqual(await ids(f.lab, old), before);
  assert.deepEqual(await ids(f.lab), f.foreign.map(item => item.id).sort());
});

test('batch edits compose moves, insertions and removals across shared working roots', { skip: !enabled }, async () => {
  const f = await fixture(2, { multipleCells: true }), refs = f.lab.base.collection('source');
  const first = (await refs.doc(f.own[0].id).get()).data(), second = (await refs.doc(f.own[1].id).get()).data();
  const moved = { ...first, location: far, geohash: encodeGeohash(far.latitude, far.longitude) };
  const inserted = row('inserted', f.uid), changes = [
    { id: f.own[0].id, before: first, after: moved }, { id: f.own[1].id, before: second, after: null },
    { id: inserted.id, before: null, after: inserted },
  ];
  let plan;
  await db.runTransaction(async tx => {
    plan = await f.lab.prepareBatch(tx, changes, { operationId: 'mixed-batch' });
    for (const change of changes) { if (change.after) tx.set(refs.doc(change.id), change.after); else tx.delete(refs.doc(change.id)); }
    plan.apply();
  });
  assert.equal(plan.historyWrites, 2); assert.equal(plan.sourceChanges, 3);
  assert.equal((await f.lab.audit()).activeMetadata, 4);
  assert.deepEqual((await refs.doc(f.own[0].id).get()).data(), moved);
  assert.equal((await refs.doc(f.own[1].id).get()).exists, false);
});

test('concurrent duplicate preparation commits one batch, receipt and retirement', { skip: !enabled }, async () => {
  const f = await fixture(51);
  const results = await Promise.all([f.run(), f.run()]);
  assert.deepEqual(results, [{ hidden: 50, hasMore: true }, { hidden: 50, hasMore: true }]);
  assert.equal((await f.lab.base.collection('source').where('authorId', '==', f.uid).where('status', '==', 'active').get()).size, 1);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 1);
  assert.equal((await db.collection('serverOperations').where('userId', '==', f.uid).get()).size, 1);
  assert.equal((await f.lab.audit()).activeMetadata, 3);
});

test('concurrent authors modifying the same cell retain both commits without lost root updates', { skip: !enabled }, async () => {
  const f = await fixture(3), other = f.requestFor(f.other);
  const result = await Promise.all([f.run(), f.run(other)]);
  assert.deepEqual(result.map(value => value.hidden).sort(), [2, 3]);
  assert.equal((await f.lab.audit()).activeMetadata, 0);
  assert.equal((await f.lab.base.collection('cells').get()).size, 0);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 2);
  for (const r of [f.request, other]) assert.equal((await f.receiptFor(r).get()).exists, true);
});

test('failure after staged index writes or before commit rolls back source, index, history and receipt', { skip: !enabled }, async () => {
  for (const mode of ['apply', 'before-commit']) {
    const f = await fixture(4, { multipleCells: true }), before = await snapshot(f.lab);
    const options = mode === 'apply' ? { indexWriter: { async prepareBatch(...args) {
      const plan = await f.lab.prepareBatch(...args); return { apply() { plan.apply(); throw new Error('injected batch failure'); } };
    } } } : { beforeCommit() { throw new Error('injected batch failure'); } };
    await assert.rejects(f.run(f.request, options), /injected batch failure/);
    assert.equal(await snapshot(f.lab), before); assert.equal((await f.receiptFor(f.request).get()).exists, false);
    await f.run(); assert.equal((await f.lab.audit()).activeMetadata, 2);
  }
});

test('an enabled writer returning no applicable plan cannot fall back to hiding source alone', { skip: !enabled }, async () => {
  const f = await fixture(2), before = await snapshot(f.lab);
  for (const result of [null, undefined, {}, { apply: true }]) {
    await assert.rejects(f.run(f.request, { indexWriter: { async prepareBatch() { return result; } } }), /invalid-index-batch-plan/);
    assert.equal(await snapshot(f.lab), before); assert.equal((await f.receiptFor(f.request).get()).exists, false);
  }
});

test('lost acknowledgement reuses the receipt and expired replay cannot touch a later indexed publication', { skip: !enabled }, async () => {
  const f = await fixture(2);
  await assert.rejects(f.run().then(() => { throw new Error('lost acknowledgement'); }), /lost acknowledgement/);
  await f.lab.mutate('later', row('later', f.uid));
  const before = await snapshot(f.lab), receipt = await f.receiptFor(f.request).get();
  assert.deepEqual(await f.run(), { hidden: 2, hasMore: false });
  assert.equal(await snapshot(f.lab), before); assert((await f.receiptFor(f.request).get()).updateTime.isEqual(receipt.updateTime));
  await f.receiptFor(f.request).delete();
  await assert.rejects(prepare(f.request, f.scoped, () => new Date(now.getTime() + week), { indexWriter: f.writer }), e => e.code === 'failed-precondition');
  assert.equal(await snapshot(f.lab), before); assert.equal(f.plans.length, 1);
});

test('duplicate IDs, oversized batches and the existing write guard fail before any mutation', { skip: !enabled }, async () => {
  const f = await fixture(2), before = await snapshot(f.lab);
  const changes = f.own.map(item => ({ id: item.id, before: item, after: { ...item, status: 'deleted' } }));
  for (const [items, options, error] of [
    [[changes[0], changes[0]], {}, /duplicate-index-id/],
    [Array(51).fill(changes[0]), {}, /invalid-index-batch/],
    [changes, { additionalWrites: 450 }, /lab-mutation-too-large/],
  ]) await assert.rejects(db.runTransaction(tx => f.lab.prepareBatch(tx, items, options)), error);
  assert.equal(await snapshot(f.lab), before); assert.equal((await f.receiptFor(f.request).get()).exists, false);
});

test('malformed metadata or a stale index cannot hide even part of a batch or issue a receipt', { skip: !enabled }, async () => {
  for (const corrupt of [{ geohash: 'invalid' }, { likesCount: 5 }]) {
    const f = await fixture(2);
    await f.lab.base.collection('source').doc(f.own[0].id).update(corrupt);
    const before = await snapshot(f.lab);
    await assert.rejects(f.run(), /invalid-index-metadata|incomplete-index/);
    assert.equal(await snapshot(f.lab), before); assert.equal((await f.receiptFor(f.request).get()).exists, false);
  }
});

test('batch hiding of already pruned expired metadata never resurrects it or retires an unchanged root', { skip: !enabled }, async () => {
  const f = await fixture(2), cell = f.own[0].geohash.slice(0, 4);
  const prune = await f.lab.beginExpiryPrune(cell, now.getTime() + 3600000);
  let step; do { step = await prune.step(); } while (step.state !== 'done');
  const before = await f.lab.inspect(), retired = (await f.lab.base.collection('retiredRoots').get()).size;
  await f.run();
  assert.equal(f.plans[0].nodeWrites, 0); assert.equal(f.plans[0].directoryWrites, 0); assert.equal(f.plans[0].historyWrites, 0);
  assert.deepEqual(await f.lab.inspect(), before);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, retired);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
});

test('identity/App Check and payload guards run before any optional batch index work', { skip: !enabled }, async () => {
  const f = await fixture(2), before = await snapshot(f.lab);
  for (const request of [{ ...f.request, app: null }, { ...f.request, auth: null },
    { ...f.request, data: { ...f.request.data, indexWriter: true } }]) await assert.rejects(f.run(request));
  assert.equal(f.plans.length, 0); assert.equal(await snapshot(f.lab), before);
  assert.equal((await f.receiptFor(f.request).get()).exists, false);
});

test('measured same-cell batch shares reads and retires one root instead of 50 sequential single edits', { skip: !enabled }, async () => {
  const f = await fixture(50), sequential = await fixture(50);
  await f.run();
  const totals = { reads: 0, nodeWrites: 0, directoryWrites: 0, historyWrites: 0 };
  let sourceReads = 0;
  for (const item of sequential.own) {
    const result = await sequential.lab.mutate(item.id, { ...item, status: 'deleted' });
    for (const field of Object.keys(totals)) totals[field] += result[field];
    sourceReads += result.attempts;
  }
  assert.equal((await sequential.lab.audit()).activeMetadata, 2);
  assert.equal(totals.historyWrites, 50); assert.equal(f.plans[0].historyWrites, 1);
  assert(totals.reads - sourceReads > f.plans[0].reads); assert(totals.nodeWrites > f.plans[0].nodeWrites);
  log('BATCH-INDEX-BENCH', JSON.stringify({ case: '50-one-cell-comparison', batchPlan: f.plans[0],
    sequentialLabMutations: { ...totals, sourceReads, indexReads: totals.reads - sourceReads } }));
});
