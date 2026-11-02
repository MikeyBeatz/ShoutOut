import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { accountDeletionJobRef, runAccountShoutHidingJob as run } from './account_deletion_job.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'identity-worker-tests') : null;
const db = app ? getFirestore(app) : null, roots = [], owners = [];
const missing = { getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
after(async () => {
  if (!db) return;
  for (const uid of owners) for (const row of (await db.collection('accountContentArchive').where('retentionOwnerId', '==', uid).get()).docs) await db.recursiveDelete(row.ref);
  for (const root of roots) await db.recursiveDelete(root);
  await db.terminate(); await deleteApp(app);
});
async function fixture(logos = 5) {
  const uid = randomUUID(), key = `mvp_${uid.replaceAll('-', '').slice(0, 12)}`; owners.push(uid);
  const request = db.doc(`accountDeletionRequests/${uid}`), profile = db.doc(`publicProfiles/${uid}`), user = db.doc(`users/${uid}`),
    reservation = db.doc(`nicknames/${key}`), shout = db.doc(`shouts/${randomUUID()}`), context = db.doc(`shouts/${randomUUID()}`);
  roots.push(request, profile, user, reservation, shout, context);
  await request.set({ userId: uid, status: 'pending' });
  await user.set({ nickname: key, nicknameLower: key, avatarId: 'fox' });
  await user.collection('legal').doc('fixture').set({ retained: true });
  await user.collection('notifications').doc('owned').set({ text: 'fixture' });
  await reservation.set({ uid, nicknameLower: key, nickname: key, createdAt: Timestamp.now() });
  await profile.set({ nickname: key, avatarId: 'fox', publicRole: 'business', businessLogoPath: `businessLogos/${uid}/logo-1.png` });
  await shout.set({ authorId: uid, status: 'active', title: 'Owned fixture' });
  await context.set({ authorId: 'foreign', commentsCount: 2, title: 'Retain context' });
  await context.collection('comments').doc('own').set({ authorId: uid, text: 'Archive this comment', createdAt: Timestamp.now() });
  await context.collection('comments').doc('foreign').set({ authorId: 'foreign', text: 'Keep this comment', createdAt: Timestamp.now() });
  await context.collection('privateReplies').doc('incoming').set({ authorId: 'foreign', recipientId: uid, participants: ['foreign', uid], text: 'Archive this private reply', createdAt: Timestamp.now() });
  const identity = { projectId: db.projectId, userId: uid, requestCreateTime: (await request.get()).createTime };
  const jobRef = accountDeletionJobRef(db, identity); roots.push(jobRef);
  const files = new Map(); for (let n = 1; n <= logos; n++) files.set(`businessLogos/${uid}/logo-${n}.png`, {
    generation: '1', metageneration: '1', metadata: { firebaseStorageDownloadTokens: `token-${n}`, retained: 'yes' },
  });
  files.set('businessLogos/foreign/logo-1.png', { generation: '1', metageneration: '1', metadata: { firebaseStorageDownloadTokens: 'foreign-token' } });
  const storage = { files, writes: 0, pages: [], loseAck: false, beforePatch: null, versioning: false, failure: null };
  const bucket = { name: 'shoutout-rules-test.appspot.com', async getMetadata() { return [{ versioning: { enabled: storage.versioning } }]; },
    async getFiles(query) {
      storage.pages.push(query); const all = [...files.keys()].filter(p => p.startsWith(query.prefix) && (!query.pageToken || p > query.pageToken)).sort();
      const page = all.slice(0, query.maxResults); return [page.map(name => ({ name })), all.length > page.length ? { pageToken: page.at(-1) } : null];
    }, file(path) { return { async getMetadata() {
      if (storage.failure) throw storage.failure;
      if (!files.has(path)) throw Object.assign(new Error('absent'), { code: 404 });
      return [globalThis.structuredClone(files.get(path))];
    }, async setMetadata(patch, conditions) {
      if (storage.beforePatch) await storage.beforePatch();
      const metadata = files.get(path);
      assert.equal(conditions.ifGenerationMatch, metadata.generation); assert.equal(conditions.ifMetagenerationMatch, metadata.metageneration);
      assert.deepEqual(patch, { metadata: { firebaseStorageDownloadTokens: null } });
      delete metadata.metadata.firebaseStorageDownloadTokens; metadata.metageneration = String(Number(metadata.metageneration) + 1); storage.writes++;
      if (storage.loseAck) { storage.loseAck = false; throw new Error('lost Storage acknowledgement'); }
    } }; } };
  let millis = Date.now(); const options = { leaseMillis: 60000, retryDelayMillis: 1000, authWaitMillis: 86400000, pageSize: 2,
    privateCleanupEnabled: true, contentArchiveEnabled: true, confirmAuthDeletionEnabled: true, publicIdentityEnabled: true, logoBucket: bucket, clock: () => new Date(millis) };
  const f = { uid, key, request, profile, user, reservation, shout, context, identity, jobRef, options, storage, bucket,
    tick: (n = 1000) => { millis += n; }, run: (auth = missing, database = db, opts = options) => run(identity, database, auth, opts) };
  f.finish = async () => { for (let step = 0; step < 30; step++) { f.tick(); const result = await f.run(); if (result.state === 'content-archived') return result; } assert.fail('bounded fixture did not finish'); };
  return f;
}

test('v4 masks before content, keeps the original reservation, pages only owned logos and finishes the v3 content path', { skip: !enabled }, async () => {
  const f = await fixture(), nameBefore = await f.reservation.get();
  assert.equal((await f.run()).state, 'revoking-logos');
  assert.deepEqual((await f.profile.get()).data(), { schemaVersion: 1, accountStatus: 'deleted' });
  assert.equal((await f.shout.get()).data().status, 'active');
  const masked = await f.profile.get(), result = await f.finish(), job = (await f.jobRef.get()).data();
  assert.equal(result.state, 'content-archived'); assert.equal(job.schemaVersion, 4); assert.equal(job.logoProcessedCount, 5);
  assert.equal(job.reservationKey, f.key); assert.equal(job.retainUntil.toMillis(), f.identity.requestCreateTime.toMillis() + 60 * 86400000);
  assert.ok((await f.reservation.get()).updateTime.isEqual(nameBefore.updateTime)); assert.ok((await f.profile.get()).updateTime.isEqual(masked.updateTime));
  assert.equal((await f.shout.get()).data().status, 'deleted'); assert.equal(job.archivedCommentCount, 1); assert.equal(job.archivedMessageCount, 1);
  assert.equal((await f.context.get()).data().commentsCount, 1); assert.equal((await f.context.collection('comments').doc('foreign').get()).exists, true);
  for (const [path, metadata] of f.storage.files) assert.equal(Boolean(metadata.metadata.firebaseStorageDownloadTokens), path.includes('/foreign/'));
  assert.equal(f.storage.writes, 5); assert.ok(f.storage.pages.every(q => q.prefix === `businessLogos/${f.uid}/` && q.maxResults <= 2 && q.autoPaginate === false));
  assert.equal((await f.run({ getUser() { assert.fail('terminal replay must not call Auth'); } })).state, 'content-archived');
});

test('enabled worker retires both role stores before masking and preserves original security metadata', { skip: !enabled }, async () => {
  const f = await fixture(0), role = db.doc(`accountRoles/${f.uid}`), legacy = db.doc(`moderators/${f.uid}`);
  roots.push(role, legacy);
  await role.set({ role: 'administrator', level: 5, grantedBy: 'fixture' });
  await legacy.set({ grantedBy: 'fixture' });
  f.options.retireRolePrivilegesEnabled = true;
  await f.run({ getUser: async () => ({ uid: f.uid }) });
  assert.equal((await role.get()).data().accountStatus, undefined);
  f.tick(); await f.run();
  assert.deepEqual((await role.get()).data(), { role: 'administrator', level: 5, grantedBy: 'fixture', accountStatus: 'deleted' });
  assert.deepEqual((await legacy.get()).data(), { grantedBy: 'fixture', accountStatus: 'deleted' });
  assert.equal((await f.profile.get()).data().accountStatus, 'deleted');
  assert.ok((await f.request.get()).data().rolesRetiredAt instanceof Timestamp);
  const before = await role.get(); await f.finish();
  assert.ok((await role.get()).updateTime.isEqual(before.updateTime));
});
test('v4 zero-logo accounts complete and an Auth-present account is never masked', { skip: !enabled }, async () => {
  const f = await fixture(0), before = await f.profile.get();
  assert.equal((await f.run({ getUser: async () => ({ uid: f.uid }) })).state, 'waiting-auth');
  assert.ok((await f.profile.get()).updateTime.isEqual(before.updateTime));
  assert.equal((await f.request.get()).data().authDeletionConfirmedAt, undefined);
  await f.finish(); assert.equal((await f.jobRef.get()).data().logoProcessedCount, 0);
});
test('one invocation never processes more than the existing 50-object budget and resumes a second page', { skip: !enabled }, async () => {
  const f = await fixture(51); f.options.pageSize = 50; await f.run(); f.tick();
  const first = await f.run(); assert.equal(first.examined, 50); assert.equal(f.storage.writes, 50);
  assert.equal((await f.jobRef.get()).data().logoProcessedCount, 50);
  await f.finish(); assert.equal((await f.jobRef.get()).data().logoProcessedCount, 51); assert.equal(f.storage.writes, 51);
  assert.ok(f.storage.pages.every(q => q.maxResults <= 50));
});
test('a lost Storage acknowledgement resumes the same pending path without double counting or rewriting the public marker', { skip: !enabled }, async () => {
  const f = await fixture(3); await f.run(); const masked = await f.profile.get(); f.tick(); f.storage.loseAck = true;
  await assert.rejects(f.run(), /lost Storage/); assert.equal((await f.jobRef.get()).data().logoProcessedCount, 0);
  await f.finish(); assert.equal((await f.jobRef.get()).data().logoProcessedCount, 3); assert.equal(f.storage.writes, 3);
  assert.ok((await f.profile.get()).updateTime.isEqual(masked.updateTime));
});
test('a lost checkpoint acknowledgement resumes after the committed head without counting a logo twice', { skip: !enabled }, async () => {
  const f = await fixture(3); await f.run(); f.tick(); let failed = false;
  const proxy = { projectId: db.projectId, doc: db.doc.bind(db), collection: db.collection.bind(db),
    async runTransaction(...args) { const result = await db.runTransaction(...args), job = (await f.jobRef.get()).data();
      if (!failed && job.logoProcessedCount === 1 && job.leaseToken) { failed = true; throw new Error('lost checkpoint acknowledgement'); } return result;
    } };
  await assert.rejects(f.run(missing, proxy), /lost checkpoint/); assert.equal((await f.jobRef.get()).data().logoProcessedCount, 1);
  await f.finish(); assert.equal((await f.jobRef.get()).data().logoProcessedCount, 3); assert.equal(f.storage.writes, 3);
});
test('a lost page checkpoint acknowledgement reuses its stored paths/cursor instead of listing or counting them twice', { skip: !enabled }, async () => {
  const f = await fixture(1); await f.run(); f.tick(); let failed = false;
  const proxy = { projectId: db.projectId, doc: db.doc.bind(db), collection: db.collection.bind(db),
    async runTransaction(...args) { const result = await db.runTransaction(...args), job = (await f.jobRef.get()).data();
      if (!failed && job.logoPageLoaded && job.logoProcessedCount === 0 && job.leaseToken) { failed = true; throw new Error('lost page acknowledgement'); } return result;
    } };
  await assert.rejects(f.run(missing, proxy), /lost page/); assert.equal(f.storage.pages.length, 1);
  await f.finish(); assert.equal(f.storage.pages.length, 1); assert.equal(f.storage.writes, 1);
  assert.equal((await f.jobRef.get()).data().logoProcessedCount, 1);
});
test('lost public-mask acknowledgement keeps its marker/progress and missing logos are checked no-ops while 403 goes to review', { skip: !enabled }, async () => {
  const f = await fixture(1); let failed = false;
  const proxy = { projectId: db.projectId, doc: db.doc.bind(db), collection: db.collection.bind(db),
    async runTransaction(...args) { const result = await db.runTransaction(...args), job = (await f.jobRef.get()).data();
      if (!failed && job.workStage === 'logos' && job.leaseToken) { failed = true; throw new Error('lost mask acknowledgement'); } return result;
    } };
  await assert.rejects(f.run(missing, proxy), /lost mask/); const masked = await f.profile.get();
  f.tick(); f.storage.failure = Object.assign(new Error('denied'), { code: 403 });
  assert.equal((await f.run()).state, 'needs-review'); assert.equal((await f.jobRef.get()).data().logoProcessedCount, 0);
  assert.ok((await f.profile.get()).updateTime.isEqual(masked.updateTime));
  const g = await fixture(1); await g.run(); g.tick();
  const getFiles = g.bucket.getFiles; g.bucket.getFiles = async query => { const result = await getFiles(query);
    g.storage.files.delete(`businessLogos/${g.uid}/logo-1.png`); return result; };
  await g.finish(); assert.equal((await g.jobRef.get()).data().logoProcessedCount, 1); assert.equal(g.storage.writes, 0);
});
test('an in-flight stale Storage patch never advances progress after lease takeover and its successor safely resumes', { skip: !enabled }, async () => {
  const f = await fixture(1); await f.run(); f.tick(); let changed = false;
  f.storage.beforePatch = async () => { if (!changed) { changed = true; await f.jobRef.update({ leaseToken: 'successor' }); } };
  assert.equal((await f.run()).state, 'lease-lost'); assert.equal((await f.jobRef.get()).data().logoProcessedCount, 0);
  f.tick(60001); await f.finish(); assert.equal((await f.jobRef.get()).data().logoProcessedCount, 1); assert.equal(f.storage.writes, 1);
});
test('foreign reservation, unexpected public fields, versioned buckets and unknown logo paths stop safely for review', { skip: !enabled }, async () => {
  for (const kind of ['reservation', 'profile', 'versioning', 'path']) {
    const f = await fixture(1);
    if (kind === 'reservation') await f.reservation.update({ uid: 'foreign' });
    if (kind === 'profile') await f.profile.update({ unexpected: 'preserve' });
    if (['reservation', 'profile'].includes(kind)) { assert.equal((await f.run()).state, 'needs-review'); assert.equal((await f.profile.get()).data().nickname, f.key); }
    else {
      await f.run(); f.tick();
      if (kind === 'versioning') f.storage.versioning = true;
      else f.storage.files.set(`businessLogos/${f.uid}/unexpected/file`, { metadata: {} });
      assert.equal((await f.run()).state, 'needs-review');
    }
    assert.equal(f.storage.writes, 0); assert.equal((await f.shout.get()).data().status, 'active');
  }
});
test('disabling v4 pauses existing work and enabling it never migrates an in-progress or completed v3 job', { skip: !enabled }, async () => {
  const f = await fixture(1); await f.run(); const before = await f.jobRef.get();
  assert.equal((await f.run({ getUser() { assert.fail('paused'); } }, db, { ...f.options, publicIdentityEnabled: false })).state, 'identity-disabled');
  assert.ok((await f.jobRef.get()).updateTime.isEqual(before.updateTime));
  const old = await fixture(0), opts = { ...old.options, publicIdentityEnabled: false };
  await old.run(missing, db, opts); assert.equal((await old.jobRef.get()).data().schemaVersion, 3);
  old.tick(); await old.run(); assert.equal((await old.jobRef.get()).data().schemaVersion, 3);
  assert.equal((await old.profile.get()).data().nickname, old.key);
  await old.finish(); assert.equal((await old.run({ getUser() { assert.fail('completed v3 replay'); } })).state, 'content-archived');
  assert.equal((await old.jobRef.get()).data().publicIdentityMaskedAt, undefined);
});
test('the v4 switch also preserves completed v1 and in-progress v2 jobs', { skip: !enabled }, async () => {
  for (const version of [1, 2]) {
    const f = await fixture(0); await f.run(missing, db, { ...f.options, publicIdentityEnabled: false,
      privateCleanupEnabled: version === 2, contentArchiveEnabled: false });
    f.tick(); await f.run(); assert.equal((await f.jobRef.get()).data().schemaVersion, version);
    assert.equal((await f.profile.get()).data().nickname, f.key); assert.equal(f.storage.writes, 0);
  }
});
