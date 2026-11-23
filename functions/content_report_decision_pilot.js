// Explicitly approved DEV fixture. Never imported by a deployed host.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { canonical } from './feed_block_index.js';
import { createFeedRuntime } from './feed_runtime.js';
import { requireEligibleActor } from './callable_security.js';
import { createShoutOperation } from './create_shout.js';
import { createCommentOperation } from './create_comment.js';
import { createPrivateReplyOperation } from './create_private_reply.js';
import { createContentReportOperation } from './create_content_report.js';
import { planPrivateDeletionPilot, validatePrivateDeletionPilot, privateDeletionPilotFence } from './private_reply_deletion_pilot.js';
import { assertPrivateReportScope, privateReportModeratorLevel } from './remove_reported_private_reply.js';
import { removePilotReadKeys } from './feed_news_pilot.js';

const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const stamp = t => t ? [t.seconds, t.nanoseconds] : null;
const geography = { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' };
const noAuth = { getUser() { throw Error('decision-pilot-auth-forbidden'); } };
const input = (uid, data) => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'internal-decision-pilot' }, data });
const actorRefs = (db, uid) => ['users', 'accountRoles', 'moderators'].map(c => db.doc(`${c}/${uid}`));

export function decisionPilotSlots(plan) {
  const [a, b] = plan.base.actors, keys = plan.base.keys;
  const shoutId = digest(`${a.uid}\n${keys[0]}`);
  return [
    { type: 'shout', uid: a.uid, reporter: b.uid, id: shoutId, collection: 'reports',
      data: { idempotencyKey: keys[0], title: `MVP rozhodnuti ${plan.base.runId.slice(-8)}`, text: 'Synthetic DEV report decisions. Remove after verification.', categories: ['Dotaz'], durationMinutes: 1440, location: { latitude: 50.53, longitude: 14.13 } } },
    { type: 'comment', uid: b.uid, reporter: a.uid, id: digest(`${b.uid}\ncreateComment\n${keys[1]}`), collection: 'commentReports',
      data: { expectedUserId: b.uid, idempotencyKey: keys[1], shoutId, text: 'MVP rozhodnuti verejny komentar' } },
    { type: 'privateReply', uid: b.uid, reporter: a.uid, id: digest(`${b.uid}\ncreatePrivateReply\n${keys[2]}`), collection: 'privateReplyReports',
      data: { expectedUserId: b.uid, idempotencyKey: keys[2], shoutId, targetType: 'shout', text: 'MVP rozhodnuti soukroma odpoved' } },
  ].map(row => ({ ...row, shoutId, reportId: `${row.reporter}_${shoutId}${row.type === 'shout' ? '' : `_${row.id}`}` }));
}
const sourceRef = (db, row) => db.doc(`shouts/${row.shoutId}${row.type === 'shout' ? '' : `/${row.type === 'comment' ? 'comments' : 'privateReplies'}/${row.id}`}`);
const reportRef = (db, row) => db.doc(`${row.collection}/${row.reportId}`);
const reason = (plan, row) => `MVP rozhodnuti ${plan.base.runId.slice(-8)} ${row.type}. Remove after verification.`;

export function validateDecisionPilot(db, plan) {
  const { digest: seal, ...body } = plan;
  assert.equal(seal, hash(body), 'decision-pilot-digest'); validatePrivateDeletionPilot(db, plan.base);
  assert.equal(plan.v, 1); assert.equal(plan.kind, 'content-report-decisions');
  assert.deepEqual(plan.staff.map(a => a.nickname), ['TestModerator', 'TestAdmin']);
  const actors = [...plan.base.actors, ...plan.staff];
  assert.equal(new Set(actors.map(a => a.uid)).size, 4);
  assert(actors.every(a => /^[A-Za-z0-9_-]{1,128}$/.test(a.uid)));
  assert(plan.staff.every(a => a.stamps.length === 3));
  assert.equal(plan.reportKeys.length, 3); assert.equal(new Set(plan.reportKeys).size, 3);
  assert(plan.reportKeys.every(k => /^op1_\d+_[a-f0-9]{32}$/.test(k)));
  if (db.projectId === 'shoutout-dev-46c81') assert.deepEqual(plan.staff.map(a => a.uid), ['it_moderator', 'it_admin']);
}
async function fence(reader, db, plan) {
  await privateDeletionPilotFence(reader, db, plan.base);
  for (let i = 0; i < plan.staff.length; i++) {
    const actor = plan.staff[i]; await requireEligibleActor({ request: input(actor.uid), db, reader });
    const rows = await reader.getAll(...actorRefs(db, actor.uid));
    assert.equal(rows[0].get('nickname'), actor.nickname, 'decision-pilot-staff-drift');
    rows.forEach((row, at) => assert.equal(canonical(stamp(row.updateTime)), canonical(actor.stamps[at]), 'decision-pilot-role-drift'));
    const level = privateReportModeratorLevel(rows[1].data(), rows[2].data());
    assert.equal(level, i === 0 ? 3 : 5, 'decision-pilot-exact-role-required');
    assertPrivateReportScope(rows[1].data(), level, { geography });
  }
}
export async function planDecisionPilot(db, actors, staff, options = {}) {
  const base = await planPrivateDeletionPilot(db, actors, options), snapshots = [];
  for (const actor of staff) snapshots.push({ uid: actor.uid, nickname: actor.nickname, stamps: (await db.getAll(...actorRefs(db, actor.uid))).map(d => stamp(d.updateTime)) });
  const body = { v: 1, kind: 'content-report-decisions', base, staff: snapshots,
    reportKeys: Array.from({ length: 3 }, () => `op1_${Math.floor(base.plannedAt / 1000)}_${randomBytes(16).toString('hex')}`) };
  const plan = { ...body, digest: hash(body) }; validateDecisionPilot(db, plan); await fence(db, db, plan); return plan;
}
function guarded(db, plan) {
  return new Proxy(db, { get(object, key) {
    if (key === 'runTransaction') return (callback, options) => db.runTransaction(async tx => { await fence(tx, db, plan); return callback(tx); }, options);
    const value = object[key]; return typeof value === 'function' ? value.bind(object) : value;
  } });
}
function ownedSource(doc, row) {
  if (!doc.exists) return;
  assert.equal(doc.get('authorId'), row.uid, 'decision-pilot-foreign-source');
  assert.equal(doc.get('text'), row.data.text, 'decision-pilot-foreign-source');
  if (row.type === 'shout') {
    assert.equal(doc.get('title'), row.data.title); assert.deepEqual(doc.get('categories'), ['Dotaz']);
    assert.equal(doc.get('expiresAt').toMillis() - doc.get('createdAt').toMillis(), 86400000);
    assert.equal(doc.get('location').latitude, 50.53); assert.equal(doc.get('location').longitude, 14.13);
  } else if (row.type === 'privateReply') {
    assert.equal(doc.get('recipientId'), row.reporter); assert.deepEqual(doc.get('participants'), [row.uid, row.reporter]);
  }
}
export async function seedDecisionPilot(db, plan) {
  validateDecisionPilot(db, plan); await fence(db, db, plan);
  const safe = guarded(db, plan), runtime = createFeedRuntime(safe, noAuth, { newsRuntimeEnabled: true }), rows = decisionPilotSlots(plan);
  const clock = async () => (await db.doc('feedIndexControl/current').get()).readTime.toDate();
  let date = await clock();
  await createShoutOperation(input(rows[0].uid, rows[0].data), runtime.database, () => date, { indexWriter: runtime.indexWriter });
  await runtime.database.runTransaction(async tx => {
    const ref = sourceRef(db, rows[0]), doc = await tx.get(ref); ownedSource(doc, rows[0]); assert(doc.exists);
    await requireEligibleActor({ request: input(rows[0].uid), db, reader: tx });
    if (doc.get('geography')) { assert.deepEqual(doc.get('geography'), geography, 'decision-pilot-geography-drift'); return; }
    const after = { ...doc.data(), geography };
    const index = await runtime.indexWriter.prepare(tx, ref.id, doc.data(), after); index.apply(); tx.update(ref, { geography });
  });
  date = await clock(); await createCommentOperation(input(rows[1].uid, rows[1].data), runtime.database, () => date);
  date = await clock(); await createPrivateReplyOperation(input(rows[2].uid, rows[2].data), safe, () => date);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const date = await clock();
      await createContentReportOperation(input(row.reporter, { expectedUserId: row.reporter, idempotencyKey: plan.reportKeys[i], targetType: row.type,
        shoutId: row.shoutId, ...(row.type === 'shout' ? {} : { targetId: row.id }), reason: reason(plan, row) }), safe, () => date);
    } catch (error) { if (error.code === 'resource-exhausted') return { ...await decisionPilotStatus(db, plan), waitingForReportCooldown: true }; throw error; }
  }
  return { ...await decisionPilotStatus(db, plan), waitingForReportCooldown: false };
}
async function proof(reader, db, plan) {
  const rows = decisionPilotSlots(plan), query = db.collection('serverOperations').where('shoutId', '==', rows[0].id).limit(21);
  const receipts = await (reader === db ? query.get() : reader.get(query));
  assert(receipts.size <= 20, 'decision-pilot-unexpected-operations');
  const decisions = receipts.docs.filter(d => d.get('action') === 'decideContentReports');
  const expected = [ ['shout', 'approve', plan.staff[0].uid], ['comment', 'resolve', plan.staff[0].uid],
    ['privateReply', 'escalate', plan.staff[0].uid], ['privateReply', 'resolve', plan.staff[1].uid] ];
  assert(decisions.length <= expected.length, 'decision-pilot-unexpected-decisions');
  const confirmed = expected.map(([type, decision, uid]) => {
    const row = rows.find(r => r.type === type), matches = decisions.filter(d => d.get('targetType') === type && d.get('result.decision') === decision);
    assert(matches.length <= 1, 'decision-pilot-duplicate-decision');
    if (!matches.length) return false;
    const d = matches[0]; assert.equal(d.get('userId'), uid, 'decision-pilot-wrong-decision-actor');
    assert.equal(d.get('targetId'), type === 'shout' ? undefined : row.id); assert.equal(d.get('authorId'), row.uid);
    assert.deepEqual(d.get('reportIds'), [row.reportId]); assert.equal(d.get('result.count'), 1);
    assert.equal(d.get('expiresAt').toMillis() - d.get('createdAt').toMillis(), 7 * 86400000);
    return d.id;
  });
  return { confirmed, receipts: receipts.size };
}
export async function decisionPilotStatus(db, plan) {
  validateDecisionPilot(db, plan); await fence(db, db, plan);
  const rows = decisionPilotSlots(plan), sources = await db.getAll(...rows.map(r => sourceRef(db, r)));
  sources.forEach((doc, i) => ownedSource(doc, rows[i]));
  const reports = await db.getAll(...rows.map(r => reportRef(db, r))), p = await proof(db, db, plan);
  reports.forEach((d, i) => { if (d.exists) { const row = rows[i]; assert.equal(d.get('reporterId'), row.reporter); assert.equal(d.get('shoutId'), row.shoutId); assert.equal(d.get('reason'), reason(plan, row), 'decision-pilot-foreign-report'); } });
  return { shoutId: rows[0].id, title: rows[0].data.title, sourcesPresent: sources.map(d => d.exists),
    reports: rows.map((r, i) => ({ type: r.type, id: r.reportId, reason: reason(plan, r), status: reports[i].get('status') ?? null })),
    decisions: p.confirmed.map(Boolean), decisionOperations: p.confirmed, receipts: p.receipts, originalsPreserved: plan.base.originals.length, cloudWrites: 0 };
}
export async function cleanupDecisionPilot(db, plan) {
  validateDecisionPilot(db, plan); await fence(db, db, plan);
  const rows = decisionPilotSlots(plan), root = sourceRef(db, rows[0]), safe = guarded(db, plan), runtime = createFeedRuntime(safe, noAuth, { newsRuntimeEnabled: true });
  assert((await root.listCollections()).every(c => ['comments', 'privateReplies', 'saves', 'reactions'].includes(c.id)), 'decision-pilot-foreign-descendant');
  for (const row of rows.slice(1)) assert.equal((await sourceRef(db, row).listCollections()).length, 0, 'decision-pilot-foreign-descendant');
  const result = await runtime.database.runTransaction(async tx => {
    const p = await proof(tx, db, plan); assert(p.confirmed.every(Boolean), 'decision-pilot-positive-proof-required');
    const sources = await tx.getAll(...rows.map(r => sourceRef(db, r))); sources.forEach((d, i) => ownedSource(d, rows[i]));
    for (const [collection, id] of [['comments', rows[1].id], ['privateReplies', rows[2].id], ['saves', null], ['reactions', null]]) {
      const children = await tx.get(root.collection(collection).limit(2));
      assert(children.docs.every(d => d.id === id), 'decision-pilot-foreign-descendant');
    }
    const reports = await tx.getAll(...rows.map(r => reportRef(db, r)));
    for (let i = 0; i < reports.length; i++) if (reports[i].exists) {
      assert.equal(reports[i].get('status'), 'resolved'); assert.equal(reports[i].get('reason'), reason(plan, rows[i]));
      assert.equal(reports[i].get('decisionOperationId'), p.confirmed[i === 2 ? 3 : i]);
      assert.equal(reports[i].get('resolvedBy'), plan.staff[i === 2 ? 1 : 0].uid);
      assert.equal(reports[i].get('resolution'), i === 0 ? 'contentApproved' : 'noAction');
      if (i === 2) assert.equal(reports[i].get('escalationOperationId'), p.confirmed[2]);
    }
    const clearance = await tx.get(db.doc(`moderationClearances/shout_${root.id}`));
    if (clearance.exists) { assert.equal(clearance.get('moderatorId'), plan.staff[0].uid); assert.deepEqual(clearance.get('sourceReportIds'), [rows[0].reportId]); }
    // Refuse foreign clearances/reports under the same new target.
    for (const row of rows) {
      const all = await tx.get(db.collection(row.collection).where('shoutId', '==', root.id).limit(2));
      assert(all.docs.every(d => d.id === row.reportId), 'decision-pilot-foreign-report');
      if (row.type !== 'shout') assert(!(await tx.get(db.doc(`moderationClearances/${row.type}_${root.id}_${row.id}`))).exists, 'decision-pilot-foreign-clearance');
    }
    const notices = await tx.getAll(...plan.base.actors.flatMap(a => ['comment', 'privateReply'].map(kind => db.doc(`users/${a.uid}/notifications/${kind}_${root.id}`))));
    for (const d of notices.filter(d => d.exists)) { assert(['comment', 'privateReply'].includes(d.get('kind'))); assert.equal(d.get('targetShoutId'), root.id); assert.equal(d.get('actorId'), rows[1].uid); assert.equal(d.get(d.get('kind') === 'comment' ? 'targetCommentId' : 'targetPrivateReplyId'), rows[d.get('kind') === 'comment' ? 1 : 2].id); }
    const deleted = [...sources, ...reports, clearance, ...notices].filter(d => d.exists);
    const index = await runtime.indexWriter.prepareBatch(tx, sources[0].exists ? [{ id: root.id, before: sources[0].data(), after: null }] : [], { additionalWrites: deleted.length });
    index.apply(); deleted.forEach(d => tx.delete(d.ref));
    return { removed: Number(sources[0].exists), documents: deleted.length, expiresAt: sources[0].get('expiresAt')?.toMillis() };
  });
  const created = await db.doc(`serverOperations/${root.id}`).get();
  const expiresAt = result.expiresAt ?? created.get('createdAt').toMillis() + 86400000;
  let readKeys = 0;
  for (const actor of [...plan.base.actors, ...plan.staff]) readKeys += await removePilotReadKeys(db,
    { slots: [{ label: 'root', title: rows[0].data.title, text: rows[0].data.text }] }, { root: { id: root.id, expiresAt } }, actor, tx => fence(tx, db, plan));
  await fence(db, db, plan);
  return { ...result, readKeys, receiptsRemoved: 0, rateResets: 0, authMutations: 0, originalsPreserved: plan.base.originals.length };
}
