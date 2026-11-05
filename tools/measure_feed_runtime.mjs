// Synthetic R5 capacity measurement. Never connects to a live project or Auth.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createLabBlockIndex } from '../functions/feed_block_index_lab.js';
import { encodeGeohash } from '../functions/geohash.js';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw new Error('measurement-requires-local-firestore-emulator');
}
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'shoutout-rules-test' }, 'feed-runtime-measurement');
const db = getFirestore(app);
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

function meter(database, counters) {
  return new Proxy(database, { get(target, key) {
    if (key === 'runTransaction') return (fn, ...options) => target.runTransaction(async real => {
      counters.attempts++;
      const tx = new Proxy(real, { get(transaction, method) {
        if (method === 'get') return async (...args) => {
          const value = await transaction.get(...args);
          counters.readUnits += Math.max(1, value.size ?? 1); return value;
        };
        if (method === 'getAll') return async (...args) => {
          const value = await transaction.getAll(...args); counters.readUnits += value.length; return value;
        };
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => {
          counters[method === 'delete' ? 'deleteCalls' : 'writeCalls']++;
          transaction[method](...args); return tx;
        };
        return typeof transaction[method] === 'function' ? transaction[method].bind(transaction) : transaction[method];
      } });
      return fn(tx);
    }, ...options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}

async function measure({ name, rows, regions, churn }) {
  const uid = `measure-${randomUUID()}`, namespace = `measure-${randomUUID().slice(0, 8)}`;
  const request = db.doc(`accountDeletionRequests/${uid}`), profile = db.doc(`publicProfiles/${uid}`);
  const fresh = database => createLabBlockIndex(database, { namespace, accountRetention: true });
  const lab = fresh(db), point = { latitude: 50.66, longitude: 14.04 };
  const pointFor = i => regions === 1 ? point : {
    latitude: -60 + Math.floor(i / 64) * 0.4, longitude: -150 + (i % 64) * 0.8,
  };
  try {
    await request.set({ userId: uid, status: 'pending' });
    const created = (await request.get()).createTime, now = Math.ceil(created.toMillis()) + 1;
    await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(now) });
    await profile.set({ nickname: 'Synthetic fixture' });
    const row = (id, location, authorId = 'foreign') => ({ id, authorId, status: 'active', location,
      geohash: encodeGeohash(location.latitude, location.longitude), categories: ['help'],
      createdAt: now - 1000, expiresAt: now + 86400000, likesCount: 0, dislikesCount: 0 });
    const input = [row('own', point, uid), ...Array.from({ length: rows }, (_, i) =>
      row(`foreign-${String(i).padStart(5, '0')}`, pointFor(i % regions)))];
    await lab.seed([]);
    for (let i = 0; i < input.length; i += 50) {
      const batch = input.slice(i, i + 50);
      await db.runTransaction(async tx => {
        const plan = await lab.prepareBatch(tx, batch.map(value => ({ id: value.id, before: null, after: value })));
        batch.forEach(value => tx.create(lab.base.collection('source').doc(value.id), value)); plan.apply();
      });
    }
    // Churn rewrites an owned leaf, retaining historical copies of the owner.
    const original = input[0];
    for (let i = 1; i <= churn; i++) await lab.mutate('own', { ...original, likesCount: i });
    const before = await lab.inspect(), auditBefore = await lab.audit();
    const historyBefore = (await lab.base.collection('retiredRoots').get()).size;
    const foreign = lab.base.collection('source').doc('foreign-00000');
    const foreignDigest = digest((await foreign.get()).data());
    await profile.set({ schemaVersion: 1, accountStatus: 'deleted' });
    const identity = { projectId: db.projectId, userId: uid, requestCreateTime: created };
    const counters = { attempts: 0, readUnits: 0, writeCalls: 0, deleteCalls: 0 };
    const measuredDb = meter(db, counters), phases = {};
    let calls = 0, lockedAfterCalls = 0, longestStepMs = 0, result;
    const started = performance.now();
    do {
      const adapter = fresh(measuredDb), prior = (await adapter.erasureJobFor(identity).get()).get('phase') ?? 'start';
      phases[prior] = (phases[prior] ?? 0) + 1;
      const stepStarted = performance.now();
      result = await adapter.purgeAccountIndex(identity, { clock: () => new Date(now) });
      longestStepMs = Math.max(longestStepMs, performance.now() - stepStarted);
      calls++;
      const fences = await lab.base.collection('cellRetention').get();
      if (fences.docs.some(doc => doc.get('owner'))) lockedAfterCalls++;
      assert(calls < 5000, 'measurement did not finish');
    } while (result.state !== 'complete');
    const stepCounters = { ...counters };
    await measuredDb.runTransaction(async tx => {
      const plan = await fresh(measuredDb).prepareAccountIndexFinish(tx, identity, { clock: () => new Date(now) }); plan.apply();
    });
    const elapsedMs = Math.round(performance.now() - started);
    const after = await lab.inspect(), auditAfter = await lab.audit();
    assert.equal(auditAfter.activeMetadata, rows);
    assert.equal(digest((await foreign.get()).data()), foreignDigest);
    assert.equal((await lab.base.get()).get('activeErasure'), undefined);
    assert.equal((await lab.erasureJobFor(identity).get()).exists, false);
    assert((await lab.base.collection('nodes').get()).docs.every(doc => !doc.get('rows')?.some(value => value.authorId === uid)));
    return { name, foreignRows: rows, requestedRegions: regions, churn, before, historyBefore,
      currentNodesBefore: auditBefore.currentNodes, after, calls, phases, lockedAfterCalls,
      singleStepPerMinuteLockMinutes: lockedAfterCalls, elapsedMs, longestStepMs: Math.round(longestStepMs),
      stepCounters, totalIncludingFinish: counters,
      verification: { foreignSourceUnchanged: true, ownerAbsentFromAllNodes: true, coldAdapterEveryStep: true, journalClosed: true } };
  } finally {
    await db.recursiveDelete(lab.base); await request.delete(); await profile.delete();
  }
}

const report = { schemaVersion: 1, sourceBase: '20cd41f8c3b42b8d03bddc83bda3c3fab85147c3',
  environment: { project: 'shoutout-rules-test', emulator: '127.0.0.1:8080', authAccountsCreated: 0 },
  notes: ['Counts cover R5 transaction attempts and final journal closure; setup, observation, audit and fixture cleanup are excluded.',
    'No cloud latency, billing index entries, storage overhead, retries under load or scheduling delay is measured.',
    'Single-step-per-minute duration is a scheduling model, not cloud timing. Limits are existing reads=32/deletes=16.'],
  cases: [] };
try {
  for (const scenario of [
    { name: 'small-hotspot', rows: 80, regions: 1, churn: 4 },
    { name: 'distributed', rows: 1024, regions: 128, churn: 32 },
    { name: 'wide-directory', rows: 1024, regions: 1024, churn: 32 },
    { name: 'dense-history', rows: 1024, regions: 1, churn: 96 },
  ]) {
    const result = await measure(scenario); report.cases.push(result);
    console.log(JSON.stringify(result));
  }
  await writeFile(new URL('../build/feed-runtime-measurement.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
} finally { await db.terminate(); await deleteApp(app); }
