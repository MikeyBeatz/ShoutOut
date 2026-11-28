import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { currentLegalPolicy } from './legal_policy.js';
import { getModerationCasePageOperation } from './moderation_queue_reader.js';
import { createModerationQueueDatabase } from './moderation_queue.js';
import { planModerationQueuePilot, seedModerationQueuePilot, moderationQueuePilotSlots,
  retireModerationQueuePilot, purgeModerationQueuePilotReports, planModerationQueuePilotCleanup, cleanupModerationQueuePilot } from './moderation_queue_pilot.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'queue-dev-pilot') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
test('bounded DEV pilot is resumable, pages50+2 and cleans only owned fixture, preserving receipts', { skip: !enabled }, async t => {
  const nonce = randomUUID(), generation = db.doc('feedIndexGenerations/p-' + nonce), controls = ['feedIndexControl/current', 'contentLifecycleControl/current', 'moderationQueueControl/current'];
  const actors = [];
  for (const nickname of ['Bright_Otter_182', 'TestBusiness', 'TestModerator', 'TestAdmin']) {
    const uid = nickname + '_' + nonce, ref = db.doc('users/' + uid); await ref.set({ nickname });
    await ref.collection('legal').doc(currentLegalPolicy().acceptanceDocument).set({});
    const doc = await ref.get(); actors.push({ uid, nickname, profileCreateTime: [doc.createTime.seconds, doc.createTime.nanoseconds] });
  }
  await db.doc('accountRoles/' + actors[2].uid).set({ level: 3, moderationScope: { countries: ['CZ'] } });
  await db.doc(controls[0]).set({ schemaVersion: 2, revision: 1, mode: 'active', readGenerationId: generation.id, writeGenerationIds: [generation.id], cardWriteGenerationIds: [generation.id], cardReadGenerationId: generation.id });
  await generation.set({ schemaVersion: 1, v: 2, cardProjection: 1, readIdentity: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1, cardReady: true });
  await db.doc(controls[1]).set({ schemaVersion: 1, revision: 1, mode: 'active' });
  await db.doc(controls[2]).set({ schemaVersion: 1, revision: 1, mode: 'active', incarnation: 'e'.repeat(64) });
  const original = db.doc('shouts/original-' + nonce); await original.set({ text: 'Keep original' });
  const originalVersion = (await original.get()).updateTime;
  const plan = await planModerationQueuePilot(db, actors, { sourceCommit: 'a'.repeat(40) }), slots = moderationQueuePilotSlots(plan);
  const receipt = db.doc('serverOperations/pilot-proof-' + nonce); await receipt.set({ userId: actors[2].uid, shoutId: plan.shoutId, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 604800000) });
  t.after(async () => {
    for (const actor of actors) { await db.recursiveDelete(db.doc('users/' + actor.uid)); await db.doc('accountRoles/' + actor.uid).delete(); }
    await db.recursiveDelete(generation); for (const p of controls) await db.doc(p).delete();
    await db.recursiveDelete(db.doc('shouts/' + plan.shoutId)); await original.delete(); await receipt.delete();
    for (const r of slots.reports) await db.doc(r.path).delete();
    for (const c of ['moderationCases', 'contentLifecycleArchive']) {
      const rows = await db.collection(c).where(c === 'moderationCases' ? 'shoutId' : 'threadId', '==', plan.shoutId).get();
      for (const d of rows.docs) await db.recursiveDelete(d.ref);
    }
    await db.doc('contentLifecycleThreads/' + plan.shoutId).delete();
  });
  await assert.rejects(seedModerationQueuePilot(db, plan), /available-client/);
  const first = await seedModerationQueuePilot(db, plan, { clientAvailable: true });
  assert.equal(first.sourceCount, 52); assert.equal(first.reportCount, 53); assert.equal(first.cases, 52);
  assert.deepEqual(await seedModerationQueuePilot(db, plan, { clientAvailable: true }), first);
  const q = createModerationQueueDatabase(db, { enabled: true }), uid = actors[2].uid;
  const req = cursor => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { expectedUserId: uid, category: 'all', order: 'mostReported', area: { kind: 'all', value: '' }, ...(cursor ? { cursor } : {}) } });
  const p1 = await getModerationCasePageOperation(req(), q), p2 = await getModerationCasePageOperation(req(p1.cursor), q);
  assert.equal(p1.items.length, 50); assert.equal(p2.items.length, 2); assert.equal(p1.items[0].pendingCount, 2); assert.equal(p2.cursor, null);
  await retireModerationQueuePilot(db, plan); await assert.rejects(seedModerationQueuePilot(db, plan, { clientAvailable: true }), /already-retired/);
  await purgeModerationQueuePilotReports(db, plan);
  const cleanup = await planModerationQueuePilotCleanup(db, plan);
  const tampered = { ...cleanup, rows: [...cleanup.rows, { path: original.path, updateTime: [originalVersion.seconds, originalVersion.nanoseconds] }] };
  await assert.rejects(cleanupModerationQueuePilot(db, plan, tampered, cleanup.digest), /cleanup-plan-drift/);
  const result = await cleanupModerationQueuePilot(db, plan, cleanup, cleanup.digest);
  assert(result.documentsRemoved >= 105); assert.equal(result.receiptsRemoved, 0);
  assert((await receipt.get()).exists); assert((await original.get()).updateTime.isEqual(originalVersion));
  assert.equal((await db.doc('shouts/' + plan.shoutId).get()).exists, false);
  assert.equal((await db.collection('contentLifecycleArchive').where('threadId', '==', plan.shoutId).get()).size, 0);
  assert.equal((await cleanupModerationQueuePilot(db, plan, cleanup, cleanup.digest)).documentsRemoved, 0);
});
