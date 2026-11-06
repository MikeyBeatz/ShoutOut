import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { applyLegacyFeedAdminUpdates, runLegacyFeedAdminTransaction, FeedIndexAdminWriteBlocked } from './feed_index_admin_guard.js';
import { applyGeohashRepairPlan, planGeohashRepair } from './feed_geohash_repair.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'feed-admin-guard-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const off = { schemaVersion: 1, revision: 0, mode: 'off', readGenerationId: null, writeGenerationIds: [] };
const modes = {
  building: { ...off, mode: 'building', writeGenerationIds: ['new'] },
  active: { ...off, mode: 'active', readGenerationId: 'new', writeGenerationIds: ['new'] },
  paused: { ...off, mode: 'paused', writeGenerationIds: ['new'] },
};

async function fixture(t) {
  const control = db.doc('feedIndexControl/current'), roots = [], generations = [];
  assert.equal((await control.get()).exists, false, 'another test owns the control');
  assert.equal((await db.collection('feedIndexGenerations').limit(1).get()).size, 0, 'another test owns a generation');
  t.after(async () => { for (const ref of [...roots, ...generations, control]) await db.recursiveDelete(ref); });
  const data = { authorId: 'foreign', title: 'Kept', text: 'Kept body', status: 'active',
    location: { latitude: 50.08, longitude: 14.44 }, categories: ['help'], geohash: '0000000',
    createdAt: 0, expiresAt: 100, likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0 };
  const refs = [db.doc(`shouts/${randomUUID()}`), db.doc(`shouts/${randomUUID()}`)]; roots.push(...refs);
  for (const ref of refs) await ref.set(data);
  const docs = await db.getAll(...refs);
  return { control, data, refs, docs,
    change: (index, patch) => ({ ref: refs[index], data: patch, updateTime: docs[index].updateTime }),
    generation: async () => { const ref = db.doc('feedIndexGenerations/new'); generations.push(ref); await ref.set({ schemaVersion: 1 }); },
    plan: () => planGeohashRepair(docs.map(doc => ({ id: doc.id, data: doc.data(), updateTime: doc.updateTime })),
      { projectId: db.projectId, now: 500 }),
  };
}

test('legacy absence and explicit off permit each repair-shaped patch without creating control/generations', { skip: !enabled }, async t => {
  const f = await fixture(t);
  const patches = [{ likesCount: 2, dislikesCount: 1, commentsCount: 4, savesCount: 3 },
    { location: { latitude: 50.1, longitude: 14.4 } }, { geohash: 'u2fkbn0', geography: { schemaVersion: 1 } }, { status: 'deleted' }];
  for (let i = 0; i < patches.length; i++) {
    if (i === 2) await f.control.set(off);
    const current = await f.refs[0].get();
    await applyLegacyFeedAdminUpdates(db, [{ ref: current.ref, data: patches[i], updateTime: current.updateTime }]);
    assert.equal((await f.refs[0].get()).get('text'), f.data.text);
  }
  assert.deepEqual((await f.control.get()).data(), off);
  assert.equal((await db.collection('feedIndexGenerations').get()).size, 0);
  assert.deepEqual((await f.refs[1].get()).data(), f.data);
});

test('all maintained modes and malformed state reject the entire repair without changing updateTime', { skip: !enabled }, async t => {
  const f = await fixture(t);
  for (const state of [...Object.values(modes), { ...off, revision: -1 }, { ...off, unknown: true }, {}]) {
    await f.control.set(state);
    await assert.rejects(applyLegacyFeedAdminUpdates(db, [f.change(0, { status: 'deleted' }), f.change(1, { likesCount: 5 })]));
    for (let i = 0; i < f.refs.length; i++) assert((await f.refs[i].get()).updateTime.isEqual(f.docs[i].updateTime));
  }
});

test('a retained generation blocks even off or a missing control', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.generation();
  await assert.rejects(applyLegacyFeedAdminUpdates(db, [f.change(0, { likesCount: 1 })]), FeedIndexAdminWriteBlocked);
  await f.control.set(off);
  await assert.rejects(applyLegacyFeedAdminUpdates(db, [f.change(0, { likesCount: 1 })]), FeedIndexAdminWriteBlocked);
  assert((await f.refs[0].get()).updateTime.isEqual(f.docs[0].updateTime));
});

test('a source changed after planning aborts every update in that transaction', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.refs[1].update({ text: 'Newer' });
  await assert.rejects(applyLegacyFeedAdminUpdates(db, [f.change(0, { likesCount: 8 }), f.change(1, { status: 'deleted' })]));
  assert((await f.refs[0].get()).updateTime.isEqual(f.docs[0].updateTime));
  assert.equal((await f.refs[1].get()).get('text'), 'Newer'); assert.equal((await f.refs[1].get()).get('status'), 'active');
});

test('activation after an earlier preflight is observed inside the actual write transaction', { skip: !enabled }, async t => {
  const f = await fixture(t); await runLegacyFeedAdminTransaction(db, () => undefined);
  let started, release;
  const began = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const proxy = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return fn => target.runTransaction(async tx => { started(); await gate; return fn(tx); });
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  const pending = applyLegacyFeedAdminUpdates(proxy, [f.change(0, { status: 'deleted' })]);
  const rejected = assert.rejects(pending, FeedIndexAdminWriteBlocked);
  try { await began; await f.control.set(modes.building); release(); await rejected; }
  finally { release(); }
  assert((await f.refs[0].get()).updateTime.isEqual(f.docs[0].updateTime));
});

test('a successful repair serializes before a switch waiting on the same control read', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.control.set(off);
  let started, release;
  const began = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const operation = runLegacyFeedAdminTransaction(db, async tx => {
    started(); await gate; tx.update(f.refs[0], { likesCount: 1 }, { lastUpdateTime: f.docs[0].updateTime });
  });
  await began; const switchState = f.control.set({ ...modes.active, revision: 1 });
  release(); await operation; await switchState;
  assert.equal((await f.refs[0].get()).get('likesCount'), 1);
  const current = await f.refs[0].get();
  await assert.rejects(applyLegacyFeedAdminUpdates(db, [{ ref: current.ref, updateTime: current.updateTime, data: { likesCount: 2 } }]), FeedIndexAdminWriteBlocked);
});

test('old exact geohash plan cannot bypass building state and preserves approval/preconditions', { skip: !enabled }, async t => {
  const f = await fixture(t), plan = await f.plan(); await f.control.set(modes.building);
  await assert.rejects(applyGeohashRepairPlan(db, plan, { approvedDigest: plan.digest }), FeedIndexAdminWriteBlocked);
  await f.control.set(off);
  const result = await applyGeohashRepairPlan(db, plan, { approvedDigest: plan.digest });
  assert.equal(result.updated, 2); assert.equal(result.digest, plan.digest);
  assert(result.writes.every(write => Object.keys(write).length === 1)); // Never invent per-write commit times.
  await assert.rejects(applyGeohashRepairPlan(db, plan, { approvedDigest: plan.digest }));
});

test('invalid update scope, absent preconditions and duplicate sources never start writes', { skip: !enabled }, async t => {
  const f = await fixture(t);
  for (const changes of [[{ ...f.change(0, {}), ref: db.doc('users/foreign') }], [{ ...f.change(0, {}), updateTime: null }],
    [f.change(0, { likesCount: 1 }), f.change(0, { likesCount: 2 })]]) {
    await assert.rejects(applyLegacyFeedAdminUpdates(db, changes), /invalid-feed-admin-updates/);
  }
  assert((await f.refs[0].get()).updateTime.isEqual(f.docs[0].updateTime));
});
