import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Firestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { createContentLifecycleDatabase, lifecycleDay } from './content_lifecycle.js';
import { archiveAccountContentPage, drainArchivedCommentReactionsPage, accountContentArchiveId, accountArchiveEffectiveDeadline } from './account_content_archive.js';
import { accountDeletionJobRef, runAccountShoutHidingJob } from './account_deletion_job.js';
import { accountPurgeJobRef, initialAccountPurgeJob } from './account_purge_guard.js';
import { validatePurgeSelection } from './account_purge_policy.js';
import { expireLifecycleAccountCopy } from './content_lifecycle_purge.js';
import { getArchivedCommentReportTargetOperation } from './archived_comment_report.js';
import { planLifecycleAccountAdoption as planPage, applyLifecycleAccountAdoption as applyPage, validateLifecycleAccountAdoptionPlan } from './content_lifecycle_account_adoption.js';
import { canonical } from './feed_block_index.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const absent = { async getUser() { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); } };
const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
async function fixture(t, { ordinaryDays = 68 } = {}) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), nonce = randomUUID().replaceAll('-', ''), owner = `owner_${nonce}`, peer = `peer_${nonce}`;
  let now = new Date(Date.now() + 5000); const clock = () => now;
  const publicEnd = new Date(now.getTime() + (ordinaryDays - 67) * lifecycleDay), born = new Date(publicEnd.getTime() - lifecycleDay);
  const root = raw.doc(`shouts/account_adopt_${nonce}`), control = raw.doc('contentLifecycleControl/current'), extra = [];
  await control.create({ schemaVersion: 1, mode: 'active', revision: 1 });
  const live = createContentLifecycleDatabase(raw, { enabled: true, clock });
  now = new Date(born.getTime() + 1000);
  const body = { authorId: `parent_${nonce}`, authorNickname: 'Synthetic parent', title: 'Original parent', text: 'Original parent body', status: 'active',
    createdAt: Timestamp.fromDate(born), expiresAt: Timestamp.fromDate(publicEnd), commentsCount: 0, likesCount: 0, dislikesCount: 0, savesCount: 0,
    geography: { schemaVersion: 1, countryCode: 'CZ' }, location: new GeoPoint(50.53, 14.13) };
  await live.runTransaction(tx => tx.create(root, body)); now = new Date(Date.now() + 5000);
  await control.update({ mode: 'paused', revision: 2 });
  const request = raw.doc(`accountDeletionRequests/${owner}`); await request.create({ userId: owner, status: 'pending' });
  const requestTime = (await request.get()).createTime;
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(requestTime.toMillis() + 1) });
  const account = { projectId: raw.projectId, userId: owner, requestCreateTime: requestTime };
  const primary = accountDeletionJobRef(raw, account), purge = accountPurgeJobRef(raw, account), marker = raw.doc(`publicProfiles/${owner}`);
  await marker.create({ schemaVersion: 1, accountStatus: 'deleted' });
  t.after(async () => {
    for (const d of (await raw.collection('accountContentArchive').where('sourceShoutId', '==', root.id).get()).docs) await raw.recursiveDelete(d.ref);
    for (const d of (await raw.collection('contentLifecycleArchive').where('threadId', '==', root.id).get()).docs) await raw.recursiveDelete(d.ref);
    for (const d of (await raw.collection('contentLifecycleJobs').where('threadId', '==', root.id).get()).docs) await raw.recursiveDelete(d.ref);
    for (const ref of [root, control, request, primary, purge, marker, raw.doc(`contentLifecycleThreads/${root.id}`), raw.doc(`users/${owner}`), ...extra]) await raw.recursiveDelete(ref);
    await raw.terminate();
  });
  const guard = async (tx, progress) => {
    const job = await tx.get(primary);
    return () => tx.update(primary, progress.kind === 'archive-root'
      ? { roots: (job.get('roots') ?? 0) + 1, ...(progress.pendingArchiveId ? { pendingArchiveId: progress.pendingArchiveId, workStage: 'reactions' } : {}) }
      : progress.kind === 'reactions-complete' ? { pendingArchiveId: null, workStage: 'comments' } : { reactions: (job.get('reactions') ?? 0) + (progress.copied ?? 0) });
  };
  async function source(kind, id = randomUUID(), { recipientOwner = false, reactions = 0, report = false } = {}) {
    const ref = root.collection(kind === 'comment' ? 'comments' : 'privateReplies').doc(id);
    const authorId = recipientOwner ? peer : owner, recipientId = recipientOwner ? owner : peer;
    await ref.create({ authorId, authorNickname: 'Synthetic original', text: `Existing account body ${id}`, createdAt: Timestamp.fromMillis(born.getTime() + 2000),
      ...(kind === 'privateReply' ? { recipientId, participants: [authorId, recipientId] } : {}) });
    if (kind === 'comment') await root.update({ commentsCount: (await root.get()).get('commentsCount') + 1 });
    for (let n = 0; n < reactions; n++) await ref.collection('reactions').doc(`actor_${n}`).create({ userId: `actor_${n}`, value: 'like' });
    let reportRef;
    if (report) {
      reportRef = raw.doc(`commentReports/reporter_${root.id}_${id}`); extra.push(reportRef);
      await reportRef.create({ reporterId: 'reporter', shoutId: root.id, commentId: id, reason: 'Existing report', status: 'open', createdAt: Timestamp.now() });
    }
    return { ref, reportRef };
  }
  async function archive(kind, child) {
    if (!(await primary.get()).exists) await primary.create({ schemaVersion: 3, userId: owner, requestCreateTime: requestTime,
      retainUntil: Timestamp.fromMillis(requestTime.toMillis() + 60 * lifecycleDay), phase: 'archiving-content', workStage: kind === 'comment' ? 'comments' : 'messages', pendingArchiveId: null, roots: 0 });
    else await primary.update({ workStage: kind === 'comment' ? 'comments' : 'messages', pendingArchiveId: null });
    const previous = await child.ref.get(), id = accountContentArchiveId(raw.projectId, child.ref.path, previous.createTime);
    await archiveAccountContentPage(account, raw, absent, { kind, clock, transactionGuard: guard });
    return raw.doc(`accountContentArchive/${id}`);
  }
  const plan = ids => planPage(raw, ids, { clock });
  const apply = (plan, options = {}) => applyPage(raw, plan, { approvedDigest: plan.digest, compatibleWriters: true, clock, ...options });
  const deadline = ref => raw.runTransaction(async tx => { const copy = await tx.get(ref); return accountArchiveEffectiveDeadline(tx, raw, copy.data(), copy); }, { readOnly: true });
  return { raw, live, root, control, body, owner, peer, request, primary, purge, account, marker, extra, clock, source, archive, guard, plan, apply, deadline,
    setNow(date) { now = date; } };
}

test('old public/private account copies gain only deadline metadata and preserve source times, bodies and journals', { skip: !enabled }, async t => {
  const f = await fixture(t), privateSource = await f.source('privateReply'), a = await f.archive('privateReply', privateSource),
    commentSource = await f.source('comment'), b = await f.archive('comment', commentSource);
  const before = await Promise.all([a.get(), b.get()]), job = await f.primary.get(), parent = await f.root.get();
  const plan = await f.plan([b.id, a.id]); validateLifecycleAccountAdoptionPlan(plan, f.raw.projectId);
  assert(plan.entries.every(e => e.action === 'bind')); assert(!JSON.stringify(plan).includes('Existing account body'));
  assert.deepEqual(await f.apply(plan), { state: 'applied', copies: 2, writes: 2, bodiesCopied: 0, bodiesRedacted: 0 });
  assert.equal((await f.apply(plan)).writes, 0);
  for (const original of before) {
    const copy = await original.ref.get();
    for (const key of ['content', 'sourceCreateTime', 'sourceUpdateTime', 'requestCreateTime', 'archivedAt', 'subjectUserIds', 'reactionsComplete']) assert.deepEqual(copy.get(key), original.get(key));
    assert.equal(copy.get('contentArchiveKey'), undefined); assert.equal(copy.get('contentExpired'), false);
    assert.equal(copy.get('lifecycleAccountBinding.migrationDigest'), plan.digest);
    assert(copy.get('retainUntil').isEqual(original.get('retainUntil'))); await f.deadline(copy.ref);
  }
  assert((await f.primary.get()).updateTime.isEqual(job.updateTime)); assert((await f.root.get()).updateTime.isEqual(parent.updateTime));
  assert.equal((await f.raw.collection('contentLifecycleArchive').where('threadId', '==', f.root.id).get()).size, 1);
  assert((await f.plan([a.id, b.id])).entries.every(e => e.action === 'covered'));
});

test('ordinary retention can only shorten the original account deadline, never restart it', { skip: !enabled }, async t => {
  const f = await fixture(t, { ordinaryDays: 20 }), source = await f.source('privateReply', 'short'), ref = await f.archive('privateReply', source);
  const original = await ref.get(), header = await f.raw.doc(`contentLifecycleThreads/${f.root.id}`).get();
  await f.apply(await f.plan([ref.id])); const after = await ref.get();
  assert(after.get('ordinaryRetainUntil').isEqual(header.get('retainUntil'))); assert(after.get('retainUntil').isEqual(header.get('retainUntil')));
  assert(after.get('requestCreateTime').isEqual(original.get('requestCreateTime')));
  assert.equal((await f.deadline(ref)).toMillis(), header.get('retainUntil').toMillis());
});

test('an already-ended ordinary body is erased during adoption while its pending reaction header remains resumable', { skip: !enabled }, async t => {
  const f = await fixture(t, { ordinaryDays: -1 }), source = await f.source('comment', 'expired', { reactions: 3 }), ref = await f.archive('comment', source);
  const job = await f.primary.get(), result = await f.apply(await f.plan([ref.id])); assert.equal(result.bodiesRedacted, 1);
  const bound = await ref.get(); assert.deepEqual(bound.get('content'), {}); assert.equal(bound.get('contentExpired'), false);
  assert((await f.primary.get()).updateTime.isEqual(job.updateTime));
  assert(validatePurgeSelection(bound, { collection: 'accountContentArchive', field: 'subjectUserIds', operator: 'array-contains' }, f.owner));
  const drained = await drainArchivedCommentReactionsPage(f.account, f.raw, absent, { archiveId: ref.id, clock: f.clock, transactionGuard: f.guard });
  assert.equal(drained.state, 'reactions-complete'); assert.equal(drained.copied, 0); assert.equal((await source.ref.collection('reactions').get()).size, 0);
  assert.equal((await f.primary.get()).get('pendingArchiveId'), null); assert.equal((await ref.get()).get('reactionsComplete'), true);
});

test('partial body-free expiry pages remain valid for account purge and finish without losing the header', { skip: !enabled }, async t => {
  const f = await fixture(t, { ordinaryDays: -1 }), child = await f.source('privateReply'), ref = await f.archive('privateReply', child);
  await f.apply(await f.plan([ref.id]));
  for (let n = 0; n < 3; n++) await ref.collection('accessAudits').doc(`audit_${n}`).create({ actorId: 'moderator', original: true });
  const first = await expireLifecycleAccountCopy(f.live, { threadId: f.root.id, clock: f.clock, pageSize: 2 }); assert.equal(first.deleted, 2);
  const partial = await ref.get(); assert.equal(partial.get('contentExpired'), false); assert.deepEqual(partial.get('content'), {});
  assert(validatePurgeSelection(partial, { collection: 'accountContentArchive', field: 'subjectUserIds', operator: 'array-contains' }, f.owner));
  await expireLifecycleAccountCopy(f.live, { threadId: f.root.id, clock: f.clock, pageSize: 2 });
  assert.equal((await ref.get()).get('contentExpired'), true); assert.equal((await ref.collection('accessAudits').get()).size, 0);
  assert.equal((await expireLifecycleAccountCopy(f.live, { threadId: f.root.id, clock: f.clock })).state, 'complete');
});

test('missing/replaced parents and mixed blocked pages never acquire guessed ordinary deadlines', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply'), ref = await f.archive('privateReply', child), parent = (await f.root.get()).data();
  const secondSource = await f.source('privateReply'), second = await f.archive('privateReply', secondSource); await second.update({ parentMissing: true });
  const mixed = await f.plan([ref.id, second.id]); await assert.rejects(f.apply(mixed), /plan-blocked/);
  assert.equal((await ref.get()).get('ordinaryRetainUntil'), undefined);
  await f.root.delete(); assert.equal((await f.plan([ref.id])).entries[0].reason, 'parent-incarnation-unproven');
  await f.root.create(parent); const plan = await f.plan([ref.id]); assert.equal(plan.entries[0].reason, 'parent-incarnation-unproven');
  await assert.rejects(f.apply(plan), /plan-blocked/); assert.equal((await ref.get()).get('ordinaryRetainUntil'), undefined);
});

test('an original source recreated after archival stops adoption rather than overwriting either incarnation', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply'), original = (await child.ref.get()).data(), ref = await f.archive('privateReply', child);
  const plan = await f.plan([ref.id]); await child.ref.create(original); await assert.rejects(f.apply(plan), /source-drift/);
  assert.equal((await f.plan([ref.id])).entries[0].reason, 'archive-source-coexist'); assert.equal((await ref.get()).get('ordinaryRetainUntil'), undefined);
});

test('changed request incarnations, closed purge ingress and unconfirmed Auth remain blocked', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply'), ref = await f.archive('privateReply', child), original = (await f.request.get()).data();
  const plan = await f.plan([ref.id]); await f.purge.create({ ingressClosedAt: Timestamp.now() }); await assert.rejects(f.apply(plan), /source-drift/);
  await f.purge.delete(); await f.request.delete(); await f.request.create(original);
  assert.equal((await f.plan([ref.id])).entries[0].reason, 'account-request-changed');
});

test('copy, parent, journal and control drift invalidate a plan without partial updates', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply'), ref = await f.archive('privateReply', child);
  let plan = await f.plan([ref.id]); await ref.update({ parentMissing: true }); await assert.rejects(f.apply(plan), /source-drift/);
  await ref.update({ parentMissing: false }); plan = await f.plan([ref.id]); await f.primary.update({ roots: 42 }); await assert.rejects(f.apply(plan), /source-drift/);
  plan = await f.plan([ref.id]); await f.control.update({ revision: 3 }); await assert.rejects(f.apply(plan), /control-drift/);
  assert.equal((await ref.get()).get('ordinaryRetainUntil'), undefined);
});

test('approval, project, batch size and schema checks reject invalid plans before mutation', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply'), ref = await f.archive('privateReply', child), plan = await f.plan([ref.id]);
  for (const ids of [[], [ref.id, ref.id], ['not-a-digest'], Array.from({ length: 51 }, (_, n) => hash(n))]) await assert.rejects(f.plan(ids), /invalid-lifecycle-account-candidates/);
  const invalid = { ...plan, extra: true }; invalid.digest = hash(Object.fromEntries(Object.entries(invalid).filter(([k]) => k !== 'digest')));
  assert.throws(() => validateLifecycleAccountAdoptionPlan(invalid, f.raw.projectId), /invalid-lifecycle-account-plan/);
  assert.throws(() => validateLifecycleAccountAdoptionPlan(plan, 'other-project'), /invalid-lifecycle-account-plan/);
  await assert.rejects(f.apply(plan, { compatibleWriters: false }), /compatible-runtime-required/);
  await assert.rejects(f.apply(plan, { approvedDigest: '0'.repeat(64) }), /invalid-lifecycle-account-plan/);
});

test('concurrent application and a lost response cannot recopy bodies or reset dates', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply'), ref = await f.archive('privateReply', child), plan = await f.plan([ref.id]);
  const results = await Promise.all([f.apply(plan), f.apply(plan)]); assert.deepEqual(results.map(r => r.writes).sort(), [0, 1]);
  const committed = await ref.get(); assert.equal((await f.apply(plan)).writes, 0); assert((await ref.get()).updateTime.isEqual(committed.updateTime));
  const next = await f.source('privateReply'), b = await f.archive('privateReply', next), fresh = await f.plan([b.id]);
  const lossy = new Proxy(f.raw, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => { await target.runTransaction(...args); throw new Error('lost-after-commit'); };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await assert.rejects(applyPage(lossy, fresh, { approvedDigest: fresh.digest, compatibleWriters: true, clock: f.clock }), /lost-after-commit/);
  assert.equal((await f.apply(fresh)).writes, 0);
});

test('SDK replacement of a bound copy invalidates its read and purge deadline', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply'), ref = await f.archive('privateReply', child);
  await f.apply(await f.plan([ref.id])); const original = (await ref.get()).data(); await ref.delete(); await ref.create(original);
  await assert.rejects(f.deadline(ref), /binding-changed/);
  const plan = await f.plan([ref.id]); assert.equal(plan.entries[0].reason, 'account-binding-changed');
});

test('replacing or repurposing a lifecycle header cannot redirect an old account copy', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply'), ref = await f.archive('privateReply', child);
  await f.apply(await f.plan([ref.id])); const header = f.raw.doc(`contentLifecycleThreads/${f.root.id}`), old = (await header.get()).data();
  await header.update({ sourceCreatedAt: Timestamp.fromMillis(old.sourceCreatedAt.toMillis() - 1000) });
  await assert.rejects(f.deadline(ref), /binding-changed/);
  await header.update({ sourceCreatedAt: old.sourceCreatedAt }); await f.deadline(ref);
  await header.delete(); await header.create(old); await assert.rejects(f.deadline(ref), /binding-changed/);
});

test('a final clock check rejects crossing the ordinary or account deadline during adoption', { skip: !enabled }, async t => {
  const f = await fixture(t, { ordinaryDays: 2 }), child = await f.source('privateReply'), ref = await f.archive('privateReply', child), plan = await f.plan([ref.id]);
  let calls = 0; const end = new Date(new Timestamp(...plan.entries[0].retainUntil).toMillis());
  await assert.rejects(f.apply(plan, { clock: () => ++calls === 1 ? f.clock() : end }), /source-drift/);
  assert.equal((await ref.get()).get('ordinaryRetainUntil'), undefined);
});

test('recipient-owned private archives retain both subjects and honor an earlier second deletion', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply', 'recipient', { recipientOwner: true }), ref = await f.archive('privateReply', child);
  await f.apply(await f.plan([ref.id])); const other = f.raw.doc(`accountDeletionRequests/${f.peer}`); f.extra.push(other);
  await other.create({ userId: f.peer, status: 'pending' }); const otherTime = (await other.get()).createTime;
  // The original fixed account date remains, while a second subject's purge
  // closure makes the body immediately unavailable without creating anything.
  const otherJob = accountPurgeJobRef(f.raw, { projectId: f.raw.projectId, userId: f.peer, requestCreateTime: otherTime }); f.extra.push(otherJob);
  await otherJob.create({ ingressClosedAt: Timestamp.now() }); assert.equal((await f.deadline(ref)).toMillis(), 0);
  assert.deepEqual((await ref.get()).get('subjectUserIds'), [f.peer, f.owner]);
});

test('a real v3 account worker resumes its original pending archive after deadline adoption', { skip: !enabled }, async t => {
  const f = await fixture(t, { ordinaryDays: -1 }), child = await f.source('comment', 'pipeline', { reactions: 2 });
  const options = { leaseMillis: 120000, retryDelayMillis: 60000, authWaitMillis: 60000, pageSize: 1, clock: f.clock,
    privateCleanupEnabled: true, contentArchiveEnabled: true, confirmAuthDeletionEnabled: true };
  let job;
  for (let n = 0; n < 12; n++) {
    await runAccountShoutHidingJob(f.account, f.raw, absent, options); job = await f.primary.get();
    if (job.get('pendingArchiveId')) break;
    f.setNow(new Date(f.clock().getTime() + 61000));
  }
  assert(job.get('pendingArchiveId')); const ref = f.raw.doc(`accountContentArchive/${job.get('pendingArchiveId')}`), before = job;
  const plan = await f.plan([ref.id]); assert.equal(plan.entries[0].action, 'bind'); await f.apply(plan);
  assert((await f.primary.get()).updateTime.isEqual(before.updateTime)); assert.deepEqual((await ref.get()).get('content'), {});
  for (let n = 0; n < 8 && (await f.primary.get()).get('phase') !== 'content-archived'; n++) {
    f.setNow(new Date(f.clock().getTime() + 61000)); await runAccountShoutHidingJob(f.account, f.raw, absent, options);
  }
  const finished = await f.primary.get(); assert.equal(finished.get('phase'), 'content-archived'); assert.equal(finished.get('pendingArchiveId'), null);
  assert.equal((await child.ref.collection('reactions').get()).size, 0); assert.equal((await ref.collection('reactions').get()).size, 0);
});

test('the existing report-only reader honors an adopted comment deadline without a shared body copy', { skip: !enabled }, async t => {
  const f = await fixture(t, { ordinaryDays: 10 }), source = await f.source('comment', 'reported', { report: true }), ref = await f.archive('comment', source);
  const mod = `mod_${f.owner}`, user = f.raw.doc(`users/${mod}`), role = f.raw.doc(`accountRoles/${mod}`); f.extra.push(user, role);
  await user.create({ nickname: 'Synthetic moderator' }); await user.collection('legal').doc('acceptance_2026_07_25').create({}); await role.create({ level: 3 });
  await f.apply(await f.plan([ref.id]));
  const request = { auth: { uid: mod, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: { reportId: source.reportRef.id } };
  const result = await getArchivedCommentReportTargetOperation(request, f.raw, f.clock);
  assert.equal(result.targetData.text, 'Existing account body reported');
  const deadline = await f.deadline(ref); f.setNow(deadline.toDate());
  await assert.rejects(getArchivedCommentReportTargetOperation(request, f.raw, f.clock), e => e.code === 'not-found');
  assert.equal((await f.raw.collection('contentLifecycleArchive').where('threadId', '==', f.root.id).get()).size, 1);
});

test('a purge that has closed ingress cannot be reopened by an old adoption plan', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('privateReply'), ref = await f.archive('privateReply', child), plan = await f.plan([ref.id]);
  const now = Timestamp.fromDate(f.clock()), job = initialAccountPurgeJob(f.account, now); await f.purge.create(job);
  await f.purge.update({ phase: 'purging', ingressClosedAt: Timestamp.fromMillis(job.retainUntil.toMillis()), version: 1 });
  await assert.rejects(f.apply(plan), /source-drift/); assert.equal((await ref.get()).get('ordinaryRetainUntil'), undefined);
});

test('fifty account copies reuse transaction-local reads and commit only fifty metadata writes', { skip: !enabled }, async t => {
  const f = await fixture(t), children = [], ids = [];
  for (let n = 0; n < 50; n++) {
    const child = await f.source('privateReply', `batch_${n}`); children.push(child);
    ids.push(accountContentArchiveId(f.raw.projectId, child.ref.path, (await child.ref.get()).createTime));
  }
  await f.archive('privateReply', children[0]); let reads = 0, calls = 0;
  const measured = new Proxy(f.raw, { get(target, key) {
    if (key === 'runTransaction') return (fn, ...options) => target.runTransaction(tx => fn(new Proxy(tx, { get(t, method) {
      if (method === 'get') return async (...args) => { calls++; reads++; return t.get(...args); };
      if (method === 'getAll') return async (...args) => { calls++; reads += args.length; return t.getAll(...args); };
      return typeof t[method] === 'function' ? t[method].bind(t) : t[method];
    } })), ...options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  const plan = await planPage(measured, ids, { clock: f.clock }); assert.equal(plan.entries.length, 50); assert(calls <= 8); assert(reads < 130);
  reads = 0; calls = 0;
  const result = await applyPage(measured, plan, { approvedDigest: plan.digest, compatibleWriters: true, clock: f.clock });
  assert.equal(result.writes, 50); assert.equal(result.bodiesCopied, 0); assert(calls <= 8); assert(reads < 130);
  process.stdout.write('LIFECYCLE_ACCOUNT_ADOPTION_TRACE ' + JSON.stringify({ copies: 50, reads, documentReadCalls: calls, writes: result.writes, bodiesCopied: 0, liveWrites: 0 }) + '\n');
});

test('an incomplete comment drain needs its original pending ID and confirmation before adoption', { skip: !enabled }, async t => {
  const f = await fixture(t), child = await f.source('comment'), ref = await f.archive('comment', child);
  await f.primary.update({ pendingArchiveId: null }); assert.equal((await f.plan([ref.id])).entries[0].reason, 'archive-drain-unproven');
  await f.primary.update({ pendingArchiveId: ref.id });
  const req = await f.request.get(), patch = req.data(); delete patch.authDeletionConfirmedAt; await f.request.set(patch);
  assert.equal((await f.plan([ref.id])).entries[0].reason, 'account-auth-unconfirmed');
});
