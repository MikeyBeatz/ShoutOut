import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLabBlockIndex, blockCache } from './feed_block_index_lab.js';
import { createAccountRetentionLab } from './feed_account_retention_lab.js';
import { treeBuilder, metadataOf } from './feed_block_index.js';
import { encodeGeohash } from './geohash.js';
import { accountRetentionMillis } from './account_purge_guard.js';
import { FeedSessionExpired } from './feed_session_policy.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'account-index-retention-tests') : null;
const db = app ? getFirestore(app) : null, roots = [];
const point = { latitude: 50.66, longitude: 14.04 }, far = { latitude: 0, longitude: 0 };
const cell = encodeGeohash(point.latitude, point.longitude).slice(0, 4);
after(async () => { if (app) {
  for (const root of roots) await db.recursiveDelete(root);
  await db.terminate(); await deleteApp(app);
} });

async function fixture(count = 80, ownCount = 1) {
  const uid = randomUUID(), namespace = `erasure-${uid.slice(0, 8)}`;
  const request = db.doc(`accountDeletionRequests/${uid}`), profile = db.doc(`publicProfiles/${uid}`);
  roots.push(request, profile);
  await request.set({ userId: uid, status: 'pending' }); const created = (await request.get()).createTime;
  const now = Math.ceil(created.toMillis()) + accountRetentionMillis;
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(Math.ceil(created.toMillis())) });
  await profile.set({ nickname: 'Before erasure' });
  const identity = { projectId: db.projectId, userId: uid, requestCreateTime: created };
  const options = { clock: () => new Date(now), reads: 2, deletes: 1 };
  const fresh = (database = db, extra = {}) => createLabBlockIndex(database, { namespace, accountRetention: true, ...extra });
  const lab = fresh(); roots.push(lab.base);
  const row = (id, extra = {}) => ({ id, authorId: 'foreign', status: 'active', location: point,
    geohash: encodeGeohash(point.latitude, point.longitude), categories: ['help'], createdAt: now - 1000,
    expiresAt: now + 86400000, likesCount: 0, dislikesCount: 0, ...extra });
  const own = row('own', { authorId: uid, createdAt: Math.floor(created.toMillis()) - 1000,
    expiresAt: Math.floor(created.toMillis()) + 86400000 });
  await lab.seed([own, ...Array.from({ length: ownCount - 1 }, (_, i) => ({ ...own, id: `own-${String(i).padStart(3, '0')}` })),
    ...Array.from({ length: count }, (_, i) => row(`foreign-${String(i).padStart(3, '0')}`)),
    row('far', { location: far, geohash: encodeGeohash(0, 0) })]);
  const f = { uid, namespace, request, profile, identity, options, lab, own, row, fresh,
    context: { point, radiusKm: 20, now, uid: 'reader' },
    mark: () => profile.set({ schemaVersion: 1, accountStatus: 'deleted' }),
    step: (extra = {}, adapter = lab) => adapter.purgeAccountIndex(identity, { ...options, ...extra }),
  };
  f.until = async (predicate, { cold = false, extra = {} } = {}) => {
    const total = { attempts: 0, readUnits: 0, writeCalls: 0, committedWrites: 0 }; let calls = 0, result;
    do {
      result = await f.step(extra, cold ? fresh() : lab); calls++;
      for (const field of Object.keys(total)) total[field] += result.metrics[field];
      assert(calls < 1000, 'erasure did not finish');
    } while (!await predicate(result));
    return { ...result, calls, total };
  };
  f.finish = settings => f.until(result => result.state === 'complete', settings);
  f.close = async () => db.runTransaction(async tx => { const plan = await lab.prepareAccountIndexFinish(tx, identity, options); plan.apply(); });
  return f;
}
async function ownerNodes(f) {
  return (await f.lab.base.collection('nodes').get()).docs.filter(doc => doc.data().rows?.some(row => row.authorId === f.uid));
}
async function locked(f) { return Boolean((await f.lab.base.collection('cellRetention').doc(cell).get()).get('owner')); }

test('R5 erases current/history/orphan copies with a cold adapter each step, fixed deadline and foreign source preservation', { skip: !enabled }, async t => {
  const f = await fixture(), foreign = await f.lab.base.collection('source').doc('foreign-000').get();
  await f.lab.mutate('foreign-000', f.row('foreign-000', { likesCount: 1 }));
  const orphan = treeBuilder(), extra = metadataOf({ ...f.own, id: 'orphan-copy' }); orphan.build([extra], cell);
  for (const [hash, node] of orphan.writes) await f.lab.base.collection('nodes').doc(hash).set(node);
  await f.lab.base.collection('source').doc('own').delete(); await f.mark();
  const result = await f.finish({ cold: true }); assert((await ownerNodes(f)).length === 0);
  assert.equal((await f.lab.base.collection('retiredRoots').where('cell', '==', cell).get()).size, 0);
  assert.equal((await f.lab.audit()).activeMetadata, 81); assert.equal(await locked(f), false);
  const source = await foreign.ref.get(); assert.equal(source.get('authorId'), foreign.get('authorId'));
  assert.equal(source.get('likesCount'), 1); assert.equal(source.get('location').latitude, point.latitude);
  assert.equal(result.retainUntil.toMillis(), Timestamp.fromMillis(f.identity.requestCreateTime.toMillis() + accountRetentionMillis).toMillis());
  assert.equal((await f.lab.erasureJobFor(f.identity).collection('marks').get()).size, 0);
  await f.close(); assert.equal((await f.lab.erasureJobFor(f.identity).get()).exists, false);
  assert.equal((await f.lab.base.get()).get('activeErasure'), undefined);
  assert.deepEqual((await f.profile.get()).data(), { schemaVersion: 1, accountStatus: 'deleted' });
  t.diagnostic('ACCOUNT-INDEX-ERASURE-BENCH ' + JSON.stringify({ sourceRows: 82, calls: result.calls, metrics: result.total }));
});

test('warm/cold/portable old sessions expire only in affected cells; foreign hydration and unaffected sessions survive', { skip: !enabled }, async () => {
  const f = await fixture(3), second = f.fresh(), old = await second.open(f.context);
  await old.page(old.first); const portable = await second.capturePortable(f.context);
  const unaffected = await second.open({ ...f.context, point: far }); await unaffected.page(unaffected.first);
  await f.mark(); await f.until(() => locked(f));
  await assert.rejects(old.page(old.first), FeedSessionExpired);
  await assert.rejects(second.portablePage(portable, {}, { uid: 'reader', assertSessionAlive() {} }), FeedSessionExpired);
  await assert.rejects(f.fresh().portablePage(portable, {}, { uid: 'reader', assertSessionAlive() {} }), FeedSessionExpired);
  assert.equal((await unaffected.page(unaffected.first)).rows.length, 1);
  assert.equal((await second.hydrate(old, ['foreign-000'], f.context.now)).items[0].available, true);
  assert.equal((await second.hydrate(old, ['own'], f.context.now)).items[0].available, false);
  await f.finish(); await assert.rejects(old.page(old.first), FeedSessionExpired);
  const renewed = await second.open(f.context); assert.equal((await renewed.page(renewed.first)).rows.length, 3);
  assert.equal((await unaffected.page(unaffected.first)).rows.length, 1); await f.close();
});

test('affected writers and normal GC retry during cleanup; foreign writes recover and erased authors cannot reinsert', { skip: !enabled }, async () => {
  const f = await fixture(3); await f.mark(); await f.until(() => locked(f));
  await assert.rejects(f.lab.mutate('foreign-000', f.row('foreign-000', { likesCount: 1 })), /index-cell-retention-busy/);
  await assert.rejects(f.lab.beginGc(cell), /index-cell-retention-busy/);
  await f.finish(); await f.close();
  await f.lab.mutate('foreign-000', f.row('foreign-000', { likesCount: 1 }));
  await assert.rejects(f.lab.mutate('resurrection', { ...f.own, id: 'resurrection', expiresAt: f.context.now + 10000 }), /index-author-erased/);
  assert.equal((await ownerNodes(f)).length, 0);
});

test('a queued leaf rewrite cannot copy the active erasure author into a new block', { skip: !enabled }, async () => {
  const f = await fixture(3); await f.mark(); await f.step(); // Fence author before per-cell discovery/locking.
  await assert.rejects(f.lab.mutate('foreign-000', f.row('foreign-000', { likesCount: 1 })), /index-author-erasure-pending/);
  assert.equal((await f.lab.base.collection('source').doc('foreign-000').get()).get('likesCount'), 0);
  await f.finish(); await f.close();
});

test('rollback after queued writes and lost commit acknowledgement keep a resumable journal without new deadlines', { skip: !enabled }, async () => {
  const f = await fixture(3); await f.mark();
  await assert.rejects(f.step({ beforeCommit() { throw new Error('rollback'); } }), /rollback/);
  assert.equal((await f.lab.erasureJobFor(f.identity).get()).exists, false); assert.equal((await f.lab.base.get()).get('erasureRevision'), 0);
  let lose = true;
  const database = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => { const result = await target.runTransaction(...args);
      if (lose) { lose = false; throw new Error('lost-commit-ack'); } return result; };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await assert.rejects(f.step({}, f.fresh(database)), /lost-commit-ack/);
  assert.equal((await f.lab.base.get()).get('erasureRevision'), 1);
  await f.finish({ cold: true }); assert.equal((await f.lab.base.collection('cellRetention').doc(cell).get()).get('version'), 1);
  await f.close(); assert.equal((await f.lab.base.get()).get('erasureRevision'), 2);
});

test('a missing removal plan rolls back the cell cursor and never reports successful erasure', { skip: !enabled }, async () => {
  const f = await fixture(3); await f.mark(); await f.until(() => locked(f));
  const broken = createAccountRetentionLab(db, f.lab.base, async () => null);
  const task = f.lab.erasureJobFor(f.identity).collection('cells').doc(cell), before = await task.get();
  await assert.rejects(broken.step(f.identity, { ...f.options, reads: 32 }), /invalid-erasure-index-plan/);
  assert.ok((await task.get()).updateTime.isEqual(before.updateTime)); assert((await ownerNodes(f)).length > 0);
  await f.finish(); await f.close();
});

test('replaced requests, missing confirmation and malformed deleted markers cannot authorize index destruction', { skip: !enabled }, async () => {
  for (const scenario of ['replaced', 'confirmation', 'marker']) {
    const f = await fixture(1); await f.mark();
    if (scenario === 'replaced') { await f.request.delete(); await f.request.set({ userId: f.uid, status: 'pending', authDeletionConfirmedAt: Timestamp.now() }); }
    if (scenario === 'confirmation') await f.request.update({ authDeletionConfirmedAt: null });
    if (scenario === 'marker') await f.profile.update({ nickname: 'Unexpected identity' });
    await assert.rejects(f.step(), /invalid-erasure-identity/); assert.equal((await f.lab.erasureJobFor(f.identity).get()).exists, false);
    assert.equal((await f.lab.base.get()).get('erasureRevision'), 0); assert((await ownerNodes(f)).length > 0);
  }
});

test('a legacy adapter cannot silently bypass the retention-enabled namespace contract', { skip: !enabled }, async () => {
  const f = await fixture(1), legacy = createLabBlockIndex(db, { namespace: f.namespace });
  const snapshot = await f.lab.capturePortable(f.context);
  await assert.rejects(legacy.open(f.context), /index-retention-mode-mismatch/);
  await assert.rejects(legacy.mutate('foreign-000', f.row('foreign-000', { likesCount: 1 })), /index-retention-mode-mismatch/);
  await assert.rejects(legacy.portablePage(snapshot, {}, { uid: 'reader', assertSessionAlive() {} }), /index-retention-mode-mismatch/);
});

test('more than 50 owned rows drain across resumable leaf batches without removing foreign metadata', { skip: !enabled }, async () => {
  const f = await fixture(2, 70); await f.mark();
  await f.finish({ cold: true, extra: { reads: 32, deletes: 16 } });
  assert.equal((await ownerNodes(f)).length, 0); assert.equal((await f.lab.audit()).activeMetadata, 3);
  const view = await f.lab.open(f.context); assert.equal((await view.page(view.first)).rows.length, 2); await f.close();
});

test('GC captured before the retention version change cannot sweep a now fenced cell', { skip: !enabled }, async () => {
  const f = await fixture(3); await f.lab.mutate('foreign-000', f.row('foreign-000', { likesCount: 1 }));
  const gc = await f.lab.beginGc(cell, { testTimeAdvanceMillis: 3660000 });
  await f.mark(); await f.until(() => locked(f));
  await assert.rejects(gc.step({ reads: 32, deletes: 16 }), /index-gc-retention-changed/);
  await f.finish(); await f.close(); assert.equal((await f.lab.audit()).activeMetadata, 4);
});

test('a real concurrent foreign mutation is committed or rolled back before inventory and never escapes final erasure', { skip: !enabled }, async () => {
  const f = await fixture(3); await f.mark();
  const results = await Promise.allSettled([f.lab.mutate('foreign-000', f.row('foreign-000', { likesCount: 1 })), f.step()]);
  assert.equal(results[1].status, 'fulfilled');
  if (results[0].status === 'rejected') assert.match(results[0].reason.message, /index-author-erasure-pending|index-cell-retention-busy/);
  await f.finish(); await f.close(); assert.equal((await ownerNodes(f)).length, 0);
  assert.equal((await f.lab.audit()).activeMetadata, 4);
});

test('a malformed cell fence fails closed for readers, writers and erasure', { skip: !enabled }, async () => {
  const f = await fixture(1); await f.mark();
  await f.lab.base.collection('cellRetention').doc(cell).set({ v: 1, version: -1, phase: 'ready' });
  await assert.rejects(f.lab.open(f.context), /invalid-index-retention-fence/);
  await assert.rejects(f.lab.mutate('foreign-000', f.row('foreign-000', { likesCount: 1 })), /invalid-index-retention-fence/);
  await assert.rejects(f.finish(), /invalid-index-retention-fence/); assert((await ownerNodes(f)).length > 0);
});

test('confirmed deletion can prepare index erasure before day 60 without deleting retained canonical content', { skip: !enabled }, async () => {
  const f = await fixture(2); await f.mark();
  const early = Math.ceil(f.identity.requestCreateTime.toMillis()) + 1000;
  const result = await f.finish({ extra: { clock: () => new Date(early), reads: 32, deletes: 16 } });
  assert(result.retainUntil.toMillis() > early); assert.equal((await ownerNodes(f)).length, 0);
  assert.equal((await f.lab.base.collection('source').doc('own').get()).get('authorId'), f.uid);
  assert.equal((await f.lab.audit()).activeMetadata, 3); await f.close();
});

test('cache TTL is bounded and clearing also invalidates an in-flight load', async () => {
  let clock = 0, release; const cache = blockCache({ maxAgeMillis: 10, clock: () => clock });
  await cache.load('old', async () => ({ value: 1 })); clock = 10; assert.equal(cache.size, 0);
  const flight = cache.load('pending', () => new Promise(resolve => { release = resolve; }));
  cache.clear(); release({ value: 2 }); await flight; assert.equal(cache.size, 0);
});

test('a response waiting in another cache cannot return an old page after the cell fence changes', { skip: !enabled }, async () => {
  const f = await fixture(3), underlying = blockCache(); let release, arrived;
  const paused = new Promise(resolve => { arrived = resolve; });
  const cache = { ...underlying, get size() { return underlying.size; }, get bytes() { return underlying.bytes; },
    load: (key, fetcher) => underlying.load(key, async () => {
      const node = await fetcher(); arrived(); await new Promise(resolve => { release = resolve; }); return node;
    }) };
  const adapter = f.fresh(db, { cache }), old = await adapter.open(f.context), pending = old.page(old.first);
  const rejected = assert.rejects(pending, FeedSessionExpired);
  await paused; await f.mark(); await f.until(() => locked(f)); release(); await rejected;
  assert.equal(cache.size, 0); await f.finish(); await f.close();
});
