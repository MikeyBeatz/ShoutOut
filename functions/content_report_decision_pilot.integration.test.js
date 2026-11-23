import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { planDecisionPilot, decisionPilotSlots, seedDecisionPilot, decisionPilotStatus, cleanupDecisionPilot } from './content_report_decision_pilot.js';
import { decideContentReportsOperation } from './decide_content_reports.js';
import { prepareNewsControlChange } from './feed_news_signals.js';
import { operationTestKey } from './test_helpers.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'decision-pilot') : null, db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });

async function fixture(t) {
  const nonce = randomUUID().slice(0, 8), actors = ['Bright_Otter_182', 'TestBusiness'].map((nickname, i) => ({ nickname, uid: `decision-${nonce}-${i}` }));
  const staff = ['TestModerator', 'TestAdmin'].map((nickname, i) => ({ nickname, uid: `decision-${nonce}-staff-${i}` }));
  const roots = ['feedIndexControl/current', 'feedNewsControl/current', 'feedIndexGenerations/feed-v3', `shouts/original-${nonce}`, `accountDeletionRequests/original-${nonce}`].map(p => db.doc(p));
  t.after(async () => {
    for (const actor of [...actors, ...staff]) {
      for (const d of (await db.collection('serverOperations').where('userId', '==', actor.uid).get()).docs) await d.ref.delete();
      for (const c of ['users', 'accountRoles', 'rateLimits', 'businessProfiles']) await db.recursiveDelete(db.doc(`${c}/${actor.uid}`));
    }
    for (const root of roots) await db.recursiveDelete(root);
  });
  await roots[0].create({ schemaVersion: 2, revision: 12, mode: 'active', readGenerationId: 'feed-v3', writeGenerationIds: ['feed-v3'], cardReadGenerationId: 'feed-v3', cardWriteGenerationIds: ['feed-v3'] });
  await roots[2].create({ schemaVersion: 1, v: 2, cardReady: true, cardProjection: 1, accountRetention: true, readIdentity: 1, erasureRevision: 0, prunedThrough: -1 });
  await roots[3].create({ untouched: true }); await roots[4].create({ untouched: true });
  for (const actor of [...actors, ...staff]) {
    await db.doc(`users/${actor.uid}`).create({ nickname: actor.nickname, avatarId: 'avatar_01', avatarBackgroundStart: 1, avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
    await db.doc(`users/${actor.uid}/legal/acceptance_2026_07_25`).create({});
  }
  await db.doc(`accountRoles/${actors[1].uid}`).create({ role: 'business', level: 2 });
  await db.doc(`businessProfiles/${actors[1].uid}`).create({ status: 'active' });
  await db.doc(`accountRoles/${staff[0].uid}`).create({ level: 3, moderationScope: { subdivisions: ['CZ-42'] } });
  await db.doc(`accountRoles/${staff[1].uid}`).create({ level: 5 });
  const g = await roots[2].get();
  await db.runTransaction(async tx => { (await prepareNewsControlChange(tx, db, { v: 1, revision: 1, mode: 'active', generation: 'feed-v3', incarnation: [g.createTime.seconds, g.createTime.nanoseconds] })).apply(); });
  const plan = await planDecisionPilot(db, actors, staff, { expectedSources: 1 });
  for (const row of decisionPilotSlots(plan)) { if (row.type === 'shout') roots.push(db.doc(`shouts/${row.id}`)); roots.push(db.doc(`${row.collection}/${row.reportId}`)); }
  roots.push(db.doc(`moderationClearances/shout_${decisionPilotSlots(plan)[0].id}`));
  return { plan, actors, staff, roots };
}
async function complete(f) {
  let result = await seedDecisionPilot(db, f.plan);
  assert(result.waitingForReportCooldown); assert.equal(result.reports.filter(r => r.status === 'open').length, 2);
  // Only an isolated emulator fixture clock advances; production never resets quotas.
  const rate = db.doc(`rateLimits/${f.actors[0].uid}/actions/report`), old = await rate.get();
  await rate.update({ lastAt: Timestamp.fromMillis(old.get('lastAt').toMillis() - 61000) });
  result = await seedDecisionPilot(db, f.plan); assert.equal(result.waitingForReportCooldown, false);
  for (const [at, decision, who] of [[0, 'approve', 0], [1, 'resolve', 0], [2, 'escalate', 0], [2, 'resolve', 1]]) {
    const row = decisionPilotSlots(f.plan)[at], uid = f.staff[who].uid;
    await decideContentReportsOperation({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'test' },
      data: { expectedUserId: uid, idempotencyKey: operationTestKey(`decision-${at}-${who}`, new Date()), targetType: row.type, shoutId: row.shoutId,
        ...(at === 0 ? {} : { targetId: row.id }), reportIds: [row.reportId], decision } }, db);
  }
}
test('bounded pilot resumes cooldown, verifies exact regional/admin decisions and removes only fixture content, leaving receipts and rates', { skip: !enabled }, async t => {
  const f = await fixture(t); await seedDecisionPilot(db, f.plan);
  await assert.rejects(cleanupDecisionPilot(db, f.plan), /positive-proof-required/);
  await complete(f); const state = await decisionPilotStatus(db, f.plan); assert(state.decisions.every(Boolean));
  const rates = await db.getAll(...f.actors.map(a => db.doc(`rateLimits/${a.uid}/actions/report`)));
  const done = await cleanupDecisionPilot(db, f.plan); assert.equal(done.removed, 1); assert.equal(done.receiptsRemoved, 0);
  assert.equal((await cleanupDecisionPilot(db, f.plan)).removed, 0);
  assert.deepEqual((await decisionPilotStatus(db, f.plan)).sourcesPresent, [false, false, false]);
  assert.equal((await db.collection('serverOperations').where('shoutId', '==', state.shoutId).get()).size, 10);
  for (const rate of rates) assert.equal((await rate.ref.get()).updateTime.toMillis(), rate.updateTime.toMillis());
  assert((await f.roots[3].get()).exists && (await f.roots[4].get()).exists);
});
test('changed role, digest or unrelated descendant stops bounded writes/cleanup', { skip: !enabled }, async t => {
  const f = await fixture(t);
  await assert.rejects(seedDecisionPilot(db, { ...f.plan, reportKeys: [] }), /digest/);
  const role = db.doc(`accountRoles/${f.staff[0].uid}`); await role.update({ level: 4 });
  await assert.rejects(seedDecisionPilot(db, f.plan), /role-drift/);
  assert(!(await db.doc(`shouts/${decisionPilotSlots(f.plan)[0].id}`).get()).exists);
  await role.update({ level: 3 });
  f.plan = await planDecisionPilot(db, f.actors, f.staff, { expectedSources: 1 });
  const rows = decisionPilotSlots(f.plan); f.roots.push(db.doc(`shouts/${rows[0].id}`), ...rows.map(r => db.doc(`${r.collection}/${r.reportId}`)), db.doc(`moderationClearances/shout_${rows[0].id}`));
  await complete(f);
  await db.doc(`shouts/${rows[0].id}/comments/unrelated`).create({ text: 'foreign' });
  await assert.rejects(cleanupDecisionPilot(db, f.plan), /foreign-descendant/);
  assert((await db.doc(`shouts/${rows[0].id}`).get()).exists);
});
