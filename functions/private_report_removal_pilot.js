// Explicit DEV fixture only; never imported by a callable or scheduled host.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { canonical } from './feed_block_index.js';
import { requireEligibleActor } from './callable_security.js';
import { createContentReportOperation } from './create_content_report.js';
import { privateReportModeratorLevel, assertPrivateReportScope } from './remove_reported_private_reply.js';
import { planPrivateDeletionPilot, validatePrivateDeletionPilot, seedPrivateDeletionPilot, privateDeletionPilotStatus,
  cleanupPrivateDeletionPilot, privateDeletionPilotSlots, privateDeletionPilotFence } from './private_reply_deletion_pilot.js';
const hash = data => createHash('sha256').update(canonical(data)).digest('hex');
const input = (uid, data) => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'internal-moderation-pilot' }, data });
const refs = (db, uid) => [db.doc(`users/${uid}`), db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`)];
const stamp = value => value ? [value.seconds, value.nanoseconds] : null;
const reportReason = plan => `MVP private moderation ${plan.base.runId.slice(-8)}. Remove after verification.`;

export function validatePrivateModerationPilot(db, plan) {
  const { digest, ...data } = plan; assert.equal(digest, hash(data), 'private-moderation-pilot-digest');
  validatePrivateDeletionPilot(db, plan.base);
  assert.equal(plan.v, 1); assert.equal(plan.kind, 'private-moderation');
  assert(/^[A-Za-z0-9_-]{1,128}$/.test(plan.moderator.uid)); assert.equal(plan.moderator.nickname, 'TestModerator');
  assert(/^op1_\d+_[a-f0-9]{32}$/.test(plan.reportKey)); assert.equal(plan.moderator.stamps.length, 3);
}
async function moderatorFence(reader, db, plan) {
  await requireEligibleActor({ request: input(plan.moderator.uid), db, reader });
  const rows = await reader.getAll(...refs(db, plan.moderator.uid));
  assert.equal(rows[0].get('nickname'), 'TestModerator', 'private-moderation-pilot-actor-drift');
  rows.forEach((row, i) => assert.equal(canonical(stamp(row.updateTime)), canonical(plan.moderator.stamps[i]), 'private-moderation-pilot-role-drift'));
  const level = privateReportModeratorLevel(rows[1].data(), rows[2].data());
  assertPrivateReportScope(rows[1].data(), level, { geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' } });
  return { role: rows[1].data(), level };
}
export async function planPrivateModerationPilot(db, actors, moderator, options = {}) {
  const base = await planPrivateDeletionPilot(db, actors, options);
  assert.equal(moderator.nickname, 'TestModerator'); assert(/^[A-Za-z0-9_-]{1,128}$/.test(moderator.uid));
  const rows = await db.getAll(...refs(db, moderator.uid));
  const data = { v: 1, kind: 'private-moderation', base,
    moderator: { uid: moderator.uid, nickname: moderator.nickname, stamps: rows.map(d => stamp(d.updateTime)) },
    reportKey: `op1_${Math.floor(base.plannedAt / 1000)}_${randomBytes(16).toString('hex')}` };
  const plan = { ...data, digest: hash(data) }; validatePrivateModerationPilot(db, plan); await moderatorFence(db, db, plan); return plan;
}
function target(db, plan) {
  const [root, first, continuation] = privateDeletionPilotSlots(plan.base), reporter = plan.base.actors[0].uid;
  return { root, first, continuation, reporter, report: db.doc(`privateReplyReports/${reporter}_${root.id}_${first.id}`) };
}
function guarded(db, plan, baseFence = true) {
  return new Proxy(db, { get(object, key) {
    if (key === 'runTransaction') return (callback, options) => db.runTransaction(async tx => {
      if (baseFence) await privateDeletionPilotFence(tx, db, plan.base);
      await moderatorFence(tx, db, plan); return callback(tx);
    }, options);
    const value = object[key]; return typeof value === 'function' ? value.bind(object) : value;
  } });
}
function verifyReport(snapshot, plan, t) {
  if (!snapshot.exists) return;
  const d = snapshot.data();
  assert.equal(d.shoutId, t.root.id); assert.equal(d.privateReplyId, t.first.id); assert.equal(d.reporterId, t.reporter);
  assert.equal(d.authorId, t.first.uid); assert.equal(d.text, t.first.data.text); assert.equal(d.reason, reportReason(plan));
  assert(['open', 'resolved'].includes(d.status), 'private-moderation-pilot-foreign-report');
  if (d.status === 'resolved') {
    assert.equal(d.resolution, 'contentRemoved'); assert.equal(d.resolvedBy, plan.moderator.uid);
    assert(/^[a-f0-9]{64}$/.test(d.decisionOperationId));
  }
}
export async function seedPrivateModerationPilot(db, plan) {
  validatePrivateModerationPilot(db, plan); await moderatorFence(db, db, plan);
  await seedPrivateDeletionPilot(guarded(db, plan, false), plan.base);
  const t = target(db, plan), time = (await db.doc('feedIndexControl/current').get()).readTime.toDate();
  await createContentReportOperation(input(t.reporter, { expectedUserId: t.reporter, idempotencyKey: plan.reportKey,
    targetType: 'privateReply', shoutId: t.root.id, targetId: t.first.id, reason: reportReason(plan) }), guarded(db, plan), () => time);
  return privateModerationPilotStatus(db, plan);
}
export async function privateModerationPilotStatus(db, plan) {
  validatePrivateModerationPilot(db, plan); const moderator = await moderatorFence(db, db, plan);
  const base = await privateDeletionPilotStatus(db, plan.base), t = target(db, plan), report = await t.report.get(); verifyReport(report, plan, t);
  let geographyReady = false;
  if (base.sourcePresent) {
    try { assertPrivateReportScope(moderator.role, moderator.level, (await db.doc(`shouts/${t.root.id}`).get()).data()); geographyReady = true; }
    catch (error) { if (error.code !== 'permission-denied') throw error; }
  }
  const rows = await db.collection('serverOperations').where('reportId', '==', t.report.id).limit(3).get();
  const decisions = rows.docs.filter(d => d.get('action') === 'removeReportedPrivateReply'); assert(decisions.length <= 1);
  const decision = decisions[0], confirmed = report.get('status') === 'resolved' && decision?.get('userId') === plan.moderator.uid &&
    decision?.get('privateReplyId') === t.first.id && decision?.get('shoutId') === t.root.id && report.get('decisionOperationId') === decision?.id &&
    decision?.get('result.removed') === true && !base.replies[0].present;
  return { ...base, reportId: t.report.id, reportReason: reportReason(plan), reportPresent: report.exists, reportStatus: report.get('status') ?? null,
    moderator: plan.moderator.nickname, geographyReady, decisionConfirmed: confirmed, continuationPreserved: base.replies[1].present,
    decisionOperationId: decision?.id ?? null, cloudWrites: 0 };
}
export async function cleanupPrivateModerationPilot(db, plan) {
  validatePrivateModerationPilot(db, plan); const t = target(db, plan);
  // Validate the decision before any cleanup. Administrative deletion is not UI proof.
  const state = await privateModerationPilotStatus(db, plan);
  if (state.sourcePresent) assert(state.decisionConfirmed && state.continuationPreserved, 'private-moderation-pilot-positive-proof-required');
  const result = await cleanupPrivateDeletionPilot(guarded(db, plan, false), plan.base);
  await guarded(db, plan).runTransaction(async tx => {
    const report = await tx.get(t.report); verifyReport(report, plan, t);
    if (report.exists) { assert.equal(report.get('status'), 'resolved'); tx.delete(t.report); }
  });
  return { ...result, reportRemoved: Number(state.reportPresent), decisionOperationId: state.decisionOperationId };
}
