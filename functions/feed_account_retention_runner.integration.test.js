import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { encodeGeohash } from './geohash.js';
import { accountPurgeJobRef, initialAccountPurgeJob, readAccountPurgeGuard, accountRetentionMillis,
  AccountPurgeLeaseLost, AccountPurgeRequestChanged, AccountPurgeNeedsReview } from './account_purge_guard.js';
import { accountPurgeStages } from './account_purge_policy.js';
import { runAccountIndexErasureSlice, AccountIndexSliceError } from './feed_account_retention_runner_lab.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'retention-runner-tests') : null;
const db = app ? getFirestore(app) : null, roots = [];
after(async () => { if (app) {
  for (const root of roots) await db.recursiveDelete(root);
  await db.terminate(); await deleteApp(app);
} });

async function fixture(churn = 0, foreignCount = 3) {
  const uid = randomUUID(), namespace = `runner-${uid.slice(0, 8)}`;
  const request = db.doc(`accountDeletionRequests/${uid}`), profile = db.doc(`publicProfiles/${uid}`);
  roots.push(request, profile);
  await request.set({ userId: uid, status: 'pending' });
  const created = (await request.get()).createTime, now = Math.ceil(created.toMillis()) + accountRetentionMillis;
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(Math.ceil(created.toMillis())) });
  const identity = { projectId: db.projectId, userId: uid, requestCreateTime: created };
  const job = accountPurgeJobRef(db, identity), lab = createLabBlockIndex(db, { namespace, accountRetention: true });
  roots.push(job, lab.base);
  const point = { latitude: 50.66, longitude: 14.04 };
  const row = (id, authorId) => ({ id, authorId, status: 'active', location: point,
    geohash: encodeGeohash(point.latitude, point.longitude), categories: ['help'],
    createdAt: now - 1000, expiresAt: now + 86400000, likesCount: 0, dislikesCount: 0 });
  const own = row('own', uid);
  await lab.seed([own, ...Array.from({ length: foreignCount }, (_, i) => row(`foreign-${i}`, 'foreign'))]);
  for (let i = 1; i <= churn; i++) await lab.mutate('own', { ...own, likesCount: i });
  await profile.set({ schemaVersion: 1, accountStatus: 'deleted' });
  await job.set({ ...initialAccountPurgeJob(identity, Timestamp.fromMillis(now)), phase: 'purging',
    ingressClosedAt: Timestamp.fromMillis(now), leaseToken: 'owner-a', leaseUntil: Timestamp.fromMillis(now + 120000) });
  const f = { uid, namespace, identity, now, job, request, profile, lab };
  f.guard = token => tx => readAccountPurgeGuard(tx, db, identity, job, token, () => new Date(f.now), accountPurgeStages(uid).length);
  f.run = ({ database = db, token = 'owner-a', ...options } = {}) => runAccountIndexErasureSlice(identity, database,
    { namespace, guard: f.guard(token), clock: () => new Date(f.now), elapsedClock: () => 0, ...options });
  return f;
}

function afterCommit(database, callback) {
  return new Proxy(database, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => {
      const result = await target.runTransaction(...args); await callback(); return result;
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}

test('runner refuses a live project even when an emulator host is set', async () => {
  await assert.rejects(runAccountIndexErasureSlice({}, { projectId: 'shoutout-dev-46c81' }), /index-runner-emulator-only/);
});

test('R6a default slice stops at 32 steps and cold invocations finish with foreign sources intact', { skip: !enabled }, async t => {
  const f = await fixture(80, 80), source = f.lab.base.collection('source').doc('foreign-0');
  const original = (await source.get()).data(), first = await f.run();
  assert.equal(first.state, 'yielded'); assert.equal(first.reason, 'step-budget'); assert.equal(first.steps, 32);
  let result = first, invocations = 1, steps = first.steps;
  const totals = { ...first.metrics };
  while (result.state !== 'complete') {
    result = await f.run(); invocations++; steps += result.steps;
    for (const key of Object.keys(totals)) totals[key] += result.metrics[key];
    assert(invocations < 20);
  }
  assert.equal(result.retainUntil.toMillis(), Timestamp.fromMillis(f.identity.requestCreateTime.toMillis() + accountRetentionMillis).toMillis());
  assert.deepEqual((await source.get()).data(), original);
  assert.equal((await f.lab.audit()).activeMetadata, 80);
  assert((await f.lab.base.collection('nodes').get()).docs.every(doc => !doc.get('rows')?.some(row => row.authorId === f.uid)));
  assert((await f.lab.base.collection('cellRetention').get()).docs.every(doc => !doc.get('owner')));
  assert.equal((await f.lab.erasureJobFor(f.identity).get()).get('phase'), 'complete');
  assert.equal((await f.job.get()).get('leaseToken'), 'owner-a'); // Runner neither claims nor releases a lease.
  assert.equal(totals.attempts, steps); assert.equal(totals.acknowledgedTransactions, steps);
  t.diagnostic('R6A-RUNNER-BENCH ' + JSON.stringify({ invocations, steps, totals }));
});

test('time budget is checked between transactions and can yield without starting one', { skip: !enabled }, async () => {
  const f = await fixture(); let elapsed = 0;
  const database = afterCommit(db, async () => { elapsed += 6000; });
  const result = await f.run({ database, elapsedClock: () => elapsed });
  assert.equal(result.reason, 'time-budget'); assert.equal(result.steps, 2); assert.equal(result.elapsedMillis, 12000);
  assert.equal(result.metrics.acknowledgedTransactions, 2);
  let samples = 0;
  const zero = await f.run({ elapsedClock: () => samples++ === 0 ? 0 : 10000 });
  assert.equal(zero.steps, 0); assert.equal(zero.metrics.attempts, 0);
});

test('all seven initial reads include the actual outer purge guard; missing options do not write', { skip: !enabled }, async () => {
  const f = await fixture();
  for (const options of [{ guard: null }, { maxSteps: 33 }, { maxMillis: 10001 }, { maxSteps: 0 }, { elapsedClock: () => NaN }]) {
    await assert.rejects(f.run(options), /invalid-index-runner/);
  }
  assert.equal((await f.lab.erasureJobFor(f.identity).get()).exists, false);
  const first = await f.run({ maxSteps: 1 });
  assert.equal(first.metrics.readUnits, 7); assert.equal(first.metrics.readRequests, 3);
  assert.equal(first.metrics.writeCalls, 2); assert.equal(first.metrics.acknowledgedWrites, 2);
});

test('lease takeover between steps stops the old worker and the new owner resumes the same journal', { skip: !enabled }, async () => {
  const f = await fixture(); let takeover = true;
  const database = afterCommit(db, async () => { if (takeover) {
    takeover = false; await f.job.update({ leaseToken: 'owner-b', leaseUntil: Timestamp.fromMillis(f.now + 120000) });
  } });
  await assert.rejects(f.run({ database }), error => {
    assert(error instanceof AccountIndexSliceError); assert(error.cause instanceof AccountPurgeLeaseLost);
    assert.equal(error.report.steps, 1); assert.equal(error.report.metrics.attempts, 2);
    assert.equal(error.report.metrics.readUnits, 10); assert.equal(error.report.metrics.acknowledgedTransactions, 1); return true;
  });
  const continued = await f.run({ token: 'owner-b' }); assert.equal(continued.state, 'complete');
  assert.equal((await f.lab.audit()).activeMetadata, 3);
});

test('concurrent owner and non-owner cannot both mutate the erasure journal', { skip: !enabled }, async () => {
  const f = await fixture();
  const [owner, other] = await Promise.allSettled([f.run(), f.run({ token: 'owner-b' })]);
  assert.equal(owner.status, 'fulfilled'); assert.equal(owner.value.state, 'complete');
  assert.equal(other.status, 'rejected'); assert(other.reason.cause instanceof AccountPurgeLeaseLost);
  assert.equal(other.reason.report.metrics.acknowledgedTransactions, 0);
  assert.equal((await f.lab.audit()).activeMetadata, 3);
});

test('overlapping invocations with the same valid lease serialize journal progress', { skip: !enabled }, async () => {
  const f = await fixture();
  const results = await Promise.all([f.run(), f.run()]);
  assert(results.every(result => result.state === 'complete'));
  assert.equal((await f.lab.base.get()).get('erasureRevision'), 1);
  assert.equal((await f.lab.audit()).activeMetadata, 3);
  assert.equal((await f.lab.erasureJobFor(f.identity).get()).get('phase'), 'complete');
});

test('an SDK transaction retry counts both attempts but only the acknowledged writes', { skip: !enabled }, async () => {
  const f = await fixture(); let abort = true;
  const result = await f.run({ maxSteps: 1, beforeCommit: () => {
    if (abort) { abort = false; throw Object.assign(new Error('injected-abort'), { code: 10 }); }
  } });
  assert.equal(result.steps, 1); assert.equal(result.metrics.attempts, 2);
  assert.equal(result.metrics.readUnits, 14); assert.equal(result.metrics.writeCalls, 4);
  assert.equal(result.metrics.acknowledgedTransactions, 1); assert.equal(result.metrics.acknowledgedWrites, 2);
});

test('lost commit acknowledgement reports uncertainty and cold retry does not restart inventory', { skip: !enabled }, async () => {
  const f = await fixture(); let lose = true;
  const database = afterCommit(db, async () => { if (lose) { lose = false; throw new Error('lost-commit-ack'); } });
  await assert.rejects(f.run({ database }), error => {
    assert.equal(error.cause.message, 'lost-commit-ack'); assert.equal(error.report.steps, 0);
    assert.equal(error.report.metrics.acknowledgedTransactions, 0); assert.equal(error.report.metrics.writeCalls, 2); return true;
  });
  assert.equal((await f.lab.erasureJobFor(f.identity).get()).get('version'), 0);
  assert.equal((await f.run()).state, 'complete');
  assert.equal((await f.lab.base.get()).get('erasureRevision'), 1); // No second journal/start revision.
});

test('an expired lease, changed request and original pre-deadline purge guard stay fail-closed', { skip: !enabled }, async () => {
  for (const failure of ['lease', 'request', 'deadline']) {
    const f = await fixture();
    if (failure === 'lease') f.now += 120001;
    if (failure === 'request') await f.request.update({ status: 'cancelled' });
    if (failure === 'deadline') f.now -= 1000;
    await assert.rejects(f.run(), error => {
      const type = failure === 'lease' ? AccountPurgeLeaseLost : failure === 'request' ? AccountPurgeRequestChanged : AccountPurgeNeedsReview;
      assert(error.cause instanceof type); assert.equal(error.report.metrics.acknowledgedTransactions, 0); return true;
    });
    assert.equal((await f.lab.erasureJobFor(f.identity).get()).exists, false);
  }
});

test('a failure after planned writes rolls back that step and backward elapsed time stops the next step', { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(f.run({ beforeCommit: () => { throw new Error('before-commit'); } }), error => {
    assert.equal(error.report.metrics.writeCalls, 2); assert.equal(error.report.metrics.acknowledgedWrites, 0); return true;
  });
  assert.equal((await f.lab.erasureJobFor(f.identity).get()).exists, false);
  let samples = 0;
  await assert.rejects(f.run({ elapsedClock: () => samples++ < 2 ? 10 : 9 }), error => {
    assert.equal(error.cause.message, 'invalid-index-runner-elapsed-clock'); assert.equal(error.report.steps, 1); return true;
  });
});
