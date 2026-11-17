import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRetentionRuntime } from './retention_runtime.js';
import { readBucketId, readContentHash, readKey, readRetentionMillis as week } from './read_sync_blocks.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'retention-runtime-tests') : null;
const db = app ? getFirestore(app) : null, day = 86400000, base = Math.floor(Date.now() / 60000) * 60000;
let millis;
const paths = ['maintenanceState/retentionControl', 'maintenanceState/readRetentionCleanup',
  'maintenanceState/continuingReceiptCleanup', 'maintenanceState/readSyncControl'];
const clock = () => new Date(millis), control = () => db.doc(paths[0]);
beforeEach(async () => { if (db) { millis = base; for (const path of paths) await db.doc(path).delete(); } });
after(async () => { if (db) { for (const path of paths) await db.doc(path).delete(); await db.terminate(); await deleteApp(app); } });
async function fixture(t, days = [1]) {
  const user = db.doc(`users/${randomUUID()}`); t.after(() => db.recursiveDelete(user));
  const buckets = user.collection('readBuckets');
  for (const [i, age] of days.entries()) {
    const expiresAt = base - week - age * day, bucketDay = Math.floor(expiresAt / day);
    const row = { shoutId: `row-${i}`, contentHash: readContentHash('title', String(i)), expiresAt,
      retainUntil: expiresAt + week, confirmedAt: expiresAt - 1000 };
    await buckets.doc(readBucketId(bucketDay)).set({ v: 1, revision: 1, day: bucketDay, prefix: '', kind: 'leaf', entries: { [readKey(row.shoutId, row.contentHash)]: row } });
  }
  return { user, buckets };
}
const activate = () => control().set({ v: 1, revision: 1, mode: 'active' });
const runtime = options => createRetentionRuntime(db, { enabled: true, clock, ...options });

test('missing/invalid/off/paused control never creates cleanup checkpoints or changes sources', { skip: !enabled }, async t => {
  const f = await fixture(t);
  for (const record of [null, { v: 99 }, { v: 1, revision: 1, mode: 'off' }, { v: 1, revision: 1, mode: 'paused' }]) {
    if (record) await control().set(record);
    const result = await runtime().run(); assert(['off', 'paused'].includes(result.state)); assert.equal(result.controlReads, 1);
    for (const path of paths.slice(1, 3)) assert.equal((await db.doc(path).get()).exists, false);
    assert.equal((await f.buckets.get()).size, 1);
  }
});

test('completed epochs sleep 24 hours while read synchronization can remain paused', { skip: !enabled }, async t => {
  const f = await fixture(t); await activate();
  await db.doc(paths[3]).set({ v: 1, revision: 1, mode: 'paused' });
  const first = await runtime().run(); assert.equal(first.state, 'checked'); assert.equal(first.phases.reads.deleted, 1);
  assert.equal((await db.doc(paths[1]).get()).get('nextRunAt').toMillis(), base + day);
  await f.buckets.doc('unexpected').set({ v: 99, day: Math.floor((base - week) / day) });
  millis += 60000;
  const idle = await runtime().run();
  for (const result of Object.values(idle.phases)) {
    assert.equal(result.state, 'idle'); assert.equal(result.metrics.readUnits, 1); assert.equal(result.metrics.committedWrites, 0);
  }
  assert.equal(idle.controlReads + Object.values(idle.phases).reduce((n, result) => n + result.metrics.readUnits, 0), 3);
  assert.equal((await f.buckets.get()).size, 1);
  millis = base + day;
  assert.equal((await runtime().run()).phases.reads.skipped, 1);
});

test('cold adapter invocations continue debt immediately instead of applying the completed cooldown', { skip: !enabled }, async t => {
  const f = await fixture(t, [1, 2]); await activate();
  let deleted = 0, result;
  for (let i = 0; i < 4; i++) {
    result = await runtime({ pageSize: 1, maxPages: 1 }).run(); deleted += result.phases.reads.deleted;
    if (result.phases.reads.state === 'complete') break;
  }
  assert.equal(deleted, 2); assert.equal(result.phases.reads.state, 'complete'); assert.equal((await f.buckets.get()).size, 0);
});

test('pause/reactivate between admission and claim invalidates both old phase requests', { skip: !enabled }, async t => {
  const f = await fixture(t); await activate();
  const result = await runtime({ afterAdmission: async () => {
    await control().set({ v: 1, revision: 2, mode: 'paused' });
    await control().set({ v: 1, revision: 3, mode: 'active' });
  } }).run();
  assert.equal(result.state, 'interrupted');
  for (const phase of Object.values(result.phases)) assert.equal(phase.errorCode, 'retention-control-changed');
  assert.equal((await f.buckets.get()).size, 1);
  assert.equal((await db.doc(paths[1]).get()).exists, false);
});

test('rewriting the same active revision still fences the admitted incarnation', { skip: !enabled }, async t => {
  const f = await fixture(t); await activate();
  const result = await runtime({ afterAdmission: async () => {
    await control().set({ v: 1, revision: 1, mode: 'paused' });
    await control().set({ v: 1, revision: 1, mode: 'active' });
  } }).run();
  assert.equal(result.state, 'interrupted'); assert.equal((await f.buckets.get()).size, 1);
  for (const phase of Object.values(result.phases)) assert.equal(phase.errorCode, 'retention-control-changed');
});

test('a pause after a committed page fences the next page and resume preserves the cursor', { skip: !enabled }, async t => {
  const f = await fixture(t, [1, 2]); await activate(); let paused = false;
  const observed = new Proxy(db, { get(target, name) {
    if (name === 'runTransaction') return async (...args) => {
      const result = await target.runTransaction(...args);
      if (!paused && result?.next?.kind === 'reads' && result.delta?.deleted === 1 && !result.complete) {
        paused = true; await control().set({ v: 1, revision: 2, mode: 'paused' });
      }
      return result;
    };
    return typeof target[name] === 'function' ? target[name].bind(target) : target[name];
  } });
  const stopped = await createRetentionRuntime(observed, { enabled: true, clock, pageSize: 1 }).run();
  assert.equal(stopped.state, 'interrupted'); assert.equal((await f.buckets.get()).size, 1);
  const cursor = (await db.doc(paths[1]).get()).get('cursor'); assert(cursor);
  millis += 60000; await control().set({ v: 1, revision: 3, mode: 'active' });
  assert.equal((await runtime().run()).phases.reads.deleted, 1); assert.equal((await f.buckets.get()).size, 0);
});

test('concurrent adapters share phase leases and acknowledge each source only once', { skip: !enabled }, async t => {
  const f = await fixture(t, [1, 2]); await activate();
  const results = await Promise.all([runtime().run(), runtime().run()]);
  assert.equal(results.reduce((total, r) => total + r.phases.reads.deleted, 0), 2); assert.equal((await f.buckets.get()).size, 0);
});

test('failure in receipt phase does not disable read cleanup', { skip: !enabled }, async t => {
  const f = await fixture(t); await activate();
  const result = await runtime({ beforeCommit({ kind }) { if (kind === 'receipts') throw Error('fixture-failure'); } }).run();
  assert.equal(result.phases.receipts.state, 'failed'); assert.equal(result.phases.reads.state, 'complete');
  assert.equal((await f.buckets.get()).size, 0);
});
