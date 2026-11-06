import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createEarlyErasureQueueLab, EarlyErasureIdentityChanged, EarlyErasureLeaseLost, EarlyErasureNeedsReview } from './feed_early_erasure_queue_lab.js';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { encodeGeohash } from './geohash.js';
import { accountPurgeJobRef, accountRetentionMillis } from './account_purge_guard.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'early-erasure-queue-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const marker = { schemaVersion: 1, accountStatus: 'deleted' };

async function fixture(t, { generations = 1 } = {}) {
  const uid = `early-${randomUUID()}`, namespace = `queue-${randomUUID().slice(0, 8)}`, roots = [], gens = [];
  const control = db.doc('feedIndexControl/current'), registry = db.collection('feedIndexGenerations');
  assert.equal((await control.get()).exists, false); assert.equal((await registry.limit(1).get()).size, 0);
  const request = db.doc(`accountDeletionRequests/${uid}`), profile = db.doc(`publicProfiles/${uid}`);
  roots.push(request, profile, db.doc(`feedErasureQueueLab/${namespace}`), control);
  t.after(async () => { for (const root of [...roots, ...gens.flatMap(gen => [gen.ref, gen.lab.base])]) await db.recursiveDelete(root); });
  await request.set({ userId: uid, status: 'pending' });
  const created = (await request.get()).createTime;
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(Math.ceil(created.toMillis())) }); await profile.set(marker);
  const identity = { projectId: db.projectId, userId: uid, requestCreateTime: created };
  const f = { uid, namespace, request, profile, identity, gens, control, roots, now: Math.ceil(created.toMillis()) + 1000,
    authExists: new Set(), authError: null, authCalls: 0 };
  const auth = { async getUser(userId) {
    f.authCalls++; if (f.authError) throw f.authError;
    if (f.authExists.has(userId)) return { uid: userId };
    throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
  } };
  f.fresh = (database = db, extra = {}) => createEarlyErasureQueueLab(database, auth, { namespace, clock: () => new Date(f.now), ...extra });
  f.queue = f.fresh(); f.job = f.queue.jobFor(identity);
  f.advance = () => { f.now += 60001; };
  f.register = async ({ empty = false } = {}) => {
    const id = `gen-${randomUUID().slice(0, 8)}`, lab = createLabBlockIndex(db, { namespace: id, accountRetention: true });
    const ref = registry.doc(id); gens.push({ id, lab, ref });
    const point = { latitude: 50.66, longitude: 14.04 }, row = (id, authorId) => ({ id, authorId, status: 'active', location: point,
      geohash: encodeGeohash(point.latitude, point.longitude), categories: ['help'], createdAt: f.now - 500,
      expiresAt: f.now + 86400000, likesCount: 0, dislikesCount: 0 });
    await lab.seed(empty ? [] : [row('own', uid), row('foreign', 'foreign')]);
    await db.runTransaction(async tx => {
      const old = await tx.get(control);
      tx.create(ref, { schemaVersion: 1 });
      tx.set(control, { schemaVersion: 1, revision: (old.get('revision') ?? 0) + 1, mode: 'paused', readGenerationId: null,
        writeGenerationIds: [...(old.get('writeGenerationIds') ?? []), id] });
    });
    return gens.at(-1);
  };
  for (let i = 0; i < generations; i++) await f.register();
  f.until = async (predicate, { maxSteps = 32, ...options } = {}) => {
    let result, calls = 0;
    do { f.advance(); result = await f.fresh().run(identity, { maxSteps, elapsedClock: () => 0, ...options });
      assert(++calls < 200, 'queue failed to progress');
    } while (!await predicate(result));
    return { result, calls };
  };
  f.drain = options => f.until(result => result.state === 'complete', options);
  return f;
}

function afterTransaction(database, observe) {
  return new Proxy(database, { get(target, key) {
    if (key === 'runTransaction') return operation => target.runTransaction(async tx => {
      const paths = [];
      const proxy = new Proxy(tx, { get(real, method) {
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => { paths.push([method, args[0].path]); real[method](...args); return proxy; };
        return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
      } });
      return { value: await operation(proxy), paths };
    }).then(async ({ value, paths }) => { await observe(paths); return value; });
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}

test('early queue refuses live targets before reading Auth or a database', () => {
  assert.throws(() => createEarlyErasureQueueLab({ projectId: 'shoutout-dev-46c81' }, {}, { namespace: 'test' }), /early-erasure-emulator-only/);
});

test('early cold recovery completes all generations, keeps canonical archives and pins the original 60-day deadline', { skip: !enabled }, async t => {
  const f = await fixture(t, { generations: 2 });
  const canonical = db.doc(`shouts/${f.uid}`), archive = db.doc(`accountContentArchive/${f.uid}`), main = db.doc(`accountDeletionJobs/${accountPurgeJobRef(db, f.identity).id}`);
  f.roots.push(canonical, archive, main);
  await canonical.set({ text: 'Retained canonical content', authorId: f.uid, status: 'deleted' });
  await archive.set({ text: 'Retained archive', retainUntil: Timestamp.fromMillis(f.identity.requestCreateTime.toMillis() + accountRetentionMillis) });
  await main.set({ phase: 'needs-review', lastErrorCode: 'fixture-primary-failed' });
  const original = await db.getAll(canonical, archive, main, f.request);
  const recovered = await f.queue.recover(); assert.equal(recovered.queued, 1);
  const done = await f.drain({ maxSteps: 2 });
  const proof = await f.fresh().verify(f.identity); assert(proof.valid); assert.equal(proof.generations, 2);
  assert.equal(proof.retainUntil.toMillis(), Timestamp.fromMillis(f.identity.requestCreateTime.toMillis() + accountRetentionMillis).toMillis());
  assert(f.now < proof.retainUntil.toMillis());
  const current = await db.getAll(canonical, archive, main, f.request);
  current.forEach((doc, i) => assert(doc.updateTime.isEqual(original[i].updateTime)));
  for (const gen of f.gens) {
    assert.equal((await gen.lab.audit()).activeMetadata, 1);
    assert.equal((await gen.lab.erasureJobFor(f.identity).get()).exists, false);
    assert.equal((await gen.lab.base.get()).get('activeErasure'), undefined);
  }
  t.diagnostic('EARLY-QUEUE-BENCH ' + JSON.stringify({ calls: done.calls, generations: proof.generations, beforeDeadline: true }));
});

test('recovery is paged and independent of the primary worker; missing proof prerequisites are skipped', { skip: !enabled }, async t => {
  const f = await fixture(t), unconfirmed = db.doc(`accountDeletionRequests/a-${f.uid}`), missingMarker = db.doc(`accountDeletionRequests/z-${f.uid}`);
  f.roots.push(unconfirmed, missingMarker);
  await unconfirmed.set({ userId: unconfirmed.id, status: 'pending' });
  await missingMarker.set({ userId: missingMarker.id, status: 'pending' });
  await missingMarker.update({ authDeletionConfirmedAt: (await missingMarker.get()).createTime });
  let sawEligible = false, skipped = 0;
  for (let i = 0; i < 4; i++) {
    const result = await f.fresh().recover({ pageSize: 1 });
    assert(result.scanned <= 1); skipped += result.skipped; sawEligible ||= result.queued > 0;
  }
  assert(sawEligible); assert.equal(skipped, 2); assert.equal((await f.job.get()).get('phase'), 'queued');
  await assert.rejects(f.queue.recover({ pageSize: 51 }), /invalid-early-erasure-page/);
});

test('Auth errors neither prove deletion nor advance recovery; an existing Auth account cannot be processed', { skip: !enabled }, async t => {
  const f = await fixture(t); f.authError = Object.assign(new Error('outage'), { code: 'auth/internal-error' });
  const scan = await f.queue.recover(); assert.equal(scan.failed, 1); assert.equal(scan.checkpointAdvanced, false);
  assert.equal((await f.job.get()).exists, false);
  f.authError = null; f.authExists.add(f.uid);
  assert.equal((await f.queue.enqueue(f.identity)).state, 'auth-still-exists'); assert.equal((await f.job.get()).exists, false);
  f.authExists.clear(); await f.queue.enqueue(f.identity); f.authExists.add(f.uid);
  assert.equal((await f.queue.run(f.identity)).state, 'auth-still-exists'); assert.equal((await f.job.get()).get('phase'), 'needs-review');
  assert.equal((await f.gens[0].lab.base.get()).get('activeErasure'), undefined);
});

test('a concurrent claim has one owner and respects the retry interval', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity);
  const results = await Promise.all([f.fresh().run(f.identity), f.fresh().run(f.identity)]);
  assert.equal(results.filter(result => result.state === 'inventory').length, 1);
  assert(results.some(result => ['busy', 'deferred'].includes(result.state)));
  assert.equal((await f.queue.run(f.identity)).state, 'deferred');
  await f.drain(); assert((await f.queue.verify(f.identity)).valid);
});

test('a new generation invalidates a completed proof and reuses unchanged completed targets', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity); await f.drain();
  const old = f.gens[0], digest = (await f.queue.verify(f.identity)).digest;
  assert.equal((await old.lab.base.get()).get('erasureRevision'), 2);
  await f.register(); assert.deepEqual(await f.queue.verify(f.identity), { valid: false, reason: 'registry-changed' });
  assert.equal((await f.queue.run(f.identity)).state, 'stale-proof');
  assert.equal((await f.queue.enqueue(f.identity)).state, 'queued'); await f.drain();
  const proof = await f.queue.verify(f.identity); assert(proof.valid); assert.equal(proof.generations, 2); assert.notEqual(proof.digest, digest);
  assert.equal((await old.lab.base.get()).get('erasureRevision'), 2); // No repeated global inventory for the old generation.
});

test('registry change during an active erasure drains its journal before inventory restarts', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity);
  await f.until(result => result.state === 'selected');
  f.advance(); await f.queue.run(f.identity, { maxSteps: 1, elapsedClock: () => 0 });
  const original = (await f.job.get()).get('activeGeneration'); assert(original);
  await f.register();
  await f.drain({ maxSteps: 2 }); assert((await f.queue.verify(f.identity)).valid);
  assert.equal((await f.job.get()).get('targetCount'), 2);
  for (const gen of f.gens) assert.equal((await gen.lab.base.get()).get('activeErasure'), undefined);
});

test('replacement of a generation incarnation fails closed and never silently clears its R5 fence', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity); await f.until(result => result.state === 'selected');
  f.advance(); await f.queue.run(f.identity, { maxSteps: 1 });
  const gen = f.gens[0]; await gen.ref.delete(); await gen.ref.create({ schemaVersion: 1 });
  await f.control.update({ revision: 2 }); f.advance();
  await assert.rejects(f.queue.run(f.identity), error => error.cause instanceof EarlyErasureNeedsReview);
  assert.equal((await f.job.get()).get('phase'), 'needs-review');
  assert.equal((await gen.lab.base.get()).get('activeErasure').userId, f.uid);
  assert.equal((await f.queue.verify(f.identity)).valid, false);
});

test('replacement of the original request cannot authorize or complete the old job', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity);
  await f.request.delete(); await f.request.create({ userId: f.uid, status: 'pending' });
  await f.request.update({ authDeletionConfirmedAt: (await f.request.get()).createTime });
  const before = await f.request.get();
  f.now = Math.max(f.now, Math.ceil(before.createTime.toMillis()) + 1000);
  await assert.rejects(f.queue.run(f.identity), EarlyErasureIdentityChanged);
  assert.equal((await f.job.get()).get('phase'), 'obsolete');
  assert((await f.request.get()).updateTime.isEqual(before.updateTime));
  const replacement = { ...f.identity, requestCreateTime: before.createTime };
  await f.queue.enqueue(replacement); assert.notEqual(f.queue.jobFor(replacement).id, f.job.id);
});

test('a lease takeover between R5 steps stops the former worker without releasing the new owner', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity); await f.until(result => result.state === 'selected');
  let take = true;
  const database = afterTransaction(db, async paths => {
    if (take && paths.some(([method, path]) => method === 'create' && path.includes('/accountErasures/'))) {
      take = false; await f.job.update({ leaseToken: 'replacement', leaseUntil: Timestamp.fromMillis(f.now + 120000) });
    }
  });
  f.advance(); await assert.rejects(f.fresh(database).run(f.identity, { elapsedClock: () => 0 }), error => error.cause instanceof EarlyErasureLeaseLost);
  assert.equal((await f.job.get()).get('leaseToken'), 'replacement');
  f.now += 120001; await f.drain(); assert((await f.queue.verify(f.identity)).valid);
  assert.equal((await f.gens[0].lab.base.get()).get('erasureRevision'), 2);
});

test('final target proof and R5 closure roll back together and can be retried', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity); await f.until(result => result.state === 'selected');
  f.advance(); await assert.rejects(f.fresh(db, { beforeFinishCommit() { throw new Error('before-finish'); } }).run(f.identity,
    { elapsedClock: () => 0 }), /before-finish/);
  const target = (await f.job.get()).get('activeGeneration'), gen = f.gens.find(gen => gen.id === target);
  assert.equal((await f.job.collection('targets').doc(target).get()).get('complete'), false);
  assert.equal((await gen.lab.erasureJobFor(f.identity).get()).get('phase'), 'complete');
  assert.equal((await f.job.get()).get('doneCount'), 0); assert((await gen.lab.base.get()).get('activeErasure'));
  await f.drain(); assert((await f.queue.verify(f.identity)).valid);
  assert.equal((await f.job.get()).get('doneCount'), 1);
});

test('lost finish acknowledgement leaves one atomic proof and does not repeat an erasure', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity); await f.until(result => result.state === 'selected');
  let lose = true;
  const database = afterTransaction(db, async paths => {
    if (lose && paths.some(([method, path]) => method === 'delete' && path === f.gens[0].lab.erasureJobFor(f.identity).path)) {
      lose = false; throw new Error('lost-finish-ack');
    }
  });
  f.advance(); await assert.rejects(f.fresh(database).run(f.identity, { elapsedClock: () => 0 }), /lost-finish-ack/);
  assert.equal((await f.job.get()).get('doneCount'), 1); assert.equal((await f.job.get()).get('activeGeneration'), null);
  assert.equal((await f.gens[0].lab.erasureJobFor(f.identity).get()).exists, false);
  await f.drain(); assert((await f.queue.verify(f.identity)).valid);
  assert.equal((await f.gens[0].lab.base.get()).get('erasureRevision'), 2);
});

test('generation inventory is paged at 50 and never reports a truncated set as complete', { skip: !enabled }, async t => {
  const f = await fixture(t, { generations: 0 });
  for (let i = 0; i < 51; i++) await f.register({ empty: true });
  await f.queue.enqueue(f.identity);
  const first = await f.queue.run(f.identity); assert.equal(first.generations, 50); assert.equal((await f.job.get()).get('stage'), 'inventory');
  f.advance(); const second = await f.fresh().run(f.identity); assert.equal(second.generations, 1);
  assert.equal((await f.job.get()).get('targetCount'), 51); assert.equal((await f.job.get()).get('stage'), 'processing');
  assert.equal((await f.queue.verify(f.identity)).valid, false);
});

test('due working jobs resume ahead of new work and queued jobs prefer the original earliest deadline', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity);
  const request = db.doc(`accountDeletionRequests/later-${f.uid}`), profile = db.doc(`publicProfiles/later-${f.uid}`); f.roots.push(request, profile);
  await request.set({ userId: request.id, status: 'pending' });
  await request.update({ authDeletionConfirmedAt: (await request.get()).createTime }); await profile.set(marker);
  const later = { projectId: db.projectId, userId: request.id, requestCreateTime: (await request.get()).createTime };
  f.now = Math.max(f.now, Math.ceil(later.requestCreateTime.toMillis()) + 1000);
  await f.queue.enqueue(later);
  const first = await f.queue.runNext(); assert.equal(first.jobId, f.job.id);
  f.advance(); const resumed = await f.fresh().runNext(); assert.equal(resumed.jobId, f.job.id);
});

test('concurrent recovery shares a checkpoint and cannot move past a page twice', { skip: !enabled }, async t => {
  const f = await fixture(t);
  let arrived = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const database = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => {
      // Both scans must capture the same checkpoint before either enqueues.
      if (arrived < 2) { if (++arrived === 2) release(); await gate; }
      return target.runTransaction(...args);
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  const results = await Promise.all([f.fresh(database).recover({ pageSize: 1 }), f.fresh(database).recover({ pageSize: 1 })]);
  assert.equal(results.filter(result => result.checkpointAdvanced).length, 1);
  assert.equal((await f.queue.base.get()).get('cursor'), f.uid);
  assert.equal((await f.queue.base.collection('jobs').get()).size, 1);
});

test('queue selection rejects a mismatched identity key before querying Auth', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity);
  const calls = f.authCalls;
  await f.job.update({ userId: 'another-user' });
  await assert.rejects(f.queue.runNext(), /invalid-early-erasure-job-key/);
  assert.equal(f.authCalls, calls);
});

test('an unregistered configured writer never produces a completion proof', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity);
  await f.control.update({ writeGenerationIds: [...f.gens.map(gen => gen.id), 'missing'] });
  await assert.rejects(f.queue.run(f.identity), /unregistered-control-generation/);
  assert.equal((await f.job.get()).get('phase'), 'needs-review');
  assert.equal((await f.queue.verify(f.identity)).valid, false);
});

test('a missing pending target cannot be mistaken for a completed empty queue', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.queue.enqueue(f.identity); await f.queue.run(f.identity);
  await f.job.collection('targets').doc(f.gens[0].id).delete(); f.advance();
  await assert.rejects(f.queue.run(f.identity), /incomplete-early-erasure-targets/);
  assert.equal((await f.job.get()).get('phase'), 'needs-review');
  assert.equal((await f.queue.verify(f.identity)).valid, false);
});
