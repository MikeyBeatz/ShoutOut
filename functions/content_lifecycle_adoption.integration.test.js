import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { createFeedRuntime } from './feed_runtime.js';
import { lifecycleDay, lifecycleArchiveKey, validateLifecycleArchive, validateLifecycleThread } from './content_lifecycle.js';
import { planLifecycleSourceAdoption as planPage, applyLifecycleSourceAdoption as applyPage, validateLifecycleAdoptionPlan } from './content_lifecycle_adoption.js';
import { encodeGeohash } from './geohash.js';
import { bodyProjection } from './feed_body_contract.js';
import { canonical } from './feed_block_index.js';
import { createHash } from 'node:crypto';
import { getLifecycleReportEvidenceOperation } from './content_lifecycle_evidence.js';
import { accountPurgeJobRef, initialAccountPurgeJob } from './account_purge_guard.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const absent = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
async function fixture(t, count = 1, { mixed = false } = {}) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), nonce = randomUUID().replaceAll('-', '');
  let now = new Date(Date.now() + 1000); const clock = () => now;
  const feed = raw.doc('feedIndexControl/current'), control = raw.doc('contentLifecycleControl/current');
  const gens = [0, 1].map(n => raw.doc(`feedIndexGenerations/adopt-${nonce.slice(0, 20)}-${n}`));
  const roots = [], extra = [], authorId = `author_${nonce}`;
  t.after(async () => {
    for (const root of roots) { await raw.recursiveDelete(root); await raw.doc(`contentLifecycleThreads/${root.id}`).delete(); }
    for (let start = 0; start < roots.length; start += 25) {
      const ids = roots.slice(start, start + 25).map(ref => ref.id);
      for (const name of ['contentLifecycleArchive', 'contentLifecycleJobs']) {
        for (const doc of (await raw.collection(name).where('threadId', 'in', ids).get()).docs) await raw.recursiveDelete(doc.ref);
      }
    }
    for (const ref of [feed, control, ...gens, ...extra]) await raw.recursiveDelete(ref);
    for (const doc of (await raw.collection('adoptionBudgetProbe').get()).docs) await doc.ref.delete();
    await raw.terminate();
  });
  assert(!(await feed.get()).exists); assert(!(await control.get()).exists);
  const batch = raw.batch(); batch.create(control, { schemaVersion: 1, mode: 'paused', revision: 1 });
  for (const [n, gen] of gens.entries()) batch.create(gen, { schemaVersion: 1, v: mixed && n === 0 ? 1 : 2, readIdentity: 1,
    ...(mixed && n === 0 ? {} : { cardProjection: 1, cardReady: true }), accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
  batch.create(feed, { schemaVersion: 2, revision: 1, mode: 'building', readGenerationId: gens[0].id,
    writeGenerationIds: gens.map(g => g.id), cardWriteGenerationIds: (mixed ? gens.slice(1) : gens).map(g => g.id), cardReadGenerationId: mixed ? null : gens[0].id });
  await batch.commit();
  const runtime = options => createFeedRuntime(raw, absent, { enabled: true, clock, cardStateEnabled: true,
    newsRuntimeEnabled: false, contentLifecycleEnabled: false, ...options });
  const rt = runtime();
  for (let n = 0; n < count; n++) {
    const ref = raw.doc(`shouts/adopt_${nonce}_${n}`); roots.push(ref);
    const source = { id: ref.id, authorId, authorNickname: 'Synthetic', title: `Adopt ${n}`, text: 'Existing source body',
      createdAt: Timestamp.fromMillis(now.getTime() - 3600000), expiresAt: Timestamp.fromMillis(now.getTime() + lifecycleDay),
      geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' },
      location: new GeoPoint(50.53, 14.13), geohash: encodeGeohash(50.53, 14.13), categories: ['Dotaz'], status: 'active',
      likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: 0 };
    await rt.database.runTransaction(async tx => {
      const p = await rt.indexWriter.prepare(tx, ref.id, null, source); p.apply(); tx.create(ref, source);
    });
  }
  const plan = paths => planPage(rt.database, paths, { clock });
  const apply = (value, options = {}) => applyPage(rt.database, value, { approvedDigest: value.digest, compatibleWriters: true, indexWriter: rt.indexWriter, clock, ...options });
  const child = async (kind, id, root = roots[0]) => {
    const ref = root.collection(kind === 'comment' ? 'comments' : 'privateReplies').doc(id);
    await rt.database.runTransaction(async tx => {
      const before = (await tx.get(root)).data(), data = { authorId, authorNickname: 'Synthetic', text: 'Existing child', createdAt: before.createdAt };
      if (kind === 'privateReply') Object.assign(data, { recipientId: `peer_${nonce}`, participants: [authorId, `peer_${nonce}`] });
      const p = kind === 'comment' ? await rt.indexWriter.prepare(tx, root.id, before, { ...before, commentsCount: before.commentsCount + 1 }) : null;
      p?.apply(); tx.create(ref, data); if (kind === 'comment') tx.update(root, { commentsCount: before.commentsCount + 1 });
    });
    return ref;
  };
  const snapshot = async () => JSON.stringify(await Promise.all(gens.map(async gen => {
    const result = {};
    for (const name of ['nodes', 'cells', 'retiredRoots', 'publicStates']) result[name] = (await gen.collection(name).get()).docs.map(doc => [doc.id, doc.data(), doc.updateTime]);
    return result;
  })));
  return { raw, rt, runtime, clock, plan, apply, child, snapshot, roots, extra, gens, feed, control, authorId,
    setNow(value) { now = value; } };
}

test('one plan adopts root/comment/private bodies atomically with explicit later provenance and leaves B4 unchanged', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.roots[0], comment = await f.child('comment', 'public'), reply = await f.child('privateReply', 'private');
  const before = (await root.get()).data(), index = await f.snapshot();
  const report = f.raw.doc(`reports/reporter_${root.id}`); f.extra.push(report);
  await report.create({ reporterId: 'reporter', shoutId: root.id, reason: 'Legacy report', status: 'open', createdAt: Timestamp.now() });
  const oldReport = await report.get();
  const plan = await f.plan([reply.path, comment.path, root.path]);
  validateLifecycleAdoptionPlan(plan, f.raw.projectId);
  assert(plan.entries.every(e => e.action === 'adopt'));
  assert.equal((await f.raw.collection('contentLifecycleArchive').where('threadId', '==', root.id).get()).size, 0);
  assert(!JSON.stringify(plan).includes('Existing source body')); assert(!JSON.stringify(plan).includes('Existing child'));
  assert.equal((await f.apply(plan)).sources, 3);
  const after = (await root.get()).data();
  assert.equal(bodyProjection(after).version, bodyProjection(before).version); assert.equal(await f.snapshot(), index);
  assert(after.createdAt.isEqual(before.createdAt)); assert(after.expiresAt.isEqual(before.expiresAt));
  assert.equal(after.historyUntil.toMillis(), before.expiresAt.toMillis() + 7 * lifecycleDay);
  const header = await f.raw.doc(`contentLifecycleThreads/${root.id}`).get(); validateLifecycleThread(header.data());
  for (const ref of [root, comment, reply]) {
    const source = await ref.get(), archive = await f.raw.doc(`contentLifecycleArchive/${source.get('contentArchiveKey')}`).get();
    validateLifecycleArchive(f.raw, archive.id, archive.data());
    assert.equal(archive.get('captureMode'), 'transition'); assert.equal(archive.get('migrationDigest'), plan.digest);
    assert(archive.get('sourceCreateTime').isEqual(source.createTime));
    assert(archive.get('sourceUpdateTime').toMillis() <= archive.get('archivedAt').toMillis());
  }
  assert((await report.get()).updateTime.isEqual(oldReport.updateTime));
  const archivedBefore = await f.raw.doc(`contentLifecycleArchive/${after.contentArchiveKey}`).get();
  assert.deepEqual(await f.apply(plan), { state: 'already-applied', sources: 0, archives: 0, threads: 0, writes: 0 });
  assert((await archivedBefore.ref.get()).updateTime.isEqual(archivedBefore.updateTime));
});

test('a child requires its original parent adoption and a missing or recreated parent is never synthesized', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.child('comment', 'child');
  assert.equal((await f.plan([child.path])).entries[0].reason, 'parent-adoption-required');
  const rootPlan = await f.plan([f.roots[0].path]); await f.apply(rootPlan);
  const childPlan = await f.plan([child.path]); assert.equal(childPlan.entries[0].action, 'adopt'); await f.apply(childPlan);
  const orphan = f.roots[0].collection('comments').doc('orphan'); await orphan.set({ authorId: f.authorId, text: 'Old', createdAt: Timestamp.fromMillis(1) });
  assert.equal((await f.plan([orphan.path])).entries[0].reason, 'invalid-child');
  await f.roots[0].delete(); assert.equal((await f.plan([child.path])).entries[0].reason, 'parent-unavailable');
});

test('uncertain manual deletion blocks the whole page and never replaces the unknown end with expiry', { skip: !enabled }, async t => {
  const f = await fixture(t, 2); await f.roots[1].update({ status: 'deleted' });
  const plan = await f.plan(f.roots.map(r => r.path)); assert.equal(plan.entries.find(e => e.path === f.roots[1].path).reason, 'deleted-end-unproven');
  await assert.rejects(f.apply(plan), /plan-blocked/);
  for (const root of f.roots) assert.equal((await root.get()).get('contentArchiveKey'), undefined);
  assert.equal((await f.raw.collection('contentLifecycleArchive').get()).size, 0);
});

test('an old orphan cannot be attached to a replacement parent with identical declared birth and body', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.roots[0], child = await f.child('comment', 'same-born-orphan'), body = (await root.get()).data();
  await root.delete(); await root.create(body);
  const plan = await f.plan([root.path, child.path]);
  assert.equal(plan.entries.find(e => e.path === child.path).reason, 'parent-incarnation-changed');
  await assert.rejects(f.apply(plan), /plan-blocked/);
  assert.equal((await root.get()).get('contentArchiveKey'), undefined); assert.equal((await child.get()).get('contentArchiveKey'), undefined);
});

test('changes in source, controls, generation incarnation or approved digest abort before source writes', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.roots[0], plan = await f.plan([root.path]);
  assert.throws(() => validateLifecycleAdoptionPlan({ ...plan, projectId: 'other' }, f.raw.projectId), /invalid-lifecycle-adoption-plan/);
  await assert.rejects(f.apply(plan, { approvedDigest: 'f'.repeat(64) }), /invalid-lifecycle-adoption-plan/);
  for (const mutate of [p => { p.entries[0].unknown = true; }, p => { p.binding.generations = [null]; }, p => { p.entries[0].source.createTime = [1, 1e9]; }]) {
    const malformed = JSON.parse(JSON.stringify(plan)); mutate(malformed);
    const { digest: _old, ...value } = malformed; void _old;
    malformed.digest = createHash('sha256').update(canonical(value)).digest('hex');
    assert.throws(() => validateLifecycleAdoptionPlan(malformed, f.raw.projectId), /invalid-lifecycle-adoption-plan/);
  }
  await root.update({ likesCount: 1 }); await assert.rejects(f.apply(plan), /source-drift/);
  const fresh = await f.plan([root.path]); await f.control.update({ revision: 2 }); await assert.rejects(f.apply(fresh), /control-drift/);
  const another = await f.plan([root.path]), marker = (await f.gens[1].get()).data();
  await f.gens[1].delete(); await f.gens[1].create(marker); await assert.rejects(f.apply(another), /control-drift/);
  assert.equal((await root.get()).get('contentArchiveKey'), undefined);
});

test('replacement with identical body/timestamps does not satisfy the old SDK incarnation plan', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.roots[0], before = (await root.get()).data(), plan = await f.plan([root.path]);
  await root.delete(); await root.create(before);
  await assert.rejects(f.apply(plan), /source-drift/); assert.equal((await root.get()).get('contentArchiveKey'), undefined);
});

test('account deletion and closed ingress cannot be bypassed by creating later archive copies', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.roots[0], plan = await f.plan([root.path]);
  const request = f.raw.doc(`accountDeletionRequests/${f.authorId}`), profile = f.raw.doc(`publicProfiles/${f.authorId}`); f.extra.push(request, profile);
  await request.create({ userId: f.authorId, status: 'pending' });
  await assert.rejects(f.apply(plan), /source-drift/);
  assert.equal((await f.plan([root.path])).entries[0].reason, 'account-deletion-in-progress');
  await request.delete(); await profile.create({ accountStatus: 'deleted' });
  assert.equal((await f.plan([root.path])).entries[0].reason, 'account-deletion-in-progress');
  assert.equal((await f.raw.collection('contentLifecycleArchive').get()).size, 0);
});

test('expired retention binds only the old deadlines, copies no body and is consumed by the existing purge', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.roots[0];
  const original = (await root.get()).data();
  f.setNow(new Date(original.expiresAt.toMillis() + 67 * lifecycleDay));
  const plan = await f.plan([root.path]); assert.equal(plan.entries[0].action, 'bind-expired');
  const result = await f.apply(plan); assert.equal(result.archives, 0);
  assert.equal((await root.get()).get('publicUntil').toMillis(), original.expiresAt.toMillis());
  assert.deepEqual((await f.apply(plan)).state, 'already-applied');
  const rt = f.runtime({ contentLifecycleEnabled: true, contentMaintenanceEnabled: true });
  const done = await rt.contentMaintenance({ maxWork: 25 }); assert.equal(done.lifecycleFailed, 0); assert(!(await root.get()).exists);
  assert.equal((await f.raw.collection('contentLifecycleArchive').get()).size, 0);
});

async function expiredPendingComment(t) {
  const f = await fixture(t), root = f.roots[0], uid = `pending_${root.id}`;
  const profile = f.raw.doc(`publicProfiles/${uid}`), request = f.raw.doc(`accountDeletionRequests/${uid}`);
  f.extra.push(profile, request); await profile.create({ accountStatus: 'pending' });
  const comment = await f.child('comment', 'expired-pending'); await comment.update({ authorId: uid });
  await request.create({ userId: uid, status: 'pending' });
  const originalRequest = await request.get(), job = accountPurgeJobRef(f.raw, {
    projectId: f.raw.projectId, userId: uid, requestCreateTime: originalRequest.createTime,
  }); f.extra.push(job);
  const source = await root.get(); f.setNow(new Date(source.get('expiresAt').toMillis() + 67 * lifecycleDay));
  await f.apply(await f.plan([root.path]));
  return { ...f, root, uid, profile, request, originalRequest, job, comment };
}

test('pending legacy author permits only expired comment metadata; retry and ordinary purge preserve request incarnation', { skip: !enabled }, async t => {
  const f = await expiredPendingComment(t), source = await f.comment.get(), plan = await f.plan([f.comment.path]);
  assert.equal(plan.entries[0].action, 'bind-expired'); assert.equal(plan.entries[0].deletionFences.length, 1);
  assert.equal((await f.apply(plan)).archives, 0); assert.equal((await f.apply(plan)).state, 'already-applied');
  assert.equal((await f.raw.collection('contentLifecycleArchive').get()).size, 0);
  assert.equal((await f.comment.get()).get('text'), source.get('text'));
  const rt = f.runtime({ contentLifecycleEnabled: true, contentMaintenanceEnabled: true });
  const done = await rt.contentMaintenance({ maxWork: 25 }); assert.equal(done.lifecycleFailed, 0);
  assert(!(await f.comment.get()).exists); assert(!(await f.job.get()).exists);
  const request = await f.request.get(); assert(request.createTime.isEqual(f.originalRequest.createTime));
  assert(request.updateTime.isEqual(f.originalRequest.updateTime)); assert.deepEqual(request.data(), f.originalRequest.data());
});

test('expired pending comment rejects recreated request/profile and a changed account purge fence without partial binding', { skip: !enabled }, async t => {
  const f = await expiredPendingComment(t), plan = await f.plan([f.comment.path]);
  await f.request.delete(); await f.request.create(f.originalRequest.data());
  await assert.rejects(f.apply(plan), /source-drift/);
  const fresh = await f.plan([f.comment.path]); assert.equal(fresh.entries[0].action, 'bind-expired');
  const request = await f.request.get();
  const job = accountPurgeJobRef(f.raw, { projectId: f.raw.projectId, userId: f.uid, requestCreateTime: request.createTime }); f.extra.push(job);
  await job.create(initialAccountPurgeJob({ projectId: f.raw.projectId, userId: f.uid, requestCreateTime: request.createTime }, Timestamp.now()));
  await assert.rejects(f.apply(fresh), /source-drift/);
  assert.equal((await f.plan([f.comment.path])).entries[0].action, 'bind-expired');
  await job.update({ ingressClosedAt: Timestamp.now() });
  assert.equal((await f.plan([f.comment.path])).entries[0].reason, 'account-deletion-in-progress');
  await job.delete(); await f.profile.delete(); await f.profile.create({ accountStatus: 'pending' });
  assert.equal((await f.plan([f.comment.path])).entries[0].reason, 'account-deletion-in-progress');
  assert.equal((await f.comment.get()).get('contentArchiveKey'), undefined);
});

test('pending exception rejects deleted/missing profile, malformed purge identity, private replies and unexpired bodies', { skip: !enabled }, async t => {
  const f = await expiredPendingComment(t);
  await f.profile.update({ accountStatus: 'deleted' });
  assert.equal((await f.plan([f.comment.path])).entries[0].reason, 'account-deletion-in-progress');
  await f.profile.update({ accountStatus: 'pending' });
  await f.job.create({ schemaVersion: 1, userId: f.uid, requestCreateTime: Timestamp.fromMillis(1), phase: 'scheduled', stage: 0, ingressClosedAt: null });
  assert.equal((await f.plan([f.comment.path])).entries[0].reason, 'account-deletion-in-progress');
  await f.job.delete(); await f.profile.delete();
  assert.equal((await f.plan([f.comment.path])).entries[0].reason, 'account-deletion-in-progress');
  const reply = await f.child('privateReply', 'pending-private');
  await reply.update({ authorId: f.uid, participants: [f.uid, (await reply.get()).get('recipientId')] });
  assert.equal((await f.plan([reply.path])).entries[0].reason, 'account-deletion-in-progress');
});

test('crossing the fixed deadline between plan and commit requests a new plan instead of creating expired copies', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.roots[0], plan = await f.plan([root.path]), before = (await root.get()).data();
  f.setNow(new Date(before.expiresAt.toMillis() + 67 * lifecycleDay));
  await assert.rejects(f.apply(plan), /source-drift/);
  assert.equal((await root.get()).get('contentArchiveKey'), undefined);
});

test('the final clock check catches expiration during shared index planning before any copy is written', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.roots[0], body = (await root.get()).data(), plan = await f.plan([root.path]);
  const deadline = new Date(body.expiresAt.toMillis() + 67 * lifecycleDay); let calls = 0;
  await assert.rejects(f.apply(plan, { clock: () => ++calls === 1 ? f.clock() : deadline }), /source-drift/);
  assert(calls >= 2); assert.equal((await root.get()).get('contentArchiveKey'), undefined);
  assert.equal((await f.raw.collection('contentLifecycleArchive').get()).size, 0);
});

test('concurrent commits and lost acknowledgement replay the same adoption without rewriting the immutable body', { skip: !enabled }, async t => {
  const f = await fixture(t, 2), root = f.roots[0], plan = await f.plan([root.path]);
  const results = await Promise.all([f.apply(plan), f.apply(plan)]);
  assert.deepEqual(results.map(r => r.state).sort(), ['already-applied', 'applied']);
  const key = (await root.get()).get('contentArchiveKey'), captured = await f.raw.doc(`contentLifecycleArchive/${key}`).get();
  await f.apply(plan); assert((await captured.ref.get()).updateTime.isEqual(captured.updateTime));
  const fresh = await f.plan([f.roots[1].path]); assert.equal(fresh.entries[0].action, 'adopt');
  const lossy = new Proxy(f.rt.database, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => { await target.runTransaction(...args); throw Object.assign(new Error('lost'), { code: 14 }); };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await assert.rejects(applyPage(lossy, fresh, { approvedDigest: fresh.digest, compatibleWriters: true, indexWriter: f.rt.indexWriter, clock: f.clock }), /lost/);
  assert((await f.roots[1].get()).get('contentArchiveKey'));
  assert.equal((await f.apply(fresh)).writes, 0);
});

test('a page of fifty roots stays within the common budget; oversized extra writes roll everything back', { skip: !enabled }, async t => {
  const f = await fixture(t, 50), plan = await f.plan(f.roots.map(r => r.path));
  assert.equal(plan.entries.length, 50); const index = await f.snapshot();
  const oversized = { async prepareBatch(tx, changes, options) {
    const p = await f.rt.indexWriter.prepareBatch(tx, changes, options);
    return { apply() { p.apply(); for (let n = 0; n < 450; n++) tx.create(f.raw.doc(`adoptionBudgetProbe/p${n}`), { synthetic: true }); } };
  } };
  await assert.rejects(f.apply(plan, { indexWriter: oversized }), /write-budget-exceeded/);
  assert.equal((await f.raw.collection('adoptionBudgetProbe').get()).size, 0); assert.equal(await f.snapshot(), index);
  assert((await Promise.all(f.roots.map(r => r.get()))).every(doc => doc.get('contentArchiveKey') === undefined));
  const result = await f.apply(plan); assert.equal(result.sources, 50); assert.equal(result.writes, 150); assert.equal(await f.snapshot(), index);
  process.stdout.write('LIFECYCLE_ADOPTION_TRACE ' + JSON.stringify({ sourcePage: 50, sourceUpdates: result.sources, archiveWrites: result.archives,
    threadWrites: result.threads, declaredWrites: result.writes, generations: 2, publicProjectionRewrites: 0, liveWrites: 0 }) + '\n');
});

test('normal lifecycle writes continue after adoption and do not recapture the old transition body', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.roots[0]; await f.apply(await f.plan([root.path]));
  const source = await root.get(), key = lifecycleArchiveKey(f.raw.projectId, root.path, source.data()), archive = await f.raw.doc(`contentLifecycleArchive/${key}`).get();
  await f.control.update({ mode: 'active', revision: 2 });
  const rt = f.runtime({ contentLifecycleEnabled: true });
  const comment = root.collection('comments').doc('new-after-transition');
  await rt.database.runTransaction(async tx => {
    const before = (await tx.get(root)).data(), p = await rt.indexWriter.prepare(tx, root.id, before, { ...before, commentsCount: 1 });
    p.apply(); tx.create(comment, { authorId: f.authorId, text: 'New atomic child', createdAt: Timestamp.fromDate(f.clock()) }); tx.update(root, { commentsCount: 1 });
  });
  assert((await archive.ref.get()).updateTime.isEqual(archive.updateTime));
  const child = await comment.get(), captured = await f.raw.doc(`contentLifecycleArchive/${child.get('contentArchiveKey')}`).get();
  assert.equal(captured.get('captureMode'), 'atomic-write'); validateLifecycleArchive(f.raw, captured.id, captured.data());
  const reporterId = 'new_reporter', report = f.raw.doc(`reports/${reporterId}_${root.id}`);
  const modUid = `mod_${randomUUID()}`, user = f.raw.doc(`users/${modUid}`), role = f.raw.doc(`accountRoles/${modUid}`);
  f.extra.push(report, user, role);
  await user.set({ nickname: 'Synthetic moderator' }); await user.collection('legal').doc('acceptance_2026_07_25').set({}); await role.set({ level: 5 });
  await rt.database.runTransaction(async tx => {
    await tx.get(root); tx.create(report, { reporterId, shoutId: root.id, reason: 'New report after adoption', status: 'open', createdAt: Timestamp.now() });
  });
  const view = await getLifecycleReportEvidenceOperation({ auth: { uid: modUid, token: { email: 'synthetic@example.test', email_verified: true } },
    app: { appId: 'synthetic' }, data: { targetType: 'shout', reportId: report.id, expectedUserId: modUid } }, rt.database, f.clock);
  assert.equal(view.captureMode, 'transition'); assert(Number.isSafeInteger(view.capturedAtMillis));
  assert.equal(view.targetData.text, source.get('text')); assert.equal(view.sourceUpdateTime, undefined);
});

test('adoption preserves a mixed v1/v2 transition and does not change either reader format', { skip: !enabled }, async t => {
  const f = await fixture(t, 1, { mixed: true }), before = await f.snapshot(), plan = await f.plan([f.roots[0].path]);
  assert.equal((await f.apply(plan)).sources, 1); assert.equal(await f.snapshot(), before);
  assert.equal((await f.gens[0].get()).get('v'), 1); assert.equal((await f.gens[1].get()).get('v'), 2);
});
