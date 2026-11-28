import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createModerationQueueDatabase, moderationReportTarget } from './moderation_queue.js';
import { startModerationCaseDecisionOperation as start, stepModerationCaseDecisionOperation as step, reapExpiredModerationCaseDecisions } from './moderation_case_decision.js';
import { currentLegalPolicy } from './legal_policy.js';
import { operationTestKey } from './test_helpers.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'moderation-case-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t, count = 53) {
  const key = randomUUID(), uid = `mod_${key}`, author = `author_${key}`, now = new Date();
  await db.doc('moderationQueueControl/current').set({ schemaVersion: 1, revision: 1, mode: 'building', incarnation: createHash('sha256').update('decision-test').digest('hex') });
  for (const userId of [uid, author]) {
    await db.doc(`users/${userId}`).set({ nickname: 'Synthetic account' });
    await db.doc(`users/${userId}/legal/${currentLegalPolicy().acceptanceDocument}`).set({ acceptedAt: Timestamp.fromDate(now) });
  }
  await db.doc(`accountRoles/${uid}`).set({ level: 3, moderationScope: { countries: ['CZ'] } });
  const shout = db.doc(`shouts/${key}`);
  await shout.set({ authorId: author, title: 'Synthetic case', text: 'Synthetic source', createdAt: Timestamp.fromDate(now), status: 'active',
    geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, geohash: 'u3078dx', likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: 0 });
  const q = createModerationQueueDatabase(db, { enabled: true }), reports = [];
  for (let offset = 0; offset < count; offset += 50) await q.runTransaction(async tx => {
    for (let n = offset; n < Math.min(count, offset + 50); n++) {
      const reporterId = `reporter${n}`, ref = db.doc(`reports/${reporterId}_${key}`);
      tx.create(ref, { reporterId, shoutId: key, reason: 'Synthetic report', createdAt: Timestamp.fromDate(now), status: 'open' }); reports.push(ref);
    }
  });
  const caseId = moderationReportTarget(reports[0].path, (await reports[0].get()).data()).caseId, caseRef = db.doc(`moderationCases/${caseId}`);
  await db.doc('moderationQueueControl/current').update({ mode: 'active' });
  const identity = { auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' } };
  const original = (await caseRef.get()).data();
  const request = (decision = 'warning') => ({ ...identity, data: { expectedUserId: uid, idempotencyKey: operationTestKey(`case-${decision}`, now), caseId,
    expectedIncarnation: original.incarnation, expectedRevision: original.revision, decision, note: 'Synthetic moderation decision' } });
  const continuation = jobId => ({ ...identity, data: { expectedUserId: uid, jobId } });
  const clock = () => new Date(now.getTime() + 1000);
  t.after(async () => {
    await db.recursiveDelete(shout); await db.recursiveDelete(caseRef);
    for (const r of reports) await r.delete();
    for (const c of ['moderationCaseDecisions']) for (const d of (await db.collection(c).where('caseId', '==', caseId).get()).docs) await d.ref.delete();
    for (const userId of [uid, author]) {
      await db.recursiveDelete(db.doc(`users/${userId}`));
      for (const c of ['accountRoles', 'moderators', 'bans', 'contentRestrictions', 'accountDeletionRequests']) await db.doc(`${c}/${userId}`).delete();
      for (const c of ['serverOperations', 'sanctions', 'warnings']) for (const d of (await db.collection(c).where('userId', '==', userId).get()).docs) await d.ref.delete();
    }
  });
  return { q, uid, author, shout, reports, caseId, caseRef, request, continuation, clock, now };
}
test('120-report case resumes concurrently after effect without duplicate sanctions', { skip: !enabled }, async t => {
  const f = await fixture(t, 120), request = f.request();
  const first = await start(request, f.q, f.clock);
  assert.deepEqual(await start(request, f.q, f.clock), first);
  await Promise.all([step(f.continuation(first.jobId), f.q, f.clock), step(f.continuation(first.jobId), f.q, f.clock)]);
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 1);
  let current; do { current = await step(f.continuation(first.jobId), f.q, f.clock); } while (current.status === 'processing');
  assert.equal(current.count, 120); assert.equal((await f.caseRef.get()).exists, false);
  assert((await Promise.all(f.reports.map(r => r.get()))).every(r => r.get('status') === 'resolved'));
  assert.deepEqual(await step(f.continuation(first.jobId), f.q, f.clock), current);
  assert.deepEqual(await start(request, f.q, f.clock), current);
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 1);
});
test('large escalation keeps senior case and clears the processing lock', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await start(f.request('escalate'), f.q, f.clock);
  let current; do { current = await step(f.continuation(first.jobId), f.q, f.clock); } while (current.status === 'processing');
  const c = (await f.caseRef.get()).data();
  assert.equal(c.openCount, 0); assert.equal(c.escalatedCount, 53); assert.equal(c.activeDecision, undefined); assert.equal(c.appliedEffect, undefined);
  assert(c.filterTokens.every(v => v.startsWith('4:')));
});
test('new reports are blocked during the decision, current actor bans stop continuation', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await start(f.request(), f.q, f.clock);
  const late = db.doc(`reports/late_${f.shout.id}`);
  await assert.rejects(f.q.runTransaction(async tx => tx.create(late, { reporterId: 'late', shoutId: f.shout.id, reason: 'Late report', createdAt: Timestamp.fromDate(f.now), status: 'open' })), /in-progress/);
  assert(!(await late.get()).exists);
  await step(f.continuation(first.jobId), f.q, f.clock);
  await db.doc(`bans/${f.uid}`).set({ expiresAt: null });
  await assert.rejects(step(f.continuation(first.jobId), f.q, f.clock), { code: 'permission-denied' });
  assert.equal((await f.caseRef.get()).get('pendingCount'), 3);
  await db.doc(`bans/${f.uid}`).delete();
  await db.doc(`accountRoles/${f.uid}`).update({ moderationScope: { countries: ['DE'] } });
  await assert.rejects(step(f.continuation(first.jobId), f.q, f.clock), { code: 'permission-denied' });
});
test('retention deletion wins over a pending decision and stale recovery cannot recreate data', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await start(f.request(), f.q, f.clock);
  await step(f.continuation(first.jobId), f.q, f.clock);
  const remaining = (await db.collection('reports').where('shoutId', '==', f.shout.id).where('status', '==', 'open').get()).docs;
  await f.q.runTransaction(async tx => { for (const report of remaining) tx.delete(report.ref); });
  assert(!(await f.caseRef.get()).exists); assert(!(await db.doc(`moderationCaseDecisions/${first.jobId}`).get()).exists);
  await assert.rejects(step(f.continuation(first.jobId), f.q, f.clock), /no longer available/);
  assert(!(await f.caseRef.get()).exists);
});
test('expired retry notes are removed and new recovery only completes the original effect', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await start(f.request(), f.q, f.clock);
  await step(f.continuation(first.jobId), f.q, f.clock);
  const future = new Date(f.now.getTime() + 8 * 86400000), futureClock = () => future;
  await reapExpiredModerationCaseDecisions(f.q, futureClock);
  assert(!(await db.doc(`moderationCaseDecisions/${first.jobId}`).get()).exists);
  let c = (await f.caseRef.get()).data(); assert.equal(c.pendingCount, 3); assert.equal(c.activeDecision, undefined); assert(c.appliedEffect);
  assert.equal(c.appliedEffect.note, undefined);
  await assert.rejects(start(f.request(), f.q, futureClock), /operation-expired/);
  const next = f.request(); next.data.idempotencyKey = operationTestKey('recover', future);
  next.data.expectedRevision = c.revision; next.data.expectedIncarnation = c.incarnation;
  const job = await start(next, f.q, futureClock); assert.equal(job.effectComplete, true);
  await step(f.continuation(job.jobId), f.q, futureClock);
  const done = await step(f.continuation(job.jobId), f.q, futureClock);
  assert.equal(done.status, 'complete'); assert.equal(done.count, 3);
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 1);
  c = (await f.caseRef.get()).data(); assert.equal(c, undefined);
});
