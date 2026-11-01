import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { encodeGeohash } from './geohash.js';
import { accountDeletionEventIdentity } from './account_deletion_event.js';
import { accountDeletionJobRef, runAccountDeletionCreatedEvent as run, runAccountShoutHidingJob } from './account_deletion_job.js';
import { scanDueAccountDeletionJobs as scan } from './account_deletion_job_scan.js';
import { cleanupAccountPrivatePageLab as cleanPrivate } from './account_private_cleanup_lab.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'account-job-tests') : null;
const db = app ? getFirestore(app) : null, namespaces = [], refs = [], privateRoots = [];
const missingAuth = { getUser() { throw Object.assign(new Error('not-found'), { code: 'auth/user-not-found' }); } };
after(async () => {
  if (!app) return;
  for (const namespace of namespaces) await db.recursiveDelete(db.collection('feedIndexLab').doc(namespace));
  for (const ref of refs) await ref.delete();
  for (const ref of privateRoots) await db.recursiveDelete(ref);
  await db.terminate(); await deleteApp(app);
});

async function fixture(own = 3) {
  const uid = randomUUID(), foreignUid = randomUUID(), namespace = `job-${randomUUID().slice(0, 8)}`; namespaces.push(namespace);
  const location = { latitude: 50.08, longitude: 14.44 };
  const rows = Array.from({ length: own + 2 }, (_, i) => ({ id: `row-${String(i).padStart(3, '0')}`,
    authorId: i < own ? uid : foreignUid, status: 'active', location,
    geohash: encodeGeohash(location.latitude, location.longitude), createdAt: 0, expiresAt: 10000,
    likesCount: 0, dislikesCount: 0, categories: ['Dotaz'] }));
  const lab = createLabBlockIndex(db, { namespace }); await lab.seed(rows);
  const requestRef = db.doc(`accountDeletionRequests/${uid}`); refs.push(requestRef);
  await requestRef.set({ userId: uid, status: 'pending', email: 'not-copied@example.test' });
  const event = { params: { userId: uid }, data: await requestRef.get() };
  const scoped = { projectId: db.projectId,
    doc: path => path.startsWith('accountDeletionJobs/') ? lab.base.collection('jobs').doc(path.split('/')[1])
      : path === 'maintenanceState/accountDeletionShoutJobs' ? lab.base.collection('maintenance').doc('scan') : db.doc(path),
    runTransaction: db.runTransaction.bind(db),
    getAll: db.getAll.bind(db),
    collection: name => name === 'shouts' ? lab.base.collection('source')
      : name === 'accountDeletionJobs' ? lab.base.collection('jobs') : db.collection(name) };
  const jobRef = accountDeletionJobRef(scoped, accountDeletionEventIdentity(event, scoped)); refs.push(jobRef);
  let millis = Date.now();
  const options = { leaseMillis: 60000, retryDelayMillis: 1000, authWaitMillis: 10000,
    clock: () => new Date(millis), indexWriter: lab, pageSize: 2 };
  return { uid, foreignUid, event, db: scoped, lab, requestRef, jobRef, options, tick: delta => { millis += delta; } };
}

test('job records atomic progress, defers retries, completes and replays without more Auth reads', { skip: !enabled }, async () => {
  const f = await fixture(), requestBefore = (await f.requestRef.get()).data();
  const first = await run(f.event, f.db, missingAuth, f.options);
  assert.equal(first.state, 'hiding-shouts'); assert.equal(first.hiddenCount, 2);
  const job = (await f.jobRef.get()).data();
  assert.equal(job.hiddenCount, 2); assert.equal(job.attempts, 1); assert.equal(job.leaseToken, null);
  assert.equal(job.retainUntil.toMillis() - job.requestCreateTime.toMillis(), 60 * 24 * 60 * 60 * 1000);
  for (const field of ['email', 'nickname', 'text', 'location', 'errorMessage']) assert.equal(field in job, false);
  assert.equal((await run(f.event, f.db, { getUser() { assert.fail('deferred job'); } }, f.options)).state, 'deferred');
  f.tick(1000);
  const last = await run(f.event, f.db, missingAuth, f.options);
  assert.equal(last.state, 'shouts-hidden'); assert.equal(last.hiddenCount, 3);
  assert.equal((await f.jobRef.get()).data().attempts, 2);
  assert.equal((await run(f.event, f.db, { getUser() { assert.fail('completed job'); } }, f.options)).state, 'shouts-hidden');
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 3);
  assert.deepEqual((await f.requestRef.get()).data(), requestBefore);
});

test('active lease prevents duplicate workers from entering Auth', { skip: !enabled }, async () => {
  const f = await fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers();
  const worker = run(f.event, f.db, { async getUser() { entered.resolve(); await release.promise; return missingAuth.getUser(); } }, f.options);
  await entered.promise;
  try {
    assert.equal((await run(f.event, f.db, { getUser() { assert.fail('leased job'); } }, f.options)).state, 'busy');
    assert.equal((await f.jobRef.get()).data().attempts, 1);
  } finally { release.resolve(); }
  assert.equal((await worker).hiddenCount, 2);
});

test('expired lease can be taken over after partial progress and fences the old worker', { skip: !enabled }, async () => {
  const f = await fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers(); let seen = 0;
  const worker = run(f.event, f.db, missingAuth, { ...f.options, pageSize: 3, async beforeTransaction() {
    if (++seen === 2) { entered.resolve(); await release.promise; }
  } });
  await entered.promise;
  let completed;
  try {
    assert.equal((await f.jobRef.get()).data().hiddenCount, 1);
    f.tick(f.options.leaseMillis + 1);
    const successor = await run(f.event, f.db, missingAuth, { ...f.options, pageSize: 50 });
    assert.equal(successor.state, 'shouts-hidden'); assert.equal(successor.hiddenCount, 3);
    completed = (await f.jobRef.get()).data();
  } finally { release.resolve(); }
  assert.equal((await worker).state, 'lease-lost');
  assert.deepEqual((await f.jobRef.get()).data(), completed);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 3);
});

test('index failure preserves earlier atomic progress and persists only a sanitized retry code', { skip: !enabled }, async () => {
  const f = await fixture(); let planned = 0;
  const indexWriter = { async prepare(...args) {
    const plan = await f.lab.prepare(...args), fail = ++planned === 2;
    return { apply() { plan.apply(); if (fail) throw new Error('sensitive provider detail'); } };
  } };
  await assert.rejects(run(f.event, f.db, missingAuth, { ...f.options, indexWriter }), /sensitive provider detail/);
  const job = (await f.jobRef.get()).data();
  assert.equal(job.phase, 'retry'); assert.equal(job.hiddenCount, 1); assert.equal(job.leaseToken, null);
  assert.equal(job.lastErrorCode, 'processing-failed'); assert(!JSON.stringify(job).includes('sensitive provider detail'));
  assert.equal((await f.lab.audit()).activeMetadata, 4);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 1);
  f.tick(1000);
  assert.equal((await run(f.event, f.db, missingAuth, { ...f.options, pageSize: 50 })).hiddenCount, 3);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
});

test('permanent permission failures stop automatic retries and preserve all source data', { skip: !enabled }, async () => {
  for (const code of ['auth/insufficient-permission', 'auth/invalid-credential', 'permission-denied', 7]) {
    const f = await fixture();
    const auth = { getUser() { throw Object.assign(new Error('private provider detail'), { code }); } };
    const result = await run(f.event, f.db, auth, f.options);
    assert.equal(result.state, 'needs-review'); assert.equal(result.hiddenCount, 0);
    const before = (await f.jobRef.get()).data();
    assert.equal(before.nextAttemptAt, null); assert.equal(before.leaseToken, null);
    assert.equal(before.lastErrorCode, 'processing-failed');
    assert(!JSON.stringify(before).includes('private provider detail'));
    f.tick(25000);
    assert.equal((await run(f.event, f.db, { getUser() { assert.fail('terminal job'); } }, f.options)).state, 'needs-review');
    assert.deepEqual((await f.jobRef.get()).data(), before);
    assert.equal((await scan(f.db, missingAuth, { ...f.options, maxJobs: 1 })).scanned, 0);
    assert.equal((await f.lab.audit()).activeMetadata, 5);
  }
});

test('temporary or unknown processing failures retry only within the existing Auth wait window', { skip: !enabled }, async () => {
  for (const code of ['auth/internal-error', 'unavailable', 14, undefined]) {
    const f = await fixture();
    const auth = { getUser() { throw Object.assign(new Error('temporary provider failure'), { code }); } };
    await assert.rejects(run(f.event, f.db, auth, f.options), /temporary provider failure/);
    assert.equal((await f.jobRef.get()).data().phase, 'retry');
    f.tick(f.options.retryDelayMillis);
    const retry = await scan(f.db, auth, { ...f.options, maxJobs: 1 });
    assert.equal(retry.failed, 1);
    assert.equal((await f.jobRef.get()).data().phase, 'retry');
    f.tick(f.options.authWaitMillis);
    const review = await scan(f.db, auth, { ...f.options, maxJobs: 1 });
    assert.equal(review.needsReview, 1); assert.equal(review.failed, 0);
    const job = (await f.jobRef.get()).data();
    assert.equal(job.phase, 'needs-review'); assert.equal(job.nextAttemptAt, null);
    assert.equal(job.hiddenCount, 0); assert.equal((await f.lab.audit()).activeMetadata, 5);
  }
});

test('waiting for Auth is bounded by explicit lab policy and never deletes an existing Auth account', { skip: !enabled }, async () => {
  const f = await fixture(), present = { async getUser(uid) { return { uid }; } };
  assert.equal((await run(f.event, f.db, present, f.options)).state, 'waiting-auth');
  f.tick(f.options.authWaitMillis);
  assert.equal((await run(f.event, f.db, present, f.options)).state, 'needs-review');
  assert.equal((await f.jobRef.get()).data().nextAttemptAt, null);
  assert.equal((await run(f.event, f.db, { getUser() { assert.fail('review job'); } }, f.options)).state, 'needs-review');
  assert.equal((await f.lab.audit()).activeMetadata, 5);
});

test('replacing a waiting request obsoletes its job and gives the new request a different job', { skip: !enabled }, async () => {
  const f = await fixture();
  await run(f.event, f.db, { getUser: async uid => ({ uid }) }, f.options);
  await f.requestRef.delete(); await f.requestRef.set({ userId: f.uid, status: 'pending' });
  assert.equal((await run(f.event, f.db, { getUser() { assert.fail('old request'); } }, f.options)).state, 'ignored');
  assert.equal((await f.jobRef.get()).data().phase, 'obsolete');
  assert.equal((await f.jobRef.get()).data().nextAttemptAt, null);
  const nextEvent = { params: { userId: f.uid }, data: await f.requestRef.get() };
  const nextRef = accountDeletionJobRef(f.db, accountDeletionEventIdentity(nextEvent, f.db)); refs.push(nextRef);
  assert.notEqual(nextRef.id, f.jobRef.id);
  assert.equal((await run(nextEvent, f.db, missingAuth, { ...f.options, pageSize: 50 })).hiddenCount, 3);
  assert.equal((await f.jobRef.get()).data().hiddenCount, 0);
});

test('request revoked during Auth verification ends its job without hiding', { skip: !enabled }, async () => {
  const f = await fixture();
  const result = await run(f.event, f.db, { async getUser() { await f.requestRef.delete(); return missingAuth.getUser(); } }, f.options);
  assert.equal(result.state, 'obsolete'); assert.equal(result.hiddenCount, 0);
  assert.equal((await f.lab.audit()).activeMetadata, 5);
});

test('full 50-source page keeps a continuation until an empty confirmation page', { skip: !enabled }, async t => {
  const f = await fixture(50), started = Date.now();
  const first = await run(f.event, f.db, missingAuth, { ...f.options, pageSize: 50 });
  assert.equal(first.state, 'hiding-shouts'); assert.equal(first.examined, 50); assert.equal(first.hiddenCount, 50);
  f.tick(1000);
  const last = await run(f.event, f.db, missingAuth, { ...f.options, pageSize: 50 });
  assert.equal(last.state, 'shouts-hidden'); assert.equal(last.examined, 0); assert.equal(last.hiddenCount, 50);
  assert.equal((await f.lab.audit()).activeMetadata, 2);
  t.diagnostic(JSON.stringify({ sources: 50, elapsedMillis: Date.now() - started }));
});

test('malformed job state is rejected rather than overwritten', { skip: !enabled }, async () => {
  const f = await fixture(); await f.jobRef.set({ schemaVersion: 99 });
  await assert.rejects(run(f.event, f.db, { getUser() { assert.fail('invalid job'); } }, f.options), /invalid-account-deletion-job-state/);
  assert.deepEqual((await f.jobRef.get()).data(), { schemaVersion: 99 });
  assert.equal((await f.lab.audit()).activeMetadata, 5);
});

test('job requires explicit timing configuration before any database access', async () => {
  for (const options of [{}, { leaseMillis: 0, retryDelayMillis: 1, authWaitMillis: 1 }]) {
    await assert.rejects(runAccountShoutHidingJob({}, {}, {}, options), /invalid-account-deletion-job-options/);
  }
});

test('recovery scan resumes due work across bounded pages and excludes terminal jobs', { skip: !enabled }, async () => {
  const f = await fixture();
  await run(f.event, f.db, { getUser: async uid => ({ uid }) }, f.options);
  assert.equal((await scan(f.db, missingAuth, { ...f.options, maxJobs: 1 })).scanned, 0);
  f.tick(1000);
  const first = await scan(f.db, missingAuth, { ...f.options, maxJobs: 1 });
  assert.equal(first.scanned, 1); assert.equal(first.hidden, 2); assert.equal(first.failed, 0);
  f.tick(1000);
  const last = await scan(f.db, missingAuth, { ...f.options, maxJobs: 1 });
  assert.equal(last.hidden, 1); assert.equal(last.shoutsHidden, 1);
  assert.equal((await scan(f.db, missingAuth, { ...f.options, maxJobs: 1 })).scanned, 0);
  assert.equal((await f.jobRef.get()).data().hiddenCount, 3);
});

test('scan rotates past malformed due records instead of starving a valid job', { skip: !enabled }, async () => {
  const f = await fixture();
  await run(f.event, f.db, { getUser: async uid => ({ uid }) }, f.options);
  const malformed = f.db.collection('accountDeletionJobs').doc('0'.repeat(64));
  await malformed.set({ userId: f.foreignUid, requestCreateTime: f.event.data.createTime,
    nextAttemptAt: Timestamp.fromMillis(f.options.clock().getTime() - 2000), schemaVersion: 99 });
  f.tick(1000);
  const failed = await scan(f.db, missingAuth, { ...f.options, maxJobs: 1 });
  assert.equal(failed.failed, 1);
  const next = await scan(f.db, missingAuth, { ...f.options, maxJobs: 1, pageSize: 50 });
  assert.equal(next.shoutsHidden, 1); assert.equal(next.hidden, 3);
  assert.equal((await malformed.get()).data().schemaVersion, 99);
});

test('scan returns aggregate errors without sensitive provider details', { skip: !enabled }, async () => {
  const f = await fixture();
  await run(f.event, f.db, { getUser: async uid => ({ uid }) }, f.options); f.tick(1000);
  const result = await scan(f.db, { getUser() { throw new Error('private-email@example.test'); } }, { ...f.options, maxJobs: 1 });
  assert.equal(result.failed, 1); assert(!JSON.stringify(result).includes('private-email'));
  assert.equal((await f.jobRef.get()).data().lastErrorCode, 'processing-failed');
});

test('empty idle scan performs no maintenance writes', { skip: !enabled }, async () => {
  const f = await fixture(), checkpoint = f.db.doc('maintenanceState/accountDeletionShoutJobs');
  assert.equal((await scan(f.db, missingAuth, { ...f.options, maxJobs: 1 })).scanned, 0);
  assert.equal((await checkpoint.get()).exists, false);
});

test('scan rejects invalid work configuration before reading the database', async () => {
  for (const options of [{}, { maxJobs: 1, clock: () => new Date() }]) {
    await assert.rejects(scan({}, {}, options), /invalid-account-deletion-job-scan-options/);
  }
});

async function privateFixture() {
  const f = await fixture();
  await run(f.event, f.db, missingAuth, { ...f.options, pageSize: 50 });
  const user = db.doc(`users/${f.uid}`); privateRoots.push(user);
  await user.set({ nickname: 'Retained nickname', email: 'retained@example.test' });
  await user.collection('legal').doc('acceptance').set({ retained: true });
  await user.collection('notifications').doc('n1').set({ targetTitle: 'Private inbox' });
  await user.collection('notifications').doc('n2').set({ targetTitle: 'Private inbox 2' });
  await user.collection('following').doc('other').set({ targetUserId: 'other' });
  await user.collection('blocked').doc('other').set({ createdAt: Timestamp.now() });
  const identity = accountDeletionEventIdentity(f.event, f.db);
  return { ...f, user, identity };
}

test('private leaf cleanup drains bounded pages and preserves profile, legal data and job progress', { skip: !enabled }, async () => {
  const f = await privateFixture(), before = (await f.jobRef.get()).data();
  const first = await cleanPrivate(f.identity, f.db, missingAuth, { pageSize: 2 });
  assert.equal(first.deleted, 2); assert.equal(first.needsAnotherPage, true);
  const next = await cleanPrivate(f.identity, f.db, missingAuth, { pageSize: 2 });
  assert.equal(next.deleted, 2);
  const last = await cleanPrivate(f.identity, f.db, missingAuth);
  assert.equal(last.state, 'private-leaves-cleaned'); assert.equal(last.deleted, 0); assert.equal(last.settingsChanged, false);
  assert.deepEqual((await f.user.get()).data(), { nickname: 'Retained nickname', email: 'retained@example.test' });
  assert.equal((await f.user.collection('legal').doc('acceptance').get()).exists, true);
  assert(Object.values((await f.user.collection('settings').doc('notifications').get()).data()).every(value => value === false));
  assert.deepEqual((await f.jobRef.get()).data(), before);
});

test('private cleanup requires missing Auth and the same completed hiding request', { skip: !enabled }, async () => {
  const f = await privateFixture();
  const waiting = await cleanPrivate(f.identity, f.db, { getUser: async uid => ({ uid }) });
  assert.equal(waiting.state, 'waiting-for-auth-deletion');
  assert.equal((await f.user.collection('settings').doc('notifications').get()).exists, false);
  await f.requestRef.delete(); await f.requestRef.set({ userId: f.uid, status: 'pending' });
  await assert.rejects(cleanPrivate(f.identity, f.db, missingAuth), /account-deletion-request-replaced/);
  assert.equal((await f.user.collection('notifications').get()).size, 2);
});

test('private cleanup uses updateTime guards and retries a changed page without partial deletes', { skip: !enabled }, async () => {
  const f = await privateFixture();
  const conflict = await cleanPrivate(f.identity, f.db, missingAuth, { async beforeCommit(refs) { await refs[0].update({ concurrentlyUpdated: true }); } });
  assert.equal(conflict.conflict, true); assert.equal(conflict.deleted, 0);
  assert.equal((await f.user.collection('notifications').get()).size, 2);
  assert.equal((await cleanPrivate(f.identity, f.db, missingAuth)).deleted, 4);
});

test('unexpected nested private data is preserved for review', { skip: !enabled }, async () => {
  const f = await privateFixture(), parent = f.user.collection('notifications').doc('n1');
  await parent.collection('unexpected').doc('child').set({ keep: true });
  await assert.rejects(cleanPrivate(f.identity, f.db, missingAuth), /unexpected-private-subcollections/);
  assert.equal((await parent.get()).exists, true);
  assert.equal((await parent.collection('unexpected').doc('child').get()).exists, true);
});

test('unknown private notification settings stop cleanup without dropping their contents', { skip: !enabled }, async () => {
  const f = await privateFixture(), settings = f.user.collection('settings').doc('notifications');
  await settings.set({ constructor: 'preserve-unknown-data' });
  await assert.rejects(cleanPrivate(f.identity, f.db, missingAuth), /unknown-notification-settings/);
  assert.deepEqual((await settings.get()).data(), { constructor: 'preserve-unknown-data' });
  assert.equal((await f.user.collection('notifications').get()).size, 2);
});

test('private cleanup prototype refuses live databases', async () => {
  for (const projectId of ['shoutout-dev-46c81', 'shoutout-production-a1b34']) {
    await assert.rejects(cleanPrivate({}, { projectId }, {}), /account-private-cleanup-emulator-required/);
  }
});

