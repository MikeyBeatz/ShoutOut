import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createModerationQueueDatabase, moderationQueueBinding } from './moderation_queue.js';
import { moderationQueueTransitionPlan, beginModerationQueueTransition, stepModerationQueueTransition, activateModerationQueueTransition } from './moderation_queue_transition.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'queue-transition') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t, count = 65) {
  const key = randomUUID(), shout = db.doc(`shouts/${key}`), now = Timestamp.now();
  await db.doc('moderationQueueControl/current').delete();
  await shout.set({ authorId: `author_${key}`, createdAt: now, text: 'Synthetic migration', geography: { schemaVersion: 1, countryCode: 'CZ' } });
  const reports = [];
  const data = n => ({ reporterId: `p${n}`, shoutId: key, reason: 'Synthetic', createdAt: now, status: 'open' });
  for (let n = 0; n < count; n++) { const ref = db.doc(`reports/p${n}_${key}`); await ref.set(data(n)); reports.push(ref); }
  const q = createModerationQueueDatabase(db, { enabled: true });
  const plan = moderationQueueTransitionPlan({ projectId: 'shoutout-rules-test', sourceCommit: 'a'.repeat(40), incarnation: createHash('sha256').update(key).digest('hex') });
  t.after(async () => {
    await db.recursiveDelete(shout); for (const ref of reports) await ref.delete();
    for (const c of (await db.collection('moderationCases').where('shoutId', '==', key).get()).docs) await db.recursiveDelete(c.ref);
    await db.doc(`moderationQueueMigrations/${plan.digest}`).delete(); await db.doc('moderationQueueControl/current').delete();
  });
  return { q, plan, shout, reports, data };
}
async function ready(f) {
  let state;
  for (let steps = 0; steps < 100; steps++) { state = await stepModerationQueueTransition(f.q, f.plan); if (state.phase === 'ready') return state; }
  throw Error('test-transition-did-not-converge');
}
test('resumable adoption and audit cover more than50 reports with concurrent wrapped writes', { skip: !enabled }, async t => {
  const f = await fixture(t);
  const initial = await beginModerationQueueTransition(f.q, f.plan);
  assert.deepEqual(await beginModerationQueueTransition(f.q, f.plan), initial);
  const first = await stepModerationQueueTransition(f.q, f.plan); assert.equal(first.inspected, 50);
  const late = db.doc(`reports/p999_${f.shout.id}`); f.reports.push(late);
  await f.q.runTransaction(async tx => tx.create(late, f.data(999)));
  await ready(f);
  const header = (await db.collection('moderationCases').where('shoutId', '==', f.shout.id).get()).docs[0];
  assert.equal(header.get('pendingCount'), 66); assert.equal(header.get('audited'), true);
  const newest = db.doc(`reports/p998_${f.shout.id}`); f.reports.push(newest);
  await f.q.runTransaction(async tx => tx.create(newest, f.data(998)));
  await assert.rejects(activateModerationQueueTransition(f.q, f.plan), /not-ready/);
  await ready(f);
  const result = await activateModerationQueueTransition(f.q, f.plan);
  assert.deepEqual(await activateModerationQueueTransition(f.q, f.plan), result);
  assert.equal((await header.ref.get()).get('pendingCount'), 67);
});
test('changed plan and corrupted audit do not activate or partially repair counts', { skip: !enabled }, async t => {
  const f = await fixture(t, 1); await beginModerationQueueTransition(f.q, f.plan);
  await assert.rejects(stepModerationQueueTransition(f.q, { ...f.plan, sourceCommit: 'b'.repeat(40) }), /plan-drift/);
  await stepModerationQueueTransition(f.q, f.plan);
  const row = (await db.collection('moderationCases').where('shoutId', '==', f.shout.id).get()).docs[0];
  await row.ref.update({ openCount: 2, pendingCount: 2 });
  await assert.rejects(ready(f), /counter-drift/);
  assert.equal((await db.doc('moderationQueueControl/current').get()).get('mode'), 'building');
  assert.equal((await row.ref.get()).get('pendingCount'), 2);
});
test('local operator cannot mutate any live project', async () => {
  await assert.rejects(beginModerationQueueTransition({ projectId: 'shoutout-dev-46c81', [moderationQueueBinding]: { enabled: true } }, {}), /emulator-only/);
});
test('migration audit rejects an incorrect time boundary without repairing it silently', { skip: !enabled }, async t => {
  const f = await fixture(t, 1); await beginModerationQueueTransition(f.q, f.plan);
  await stepModerationQueueTransition(f.q, f.plan);
  const row = (await db.collection('moderationCases').where('shoutId', '==', f.shout.id).get()).docs[0];
  const altered = Timestamp.fromMillis(row.get('firstAt').toMillis() - 1000);
  await row.ref.update({ firstAt: altered });
  await assert.rejects(ready(f), /boundary-drift/);
  assert.equal((await db.doc('moderationQueueControl/current').get()).get('mode'), 'building');
  assert((await row.ref.get()).get('firstAt').isEqual(altered));
});
