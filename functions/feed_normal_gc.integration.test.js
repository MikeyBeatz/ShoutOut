import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { runNormalIndexGc as run } from './feed_normal_gc.js';
import { metadataOf, treeBuilder } from './feed_block_index.js';
import { encodeGeohash } from './geohash.js';
import { cellGrid } from './feed_block_index_store.js';
import { indexMaintenance } from './feed_index_maintenance.js';
import { createFeedRuntime } from './feed_runtime.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'feed-normal-gc-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t, { cardProjection = false } = {}) {
  const base = db.doc(`feedIndexGenerations/gc-${randomUUID().slice(0, 8)}`), control = db.doc('feedIndexControl/current');
  const roots = [base, control, db.doc('feedIndexMaintenance/gcSweep'), db.doc('feedIndexMaintenance/runtime')];
  for (const ref of roots) assert.equal((await ref.get()).exists, false);
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  const location = { latitude: 50.08, longitude: 14.44 }, geohash = encodeGeohash(location.latitude, location.longitude), cell = geohash.slice(0, 4);
  const row = { id: 'fixture', authorId: 'preserved-author', authorNickname: 'Synthetic', title: 'Synthetic card', text: 'Preserve the current body',
    location, geohash, status: 'active', createdAt: Timestamp.fromMillis(Date.now() - 1000),
    expiresAt: Timestamp.fromMillis(Date.now() + 7200000), categories: ['Dotaz'], likesCount: 0, dislikesCount: 0 };
  const format = { cardProjection, contentIdentity: cardProjection };
  const builder = treeBuilder(format), descriptor = builder.build([metadataOf(row, format)], cell), batch = db.batch();
  batch.create(base, { v: cardProjection ? 2 : 1, schemaVersion: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1,
    ...(cardProjection ? { cardProjection: 1, cardReady: true, readIdentity: 1 } : {}) });
  batch.create(control, { schemaVersion: cardProjection ? 2 : 1, revision: 1, mode: 'active', readGenerationId: base.id, writeGenerationIds: [base.id],
    ...(cardProjection ? { cardReadGenerationId: base.id, cardWriteGenerationIds: [base.id] } : {}) });
  batch.create(base.collection('cells').doc(cell), { v: 1, revision: 1, hash: descriptor.hash, minExpiry: descriptor.minExpiry, ...cellGrid(cell) });
  for (const [hash, node] of builder.writes) batch.create(base.collection('nodes').doc(hash), node);
  // Old retiredAt triggers discovery, while actual createTime correctly keeps
  // this newly created root protected for the full session hour.
  batch.create(base.collection('retiredRoots').doc('old-candidate'), { kind: 'feed-index-root', v: 1, cell,
    hash: descriptor.hash, retiredAt: Timestamp.fromMillis(Date.now() - 7200000) });
  await batch.commit();
  const orphanBuilder = treeBuilder(format);
  for (let i = 1; i <= 40; i++) orphanBuilder.build([metadataOf({ ...row, likesCount: i }, format)], cell);
  const orphans = [...orphanBuilder.writes].filter(([hash]) => !builder.writes.has(hash)), extras = db.batch();
  for (const [hash, node] of orphans) extras.create(base.collection('nodes').doc(hash), node);
  await extras.commit(); const orphan = orphans[0];
  return { base, control, cell, orphan: base.collection('nodes').doc(orphan[0]), hash: descriptor.hash,
    job: base.collection('gcJobs').doc(cell) };
}

test('normal GC uses actual runtime paths, resumes cold slices and preserves current/protected trees', { skip: !enabled }, async t => {
  const f = await fixture(t); let result;
  for (let i = 0; i < 30; i++) {
    result = await run(db, { maxSteps: 1 });
    if (result.state === 'complete') break;
    assert.equal(result.state, 'yielded');
    const job = await f.job.get(); assert(job.get('checkpoint')); assert.equal(job.get('leaseToken'), null);
    assert(!JSON.stringify(job.data()).includes('preserved-author'));
    await f.job.update({ nextAttemptAt: Timestamp.fromMillis(0) });
  }
  assert.equal(result.state, 'complete'); assert.equal((await f.job.get()).exists, false);
  assert.equal((await f.orphan.get()).exists, false);
  assert.equal((await f.base.collection('nodes').doc(f.hash).get()).exists, true);
  assert.equal((await f.base.collection('retiredRoots').get()).size, 1);
});

test('card-format GC resumes a cold checkpoint and preserves current and session-protected v2 trees', { skip: !enabled }, async t => {
  const f = await fixture(t, { cardProjection: true }); let result;
  for (let n = 0; n < 30; n++) {
    result = await run(db, { maxSteps: 1 });
    if (result.state === 'complete') break;
    assert.equal(result.state, 'yielded');
    const job = await f.job.get(); assert(job.get('checkpoint')); assert.equal(job.get('leaseToken'), null);
    await f.job.update({ nextAttemptAt: Timestamp.fromMillis(0) });
  }
  assert.equal(result.state, 'complete'); assert(!(await f.job.get()).exists);
  assert(!(await f.orphan.get()).exists); assert((await f.base.collection('nodes').doc(f.hash).get()).exists);
  assert.equal((await f.base.collection('retiredRoots').get()).size, 1);
});

test('concurrent v2 GC workers fence a single lease and keep current nodes', { skip: !enabled }, async t => {
  const f = await fixture(t, { cardProjection: true });
  const results = await Promise.all([run(db, { maxSteps: 1 }), run(db, { maxSteps: 1 })]);
  assert(results.every(r => ['yielded', 'idle', 'busy'].includes(r.state)));
  assert(results.some(r => r.state === 'yielded'));
  assert((await f.base.collection('nodes').doc(f.hash).get()).exists);
  assert.equal((await f.base.collection('gcJobs').get()).size, 1);
});

test('installed archive runtime performs v2 normal GC without an index failure or content mutation', { skip: !enabled }, async t => {
  const f = await fixture(t, { cardProjection: true });
  const queue = db.doc('feedIndexMaintenance/erasureQueue');
  t.after(() => db.recursiveDelete(queue));
  const runtime = createFeedRuntime(db, { getUser() { assert.fail('No Auth call without an account erasure'); } }, {
    enabled: true, contentLifecycleEnabled: true, contentCaptureEnabled: true, contentMaintenanceEnabled: true,
    enforceArchiveDisclosure: true, disclosurePolicy: { archiveDisclosureEnabled: true, version: '2026-11-27' },
  });
  const result = await runtime.indexMaintenance();
  assert.equal(result.indexFailed, 0); assert.equal(result.indexNeedsReview, 0); assert.equal(result.indexState, 'gc:complete');
  assert(!(await f.orphan.get()).exists); assert((await f.base.collection('nodes').doc(f.hash).get()).exists);
  assert((await db.collection('contentLifecycleArchive').limit(1).get()).empty);
});

test('unknown format or inconsistent card/content flags reject before lease or sweep deletion', { skip: !enabled }, async t => {
  const f = await fixture(t, { cardProjection: true });
  for (const patch of [{ v: 3 }, { v: 1, cardProjection: 1 }, { v: 2, cardProjection: 0 }, { v: 2, cardProjection: 1, readIdentity: 2 }]) {
    await f.base.update({ v: 2, cardProjection: 1, readIdentity: 1, ...patch });
    await db.doc('feedIndexMaintenance/gcSweep').delete();
    await assert.rejects(run(db), /invalid-index-(?:card-format|content-identity-mode)/);
    assert(!(await f.job.get()).exists);
    assert((await f.base.collection('nodes').doc(f.hash).get()).exists);
    assert((await f.orphan.get()).exists);
  }
});

test('checkpoint root change restarts safely; corruption goes to review without deleting current data', { skip: !enabled }, async t => {
  const f = await fixture(t); assert.equal((await run(db, { maxSteps: 1 })).state, 'yielded');
  await f.base.collection('cells').doc(f.cell).update({ revision: 2 });
  await f.job.update({ nextAttemptAt: Timestamp.fromMillis(0) });
  assert.equal((await run(db)).state, 'restarted'); assert.equal((await f.job.get()).exists, false);
  assert.equal((await run(db)).state, 'idle'); // End of the bounded discovery scan resets its cursor.
  assert.equal((await run(db, { maxSteps: 1 })).state, 'yielded');
  const checkpoint = (await f.job.get()).get('checkpoint');
  await f.job.update({ nextAttemptAt: Timestamp.fromMillis(0), checkpoint: { ...checkpoint, digest: 'bad' } });
  assert.equal((await run(db)).state, 'needs-review');
  assert.equal((await f.job.get()).get('phase'), 'needs-review');
  assert.equal((await f.base.collection('nodes').doc(f.hash).get()).exists, true);
});

test('absent/off control performs no GC work; paused reader still permits maintenance', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.control.update({ mode: 'paused', readGenerationId: null });
  assert.equal((await run(db)).state, 'complete');
  await f.control.update({ mode: 'off', writeGenerationIds: [] });
  assert.deepEqual(await run(db), { state: 'idle', steps: 0 });
  await f.control.delete(); assert.deepEqual(await run(db), { state: 'idle', steps: 0 });
});

test('maintenance resumes erasure before GC and alternates new work durably across cold factories', { skip: !enabled }, async t => {
  const ref = db.doc('feedIndexMaintenance/runtime'); t.after(() => db.recursiveDelete(ref));
  const calls = []; let working = true;
  const queue = { recover: async () => ({ queued: 2 }), runNext: async options => {
    calls.push(options.workingOnly ? 'working' : 'erasure');
    return { state: options.workingOnly && !working ? 'idle' : 'complete', slice: { steps: 3 } };
  } };
  const options = { normalGc: async () => { calls.push('gc'); return { state: 'complete', steps: 2 }; } };
  assert.equal((await indexMaintenance(db, queue, options)()).indexState, 'erasure:complete');
  working = false;
  assert.equal((await indexMaintenance(db, queue, options)()).indexState, 'gc:complete');
  assert.equal((await indexMaintenance(db, queue, options)()).indexState, 'erasure:complete');
  assert.deepEqual(calls, ['working', 'working', 'gc', 'working', 'erasure']);
});

test('index failures are reported without silently succeeding or starting another walk', { skip: !enabled }, async () => {
  const queue = { recover: async () => { throw new Error('unavailable'); }, runNext: () => assert.fail('No walk after failed recovery') };
  const result = await indexMaintenance(db, queue)(); assert.equal(result.indexFailed, 1); assert.equal(result.indexSteps, 0);
});
