import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planGeohashRepair, applyGeohashRepairPlan } from './feed_geohash_repair.js';
import { encodeGeohash } from './create_shout.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'geohash-repair-tests') : null;
const db = app ? getFirestore(app) : null, refs = [];
after(async () => { if (app) { for (const ref of refs) await ref.delete(); await db.terminate(); await deleteApp(app); } });
async function fixture() {
  const location = { latitude: 50.08, longitude: 14.44 };
  const data = { authorId: 'author', status: 'active', location, createdAt: 0, expiresAt: 100,
    categories: ['Dotaz'], likesCount: 0, dislikesCount: 0, title: 'Kept body', text: 'Kept text' };
  const items = [db.doc(`shouts/${randomUUID()}`), db.doc(`shouts/${randomUUID()}`)]; refs.push(...items);
  await items[0].set(data); await items[1].set({ ...data, geohash: '0000000' });
  const docs = await db.getAll(...items);
  const plan = await planGeohashRepair(docs.map(doc => ({ id: doc.id, data: doc.data(), updateTime: doc.updateTime })),
    { projectId: db.projectId, now: 500 });
  return { items, data, plan, expected: encodeGeohash(location.latitude, location.longitude) };
}
test('approved exact plan updates only root geohash and refuses stale repeat', { skip: !enabled }, async () => {
  const f = await fixture(); assert.equal(f.plan.state, 'ready-for-approval'); assert.equal(f.plan.changes.length, 2);
  const result = await applyGeohashRepairPlan(db, f.plan, { approvedDigest: f.plan.digest });
  assert.equal(result.updated, 2);
  for (const ref of f.items) assert.deepEqual((await ref.get()).data(), { ...f.data, geohash: f.expected });
  await assert.rejects(applyGeohashRepairPlan(db, f.plan, { approvedDigest: f.plan.digest }));
});
test('one concurrent edit aborts the entire batch without partially repairing the other record', { skip: !enabled }, async () => {
  const f = await fixture(); await f.items[0].update({ text: 'Newer body' });
  await assert.rejects(applyGeohashRepairPlan(db, f.plan, { approvedDigest: f.plan.digest }));
  assert.equal((await f.items[0].get()).data().geohash, undefined);
  assert.equal((await f.items[1].get()).data().geohash, '0000000');
});
test('missing consent, tampering and production targets fail before database writes', { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(applyGeohashRepairPlan(db, f.plan), /unapproved/);
  await assert.rejects(applyGeohashRepairPlan(db, { ...f.plan, projectId: 'production' }, { approvedDigest: f.plan.digest }), /unapproved/);
  await assert.rejects(planGeohashRepair([], { projectId: 'shoutout-production-a1b34', now: 0 }), /invalid/);
  assert.equal((await f.items[1].get()).data().geohash, '0000000');
});
