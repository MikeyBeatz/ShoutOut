import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { accountPurgeJobRef, initialAccountPurgeJob, accountRetentionMillis } from './account_purge_guard.js';
import { runAccountPurgeJob, purgedShoutContext } from './account_purge_job.js';
import { createPurgeDocumentPager } from './account_purge_pager.js';
import { runAccountMaintenanceTick } from './shout_expiration.js';
import { accountPurgeStages } from './account_purge_policy.js';
import { assertReportEvidenceRetention } from './moderation_retention.js';
import { lifecycleArchiveKey, lifecycleBodyHash, lifecycleTimes, createContentLifecycleDatabase } from './content_lifecycle.js';
import { getLifecycleReportEvidenceOperation } from './content_lifecycle_evidence.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'account-purge-tests') : null;
const db = app ? getFirestore(app) : null, roots = [];
const missing = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
after(async () => { if (db) { for (const root of roots) await db.recursiveDelete(root); await db.terminate(); await deleteApp(app); } });

async function fixture() {
  const uid = randomUUID(), key = `mvp_${uid.replaceAll('-', '').slice(0, 12)}`;
  const request = db.doc(`accountDeletionRequests/${uid}`), profile = db.doc(`publicProfiles/${uid}`), user = db.doc(`users/${uid}`);
  await request.set({ userId: uid, status: 'pending', email: 'fixture@example.test' });
  const created = (await request.get()).createTime, identity = { projectId: db.projectId, userId: uid, requestCreateTime: created };
  const jobRef = accountPurgeJobRef(db, identity), mainRef = db.doc(`accountDeletionJobs/${jobRef.id}`), reservation = db.doc(`nicknames/${key}`);
  roots.push(request, profile, user, jobRef, mainRef, reservation);
  await user.set({ nickname: key, nicknameLower: key }); await profile.set({ nickname: key, avatarId: 'fox' });
  await reservation.set({ uid, nicknameLower: key });
  await mainRef.set({ reservationKey: key, leaseToken: null, leaseUntil: null, nextAttemptAt: null, phase: 'content-archived' });
  await jobRef.set(initialAccountPurgeJob(identity, Timestamp.now()));
  let millis = created.toMillis() + accountRetentionMillis;
  const files = new Map(), bucket = {
    name: 'shoutout-rules-test.firebasestorage.app', policy: {}, deletes: 0, loseAck: false,
    async getMetadata() { return [bucket.policy]; },
    async getFiles(options) { assert.equal(options.maxResults, 1); assert.equal(options.autoPaginate, false);
      return [[...files.keys()].filter(path => path.startsWith(options.prefix)).sort().slice(0, 1).map(path => bucket.file(path))]; },
    file(name) { return { name, async getMetadata() {
      if (!files.has(name)) throw Object.assign(new Error('absent'), { code: 404 }); return [{ generation: files.get(name) }];
    }, async delete(options) {
      if (!files.has(name)) throw Object.assign(new Error('absent'), { code: 404 });
      if (options.ifGenerationMatch !== files.get(name)) throw Object.assign(new Error('replaced'), { code: 412 });
      files.delete(name); bucket.deletes++; if (bucket.loseAck) { bucket.loseAck = false; throw new Error('lost Storage acknowledgement'); }
    } }; },
  };
  const options = { pageSize: 50, leaseMillis: 120000, retryDelayMillis: 1000, authWaitMillis: 86400000, bucket, clock: () => new Date(millis) };
  const f = { uid, key, request, profile, user, jobRef, mainRef, reservation, identity, files, bucket, options,
    advance: n => { millis += n; }, time: n => { millis = n; },
    run: (auth = missing, opts = options, database = db) => runAccountPurgeJob(identity, database, auth, opts),
    add: async (path, data) => { const ref = db.doc(path); roots.push(ref); await ref.set(data); return ref; } };
  f.finish = async () => { for (let n = 0; n < 100; n++) { const result = await f.run();
    if (result.state === 'purged') return result; assert.equal(result.state, 'purging', JSON.stringify(result)); f.advance(1000); }
    assert.fail('purge did not finish'); };
  return f;
}

test('opted-in lifecycle stages append to existing positions and purge only owned canonical bodies and their audits', { skip: !enabled }, async () => {
  const f = await fixture(); f.options.contentLifecycleEnabled = true; f.options.moderationCopiesEnabled = true;
  const old = accountPurgeStages(f.uid, { moderationCopiesEnabled: true });
  const next = accountPurgeStages(f.uid, { moderationCopiesEnabled: true, contentLifecycleEnabled: true });
  assert.deepEqual(next.slice(0, old.length), old);
  const archive = async (uid, text) => {
    const threadId = randomUUID(), sourcePath = `shouts/${threadId}/comments/comment`;
    const content = { authorId: uid, text, createdAt: Timestamp.now() };
    const key = lifecycleArchiveKey(db.projectId, sourcePath, content);
    return f.add(`contentLifecycleArchive/${key}`, { schemaVersion: 1, kind: 'comment', subjectUserIds: [uid],
      content, contentHash: lifecycleBodyHash(content), threadId, sourcePath, sourceCreatedAt: content.createdAt,
      archivedAt: content.createdAt, threadCreatedAt: content.createdAt, state: {} });
  };
  const owned = await archive(f.uid, 'Owned archive');
  const audit = await f.add(`${owned.path}/accessAudits/foreign-actor`, { actorId: 'foreign-actor' });
  const foreign = await archive('foreign-author', 'Preserve foreign archive');
  const report = await f.add(`reports/${randomUUID()}`, { authorId: f.uid, reporterId: 'foreign-reporter', status: 'resolved', reason: 'Owned subject' });
  const commentReport = await f.add(`commentReports/${randomUUID()}`, { authorId: f.uid, reporterId: 'foreign-reporter', status: 'resolved', reason: 'Owned subject' });
  await f.finish();
  assert(!(await owned.get()).exists); assert(!(await audit.get()).exists);
  assert(!(await report.get()).exists); assert(!(await commentReport.get()).exists);
  assert.equal((await foreign.get()).get('content.text'), 'Preserve foreign archive');
});

test('lifecycle account purge during paused ingress anonymizes foreign reply versions and parent context without losing the foreign body', { skip: !enabled }, async () => {
  const f = await fixture(); f.options.contentLifecycleEnabled = true;
  await f.add('contentLifecycleControl/current', { schemaVersion: 1, mode: 'paused', revision: 2 });
  const createdAt = Timestamp.fromMillis(f.identity.requestCreateTime.toMillis() - 1),
    expiry = Timestamp.fromMillis(createdAt.toMillis() + 86400000), rootId = randomUUID();
  const rootPath = `shouts/${rootId}`, time = lifecycleTimes(expiry), foreign = `foreign-${randomUUID()}`;
  await f.add(`contentLifecycleThreads/${rootId}`, { schemaVersion: 1, shoutId: rootId, sourceCreatedAt: createdAt,
    archivedAt: createdAt, plannedExpiresAt: expiry, geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, ...time });
  const publish = async (path, body, kind) => {
    const key = lifecycleArchiveKey(db.projectId, path, body), hash = lifecycleBodyHash(body);
    const ref = await f.add(path, { ...body, contentArchiveKey: key, contentHash: hash,
      ...(kind === 'shout' ? { publicUntil: time.publicUntil, historyUntil: time.historyUntil } : {}) });
    const archive = await f.add(`contentLifecycleArchive/${key}`, { schemaVersion: 1, kind, threadId: rootId, sourcePath: path,
      sourceCreatedAt: createdAt, sourceCreateTime: (await ref.get()).createTime, threadCreatedAt: createdAt,
      archivedAt: Timestamp.now(), subjectUserIds: [body.authorId], content: body, contentHash: hash, state: {} });
    return { ref, archive };
  };
  const root = await publish(rootPath, { authorId: f.uid, authorNickname: 'Original', title: 'Owned parent', text: 'Owned parent text',
    createdAt, expiresAt: expiry, status: 'expired', commentsCount: 2, likesCount: 0, dislikesCount: 0, savesCount: 0 }, 'shout');
  await publish(`${rootPath}/comments/original`, { authorId: f.uid, text: 'Original comment', createdAt, likesCount: 0, dislikesCount: 0 }, 'comment');
  const reply = await publish(`${rootPath}/comments/foreign`, { authorId: foreign, authorNickname: 'Foreign', text: '@Original Preserve this reply',
    replyToCommentId: 'original', replyToNickname: 'Original', createdAt, likesCount: 0, dislikesCount: 0 }, 'comment');
  const reporter = `reporter-${randomUUID()}`, report = await f.add(`commentReports/${reporter}_${rootId}_foreign`, {
    reporterId: reporter, authorId: foreign, shoutId: rootId, commentId: 'foreign', reason: 'Synthetic foreign report', status: 'open',
    createdAt: Timestamp.now(), contentArchiveKey: reply.archive.id, shoutArchiveKey: root.archive.id, parentContextPurged: false,
    moderationGeography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' },
  });
  const decorated = createContentLifecycleDatabase(db, { enabled: true, clock: f.options.clock });
  let result;
  for (let n = 0; n < 100; n++) {
    result = await f.run(missing, f.options, decorated);
    if (result.state === 'purged') break;
    assert.equal(result.state, 'purging', JSON.stringify(result)); f.advance(1000);
  }
  assert.equal(result.state, 'purged');
  for (const record of (await db.collection('contentLifecycleArchive').where('threadId', '==', rootId).get()).docs) roots.push(record.ref);
  assert.equal((await reply.ref.get()).get('text'), 'Preserve this reply');
  assert.equal((await reply.archive.get()).get('content.text'), 'Preserve this reply');
  assert.equal((await reply.archive.get()).get('redactionKind'), 'account-reference');
  assert.equal((await reply.archive.get()).get('content.replyToNickname'), undefined);
  assert.equal((await report.get()).get('shoutArchiveKey'), undefined);
  assert.equal((await report.get()).get('moderationGeography'), null);
  const admin = `reader-${randomUUID()}`;
  await f.add(`users/${admin}`, { nickname: 'Synthetic archive reader' });
  await f.add(`users/${admin}/legal/acceptance_2026_07_25`, {});
  await f.add(`accountRoles/${admin}`, { level: 5 });
  const read = await getLifecycleReportEvidenceOperation({ auth: { uid: admin, token: { email: 'synthetic@example.test', email_verified: true } },
    app: { appId: 'synthetic' }, data: { reportId: report.id, targetType: 'comment', expectedUserId: admin } }, decorated, f.options.clock);
  assert.equal(read.targetData.text, 'Preserve this reply'); assert.equal(read.privacyRedacted, true);
  assert.equal(read.parentData, undefined);
});

test('existing maintenance tick prioritizes a due purge and shares its one-job/50-step budget with other work', { skip: !enabled }, async () => {
  const f = await fixture(), expired = await f.add(`shouts/${randomUUID()}`, { authorId: 'foreign', status: 'active', expiresAt: Timestamp.fromMillis(1) });
  roots.push(db.doc('maintenanceState/accountPurgeJobs'));
  const options = { ...f.options, maxJobs: 1, retentionPurgeEnabled: true, shoutExpirationEnabled: true };
  const first = await runAccountMaintenanceTick(db, missing, options);
  assert.equal(first.purgeScanned, 1); assert.ok(first.purgeExamined <= 50); assert.equal(first.scanned, 0); assert.equal(first.expirationChanged, 0);
  assert.equal((await expired.get()).get('status'), 'active'); f.advance(1000); await f.finish();
  const second = await runAccountMaintenanceTick(db, missing, options);
  assert.equal(second.purgeScanned, 0); assert.equal(second.expirationChanged, 1);
});

test('purge starts at the exact original 60-day boundary and never calls Auth early', { skip: !enabled }, async () => {
  const f = await fixture(), before = await f.jobRef.get(), user = await f.user.get();
  const auditTime = Timestamp.now(), reports = [];
  for (const collection of ['reports', 'commentReports', 'privateReplyReports']) reports.push(await f.add(`${collection}/${randomUUID()}`, {
    reporterId: 'foreign-reporter', authorId: 'foreign-author', reason: 'Preserve report evidence', resolvedAt: auditTime,
    resolvedBy: f.uid, escalatedBy: f.uid, status: 'resolved', decisionOperationId: 'preserve-operation',
  }));
  f.time(f.identity.requestCreateTime.toMillis() + accountRetentionMillis - 1);
  assert.equal((await f.run({ getUser() { assert.fail('early Auth'); } })).state, 'deferred');
  assert.ok((await f.jobRef.get()).updateTime.isEqual(before.updateTime)); assert.ok((await f.user.get()).updateTime.isEqual(user.updateTime));
  for (const ref of reports) assert.equal((await ref.get()).get('resolvedBy'), f.uid);
  f.advance(1); await f.finish(); assert.equal((await f.request.get()).exists, false); assert.equal((await f.reservation.get()).exists, false);
  assert.deepEqual((await f.profile.get()).data(), { schemaVersion: 1, accountStatus: 'deleted' });
  for (const ref of reports) {
    const row = await ref.get(); assert(row.exists); assert.equal(row.get('resolvedBy'), undefined); assert.equal(row.get('escalatedBy'), undefined);
    assert.equal(row.get('reason'), 'Preserve report evidence'); assert(row.get('resolvedAt').isEqual(auditTime)); assert.equal(row.get('decisionOperationId'), 'preserve-operation');
  }
  assert.equal((await f.run({ getUser() { assert.fail('replay Auth'); } })).state, 'purged');
});

test('bounded tree listing includes missing intermediate parents and drains descendants before releasing the nickname', { skip: !enabled }, async () => {
  const f = await fixture(), orphan = f.user.collection('legal').doc('missing').collection('evidence').doc('leaf');
  await orphan.set({ retained: true }); await f.user.delete();
  const pager = createPurgeDocumentPager(db), page = await pager.list(`${f.user.path}/legal`);
  assert.deepEqual(page.paths, [`${f.user.path}/legal/missing`]); await pager.close();
  const result = await f.finish(); assert.ok(result.deleted >= 1); assert.equal((await orphan.get()).exists, false);
});

test('whole Business/profile trees purge, foreign roots survive, and a foreign nickname reservation is never released', { skip: !enabled }, async () => {
  const f = await fixture();
  const business = await f.add(`businessProfiles/${f.uid}`, { officialName: 'Fixture business' });
  await business.collection('locations').doc('initial').collection('metadata').doc('fixture').set({ retained: true });
  await f.add(`businessApplications/${f.uid}`, { contactEmail: 'fixture@example.test' });
  const control = await f.add(`businessProfiles/${randomUUID()}`, { officialName: 'Preserve foreign' }), before = await control.get();
  await f.reservation.update({ uid: 'foreign' });
  await f.finish(); assert.equal((await business.get()).exists, false);
  assert.equal((await business.collection('locations').doc('initial').collection('metadata').doc('fixture').get()).exists, false);
  assert.equal((await f.reservation.get()).get('uid'), 'foreign'); assert.ok((await control.get()).updateTime.isEqual(before.updateTime));
});

test('purge removes live owned activities with exact counters, retains foreign conversations in an anonymous Shout context', { skip: !enabled }, async () => {
  const f = await fixture(), own = await f.add(`shouts/${randomUUID()}`, { authorId: f.uid, title: 'Remove title', text: 'Remove text', location: { private: true } });
  const foreign = await f.add(`shouts/${randomUUID()}`, { authorId: 'foreign', likesCount: 1, savesCount: 1, commentsCount: 1 });
  await own.collection('comments').doc('foreign').set({ authorId: 'other', text: 'Preserve foreign comment' });
  await own.collection('privateReplies').doc('foreign').set({ authorId: 'alice', recipientId: 'bob', text: 'Preserve foreign conversation' });
  await foreign.collection('reactions').doc(f.uid).set({ userId: f.uid, type: 'like', updatedAt: Timestamp.now() });
  await foreign.collection('saves').doc(f.uid).set({ userId: f.uid, createdAt: Timestamp.now() });
  await foreign.collection('comments').doc('own').set({ authorId: f.uid, text: 'Remove own comment' });
  await f.finish(); assert.deepEqual((await own.get()).data(), purgedShoutContext);
  assert.equal((await own.collection('comments').doc('foreign').get()).get('text'), 'Preserve foreign comment');
  assert.equal((await own.collection('privateReplies').doc('foreign').get()).get('text'), 'Preserve foreign conversation');
  assert.deepEqual((await foreign.get()).data(), { authorId: 'foreign', likesCount: 0, savesCount: 0, commentsCount: 0 });
});

test('archived content, nested copied reactions/access audits and linked report text purge at the same deadline', { skip: !enabled }, async () => {
  const f = await fixture(), shoutId = randomUUID();
  const archive = await f.add(`accountContentArchive/${randomUUID()}`, { kind: 'comment', sourcePath: `shouts/${shoutId}/comments/parent`,
    subjectUserIds: [f.uid], content: { authorId: f.uid, text: 'Remove archived text' } });
  await archive.collection('reactions').doc('foreign').set({ actorId: 'foreign', content: { type: 'like' } });
  await archive.collection('accessAudits').doc('access').set({ actorId: 'foreign', retained: true });
  const report = await f.add(`commentReports/${randomUUID()}`, { reporterId: 'foreign', shoutId, commentId: 'parent', reason: 'Remove evidence' });
  const reply = await f.add(`shouts/${shoutId}/comments/reply`, { authorId: 'foreign', replyToCommentId: 'parent', replyToNickname: 'Old', text: '@Old Keep this body' });
  const copiedReply = await f.add(`accountContentArchive/${randomUUID()}`, { kind: 'comment', sourceShoutId: shoutId,
    subjectUserIds: ['foreign'], replyToCommentId: 'parent', content: { authorId: 'foreign', replyToCommentId: 'parent', replyToNickname: 'Old', text: '@Old Keep archived body' } });
  await f.finish(); assert.equal((await archive.get()).exists, false); assert.equal((await report.get()).exists, false);
  assert.equal((await archive.collection('reactions').doc('foreign').get()).exists, false);
  assert.equal((await archive.collection('accessAudits').doc('access').get()).exists, false);
  assert.deepEqual((await reply.get()).data(), { authorId: 'foreign', text: 'Keep this body' });
  assert.deepEqual((await copiedReply.get()).data().content, { authorId: 'foreign', text: 'Keep archived body' });
});

test('existing Auth, an Auth outage, and an active primary lease never permit destructive work', { skip: !enabled }, async () => {
  const f = await fixture(), before = await f.user.get();
  assert.equal((await f.run({ getUser: async () => ({ uid: f.uid }) })).state, 'auth-still-exists');
  await assert.rejects(f.run({ getUser: async () => { throw new Error('Auth unavailable'); } }), /Auth unavailable/);
  await f.mainRef.update({ leaseToken: 'active', leaseUntil: Timestamp.fromMillis(f.options.clock().getTime() + 60000) });
  assert.equal((await f.run()).state, 'busy'); assert.ok((await f.user.get()).updateTime.isEqual(before.updateTime));
});

test('Storage deletion uses a durable generation and recovers a lost acknowledgement without duplicate deletion', { skip: !enabled }, async () => {
  const f = await fixture(); f.files.set(`businessLogos/${f.uid}/logo-1.png`, '1'); f.files.set(`bugReports/${f.uid}/fixture/screenshot`, '2');
  f.bucket.loseAck = true;
  for (let n = 0; n < 20; n++) {
    try { await f.run(); f.advance(1000); }
    catch (error) { assert.match(error.message, /lost Storage acknowledgement/); break; }
  }
  assert.ok((await f.jobRef.get()).get('pendingFile'));
  f.advance(1000); const result = await f.finish(); assert.equal(result.storage, 2); assert.equal(f.bucket.deletes, 2); assert.equal(f.files.size, 0);
});

test('soft delete and a replaced request stop safely before deleting the protected data', { skip: !enabled }, async () => {
  const f = await fixture(); f.bucket.policy = { softDeletePolicy: { retentionDurationSeconds: '604800' } };
  const path = `businessLogos/${f.uid}/logo-1.png`; f.files.set(path, '1');
  let result; for (let n = 0; n < 20; n++) { result = await f.run(); if (result.state === 'needs-review') break; f.advance(1000); }
  assert.equal(result.state, 'needs-review'); assert.equal(f.files.get(path), '1'); assert.equal((await f.request.get()).exists, true);
  const replaced = await fixture(); await replaced.request.delete(); await replaced.request.set({ userId: replaced.uid, status: 'pending' });
  assert.equal((await replaced.run()).state, 'obsolete'); assert.equal((await replaced.user.get()).exists, true);
});

test('a replaced Storage generation survives and leaves the job for review', { skip: !enabled }, async () => {
  const f = await fixture(), path = `businessLogos/${f.uid}/logo-1.png`; f.files.set(path, '1');
  f.options.beforeCommit = async change => { if (change.operation === 'storage-delete') f.files.set(path, '2'); };
  let result; for (let n = 0; n < 20; n++) { result = await f.run(); if (result.state === 'needs-review') break; f.advance(1000); }
  assert.equal(result.state, 'needs-review'); assert.equal(f.files.get(path), '2'); assert.equal(f.bucket.deletes, 0);
});

test('concurrent workers cannot enter the same deletion and a taken-over lease fences the stale worker', { skip: !enabled }, async () => {
  for (const takeOver of [false, true]) {
    const f = await fixture(), shout = await f.add(`shouts/${randomUUID()}`, { authorId: 'foreign', likesCount: 1 });
    const vote = shout.collection('reactions').doc(f.uid); await vote.set({ userId: f.uid, type: 'like', updatedAt: Timestamp.now() });
    let injected = false;
    f.options.beforeCommit = async change => {
      if (change.operation !== 'reaction' || injected) return; injected = true;
      if (takeOver) await f.jobRef.update({ leaseToken: 'other-worker' });
      else assert.equal((await f.run()).state, 'busy');
    };
    const first = await f.run(); assert.ok(first.examined <= 50);
    if (takeOver) { assert.equal(first.state, 'lease-lost'); assert.equal((await vote.get()).exists, true); f.advance(120001); }
    f.options.beforeCommit = null; if (first.state !== 'purged') { f.advance(1000); await f.finish(); }
    assert.equal((await vote.get()).exists, false); assert.equal((await shout.get()).get('likesCount'), 0);
  }
});

test('a lost Firestore acknowledgement after a committed counter deletion never repeats the decrement', { skip: !enabled }, async () => {
  const f = await fixture(), shout = await f.add(`shouts/${randomUUID()}`, { authorId: 'foreign', likesCount: 1 });
  const vote = shout.collection('reactions').doc(f.uid); await vote.set({ userId: f.uid, type: 'like', updatedAt: Timestamp.now() });
  let lost = false;
  const proxy = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async work => { const result = await db.runTransaction(work);
      if (!lost && !(await vote.get()).exists) { lost = true; throw new Error('lost Firestore acknowledgement'); } return result; };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
  await assert.rejects(f.run(missing, f.options, proxy), /lost Firestore acknowledgement/);
  assert.equal((await shout.get()).get('likesCount'), 0); f.advance(1000); await f.finish();
  assert.equal((await shout.get()).get('likesCount'), 0);
});

test('reporter evidence copies are removed from a foreign case while its technical sanction remains', { skip: !enabled }, async () => {
  const f = await fixture(), report = await f.add(`reports/${randomUUID()}`, { reporterId: f.uid, shoutId: 'foreign', reason: 'Remove reporter text' });
  const sanction = await f.add(`sanctions/${randomUUID()}`, { userId: 'foreign', sourceReportId: report.id, reason: 'Remove reporter text',
    contentSnapshot: { reporterId: f.uid, text: 'Remove copied text' }, type: 'warning' });
  const clearance = await f.add(`moderationClearances/${randomUUID()}`, { sourceReportIds: [report.id, 'foreign-report'], reason: 'Remove copied note' });
  await f.finish(); assert.equal((await report.get()).exists, false);
  assert.deepEqual((await sanction.get()).data(), { userId: 'foreign', type: 'warning' });
  assert.deepEqual((await clearance.get()).data(), { sourceReportIds: ['foreign-report'] });
});

test('the cloud document pager explicitly disables auto-pagination and rejects oversized responses', { skip: !enabled }, async () => {
  const previous = process.env.FIRESTORE_EMULATOR_HOST; delete process.env.FIRESTORE_EMULATOR_HOST;
  const base = 'projects/shoutout-rules-test/databases/(default)/documents';
  try {
    let oversized = false;
    const client = { async listDocuments(request, options) {
      assert.equal(request.pageSize, 1); assert.equal(request.showMissing, true); assert.deepEqual(request.mask, { fieldPaths: [] });
      assert.equal(options.autoPaginate, false);
      return [Array.from({ length: oversized ? 2 : 1 }, (_, n) => ({ name: `${base}/users/fixture/legal/child${n}` })), null];
    } };
    const pager = createPurgeDocumentPager(db, { client });
    assert.deepEqual(await pager.list('users/fixture/legal'), { paths: ['users/fixture/legal/child0'], next: null });
    oversized = true; await assert.rejects(pager.list('users/fixture/legal'), /invalid-purge-list-response/); await pager.close();
  } finally { process.env.FIRESTORE_EMULATOR_HOST = previous; }
});

test('enabled moderation cleanup scrubs warning and active sanction copies without changing enforcement', { skip: !enabled }, async () => {
  for (const type of ['warning', 'accountBan', 'contentRestriction']) {
    const f = await fixture(); f.options.moderationCopiesEnabled = true;
    const target = randomUUID(), report = await f.add(`reports/${randomUUID()}`, { reporterId: f.uid, shoutId: 'foreign', reason: 'Copied reporter reason' });
    const sanction = await f.add(`sanctions/${randomUUID()}`, { userId: target, type, sourceReportId: report.id,
      reason: 'Copied reporter reason', contentSnapshot: { text: 'Copied evidence' } });
    const copyData = { userId: target, sanctionId: sanction.id, reason: 'Copied reporter reason', moderatorId: 'foreign-moderator',
      expiresAt: type === 'accountBan' ? null : Timestamp.fromMillis(9999999999999), createdAt: Timestamp.fromMillis(1234) };
    const copy = await f.add(type === 'warning' ? `warnings/${randomUUID()}` : `${type === 'accountBan' ? 'bans' : 'contentRestrictions'}/${target}`, copyData);
    const other = await f.add(`bans/${randomUUID()}`, { userId: 'unrelated', reason: 'Keep reason', sanctionId: 'unrelated-sanction' });
    const otherTime = (await other.get()).updateTime;
    await f.finish();
    const expectedCopy = { ...copyData }; delete expectedCopy.reason;
    assert.deepEqual((await copy.get()).data(), expectedCopy);
    assert.deepEqual((await sanction.get()).data(), { userId: target, type });
    assert.equal((await report.get()).exists, false);
    assert(otherTime.isEqual((await other.get()).updateTime));
  }
});

test('moderation copy scrub preserves a replacement active sanction installed before its transaction', { skip: !enabled }, async () => {
  const f = await fixture(); f.options.moderationCopiesEnabled = true;
  const target = randomUUID(), report = await f.add(`reports/${randomUUID()}`, { reporterId: f.uid, shoutId: 'foreign', reason: 'Old reason' });
  const sanction = await f.add(`sanctions/${randomUUID()}`, { userId: target, type: 'accountBan', sourceReportId: report.id, reason: 'Old reason' });
  const pointer = await f.add(`bans/${target}`, { userId: target, sanctionId: sanction.id, reason: 'Old reason', expiresAt: null });
  const replacement = { userId: target, sanctionId: randomUUID(), reason: 'New independent reason', expiresAt: null };
  let replaced = false;
  f.options.beforeCommit = async change => { if (!replaced && change.operation === 'copiedReport') { replaced = true; await pointer.set(replacement); } };
  await f.finish(); assert(replaced); assert.deepEqual((await pointer.get()).data(), replacement);
  assert.equal((await sanction.get()).get('reason'), undefined);
});

test('appended moderation reference stages resume an existing job without renumbering or lifting foreign restrictions', { skip: !enabled }, async () => {
  const f = await fixture(); f.options.pageSize = 1;
  const before = accountPurgeStages(f.uid), after = accountPurgeStages(f.uid, { moderationCopiesEnabled: true });
  assert.deepEqual(after.slice(0, before.length), before); assert.equal(after.length, before.length + 2);
  const copies = [];
  for (const c of ['bans', 'contentRestrictions']) copies.push(await f.add(`${c}/${randomUUID()}`, {
    userId: 'foreign', sanctionId: randomUUID(), moderatorId: f.uid, reason: 'Independent enforcement reason', expiresAt: null }));
  assert.equal((await f.run()).state, 'purging');
  // Represent an old job that really drained its previous final user stage.
  await f.user.collection('settings').doc('notifications').delete();
  await f.jobRef.update({ stage: before.length, stageCursor: null, selected: null, stack: [] });
  f.options.moderationCopiesEnabled = true;
  f.advance(1000);
  await f.finish();
  for (const copy of copies) { const data = (await copy.get()).data(); assert(data); assert.equal(data.moderatorId, undefined);
    assert.equal(data.reason, 'Independent enforcement reason'); assert.equal(data.expiresAt, null); assert(data.sanctionId); }
});

test('ambiguous moderation warning copies stop the purge before any evidence or reason is partially scrubbed', { skip: !enabled }, async () => {
  const f = await fixture(); f.options.moderationCopiesEnabled = true;
  const target = randomUUID(), report = await f.add(`reports/${randomUUID()}`, { reporterId: f.uid, shoutId: 'foreign', reason: 'Keep until reviewed' });
  const sanction = await f.add(`sanctions/${randomUUID()}`, { userId: target, type: 'warning', sourceReportId: report.id, reason: 'Keep until reviewed' });
  const copies = [];
  for (let i = 0; i < 2; i++) copies.push(await f.add(`warnings/${randomUUID()}`, { userId: target, sanctionId: sanction.id, reason: 'Keep until reviewed' }));
  let result;
  for (let n = 0; n < 20; n++) { result = await f.run(); if (result.state === 'needs-review') break; f.advance(1000); }
  assert.equal(result.state, 'needs-review'); assert((await report.get()).exists);
  assert.equal((await sanction.get()).get('reason'), 'Keep until reviewed');
  for (const copy of copies) assert.equal((await copy.get()).get('reason'), 'Keep until reviewed');
});

test('a concurrent moderation copy either precedes reporter purge and is drained, or is fenced without recreating evidence', { skip: !enabled }, async () => {
  const f = await fixture(); f.options.moderationCopiesEnabled = true;
  const report = await f.add(`reports/${randomUUID()}`, { reporterId: f.uid, shoutId: 'foreign', reason: 'Concurrent copied reason' });
  const target = randomUUID(), sanction = db.doc(`sanctions/${randomUUID()}`), warning = db.doc(`warnings/${randomUUID()}`);
  roots.push(sanction, warning);
  const beforeDeadline = Timestamp.fromMillis(f.identity.requestCreateTime.toMillis() + accountRetentionMillis - 1);
  const copy = db.runTransaction(async tx => {
    const source = await tx.get(report); if (!source.exists) throw new Error('source-already-purged');
    await assertReportEvidenceRetention(tx, db, { docs: [source] }, beforeDeadline);
    tx.create(sanction, { userId: target, type: 'warning', sourceReportId: report.id, reason: source.get('reason') });
    tx.create(warning, { userId: target, sanctionId: sanction.id, reason: source.get('reason') });
  });
  const [copied, purged] = await Promise.allSettled([copy, f.finish()]);
  assert.equal(purged.status, 'fulfilled');
  if (copied.status === 'rejected') assert(copied.reason.code === 'failed-precondition' || copied.reason.message === 'source-already-purged', copied.reason);
  assert.equal((await report.get()).exists, false);
  for (const ref of [sanction, warning]) assert.equal((await ref.get()).get('reason'), undefined);
  await assert.rejects(db.runTransaction(tx => assertReportEvidenceRetention(tx, db, { docs: [{ get: () => f.uid }] }, beforeDeadline)),
    error => error.code === 'failed-precondition');
});

test('resuming after the final profile drain never recreates notification preferences', { skip: !enabled }, async () => {
  const f = await fixture(); f.options.pageSize = 1; await f.run();
  const settings = f.user.collection('settings').doc('notifications'); assert.equal((await settings.get()).get('reactions'), false);
  await settings.delete(); await f.jobRef.update({ stage: accountPurgeStages(f.uid).length, stageCursor: null });
  f.advance(1000); assert.equal((await f.run()).state, 'purged');
  assert.equal((await settings.get()).exists, false); assert.equal((await f.user.get()).exists, false);
});
