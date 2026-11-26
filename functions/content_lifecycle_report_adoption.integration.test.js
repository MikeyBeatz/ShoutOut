import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Firestore, Timestamp, GeoPoint, FieldValue } from 'firebase-admin/firestore';
import { createFeedRuntime } from './feed_runtime.js';
import { createContentLifecycleDatabase, lifecycleDay } from './content_lifecycle.js';
import { planLifecycleSourceAdoption, applyLifecycleSourceAdoption } from './content_lifecycle_adoption.js';
import { planLifecycleReportAdoption as planPage, applyLifecycleReportAdoption as applyPage, validateLifecycleReportAdoptionPlan } from './content_lifecycle_report_adoption.js';
import { getLifecycleReportEvidenceOperation as readEvidence } from './content_lifecycle_evidence.js';
import { decideContentReportsOperation } from './decide_content_reports.js';
import { removeReportedPublicContentOperation } from './remove_reported_public_content.js';
import { removeReportedPrivateReplyOperation } from './remove_reported_private_reply.js';
import { sanctionContentOperation } from './moderation_sanctions.js';
import { purgeScrubPatch } from './account_purge_policy.js';
import { operationTestKey } from './test_helpers.js';
import { encodeGeohash } from './geohash.js';
import { canonical } from './feed_block_index.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const types = ['shout', 'comment', 'privateReply'];
const collections = { shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' };
const absent = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
async function fixture(t, { level = 3, scope = { countries: ['CZ'] } } = {}) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), nonce = randomUUID().replaceAll('-', '');
  let now = new Date(Date.now() + 1500); const clock = () => now;
  const control = raw.doc('contentLifecycleControl/current'), feed = raw.doc('feedIndexControl/current'), gen = raw.doc(`feedIndexGenerations/legacy-${nonce}`);
  const root = raw.doc(`shouts/legacy_${nonce}`), extra = [], authorId = `author_${nonce}`, reporterId = `reporter_${nonce}`, moderatorId = `mod_${nonce}`;
  t.after(async () => {
    await raw.recursiveDelete(root); await raw.doc(`contentLifecycleThreads/${root.id}`).delete();
    for (const doc of (await raw.collection('contentLifecycleArchive').where('threadId', '==', root.id).get()).docs) await raw.recursiveDelete(doc.ref);
    for (const ref of [control, feed, gen, ...extra]) await raw.recursiveDelete(ref);
    await raw.terminate();
  });
  const batch = raw.batch();
  batch.create(control, { schemaVersion: 1, mode: 'paused', revision: 1 });
  batch.create(gen, { schemaVersion: 1, v: 2, readIdentity: 1, cardProjection: 1, cardReady: true, accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
  batch.create(feed, { schemaVersion: 2, revision: 1, mode: 'active', readGenerationId: gen.id, writeGenerationIds: [gen.id], cardReadGenerationId: gen.id, cardWriteGenerationIds: [gen.id] });
  const user = raw.doc(`users/${moderatorId}`), role = raw.doc(`accountRoles/${moderatorId}`); extra.push(user, role, raw.doc(`rateLimits/${moderatorId}`));
  batch.create(user, { nickname: 'Synthetic moderator' }); batch.create(user.collection('legal').doc('acceptance_2026_07_25'), {});
  batch.create(role, { level, moderationScope: scope }); await batch.commit();
  const rt = createFeedRuntime(raw, absent, { enabled: true, clock, cardStateEnabled: true, newsRuntimeEnabled: false, contentLifecycleEnabled: false });
  const source = { id: root.id, authorId, authorNickname: 'Synthetic', title: 'Legacy evidence', text: 'Existing original root body',
    createdAt: Timestamp.fromMillis(now.getTime() - 3600000), expiresAt: Timestamp.fromMillis(now.getTime() + lifecycleDay), status: 'active',
    geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, location: new GeoPoint(50.53, 14.13), geohash: encodeGeohash(50.53, 14.13), categories: ['Dotaz'],
    likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: 1 };
  await rt.database.runTransaction(async tx => { const p = await rt.indexWriter.prepare(tx, root.id, null, source); p.apply(); tx.create(root, source); });
  const sources = { shout: root, comment: root.collection('comments').doc('public'), privateReply: root.collection('privateReplies').doc('private') };
  await sources.comment.create({ authorId, authorNickname: 'Synthetic', text: 'Existing original comment', createdAt: source.createdAt });
  await sources.privateReply.create({ authorId, authorNickname: 'Synthetic', recipientId: reporterId, participants: [authorId, reporterId], text: 'Existing original private body', createdAt: source.createdAt });
  async function report(kind, uid = reporterId) {
    const ref = raw.doc(`${collections[kind]}/${uid}_${root.id}${kind === 'shout' ? '' : `_${sources[kind].id}`}`); extra.push(ref);
    const body = (await sources[kind].get()).data();
    await ref.create({ reporterId: uid, shoutId: root.id, reason: 'Synthetic legacy reason', status: 'open', createdAt: Timestamp.now(),
      ...(kind === 'comment' ? { commentId: sources[kind].id } : kind === 'privateReply' ? { privateReplyId: sources[kind].id, authorId, text: body.text, priority: 'high' } : {}) });
    return ref;
  }
  const reports = {};
  for (const kind of types) reports[kind] = await report(kind);
  async function adopt() {
    const plan = await planLifecycleSourceAdoption(rt.database, Object.values(sources).map(ref => ref.path), { clock });
    assert(plan.entries.every(e => e.action === 'adopt'));
    await applyLifecycleSourceAdoption(rt.database, plan, { approvedDigest: plan.digest, compatibleWriters: true, indexWriter: rt.indexWriter, clock });
  }
  async function candidate(ref, kind) {
    return { reportPath: ref.path, contentArchiveKey: (await sources[kind].get()).get('contentArchiveKey'), shoutArchiveKey: (await root.get()).get('contentArchiveKey') };
  }
  const candidates = async () => Promise.all(types.map(type => candidate(reports[type], type)));
  const plan = c => planPage(rt.database, c, { clock });
  const apply = (p, options = {}) => applyPage(rt.database, p, { approvedDigest: p.digest, compatibleWriters: true, clock, ...options });
  const request = (kind, ref = reports[kind]) => ({ auth: { uid: moderatorId, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { reportId: ref.id, targetType: kind, expectedUserId: moderatorId } });
  return { raw, rt, control, feed, gen, root, role, sources, source, reports, extra, authorId, reporterId, moderatorId, clock, report, adopt, candidate, candidates, plan, apply, request,
    setNow(value) { now = value; } };
}

test('one bounded plan binds all three old report kinds without copying bodies or changing source/index versions', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); const cs = await f.candidates();
  const before = await Promise.all(cs.map(c => f.raw.doc(c.reportPath).get()));
  const sourceBefore = await Promise.all(Object.values(f.sources).map(ref => ref.get()));
  const archives = await Promise.all(cs.map(c => f.raw.doc(`contentLifecycleArchive/${c.contentArchiveKey}`).get()));
  const indexBefore = (await f.gen.collection('publicStates').get()).docs.map(d => [d.id, d.updateTime]);
  for (const kind of types) await assert.rejects(readEvidence(f.request(kind), f.rt.database, f.clock), e => e.code === 'failed-precondition');
  const plan = await f.plan(cs); validateLifecycleReportAdoptionPlan(plan, f.raw.projectId);
  assert(plan.entries.every(e => e.action === 'bind')); assert(!JSON.stringify(plan).includes('Existing original')); assert(!JSON.stringify(plan).includes('Synthetic legacy reason'));
  assert.deepEqual(await f.apply(plan), { state: 'applied', reports: 3, writes: 3, bodyCopies: 0 });
  assert.equal((await f.apply(plan)).writes, 0);
  for (let n = 0; n < cs.length; n++) {
    const after = await before[n].ref.get();
    for (const key of ['reason', 'status', 'createdAt']) assert.deepEqual(after.get(key), before[n].get(key));
    assert(after.createTime.isEqual(before[n].createTime)); assert.equal(after.get('text'), undefined);
    assert.equal(after.get('legacyEvidenceBinding.migrationDigest'), plan.digest);
    assert((await archives[n].ref.get()).updateTime.isEqual(archives[n].updateTime));
    assert((await sourceBefore[n].ref.get()).updateTime.isEqual(sourceBefore[n].updateTime));
    const view = await readEvidence(f.request(types[n]), f.rt.database, f.clock);
    assert.equal(view.captureMode, 'transition'); assert.equal(view.targetData.text, archives[n].get('content.text'));
    assert.equal(view.legacyEvidenceBinding, undefined);
  }
  assert.deepEqual((await f.gen.collection('publicStates').get()).docs.map(d => [d.id, d.updateTime]), indexBefore);
  const again = await f.plan(cs); assert(again.entries.every(e => e.action === 'bound')); assert.equal((await f.apply(again)).writes, 0);
});

for (const kind of types) test(`migrated ${kind} is readable and decidable after source/parent loss, with scoped replay`, { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); await f.apply(await f.plan([await f.candidate(f.reports[kind], kind)]));
  for (const ref of Object.values(f.sources).reverse()) await ref.delete();
  const view = await readEvidence(f.request(kind), f.rt.database, f.clock); assert(view.targetData.text.startsWith('Existing original'));
  const db = createContentLifecycleDatabase(f.raw, { enabled: true, clock: f.clock });
  const req = f.request(kind); req.data = { expectedUserId: f.moderatorId, targetType: kind, shoutId: f.root.id,
    ...(kind === 'shout' ? {} : { targetId: f.sources[kind].id }), reportIds: [f.reports[kind].id], decision: 'approve', note: '', idempotencyKey: operationTestKey(`legacy_${kind}`, f.clock()) };
  const receiptId = createHash('sha256').update(`${f.moderatorId}\ndecideContentReports\n${req.data.idempotencyKey}`).digest('hex');
  f.extra.push(f.raw.doc(`serverOperations/${receiptId}`), f.raw.doc(`moderationClearances/${kind}_${f.root.id}${kind === 'shout' ? '' : `_${f.sources[kind].id}`}`));
  assert.deepEqual(await decideContentReportsOperation(req, db, f.clock), { decision: 'approve', count: 1 });
  assert.equal((await f.reports[kind].get()).get('resolution'), 'contentApproved');
  await decideContentReportsOperation(req, db, f.clock);
  await f.role.update({ moderationScope: { countries: ['DE'] } });
  await assert.rejects(readEvidence(f.request(kind), f.rt.database, f.clock), e => e.code === 'permission-denied');
  await assert.rejects(decideContentReportsOperation(req, db, f.clock), e => e.code === 'permission-denied');
});

test('later target edits cannot be presented as the old reported version', { skip: !enabled }, async t => {
  const f = await fixture(t);
  await f.sources.comment.update({ text: 'Changed after the report' }); await f.adopt();
  const plan = await f.plan(await f.candidates());
  assert.equal(plan.entries.find(e => e.reportPath === f.reports.comment.path).reason, 'report-version-unproven');
  await assert.rejects(f.apply(plan), /plan-blocked/); assert.equal((await f.reports.shout.get()).get('contentArchiveKey'), undefined);
});

test('a later parent geography cannot grant a moderator authority over the original report', { skip: !enabled }, async t => {
  const f = await fixture(t);
  await f.rt.database.runTransaction(async tx => {
    const before = (await tx.get(f.root)).data(), geography = { schemaVersion: 1, countryCode: 'DE' };
    const p = await f.rt.indexWriter.prepare(tx, f.root.id, before, { ...before, geography }); p.apply(); tx.update(f.root, { geography });
  });
  await f.adopt(); const plan = await f.plan([await f.candidate(f.reports.privateReply, 'privateReply')]);
  assert.equal(plan.entries[0].reason, 'report-version-unproven'); await assert.rejects(f.apply(plan), /plan-blocked/);
});

test('private text/recipient mismatches and partial bindings block the whole page', { skip: !enabled }, async t => {
  const f = await fixture(t), outsider = await f.report('privateReply', 'outsider'); await f.adopt();
  assert.equal((await f.plan([await f.candidate(outsider, 'privateReply')])).entries[0].reason, 'report-target-changed');
  await f.reports.privateReply.update({ text: 'Different report snapshot' });
  const plan = await f.plan(await f.candidates()); assert.equal(plan.entries.find(e => e.reportPath === f.reports.privateReply.path).reason, 'report-target-changed');
  await assert.rejects(f.apply(plan), /plan-blocked/);
  await f.reports.comment.update({ contentArchiveKey: 'a'.repeat(64) });
  const partial = await f.plan([await f.candidate(f.reports.comment, 'comment')]); assert.equal(partial.entries[0].reason, 'partial-report-binding');
});

test('missing archives and a substituted parent incarnation never acquire a binding', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); const cs = await f.candidates();
  const wrong = { ...cs[1], contentArchiveKey: 'f'.repeat(64) };
  assert.equal((await f.plan([wrong])).entries[0].reason, 'evidence-unavailable');
  const thread = f.raw.doc(`contentLifecycleThreads/${f.root.id}`), birth = (await thread.get()).get('sourceCreateTime');
  await thread.update({ sourceCreateTime: Timestamp.fromMillis(birth.toMillis() - 1000) });
  assert.equal((await f.plan([cs[1]])).entries[0].reason, 'evidence-identity-changed');
  assert.equal((await f.reports.comment.get()).get('contentArchiveKey'), undefined);
});

test('stored proof and the original geographic scope remain mandatory on every archived read', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); await f.apply(await f.plan(await f.candidates()));
  for (const kind of ['shout', 'comment']) {
    await f.reports[kind].update({ moderationGeography: { schemaVersion: 1, countryCode: 'DE' } });
    await assert.rejects(readEvidence(f.request(kind), f.rt.database, f.clock), e => e.code === 'failed-precondition');
  }
  await f.reports.privateReply.update({ legacyEvidenceBinding: FieldValue.delete() });
  await assert.rejects(readEvidence(f.request('privateReply'), f.rt.database, f.clock), e => e.code === 'failed-precondition');
});

test('an unbound report cannot select a potentially superseded copy from before it was filed', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); const late = await f.report('shout', 'late_legacy_reporter');
  const plan = await f.plan([await f.candidate(late, 'shout')]);
  assert.equal(plan.entries[0].reason, 'report-version-unproven'); await assert.rejects(f.apply(plan), /plan-blocked/);
});

test('invalid candidate paths, duplicate/oversized batches, schema and approval digests are rejected before mutation', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); const cs = await f.candidates(), plan = await f.plan(cs);
  for (const candidates of [[], [cs[0], cs[0]], Array.from({ length: 51 }, (_, n) => ({ ...cs[0], reportPath: `reports/uid${n}_${f.root.id}` })),
    [{ ...cs[0], reportPath: 12 }], [{ ...cs[0], reportPath: 'users/private' }], [{ ...cs[0], extra: true }]]) await assert.rejects(f.plan(candidates), /invalid-lifecycle-report-candidates/);
  const malformed = { ...plan, extra: true }; malformed.digest = digest(Object.fromEntries(Object.entries(malformed).filter(([k]) => k !== 'digest')));
  assert.throws(() => validateLifecycleReportAdoptionPlan(malformed, f.raw.projectId), /invalid-lifecycle-report-plan/);
  await assert.rejects(f.apply(plan, { approvedDigest: '0'.repeat(64) }), /invalid-lifecycle-report-plan/);
  await assert.rejects(f.apply(plan, { compatibleWriters: false }), /compatible-runtime-required/);
  await assert.rejects(applyPage(f.raw, plan), /approved-digest-required/);
  assert.equal((await f.reports.shout.get()).get('contentArchiveKey'), undefined);
});

test('report, archive and control drift invalidate their exact plan without partial bindings', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); const cs = await f.candidates();
  let plan = await f.plan(cs); await f.reports.comment.update({ reason: 'A later moderator correction' });
  await assert.rejects(f.apply(plan), /source-drift/);
  plan = await f.plan(cs); const archive = f.raw.doc(`contentLifecycleArchive/${cs[0].contentArchiveKey}`); await archive.update({ state: { status: 'deleted' } });
  await assert.rejects(f.apply(plan), /source-drift/);
  plan = await f.plan(cs); await f.control.update({ revision: 2 }); await assert.rejects(f.apply(plan), /control-drift/);
  for (const ref of Object.values(f.reports)) assert.equal((await ref.get()).get('contentArchiveKey'), undefined);
});

test('same-ID report recreation cannot reuse the approved plan or the stored legacy proof', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); const cs = await f.candidates(), plan = await f.plan(cs), original = await f.reports.shout.get();
  await f.reports.shout.delete(); await f.reports.shout.create(original.data()); await assert.rejects(f.apply(plan), /source-drift/);
  const fresh = await f.plan([cs[1]]); await f.apply(fresh); const bound = await f.reports.comment.get();
  await bound.ref.delete(); await bound.ref.create(bound.data());
  await assert.rejects(readEvidence(f.request('comment'), f.rt.database, f.clock), e => e.code === 'failed-precondition');
});

test('a migrated report and a newly bound atomic report share one real moderation decision', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); await f.apply(await f.plan([await f.candidate(f.reports.shout, 'shout')]));
  await f.control.update({ mode: 'active', revision: 2 });
  const db = createContentLifecycleDatabase(f.raw, { enabled: true, clock: f.clock }), reporterId = 'new_reporter';
  const ref = f.raw.doc(`reports/${reporterId}_${f.root.id}`); f.extra.push(ref);
  await db.runTransaction(async tx => {
    await tx.get(f.root); tx.create(ref, { reporterId, shoutId: f.root.id, reason: 'New atomic binding', status: 'open', createdAt: Timestamp.now() });
  });
  assert.equal((await ref.get()).get('legacyEvidenceBinding'), undefined);
  const req = f.request('shout'); req.data = { expectedUserId: f.moderatorId, targetType: 'shout', shoutId: f.root.id,
    reportIds: [f.reports.shout.id, ref.id].sort(), decision: 'approve', note: '', idempotencyKey: operationTestKey('legacy_mixed', f.clock()) };
  const receiptId = createHash('sha256').update(`${f.moderatorId}\ndecideContentReports\n${req.data.idempotencyKey}`).digest('hex');
  f.extra.push(f.raw.doc(`serverOperations/${receiptId}`), f.raw.doc(`moderationClearances/shout_${f.root.id}`));
  assert.deepEqual(await decideContentReportsOperation(req, db, f.clock), { decision: 'approve', count: 2 });
  assert.equal((await ref.get()).get('resolution'), 'contentApproved'); assert.equal((await f.reports.shout.get()).get('resolution'), 'contentApproved');
});

for (const kind of types) test(`real removal of a migrated ${kind} preserves the existing moderation contract`, { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); await f.apply(await f.plan([await f.candidate(f.reports[kind], kind)]));
  const rt = createFeedRuntime(f.raw, absent, { enabled: true, clock: f.clock, cardStateEnabled: true, contentLifecycleEnabled: true });
  const req = f.request(kind), key = operationTestKey(`legacy_remove_${kind}`, f.clock());
  req.data = kind === 'privateReply' ? { expectedUserId: f.moderatorId, reportId: f.reports[kind].id, idempotencyKey: key, note: '' } :
    { expectedUserId: f.moderatorId, targetType: kind, shoutId: f.root.id, ...(kind === 'comment' ? { targetId: f.sources[kind].id } : {}),
      reportIds: [f.reports[kind].id], decision: 'remove', note: '', idempotencyKey: key };
  const action = kind === 'privateReply' ? 'removeReportedPrivateReply' : 'removeReportedPublicContent';
  const receiptId = createHash('sha256').update(`${f.moderatorId}\n${action}\n${key}`).digest('hex'); f.extra.push(f.raw.doc(`serverOperations/${receiptId}`));
  const op = kind === 'privateReply' ? removeReportedPrivateReplyOperation : removeReportedPublicContentOperation;
  await op(req, rt.database, f.clock, { indexWriter: rt.indexWriter }); await op(req, rt.database, f.clock, { indexWriter: rt.indexWriter });
  assert.equal((await f.reports[kind].get()).get('resolution'), 'contentRemoved');
  if (kind === 'shout') assert.equal((await f.root.get()).get('status'), 'deleted');
  else assert(!(await f.sources[kind].get()).exists);
  if (kind === 'comment') assert.equal((await f.root.get()).get('commentsCount'), 0);
});

test('a sanction over migrated evidence records an archive reference without a fresh full text copy', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); await f.apply(await f.plan([await f.candidate(f.reports.comment, 'comment')]));
  const owner = f.raw.doc(`users/${f.authorId}`); f.extra.push(owner); await owner.create({ nickname: 'Synthetic target' });
  await f.sources.comment.delete();
  const db = createContentLifecycleDatabase(f.raw, { enabled: true, clock: f.clock }), req = f.request('comment');
  const key = operationTestKey('legacy_warning', f.clock());
  req.data = { expectedUserId: f.moderatorId, expectedTargetUserId: f.authorId, mode: 'report', sourceReportId: f.reports.comment.id,
    targetType: 'comment', shoutId: f.root.id, targetId: f.sources.comment.id, reportIds: [f.reports.comment.id], decision: 'warning', note: 'Synthetic reason', idempotencyKey: key };
  const receiptId = createHash('sha256').update(`${f.moderatorId}\nsanctionContent\n${key}`).digest('hex');
  for (const name of ['serverOperations', 'sanctions', 'warnings']) f.extra.push(f.raw.doc(`${name}/${receiptId}`));
  await sanctionContentOperation(req, db, f.clock);
  const sanction = (await f.raw.doc(`sanctions/${receiptId}`).get()).data();
  assert.equal(sanction.contentArchiveKey, (await f.reports.comment.get()).get('contentArchiveKey'));
  assert.equal(sanction.contentSnapshot.text, undefined); assert(!JSON.stringify(sanction).includes('Existing original comment'));
});

test('concurrent workers and a genuinely lost response bind each report once without recapturing bodies', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); const cs = await f.candidates(), plan = await f.plan([cs[0]]);
  const results = await Promise.all([f.apply(plan), f.apply(plan)]); assert.deepEqual(results.map(r => r.writes).sort(), [0, 1]);
  const second = await f.plan([cs[1]]), lossy = new Proxy(f.rt.database, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => { await target.runTransaction(...args); throw new Error('lost-after-commit'); };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await assert.rejects(applyPage(lossy, second, { approvedDigest: second.digest, compatibleWriters: true, clock: f.clock }), /lost-after-commit/);
  const committed = await f.reports.comment.get(); assert.equal((await f.apply(second)).writes, 0);
  assert((await committed.ref.get()).updateTime.isEqual(committed.updateTime));
});

test('pending/deleted accounts and a crossed deadline never gain new report bindings', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); const cs = await f.candidates(), plan = await f.plan(cs);
  const request = f.raw.doc(`accountDeletionRequests/${f.reporterId}`); f.extra.push(request);
  await request.create({ userId: f.reporterId, status: 'pending' }); await assert.rejects(f.apply(plan), /source-drift/);
  assert((await f.plan(cs)).entries.every(e => e.reason === 'evidence-retention-unavailable'));
  await request.delete(); const marker = f.raw.doc(`publicProfiles/${f.authorId}`); f.extra.push(marker);
  await marker.create({ accountStatus: 'deleted' }); assert((await f.plan(cs)).entries.every(e => e.reason === 'evidence-retention-unavailable'));
  await marker.delete(); const fresh = await f.plan(cs), deadline = new Date((await f.root.get()).get('expiresAt').toMillis() + 67 * lifecycleDay);
  let calls = 0; await assert.rejects(f.apply(fresh, { clock: () => ++calls === 1 ? f.clock() : deadline }), /source-drift/);
  assert.equal((await f.reports.shout.get()).get('contentArchiveKey'), undefined);
});

test('a bounded page of fifty reports performs fifty metadata writes and zero body copies', { skip: !enabled }, async t => {
  const f = await fixture(t), reports = [];
  for (let n = 0; n < 50; n++) reports.push(await f.report('shout', `batch_${n}`));
  await f.adopt(); const cs = await Promise.all(reports.map(ref => f.candidate(ref, 'shout'))), before = await f.raw.doc(`contentLifecycleArchive/${cs[0].contentArchiveKey}`).get();
  const result = await f.apply(await f.plan(cs)); assert.equal(result.reports, 50); assert.equal(result.writes, 50); assert.equal(result.bodyCopies, 0);
  assert((await before.ref.get()).updateTime.isEqual(before.updateTime));
  process.stdout.write('LIFECYCLE_REPORT_ADOPTION_TRACE ' + JSON.stringify({ reportPage: 50, writes: result.writes, bodyCopies: result.bodyCopies, liveWrites: 0 }) + '\n');
});

test('purging the reported parent retains a child only with anonymous context and admin scope', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.adopt(); await f.apply(await f.plan([await f.candidate(f.reports.comment, 'comment')]));
  const report = await f.reports.comment.get(); await report.ref.update(purgeScrubPatch(report.data(), 'lifecycleContext'));
  await f.raw.doc(`contentLifecycleArchive/${report.get('shoutArchiveKey')}`).delete();
  await assert.rejects(readEvidence(f.request('comment'), f.rt.database, f.clock), e => e.code === 'permission-denied');
  await f.role.update({ level: 5 }); const view = await readEvidence(f.request('comment'), f.rt.database, f.clock);
  assert.equal(view.targetData.text, 'Existing original comment'); assert.equal(view.parentData, undefined);
});
