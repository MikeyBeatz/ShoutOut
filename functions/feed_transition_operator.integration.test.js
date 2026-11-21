import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createFeedRuntime } from './feed_runtime.js';
import { canonical } from './feed_block_index.js';
import { encodeGeohash } from './geohash.js';
import { planFeedTransition, validateTransitionPlan, transitionStatus, runFeedTransitionStep } from './feed_transition_operator.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'transition-operator-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const sealed = value => ({ ...value, digest: createHash('sha256').update(canonical(value)).digest('hex') });
async function fixture(t, count = 3) {
  const id = randomUUID(), source = `operator-${id.slice(0, 8)}`, target = `${source}-next`;
  const control = db.doc('feedIndexControl/current'), from = db.doc(`feedIndexGenerations/${source}`), to = db.doc(`feedIndexGenerations/${target}`);
  const roots = [control, from, to, db.doc(`feedIndexMaintenance/transitions/jobs/${target}`)];
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  await control.create({ schemaVersion: 1, revision: 1, mode: 'active', readGenerationId: source, writeGenerationIds: [source] });
  await from.create({ schemaVersion: 1, v: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
  const runtime = createFeedRuntime(db, { async getUser() { return {}; } });
  const location = { latitude: 50.08, longitude: 14.44 }, time = Date.now();
  const rows = Array.from({ length: count }, (_, i) => ({ id: `${id}-${i}`, authorId: id, authorNickname: 'Fixture', location,
    geohash: encodeGeohash(location.latitude, location.longitude), status: 'active', categories: ['Dotaz'],
    title: `Operator ${i}`, text: 'Synthetic body', createdAt: Timestamp.fromMillis(time - 1000), expiresAt: Timestamp.fromMillis(time + 86400000) }));
  rows.forEach(row => roots.push(db.doc(`shouts/${row.id}`)));
  if (rows.length) await runtime.database.runTransaction(async tx => {
    const plan = await runtime.indexWriter.prepareBatch(tx, rows.map(row => ({ id: row.id, before: null, after: row })));
    plan.apply(); rows.forEach(row => tx.create(db.doc(`shouts/${row.id}`), row));
  });
  const plan = await planFeedTransition(db, target);
  const run = action => runFeedTransitionStep(db, plan, action, { approvedDigest: plan.digest, compatibleWriters: true });
  return { source, target, control, from, to, roots, rows, plan, run };
}
test('operator plan is read-only, sealed, project/format specific and bound to the source incarnation', { skip: !enabled }, async t => {
  const f = await fixture(t), before = await f.control.get();
  assert.equal(f.plan.batchSize, 50); assert.equal(f.plan.controlRevision, 1);
  assert.equal((await transitionStatus(db, f.plan)).phase, 'not-started');
  assert((await f.control.get()).updateTime.isEqual(before.updateTime)); assert.equal((await f.to.get()).exists, false);
  for (const changed of [{ ...f.plan, batchSize: 51 }, { ...f.plan, projectId: 'other' }, { ...f.plan, sourceIncarnation: [1, 0] }]) {
    assert.throws(() => validateTransitionPlan(changed, db.projectId));
  }
  assert.throws(() => validateTransitionPlan(f.plan, 'other'));
  await assert.rejects(runFeedTransitionStep(db, f.plan, 'start', { compatibleWriters: true }), /approved-digest/);
  await assert.rejects(runFeedTransitionStep(db, f.plan, 'start', { approvedDigest: f.plan.digest }), /compatible-writer/);
  const marker = (await f.from.get()).data(); await f.from.delete(); await f.from.set(marker);
  await assert.rejects(f.run('start'), /incarnation-changed/); assert.equal((await f.to.get()).exists, false);
});
test('operator reopens checkpoints, audits, activates and rolls back without changing source Shouts', { skip: !enabled }, async t => {
  const f = await fixture(t), original = await db.getAll(...f.rows.map(row => db.doc(`shouts/${row.id}`)));
  await f.run('start'); assert.equal((await f.run('start')).changed, false);
  await assert.rejects(f.run('activate'), /stale-feed-transition/);
  assert.equal((await f.run('backfill')).phase, 'audit');
  assert.equal((await transitionStatus(db, f.plan)).scanned, 3);
  const checkpoint = await db.doc(`feedIndexMaintenance/transitions/jobs/${f.target}`).get();
  // A lost final acknowledgement is recovered through status, not by resetting
  // a completed phase. Retrying the old command must not mutate its checkpoint.
  await assert.rejects(f.run('backfill'), /stale-feed-transition/);
  assert((await checkpoint.ref.get()).updateTime.isEqual(checkpoint.updateTime));
  await f.run('begin-audit');
  for (let i = 0; i < 20; i++) { if ((await f.run('audit')).phase === 'ready') break; }
  assert.equal((await transitionStatus(db, f.plan)).sourceCount, 3);
  assert.equal((await f.run('activate')).changed, true); assert.equal((await f.run('activate')).changed, false);
  await f.run('rollback'); assert.equal((await f.control.get()).get('readGenerationId'), f.source);
  await f.run('resume'); await f.run('begin-audit');
  for (let i = 0; i < 20; i++) { if ((await f.run('audit')).phase === 'ready') break; }
  await f.run('activate');
  for (const doc of original) assert((await doc.ref.get()).updateTime.isEqual(doc.updateTime));
});
test('operator handles empty sources through the same audited transition and abort preserves the registry', { skip: !enabled }, async t => {
  const f = await fixture(t, 0); await f.run('start'); await f.run('backfill'); await f.run('begin-audit');
  for (let i = 0; i < 10; i++) { if ((await f.run('audit')).phase === 'ready') break; }
  const status = await transitionStatus(db, f.plan); assert.equal(status.sourceCount, 0); assert.equal(status.indexCount, 0);
  await f.run('abort'); assert.equal((await f.to.get()).exists, true); assert.equal((await f.run('abort')).changed, false);
  assert.deepEqual((await f.control.get()).get('writeGenerationIds'), [f.source]);
});
test('stale control and a foreign re-sealed plan cannot consume another transition job', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.control.update({ revision: 2 });
  await assert.rejects(f.run('start'), /start-conflict/); assert.equal((await f.to.get()).exists, false);
  await f.control.update({ revision: 1 }); await f.run('start');
  const { digest, ...value } = f.plan; assert.equal(digest.length, 64);
  const foreign = sealed({ ...value, controlRevision: 0 });
  await assert.rejects(runFeedTransitionStep(db, foreign, 'backfill', { approvedDigest: foreign.digest, compatibleWriters: true }), /ownership-conflict/);
  assert.equal((await transitionStatus(db, f.plan)).scanned, 0);
});
