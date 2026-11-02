import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { repairActivityOwnership as repair, ownershipPlanDigest, ownershipDataDigest } from '../tools/activity_ownership_repair.mjs';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'ownership-repair-tests') : null;
const db = app ? getFirestore(app) : null, roots = [];
after(async () => { if (db) { for (const root of roots) await db.recursiveDelete(root); await db.terminate(); await deleteApp(app); } });
async function fixture() {
  const uid = randomUUID(), root = db.doc(`shouts/${randomUUID()}`); roots.push(root);
  await root.set({ likesCount: 1, dislikesCount: 1, savesCount: 1, text: 'Unchanged' });
  const refs = [root.collection('reactions').doc(uid), root.collection('comments').doc('comment').collection('reactions').doc(uid), root.collection('saves').doc(uid)];
  await refs[0].set({ type: 'like', updatedAt: Timestamp.now() }); await refs[1].set({ type: 'dislike', updatedAt: Timestamp.now() }); await refs[2].set({ createdAt: Timestamp.now() });
  const snaps = await db.getAll(...refs);
  const plan = { projectId: 'shoutout-dev-46c81', kind: 'reaction-save-ownership-v1', counts: {}, coverageReady: false, review: [],
    repairs: snaps.map(s => ({ path: s.ref.path, userId: uid, patch: { userId: uid }, originalDigest: ownershipDataDigest(s.data()),
      updateTime: { seconds: s.updateTime.seconds, nanoseconds: s.updateTime.nanoseconds } })) };
  plan.digest = ownershipPlanDigest(plan);
  // The emulator is physically fixed; only the utility's production-target guard sees a DEV-shaped facade.
  const scoped = { projectId: 'shoutout-dev-46c81', doc: db.doc.bind(db), getAll: db.getAll.bind(db), batch: db.batch.bind(db) };
  return { root, refs, snaps, plan, scoped, options: { expectedDigest: plan.digest } };
}
test('ownership dry-run is read-only; atomic apply changes only UID and replay writes nothing', { skip: !enabled }, async () => {
  const f = await fixture(), parent = await f.root.get();
  assert.deepEqual(await repair(f.scoped, f.plan, f.options), { wouldChange: 3, changed: 0, alreadyIndexed: 0 });
  for (let i = 0; i < f.refs.length; i++) assert.ok((await f.refs[i].get()).updateTime.isEqual(f.snaps[i].updateTime));
  assert.equal((await repair(f.scoped, f.plan, { ...f.options, apply: true })).changed, 3);
  const applied = await db.getAll(...f.refs);
  for (let i = 0; i < applied.length; i++) assert.deepEqual(applied[i].data(), { ...f.snaps[i].data(), userId: f.refs[i].id });
  assert.ok((await f.root.get()).updateTime.isEqual(parent.updateTime));
  assert.deepEqual(await repair(f.scoped, f.plan, { ...f.options, apply: true }), { wouldChange: 0, changed: 0, alreadyIndexed: 3 });
  for (let i = 0; i < f.refs.length; i++) assert.ok((await f.refs[i].get()).updateTime.isEqual(applied[i].updateTime));
});
test('one stale row prevents every repair and wrong project/digest cannot reach a write', { skip: !enabled }, async () => {
  const f = await fixture(); await f.refs[2].update({ createdAt: Timestamp.now() });
  await assert.rejects(repair(f.scoped, f.plan, { ...f.options, apply: true }), /stale/);
  for (const ref of f.refs) assert.equal((await ref.get()).data().userId, undefined);
  await assert.rejects(repair({ ...f.scoped, projectId: 'shoutout-production-a1b34' }, f.plan, f.options), /invalid-or-unapproved/);
  await assert.rejects(repair(f.scoped, f.plan, { expectedDigest: '0'.repeat(64), apply: true }), /invalid-or-unapproved/);
});
test('a change after preflight triggers an atomic updateTime conflict at commit', { skip: !enabled }, async () => {
  const f = await fixture(), racing = { ...f.scoped, batch() {
    const batch = db.batch(); return { update(...args) { batch.update(...args); }, async commit() {
      await f.refs[1].update({ updatedAt: Timestamp.now() }); return batch.commit();
    } };
  } };
  await assert.rejects(repair(racing, f.plan, { ...f.options, apply: true }));
  for (const ref of f.refs) assert.equal((await ref.get()).data().userId, undefined);
});
test('a lost commit acknowledgement replays without overwriting any original data', { skip: !enabled }, async () => {
  const f = await fixture(), lostAck = { ...f.scoped, batch() {
    const batch = db.batch(); return { update(...args) { batch.update(...args); }, async commit() { await batch.commit(); throw new Error('lost-ack'); } };
  } };
  await assert.rejects(repair(lostAck, f.plan, { ...f.options, apply: true }), /lost-ack/);
  assert.equal((await repair(f.scoped, f.plan, { ...f.options, apply: true })).alreadyIndexed, 3);
});
test('even a freshly digested plan cannot patch another collection or another ownership field', { skip: !enabled }, async () => {
  const f = await fixture();
  for (const patch of [{ path: 'users/' + f.refs[0].id }, { patch: { likesCount: 99 } }, { userId: 'another' }]) {
    const plan = { ...f.plan, repairs: [{ ...f.plan.repairs[0], ...patch }] }; plan.digest = ownershipPlanDigest(plan);
    await assert.rejects(repair(f.scoped, plan, { expectedDigest: plan.digest, apply: true }), /invalid-ownership-repair-row/);
  }
});
