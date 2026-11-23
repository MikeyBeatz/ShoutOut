// One explicitly approved DEV fixture. Never imported by deployed hosts.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { canonical } from './feed_block_index.js';
import { createFeedRuntime } from './feed_runtime.js';
import { requireEligibleActor } from './callable_security.js';
import { createShoutOperation } from './create_shout.js';
import { createCommentOperation } from './create_comment.js';
import { createContentReportOperation } from './create_content_report.js';
import { privateDeletionPilotFence } from './private_reply_deletion_pilot.js';
import { privateReportModeratorLevel, assertPrivateReportScope } from './remove_reported_private_reply.js';
import { removePilotReadKeys } from './feed_news_pilot.js';

const project = 'shoutout-dev-46c81', names = ['Bright_Otter_182', 'TestBusiness'];
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const stamp = t => t ? [t.seconds, t.nanoseconds] : null;
const geography = { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' };
const noAuth = { getUser() { throw Error('public-pilot-auth-forbidden'); } };
const input = (uid, data) => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'internal-public-pilot' }, data });
const staffRefs = (db, uid) => ['users', 'accountRoles', 'moderators'].map(c => db.doc(`${c}/${uid}`));
const sourceRef = (db, row) => db.doc(`shouts/${row.shoutId}${row.type === 'shout' ? '' : `/comments/${row.id}`}`);
const reportRef = (db, row) => db.doc(`${row.type === 'shout' ? 'reports' : 'commentReports'}/${row.reportId}`);
const reason = (plan, row) => `MVP public removal ${plan.base.runId.slice(-8)} ${row.type}. Remove after verification.`;

export function publicRemovalPilotSlots(plan) {
  const [a, b] = plan.base.actors, keys = plan.base.keys, shoutId = digest(`${a.uid}\n${keys[0]}`);
  return [
    { type: 'shout', uid: a.uid, reporter: b.uid, id: shoutId, data: { idempotencyKey: keys[0],
      title: `MVP public removal ${plan.base.runId.slice(-8)}`, text: 'Synthetic DEV public removal pilot. Remove after verification.',
      categories: ['Dotaz'], durationMinutes: 1440, location: { latitude: 50.53, longitude: 14.13 } } },
    { type: 'comment', uid: b.uid, reporter: a.uid, id: digest(`${b.uid}\ncreateComment\n${keys[1]}`),
      data: { expectedUserId: b.uid, idempotencyKey: keys[1], shoutId, text: 'MVP public removal target comment' } },
    { type: 'control', uid: a.uid, id: digest(`${a.uid}\ncreateComment\n${keys[2]}`),
      data: { expectedUserId: a.uid, idempotencyKey: keys[2], shoutId, text: 'MVP public removal control comment' } },
  ].map(row => ({ ...row, shoutId, ...(row.reporter ? { reportId: `${row.reporter}_${shoutId}${row.type === 'shout' ? '' : `_${row.id}`}` } : {}) }));
}

export function validatePublicRemovalPilot(db, plan) {
  assert(db.projectId === project || db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080', 'public-pilot-dev-required');
  const { digest: seal, ...body } = plan;
  assert.equal(seal, hash(body), 'public-pilot-digest'); assert.equal(plan.v, 1); assert.equal(plan.kind, 'public-report-removal');
  const base = plan.base; assert.equal(base.v, 1); assert.equal(base.projectId, db.projectId); assert(/^mvp-public-remove-[a-f0-9]{16}$/.test(base.runId));
  assert.deepEqual(base.actors.map(a => a.nickname), names); assert.equal(plan.staff.nickname, 'TestModerator');
  assert.equal(new Set([...base.actors, plan.staff].map(a => a.uid)).size, 3);
  assert([...base.actors, plan.staff].every(a => /^[A-Za-z0-9_-]{1,128}$/.test(a.uid)));
  assert.equal(base.keys.length, 5); assert.equal(new Set(base.keys).size, 5); assert(base.keys.every(k => /^op1_\d+_[a-f0-9]{32}$/.test(k)));
  assert(Number.isSafeInteger(base.plannedAt) && base.plannedAt > 0);
  assert(Array.isArray(base.originals) && Array.isArray(base.requests) && base.incarnations.length > 0 && base.incarnations.length <= 3);
  assert.equal(plan.staff.stamps.length, 3); assert(!base.originals.some(r => r.id === publicRemovalPilotSlots(plan)[0].id));
  if (db.projectId === project) {
    assert.equal(base.originals.length, 38); assert.equal(base.requests.length, 1);
    assert.deepEqual(base.actors.map(a => a.uid), ['Ja0aoV18a7alFad5wLJlnPCSBVF3', 'it_business']); assert.equal(plan.staff.uid, 'it_moderator');
  }
}
async function fence(reader, db, plan) {
  await privateDeletionPilotFence(reader, db, plan.base);
  for (const actor of plan.base.actors) {
    const eligible = await requireEligibleActor({ request: input(actor.uid), db, reader, requireContentPermission: true });
    assert.equal(eligible.profile.nickname, actor.nickname, 'public-pilot-actor-drift');
  }
  const roles = await reader.getAll(...plan.base.actors.map(a => db.doc(`accountRoles/${a.uid}`)));
  assert.notEqual(roles[0].get('role'), 'business'); assert.equal(roles[1].get('role'), 'business'); assert.equal(roles[1].get('level'), 2);
  const blocked = await reader.getAll(...plan.base.actors.map((a, i) => db.doc(`users/${a.uid}/blocked/${plan.base.actors[1 - i].uid}`)));
  assert(blocked.every(d => !d.exists), 'public-pilot-actors-blocked');
  const actor = plan.staff; await requireEligibleActor({ request: input(actor.uid), db, reader });
  const docs = await reader.getAll(...staffRefs(db, actor.uid)); assert.equal(docs[0].get('nickname'), actor.nickname, 'public-pilot-staff-drift');
  docs.forEach((d, i) => assert.equal(canonical(stamp(d.updateTime)), canonical(actor.stamps[i]), 'public-pilot-role-drift'));
  const level = privateReportModeratorLevel(docs[1].data(), docs[2].data()); assert.equal(level, 3, 'public-pilot-exact-moderator-required');
  assertPrivateReportScope(docs[1].data(), level, { geography });
}
export async function planPublicRemovalPilot(db, actors, staff, { expectedSources = 38 } = {}) {
  assert(db.projectId === project || db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080', 'public-pilot-dev-required');
  if (db.projectId === project) assert.equal(expectedSources, 38);
  const body = await db.runTransaction(async tx => {
    const [control, news] = await tx.getAll(db.doc('feedIndexControl/current'), db.doc('feedNewsControl/current'));
    const ids = control.get('writeGenerationIds'); assert(Array.isArray(ids) && ids.length > 0 && ids.length <= 3);
    const generations = await tx.getAll(...ids.map(id => db.doc(`feedIndexGenerations/${id}`))); assert(generations.every(d => d.exists));
    const sources = await tx.get(db.collection('shouts').select().limit(expectedSources + 1)); assert.equal(sources.size, expectedSources);
    const requests = await tx.get(db.collection('accountDeletionRequests').select().limit(51)); assert(requests.size <= 50);
    const staffDocs = await tx.getAll(...staffRefs(db, staff.uid));
    return { v: 1, kind: 'public-report-removal', base: { v: 1, projectId: db.projectId, runId: `mvp-public-remove-${randomBytes(8).toString('hex')}`,
      plannedAt: control.readTime.toMillis(), actors: actors.map(({ uid, nickname }) => ({ uid, nickname })),
      keys: Array.from({ length: 5 }, () => `op1_${control.readTime.seconds}_${randomBytes(16).toString('hex')}`),
      controlHash: hash(control.data()), newsHash: hash(news.data()), incarnations: generations.map(d => ({ id: d.id, created: stamp(d.createTime) })),
      originals: sources.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })), requests: requests.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })) },
    staff: { uid: staff.uid, nickname: staff.nickname, stamps: staffDocs.map(d => stamp(d.updateTime)) } };
  }, { readOnly: true });
  const plan = { ...body, digest: hash(body) }; validatePublicRemovalPilot(db, plan); await fence(db, db, plan); return plan;
}
function guarded(db, plan) {
  return new Proxy(db, { get(object, key) {
    if (key === 'runTransaction') return (callback, options) => db.runTransaction(async tx => { await fence(tx, db, plan); return callback(tx); }, options);
    const value = object[key]; return typeof value === 'function' ? value.bind(object) : value;
  } });
}
function ownedSource(doc, row) {
  if (!doc.exists) return;
  assert.equal(doc.get('authorId'), row.uid, 'public-pilot-foreign-source'); assert.equal(doc.get('text'), row.data.text, 'public-pilot-foreign-source');
  if (row.type === 'shout') {
    assert.equal(doc.get('title'), row.data.title); assert.deepEqual(doc.get('categories'), ['Dotaz']);
    assert.equal(doc.get('expiresAt').toMillis() - doc.get('createdAt').toMillis(), 86400000);
    assert.equal(doc.get('location').latitude, 50.53); assert.equal(doc.get('location').longitude, 14.13);
  }
}
function ownedReport(doc, plan, row) {
  if (!doc.exists) return;
  assert.equal(doc.get('shoutId'), row.shoutId); assert.equal(doc.get('reporterId'), row.reporter);
  assert.equal(doc.get('reason'), reason(plan, row), 'public-pilot-foreign-report');
  if (row.type === 'comment') assert.equal(doc.get('commentId'), row.id);
}
async function proof(reader, db, plan) {
  const rows = publicRemovalPilotSlots(plan), root = rows[0];
  const query = db.collection('serverOperations').where('shoutId', '==', root.id).limit(9).select('action', 'userId', 'authorId', 'targetType', 'targetId',
    'reportIds', 'reportId', 'requiredRoleLevel', 'result.removed', 'result.count', 'createdAt', 'expiresAt', 'keyVersion');
  const receipts = await (reader === db ? query.get() : reader.get(query)); assert(receipts.size <= 7, 'public-pilot-unexpected-operations');
  const seedIds = new Map([
    [root.id, ['createShout', root.uid]], ...rows.slice(1).map(r => [r.id, ['createComment', r.uid]]),
    ...rows.slice(0, 2).map((r, i) => [digest(`${r.reporter}\ncreateContentReport\n${plan.base.keys[3 + i]}`), ['createContentReport', r.reporter]]),
  ]);
  for (const d of receipts.docs) if (d.get('action') !== 'removeReportedPublicContent') {
    const expected = seedIds.get(d.id); assert(expected, 'public-pilot-foreign-operation');
    assert.equal(d.get('action'), expected[0]); assert.equal(d.get('userId'), expected[1]);
  }
  const decisions = receipts.docs.filter(d => d.get('action') === 'removeReportedPublicContent');
  const confirmed = rows.slice(0, 2).map(row => {
    const matches = decisions.filter(d => d.get('targetType') === row.type); assert(matches.length <= 1, 'public-pilot-duplicate-decision');
    if (!matches.length) return null;
    const d = matches[0]; assert.equal(d.get('userId'), plan.staff.uid, 'public-pilot-wrong-decision-actor');
    assert.equal(d.get('authorId'), row.uid); assert.equal(d.get('targetId'), row.type === 'shout' ? undefined : row.id);
    assert.deepEqual(d.get('reportIds'), [row.reportId]); assert.equal(d.get('requiredRoleLevel'), 3);
    assert.deepEqual(d.get('result'), { removed: true, count: 1 }); assert.equal(d.get('keyVersion'), 1);
    assert.equal(d.get('expiresAt').toMillis() - d.get('createdAt').toMillis(), 7 * 86400000);
    return d;
  });
  assert.equal(decisions.length, confirmed.filter(Boolean).length, 'public-pilot-unexpected-decision');
  if (confirmed.every(Boolean)) assert(confirmed[1].get('createdAt').toMillis() <= confirmed[0].get('createdAt').toMillis(), 'public-pilot-wrong-decision-order');
  return { confirmed, receipts: receipts.size };
}
export async function seedPublicRemovalPilot(db, plan) {
  validatePublicRemovalPilot(db, plan); await fence(db, db, plan);
  const p = await proof(db, db, plan); assert(p.confirmed.every(d => !d), 'public-pilot-decision-started');
  const rows = publicRemovalPilotSlots(plan), reports = await db.getAll(...rows.slice(0, 2).map(r => reportRef(db, r)));
  reports.forEach((d, i) => { ownedReport(d, plan, rows[i]); if (d.exists) assert.equal(d.get('status'), 'open', 'public-pilot-decision-started'); });
  const safe = guarded(db, plan), runtime = createFeedRuntime(safe, noAuth, { newsRuntimeEnabled: true });
  const clock = async () => (await db.doc('feedIndexControl/current').get()).readTime.toDate();
  try {
    let date = await clock(); await createShoutOperation(input(rows[0].uid, rows[0].data), runtime.database, () => date, { indexWriter: runtime.indexWriter });
    await runtime.database.runTransaction(async tx => {
      const doc = await tx.get(sourceRef(db, rows[0])); ownedSource(doc, rows[0]); assert(doc.exists);
      if (doc.get('geography')) { assert.deepEqual(doc.get('geography'), geography, 'public-pilot-geography-drift'); return; }
      const index = await runtime.indexWriter.prepare(tx, doc.id, doc.data(), { ...doc.data(), geography }); index.apply(); tx.update(doc.ref, { geography });
    });
    for (const row of rows.slice(1)) { date = await clock(); await createCommentOperation(input(row.uid, row.data), runtime.database, () => date); }
    for (const [i, row] of rows.slice(0, 2).entries()) {
      date = await clock(); await createContentReportOperation(input(row.reporter, { expectedUserId: row.reporter, idempotencyKey: plan.base.keys[3 + i],
        targetType: row.type, shoutId: row.shoutId, ...(row.type === 'shout' ? {} : { targetId: row.id }), reason: reason(plan, row) }), safe, () => date);
    }
  } catch (error) { if (error.code === 'resource-exhausted') return { ...await publicRemovalPilotStatus(db, plan), waitingForCooldown: true }; throw error; }
  return { ...await publicRemovalPilotStatus(db, plan), waitingForCooldown: false };
}
export async function publicRemovalPilotStatus(db, plan) {
  validatePublicRemovalPilot(db, plan); await fence(db, db, plan);
  const rows = publicRemovalPilotSlots(plan), sources = await db.getAll(...rows.map(r => sourceRef(db, r)));
  sources.forEach((d, i) => ownedSource(d, rows[i]));
  const reports = await db.getAll(...rows.slice(0, 2).map(r => reportRef(db, r))); reports.forEach((d, i) => ownedReport(d, plan, rows[i]));
  const p = await proof(db, db, plan);
  return { shoutId: rows[0].id, title: rows[0].data.title, sourcesPresent: sources.map(d => d.exists), shoutStatus: sources[0].get('status') ?? null,
    commentsCount: sources[0].get('commentsCount') ?? null, reports: rows.slice(0, 2).map((r, i) => ({ type: r.type, id: r.reportId, reason: reason(plan, r), status: reports[i].get('status') ?? null })),
    decisions: p.confirmed.map(Boolean), decisionOperations: p.confirmed.map(d => d?.id ?? null), receipts: p.receipts, originalsPreserved: plan.base.originals.length, cloudWrites: 0 };
}
export async function cleanupPublicRemovalPilot(db, plan) {
  validatePublicRemovalPilot(db, plan); await fence(db, db, plan);
  const rows = publicRemovalPilotSlots(plan), root = sourceRef(db, rows[0]);
  assert((await root.listCollections()).every(c => ['comments', 'privateReplies', 'saves', 'reactions'].includes(c.id)), 'public-pilot-foreign-descendant');
  for (const row of rows.slice(1)) assert.equal((await sourceRef(db, row).listCollections()).length, 0, 'public-pilot-foreign-descendant');
  const safe = guarded(db, plan), runtime = createFeedRuntime(safe, noAuth, { newsRuntimeEnabled: true });
  const result = await runtime.database.runTransaction(async tx => {
    const p = await proof(tx, db, plan); assert(p.confirmed.every(Boolean), 'public-pilot-positive-proof-required');
    const sources = await tx.getAll(...rows.map(r => sourceRef(db, r))); sources.forEach((d, i) => ownedSource(d, rows[i]));
    assert(!sources[1].exists, 'public-pilot-target-not-removed');
    if (sources[0].exists) { assert.equal(sources[0].get('status'), 'deleted'); assert.equal(sources[0].get('commentsCount'), 1); assert(sources[2].exists, 'public-pilot-control-comment-missing'); }
    const reports = await tx.getAll(...rows.slice(0, 2).map(r => reportRef(db, r)));
    reports.forEach((d, i) => { ownedReport(d, plan, rows[i]); if (sources[0].exists) assert(d.exists); if (d.exists) {
      assert.equal(d.get('status'), 'resolved'); assert.equal(d.get('resolution'), 'contentRemoved');
      assert.equal(d.get('resolvedBy'), plan.staff.uid); assert.equal(d.get('decisionOperationId'), p.confirmed[i].id);
    } });
    for (const name of ['comments', 'privateReplies', 'saves', 'reactions']) {
      const children = await tx.get(root.collection(name).limit(3));
      assert(children.docs.every(d => name === 'comments' && d.id === rows[2].id), 'public-pilot-foreign-descendant');
    }
    for (const [collection, allowed] of [['reports', [rows[0].reportId]], ['commentReports', [rows[1].reportId]], ['privateReplyReports', []]]) {
      const all = await tx.get(db.collection(collection).where('shoutId', '==', root.id).limit(3));
      assert(all.docs.every(d => allowed.includes(d.id)), 'public-pilot-foreign-report');
    }
    const clearances = await tx.getAll(...rows.map(r => db.doc(`moderationClearances/${r.type === 'shout' ? 'shout' : 'comment'}_${root.id}${r.type === 'shout' ? '' : `_${r.id}`}`)));
    assert(clearances.every(d => !d.exists), 'public-pilot-foreign-clearance');
    const notices = await tx.getAll(...plan.base.actors.map(a => db.doc(`users/${a.uid}/notifications/comment_${root.id}`)));
    for (const n of notices.filter(d => d.exists)) { assert.equal(n.get('kind'), 'comment'); assert.equal(n.get('targetShoutId'), root.id);
      assert(plan.base.actors.some(a => a.uid === n.get('actorId'))); assert(rows.slice(1).some(r => r.id === n.get('targetCommentId'))); }
    const deleted = [...sources, ...reports, ...notices].filter(d => d.exists);
    const index = await runtime.indexWriter.prepareBatch(tx, sources[0].exists ? [{ id: root.id, before: sources[0].data(), after: null }] : [], { additionalWrites: deleted.length });
    index.apply(); deleted.forEach(d => tx.delete(d.ref));
    return { removed: Number(sources[0].exists), documents: deleted.length, expiresAt: sources[0].get('expiresAt')?.toMillis() };
  });
  const created = await db.doc(`serverOperations/${root.id}`).get();
  const expiresAt = result.expiresAt ?? created.get('createdAt').toMillis() + 86400000;
  let readKeys = 0;
  for (const actor of [...plan.base.actors, plan.staff]) readKeys += await removePilotReadKeys(db,
    { slots: [{ label: 'root', title: rows[0].data.title, text: rows[0].data.text }] }, { root: { id: root.id, expiresAt } }, actor, tx => fence(tx, db, plan));
  await fence(db, db, plan); return { ...result, readKeys, receiptsRemoved: 0, rateResets: 0, authMutations: 0, originalsPreserved: plan.base.originals.length };
}
