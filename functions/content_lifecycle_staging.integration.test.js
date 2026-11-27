import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { createContentLifecycleDatabase, lifecycleDay, lifecycleReadsEnabled } from './content_lifecycle.js';
import { archiveAccountContentPage } from './account_content_archive.js';
import { accountDeletionJobRef, runAccountShoutHidingJob } from './account_deletion_job.js';
import { operationTestKey } from './test_helpers.js';
import { decideContentReportsOperation } from './decide_content_reports.js';
import { planLifecycleReportCompatibility, applyLifecycleReportCompatibility } from './content_lifecycle_report_compatibility.js';
import { getLifecycleReportEvidenceOperation } from './content_lifecycle_evidence.js';
import { createFeedRuntime } from './feed_runtime.js';
import { legalPolicy } from './legal_policy.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const absent = { async getUser() { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); } };
async function fixture(t) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), nonce = randomUUID().replaceAll('-', '');
  const root = raw.doc(`shouts/staging_${nonce}`), child = root.collection('comments').doc('legacy'), owner = `author_${nonce}`;
  const body = { authorId: owner, authorNickname: 'Synthetic author', title: 'Synthetic legacy', text: 'Original legacy body', createdAt: Timestamp.fromMillis(Date.now() - 5000),
    expiresAt: Timestamp.fromMillis(Date.now() + lifecycleDay), status: 'active', commentsCount: 1, likesCount: 0, dislikesCount: 0, savesCount: 0,
    geography: { schemaVersion: 1, countryCode: 'CZ' } };
  const control = raw.doc('contentLifecycleControl/current'), extra = [];
  t.after(async () => {
    for (const doc of (await raw.collection('accountContentArchive').where('sourceShoutId', '==', root.id).get()).docs) await raw.recursiveDelete(doc.ref);
    for (const r of [root, control, ...extra]) await raw.recursiveDelete(r);
    await raw.terminate();
  });
  await root.create(body); await child.create({ authorId: owner, text: 'Legacy comment', createdAt: body.createdAt });
  await control.create({ schemaVersion: 1, revision: 1, mode: 'active', captureFenceAt: FieldValue.serverTimestamp(), legacyRevision: 0 });
  let now = new Date(Date.now() + 5000); const clock = () => now;
  const db = createContentLifecycleDatabase(raw, { enabled: true, readsEnabled: false, clock });
  const track = ref => { extra.push(ref); return ref; };
  return { raw, root, child, body, control, db, owner, clock, track, setNow(d) { now = d; } };
}

test('capture-only archives a new source while preserving old content and a transactional dirty fence', { skip: !enabled }, async t => {
  const f = await fixture(t), ref = f.track(f.raw.doc(`shouts/new_${f.root.id}`));
  f.track(f.raw.doc(`contentLifecycleThreads/${ref.id}`));
  await f.db.runTransaction(tx => tx.create(ref, { ...f.body, commentsCount: 0 }));
  const source = await ref.get(), archive = f.track(f.raw.doc(`contentLifecycleArchive/${source.get('contentArchiveKey')}`));
  assert((await archive.get()).exists); assert(!lifecycleReadsEnabled(f.db));
  assert.equal((await f.control.get()).get('legacyRevision'), 0);
  await f.db.runTransaction(async tx => { await tx.get(f.root); tx.update(f.root, { status: 'deleted' }); });
  assert.equal((await f.control.get()).get('legacyRevision'), 1);
  assert.equal((await f.root.get()).get('contentArchiveKey'), undefined);
  assert(!(await f.raw.doc(`contentLifecycleThreads/${f.root.id}`).get()).exists);
});

test('a post-fence unbound source cannot use legacy compatibility or bypass archive ingress', { skip: !enabled }, async t => {
  const f = await fixture(t), ref = f.track(f.raw.doc(`shouts/late_${f.root.id}`)); await ref.create(f.body);
  await assert.rejects(f.db.runTransaction(async tx => { await tx.get(ref); tx.update(ref, { status: 'deleted' }); }), /migration is required/);
  assert.equal((await ref.get()).get('status'), 'active'); assert.equal((await f.control.get()).get('legacyRevision'), 0);
});

test('a new child of an unconverted parent stops atomically instead of creating an unarchived body', { skip: !enabled }, async t => {
  const f = await fixture(t), child = f.root.collection('comments').doc('new');
  await assert.rejects(f.db.runTransaction(async tx => { const parent = await tx.get(f.root);
    tx.update(f.root, { commentsCount: parent.get('commentsCount') + 1 });
    tx.create(child, { authorId: 'other-author', text: 'New comment', createdAt: Timestamp.fromDate(f.clock()) });
  }), /migration is required/);
  assert(!(await child.get()).exists); assert.equal((await f.root.get()).get('commentsCount'), 1);
  assert.equal((await f.control.get()).get('legacyRevision'), 0);
});

test('inline adoption captures one original parent and both child kinds atomically', { skip: !enabled }, async t => {
  const f = await fixture(t), db = createContentLifecycleDatabase(f.raw, { enabled: true, readsEnabled: false, inlineParentAdoption: true, clock: f.clock });
  const first = f.root.collection('comments').doc('new'), second = f.root.collection('privateReplies').doc('new');
  await db.runTransaction(async tx => {
    const root = await tx.get(f.root);
    tx.update(f.root, { commentsCount: root.get('commentsCount') + 1 });
    tx.create(first, { authorId: 'other-author', text: 'New public', createdAt: Timestamp.fromDate(f.clock()) });
    tx.create(second, { authorId: 'other-author', recipientId: f.owner, participants: ['other-author', f.owner], text: 'New private', createdAt: Timestamp.fromDate(f.clock()) });
  });
  const root = await f.root.get(), header = f.track(f.raw.doc(`contentLifecycleThreads/${root.id}`));
  const copies = [];
  for (const ref of [f.root, first, second]) {
    const doc = await ref.get(), archive = f.track(f.raw.doc(`contentLifecycleArchive/${doc.get('contentArchiveKey')}`));
    copies.push((await archive.get()).data());
  }
  assert.equal(root.get('commentsCount'), 2);
  assert.equal(copies[0].captureMode, 'transition'); assert.equal(copies[0].content.text, f.body.text);
  assert.equal(copies[1].captureMode, 'atomic-write'); assert.equal(copies[2].captureMode, 'atomic-write');
  assert.equal((await header.get()).get('retainUntil').toMillis(), f.body.expiresAt.toMillis() + 67 * lifecycleDay);
  assert.equal((await f.control.get()).get('legacyRevision'), 1);
  // A second child uses the already bound root and does not recreate its body.
  const third = f.root.collection('comments').doc('next');
  const born = (await f.raw.doc(`contentLifecycleArchive/${root.get('contentArchiveKey')}`).get()).createTime;
  await db.runTransaction(tx => tx.create(third, { authorId: 'other-author', text: 'Next', createdAt: Timestamp.fromDate(f.clock()) }));
  f.track(f.raw.doc(`contentLifecycleArchive/${(await third.get()).get('contentArchiveKey')}`));
  assert((await f.raw.doc(`contentLifecycleArchive/${root.get('contentArchiveKey')}`).get()).createTime.isEqual(born));
  assert.equal((await f.control.get()).get('legacyRevision'), 1);
});

for (const scenario of ['deleted', 'expired', 'deleting', 'partial', 'budget']) {
  test(`inline parent ${scenario} stops the entire transaction`, { skip: !enabled }, async t => {
    const f = await fixture(t);
    if (scenario === 'deleted') await f.root.update({ status: 'deleted' });
    if (scenario === 'expired') f.setNow(new Date(f.body.expiresAt.toMillis() + 1));
    if (scenario === 'deleting') await f.track(f.raw.doc(`accountDeletionRequests/${f.owner}`)).create({ userId: f.owner, status: 'pending' });
    if (scenario === 'partial') await f.track(f.raw.doc(`contentLifecycleThreads/${f.root.id}`)).create({ invalid: true });
    const db = createContentLifecycleDatabase(f.raw, { enabled: true, readsEnabled: false, inlineParentAdoption: true, clock: f.clock,
      ...(scenario === 'budget' ? { writeBudget: 3 } : {}) });
    const child = f.root.collection('comments').doc('new');
    await assert.rejects(db.runTransaction(async tx => {
      await tx.get(f.root); tx.update(f.root, { commentsCount: 2 });
      tx.create(child, { authorId: 'other-author', text: 'New', createdAt: Timestamp.fromDate(f.clock()) });
    }));
    assert(!(await child.get()).exists); assert.equal((await f.root.get()).get('commentsCount'), 1);
    assert.equal((await f.root.get()).get('contentArchiveKey'), undefined);
    assert.equal((await f.control.get()).get('legacyRevision'), 0);
  });
}

test('a legacy anonymous context cannot bypass the original account deadline or preserve extra private fields', { skip: !enabled }, async t => {
  const f = await fixture(t), request = f.track(f.raw.doc(`accountDeletionRequests/${f.owner}`));
  await request.create({ userId: f.owner, status: 'pending' });
  await assert.rejects(f.db.runTransaction(tx => tx.set(f.root, { schemaVersion: 1, status: 'deleted', contentPurged: true, authorId: f.owner })), /deadline has not passed/);
  f.setNow(new Date((await request.get()).createTime.toMillis() + 60 * lifecycleDay));
  await assert.rejects(f.db.runTransaction(tx => tx.set(f.root, { schemaVersion: 1, status: 'deleted', contentPurged: true, authorId: f.owner, text: 'Cannot retain' })), /incarnation changed/);
  assert.equal((await f.root.get()).get('text'), f.body.text);
});

test('partial bindings, changed source birth and missing dirty fences are rejected atomically', { skip: !enabled }, async t => {
  const f = await fixture(t);
  await assert.rejects(f.db.runTransaction(tx => tx.update(f.root, { contentArchiveKey: 'a'.repeat(64) })), /incarnation changed/);
  await assert.rejects(f.db.runTransaction(tx => tx.update(f.root, { createdAt: Timestamp.now() })), /incarnation changed/);
  await f.control.update({ legacyRevision: FieldValue.delete() });
  await assert.rejects(f.db.runTransaction(tx => tx.update(f.root, { status: 'deleted' })), /inventory fence/);
  assert.equal((await f.root.get()).get('status'), 'active');
});

test('capture-only keeps legacy private report text and fences reports over old source IDs', { skip: !enabled }, async t => {
  const f = await fixture(t), peer = `peer_${f.root.id}`, reply = f.root.collection('privateReplies').doc('old');
  // This reply is deliberately post-fence; it must not be misclassified as old.
  await reply.create({ authorId: f.owner, recipientId: peer, participants: [f.owner, peer], text: 'Private original', createdAt: f.body.createdAt });
  const ref = f.track(f.raw.doc(`commentReports/${peer}_${f.root.id}_legacy`));
  await f.db.runTransaction(async tx => { await tx.get(f.child); tx.create(ref, { reporterId: peer, shoutId: f.root.id,
    commentId: 'legacy', reason: 'Synthetic report', status: 'open', createdAt: Timestamp.now() }); });
  assert.equal((await f.control.get()).get('legacyRevision'), 1); assert.equal((await ref.get()).get('contentArchiveKey'), undefined);
  const bad = f.track(f.raw.doc(`privateReplyReports/${peer}_${f.root.id}_old`));
  await assert.rejects(f.db.runTransaction(async tx => { await tx.get(reply); tx.create(bad, {
    reporterId: peer, shoutId: f.root.id, privateReplyId: 'old', authorId: f.owner, text: 'Private original' }); }), /migration is required/);
  assert(!(await bad.get()).exists);
});

test('a legacy account archive slice continues under capture-only and preserves its original request and 60-day deadline', { skip: !enabled }, async t => {
  const f = await fixture(t), request = f.track(f.raw.doc(`accountDeletionRequests/${f.owner}`));
  await request.create({ userId: f.owner, status: 'pending' }); const birth = (await request.get()).createTime;
  const identity = { projectId: f.raw.projectId, userId: f.owner, requestCreateTime: birth };
  const job = f.track(accountDeletionJobRef(f.raw, identity)); await job.create({ roots: 0 });
  f.setNow(new Date(Date.now() + 5000));
  await archiveAccountContentPage(identity, f.db, absent, { kind: 'comment', clock: f.clock,
    transactionGuard: async tx => { await tx.get(job); return () => tx.update(job, { roots: 1 }); } });
  assert(!(await f.child.get()).exists); assert.equal((await job.get()).get('roots'), 1);
  const rows = await f.raw.collection('accountContentArchive').where('sourceShoutId', '==', f.root.id).get();
  assert.equal(rows.size, 1); assert.equal(rows.docs[0].get('content.text'), 'Legacy comment');
  assert.equal(rows.docs[0].get('retainUntil').toMillis(), birth.toMillis() + 60 * lifecycleDay);
  assert.equal(rows.docs[0].get('contentArchiveKey'), undefined); assert.equal((await f.control.get()).get('legacyRevision'), 1);
});

test('a real pre-cutover v3 worker completes through capture-only without changing the request incarnation', { skip: !enabled }, async t => {
  const f = await fixture(t), request = f.track(f.raw.doc(`accountDeletionRequests/${f.owner}`));
  await request.create({ userId: f.owner, status: 'pending' }); const birth = (await request.get()).createTime;
  const identity = { projectId: f.raw.projectId, userId: f.owner, requestCreateTime: birth }, job = f.track(accountDeletionJobRef(f.raw, identity));
  const options = { leaseMillis: 120000, retryDelayMillis: 60000, authWaitMillis: 60000, pageSize: 1, clock: f.clock,
    privateCleanupEnabled: true, contentArchiveEnabled: true, confirmAuthDeletionEnabled: true };
  f.setNow(new Date(Date.now() + 5000));
  for (let n = 0; n < 18; n++) {
    await runAccountShoutHidingJob(identity, f.db, absent, options);
    if ((await job.get()).get('phase') === 'content-archived') break;
    f.setNow(new Date(f.clock().getTime() + 61000));
  }
  assert.equal((await job.get()).get('schemaVersion'), 3); assert.equal((await job.get()).get('phase'), 'content-archived');
  assert((await request.get()).createTime.isEqual(birth)); assert((await f.control.get()).get('legacyRevision') >= 2);
});

test('capture-only still uses legacy report decisions until reader activation', { skip: !enabled }, async t => {
  const f = await fixture(t), uid = `mod_${f.root.id}`, peer = `peer_${f.root.id}`;
  const user = f.track(f.raw.doc(`users/${uid}`)), role = f.track(f.raw.doc(`accountRoles/${uid}`));
  await user.create({ nickname: 'Synthetic' }); await user.collection('legal').doc('acceptance_2026_07_25').create({});
  await role.create({ level: 3, moderationScope: { countries: ['CZ'] } });
  const report = f.track(f.raw.doc(`commentReports/${peer}_${f.root.id}_legacy`));
  await f.db.runTransaction(async tx => { await tx.get(f.child); tx.create(report, { reporterId: peer, shoutId: f.root.id,
    commentId: 'legacy', reason: 'Synthetic', status: 'open', createdAt: Timestamp.now() }); });
  const key = operationTestKey('capture_legacy', f.clock());
  const request = { auth: { uid, token: { email_verified: true, email: 'fixture@example.test' } }, app: { appId: 'synthetic' },
    data: { expectedUserId: uid, idempotencyKey: key, targetType: 'comment', shoutId: f.root.id, targetId: 'legacy', reportIds: [report.id], decision: 'resolve' } };
  const result = await decideContentReportsOperation(request, f.db, f.clock); assert.equal(result.count, 1);
  for (const doc of (await f.raw.collection('serverOperations').where('userId', '==', uid).get()).docs) f.track(doc.ref);
  assert.equal((await report.get()).get('status'), 'resolved');
});

test('staged shared private reports keep old-client text until an approved compatibility batch removes it', { skip: !enabled }, async t => {
  const f = await fixture(t), root = f.track(f.raw.doc(`shouts/new_${f.root.id}`)), peer = `peer_${f.root.id}`;
  f.track(f.raw.doc(`contentLifecycleThreads/${root.id}`));
  await f.db.runTransaction(tx => tx.create(root, { ...f.body, commentsCount: 0 }));
  const child = root.collection('privateReplies').doc('new');
  await f.db.runTransaction(tx => tx.create(child, { authorId: f.owner, recipientId: peer, participants: [f.owner, peer], text: 'Private original', createdAt: f.body.createdAt }));
  const report = f.track(f.raw.doc(`privateReplyReports/${peer}_${root.id}_new`));
  await f.db.runTransaction(async tx => { await tx.get(child); tx.create(report, { authorId: f.owner, reporterId: peer, shoutId: root.id,
    privateReplyId: 'new', text: 'Private original', status: 'open', reason: 'Synthetic report', createdAt: Timestamp.now() }); });
  assert.equal((await report.get()).get('text'), 'Private original'); assert((await report.get()).get('contentArchiveKey'));
  const plan = await planLifecycleReportCompatibility(f.raw, [report.path], { clock: f.clock }); assert.equal(plan.entries[0].action, 'scrub');
  const options = { approvedDigest: plan.digest, compatibleReaders: true, compatibleWriters: true, clock: f.clock };
  assert.equal((await applyLifecycleReportCompatibility(f.raw, plan, options)).writes, 1);
  assert.equal((await report.get()).get('text'), undefined); assert.equal((await applyLifecycleReportCompatibility(f.raw, plan, options)).writes, 0);
  const uid = `admin_${f.root.id}`, user = f.track(f.raw.doc(`users/${uid}`)), role = f.track(f.raw.doc(`accountRoles/${uid}`));
  await user.create({ nickname: 'Synthetic admin' }); await user.collection('legal').doc('acceptance_2026_07_25').create({});
  await role.create({ level: 5 });
  const request = { auth: { uid, token: { email_verified: true, email: 'fixture@example.test' } }, app: { appId: 'synthetic' },
    data: { expectedUserId: uid, targetType: 'privateReply', reportId: report.id } };
  const before = await getLifecycleReportEvidenceOperation(request, f.db, f.clock);
  // A compatible rollback pauses capture and disables maintenance, retaining
  // the archive reader contract rather than falling back to missing sources.
  await f.control.update({ mode: 'paused', revision: 2 });
  const rollback = createFeedRuntime(f.raw, absent, { clock: f.clock, contentLifecycleEnabled: true, contentMaintenanceEnabled: false,
    enforceArchiveDisclosure: true, disclosurePolicy: legalPolicy({ archiveDisclosureEnabled: true, version: '2099-01-01' }) });
  assert.equal(rollback.contentMaintenance, null);
  await root.delete(); await child.delete();
  const after = await getLifecycleReportEvidenceOperation(request, rollback.database, f.clock);
  assert.deepEqual(after.targetData, before.targetData); assert.equal(after.targetData.text, 'Private original');
  await assert.rejects(f.db.runTransaction(tx => tx.create(root, { ...f.body, commentsCount: 0 })), /not active/);
  assert.equal((await report.get()).get('text'), undefined);
  for (const d of (await f.raw.collection('contentLifecycleArchive').where('threadId', '==', root.id).get()).docs) f.track(d.ref);
});
