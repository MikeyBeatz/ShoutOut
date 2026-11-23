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
  if (plan.acceptedDecision) {
    const { acceptedDecision: a, ...original } = data;
    assert.equal(a.sourceDigest, hash(original), 'private-moderation-pilot-acceptance-source');
    assert(/^[a-f0-9]{64}$/.test(a.operationId)); assert.equal(a.actor.nickname, 'TestAdmin');
    assert(/^[A-Za-z0-9_-]{1,128}$/.test(a.actor.uid)); assert.notEqual(a.actor.uid, plan.moderator.uid);
    assert.equal(a.actor.stamps.length, 3); assert.equal(a.receiptStamp.length, 2); assert.equal(a.reportStamp.length, 2);
  }
}
async function moderatorFence(reader, db, plan) {
  await requireEligibleActor({ request: input(plan.moderator.uid), db, reader });
  const rows = await reader.getAll(...refs(db, plan.moderator.uid));
  assert.equal(rows[0].get('nickname'), 'TestModerator', 'private-moderation-pilot-actor-drift');
  rows.forEach((row, i) => assert.equal(canonical(stamp(row.updateTime)), canonical(plan.moderator.stamps[i]), 'private-moderation-pilot-role-drift'));
  const level = privateReportModeratorLevel(rows[1].data(), rows[2].data());
  assertPrivateReportScope(rows[1].data(), level, { geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' } });
  if (plan.acceptedDecision) {
    const a = plan.acceptedDecision;
    await requireEligibleActor({ request: input(a.actor.uid), db, reader });
    const actor = await reader.getAll(...refs(db, a.actor.uid));
    assert.equal(actor[0].get('nickname'), 'TestAdmin', 'private-moderation-pilot-accepted-actor-drift');
    actor.forEach((row, i) => assert.equal(canonical(stamp(row.updateTime)), canonical(a.actor.stamps[i]), 'private-moderation-pilot-accepted-role-drift'));
    assert.equal(privateReportModeratorLevel(actor[1].data(), actor[2].data()), 5);
    const [receipt] = await reader.getAll(db.doc(`serverOperations/${a.operationId}`));
    assert.equal(canonical(stamp(receipt.updateTime)), canonical(a.receiptStamp), 'private-moderation-pilot-accepted-receipt-drift');
    const t = target(db, plan);
    assert.equal(receipt.get('action'), 'removeReportedPrivateReply'); assert.equal(receipt.get('userId'), a.actor.uid);
    assert.equal(receipt.get('reportId'), t.report.id); assert.equal(receipt.get('shoutId'), t.root.id);
    assert.equal(receipt.get('privateReplyId'), t.first.id); assert.equal(receipt.get('result.removed'), true);
  }
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
    assert.equal(d.resolution, 'contentRemoved'); assert.equal(d.resolvedBy, plan.acceptedDecision?.actor.uid ?? plan.moderator.uid);
    assert(/^[a-f0-9]{64}$/.test(d.decisionOperationId));
  }
  if (plan.acceptedDecision) {
    assert.equal(d.status, 'resolved'); assert.equal(d.decisionOperationId, plan.acceptedDecision.operationId);
    assert.equal(canonical(stamp(snapshot.updateTime)), canonical(plan.acceptedDecision.reportStamp), 'private-moderation-pilot-accepted-report-drift');
  }
}
// Read-only supplemental plan after explicit acceptance of the actual TestAdmin
// UI decision. The original plan, receipt, report and roles are never rewritten.
export async function acceptPrivateModerationDecision(db, plan, operationId) {
  validatePrivateModerationPilot(db, plan); assert(!plan.acceptedDecision);
  assert(/^[a-f0-9]{64}$/.test(operationId)); await moderatorFence(db, db, plan);
  const t = target(db, plan), [receipt, report] = await db.getAll(db.doc(`serverOperations/${operationId}`), t.report);
  const uid = receipt.get('userId'); assert(/^[A-Za-z0-9_-]{1,128}$/.test(uid));
  const actor = await db.getAll(...refs(db, uid));
  const { digest, ...original } = plan;
  const data = { ...original, acceptedDecision: { sourceDigest: digest, operationId,
    actor: { uid, nickname: actor[0].get('nickname'), stamps: actor.map(d => stamp(d.updateTime)) },
    receiptStamp: stamp(receipt.updateTime), reportStamp: stamp(report.updateTime) } };
  const accepted = { ...data, digest: hash(data) };
  validatePrivateModerationPilot(db, accepted);
  const status = await privateModerationPilotStatus(db, accepted);
  assert(status.decisionConfirmed && status.continuationPreserved && status.sourcePresent, 'private-moderation-pilot-positive-proof-required');
  return accepted;
}
export async function seedPrivateModerationPilot(db, plan) {
  validatePrivateModerationPilot(db, plan); assert(!plan.acceptedDecision, 'private-moderation-pilot-accepted-plan-no-seed'); await moderatorFence(db, db, plan);
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
  const decision = decisions[0], confirmed = report.get('status') === 'resolved' && decision?.get('userId') === (plan.acceptedDecision?.actor.uid ?? plan.moderator.uid) &&
    decision?.get('privateReplyId') === t.first.id && decision?.get('shoutId') === t.root.id && report.get('decisionOperationId') === decision?.id &&
    decision?.get('result.removed') === true && !base.replies[0].present;
  return { ...base, reportId: t.report.id, reportReason: reportReason(plan), reportPresent: report.exists, reportStatus: report.get('status') ?? null,
    moderator: plan.acceptedDecision?.actor.nickname ?? plan.moderator.nickname, geographyReady, decisionConfirmed: confirmed, continuationPreserved: base.replies[1].present,
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
