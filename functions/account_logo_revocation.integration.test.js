import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { listDeletedAccountLogosLab as list, revokeDeletedAccountLogoLab as revoke } from './account_logo_revocation_lab.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080' &&
  process.env.FIREBASE_STORAGE_EMULATOR_HOST === '127.0.0.1:9199';
let app, db, bucket;
const projectId = 'shoutout-rules-test', bucketName = `${projectId}.appspot.com`;
const path = 'businessLogos/logoOwner/logo-1.png', token = 'local-fixture-token';
const missingAuth = { async getUser() { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); } };
const oldUrl = `http://127.0.0.1:9199/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
before(async () => {
  if (!enabled) return;
  app = initializeApp({ projectId, storageBucket: bucketName }, 'logo-revocation-tests');
  db = getFirestore(app); bucket = getStorage(app).bucket();
});
async function clear() {
  for (const collection of ['accountDeletionRequests', 'publicProfiles', 'logoRevocationLab']) {
    await db.recursiveDelete(db.doc(`${collection}/logoOwner`));
  }
  // Only this suite's explicit fixture objects; never a recursive bucket delete.
  for (const name of [path, 'businessLogos/logoOwner/logo-2.png', 'businessLogos/otherOwner/logo-1.png', 'bugReports/logoOwner/test/screenshot']) {
    await bucket.file(name).delete({ ignoreNotFound: true });
  }
}
beforeEach(async () => { if (enabled) await clear(); });
after(async () => { if (enabled) { await clear(); await db.terminate(); await deleteApp(app); } });
async function fixture(withTokens = true) {
  const request = db.doc('accountDeletionRequests/logoOwner'), profile = db.doc('publicProfiles/logoOwner');
  const lease = db.doc('logoRevocationLab/logoOwner');
  await request.set({ userId: 'logoOwner', status: 'pending' });
  await profile.set({ schemaVersion: 1, accountStatus: 'deleted' }); await lease.set({ owner: 'fixture' });
  await bucket.file(path).save(Buffer.from([1, 2, 3]), { resumable: false, metadata: {
    contentType: 'image/png', cacheControl: 'public,max-age=31536000,immutable',
    metadata: { retained: 'yes', ...(withTokens ? { firebaseStorageDownloadTokens: token } : {}) },
  } });
  const identity = { projectId, userId: 'logoOwner', requestCreateTime: (await request.get()).createTime };
  const options = { transactionGuard: async transaction => {
    assert.equal((await transaction.get(lease)).data()?.owner, 'fixture');
  } };
  return { request, profile, lease, identity, options,
    run: () => revoke(identity, db, missingAuth, bucket, path, options) };
}

test('real Storage inventory pages cover current and orphan logos, excluding another owner and bug screenshots', { skip: !enabled }, async () => {
  const f = await fixture();
  for (const name of ['businessLogos/logoOwner/logo-2.png', 'businessLogos/otherOwner/logo-1.png', 'bugReports/logoOwner/test/screenshot']) {
    await bucket.file(name).save(Buffer.from([9]), { resumable: false });
  }
  const first = await list(f.identity, db, missingAuth, bucket, { ...f.options, pageSize: 1 });
  assert.equal(first.paths.length, 1); assert.ok(first.nextPageToken);
  const second = await list(f.identity, db, missingAuth, bucket, { ...f.options, pageSize: 1, pageToken: first.nextPageToken });
  assert.deepEqual([...first.paths, ...second.paths].sort(), [path, 'businessLogos/logoOwner/logo-2.png']);
  assert.equal(second.nextPageToken, null);
});
test('pinned emulator retains bearer tokens after the real Admin metadata patch: helper refuses completion and bytes remain', { skip: !enabled }, async () => {
  const f = await fixture(); assert.equal((await fetch(oldUrl)).status, 200);
  const [before] = await bucket.file(path).getMetadata(), profile = await f.profile.get();
  await assert.rejects(f.run(), /logo-revocation-not-verified/);
  const [after] = await bucket.file(path).getMetadata();
  assert.equal(after.metadata.retained, 'yes'); assert.equal(after.contentType, before.contentType);
  assert.equal(after.cacheControl, before.cacheControl); assert.equal(after.generation, before.generation);
  assert.deepEqual([...(await bucket.file(path).download())[0]], [1, 2, 3]);
  assert.equal((await fetch(oldUrl)).status, 200);
  assert.ok((await f.profile.get()).updateTime.isEqual(profile.updateTime));
  await assert.rejects(f.run(), /logo-revocation-not-verified/);
});
test('actual emulator does not enforce metadata version preconditions; it cannot certify cloud CAS behavior', { skip: !enabled }, async () => {
  await fixture(); const file = bucket.file(path), [before] = await file.getMetadata();
  await file.setMetadata({ metadata: { localPreconditionProbe: 'accepted' } }, {
    ifGenerationMatch: '1', ifMetagenerationMatch: '999999999',
  });
  assert.notEqual(before.generation, '1');
  assert.equal((await file.getMetadata())[0].metadata.localPreconditionProbe, 'accepted');
});
test('Auth presence, missing marker and cancelled or replaced original request refuse the real Storage write', { skip: !enabled }, async () => {
  const f = await fixture(), file = bucket.file(path), [before] = await file.getMetadata();
  await assert.rejects(revoke(f.identity, db, { getUser: async () => ({ uid: 'logoOwner' }) }, bucket, path, f.options), /auth-still-exists/);
  await f.profile.delete(); await assert.rejects(f.run(), /confirmed-deletion/);
  await f.profile.set({ schemaVersion: 1, accountStatus: 'deleted' });
  await f.request.update({ status: 'cancelled' }); await assert.rejects(f.run(), /confirmed-deletion/);
  await f.request.delete(); await f.request.set({ userId: 'logoOwner', status: 'pending' });
  await assert.rejects(f.run(), /confirmed-deletion/);
  assert.equal((await file.getMetadata())[0].metageneration, before.metageneration);
});
test('real lease read and deletion-request change between metadata read and patch both block writes', { skip: !enabled }, async () => {
  const f = await fixture(), file = bucket.file(path), [before] = await file.getMetadata();
  await f.lease.update({ owner: 'other-worker' }); await assert.rejects(f.run());
  await f.lease.update({ owner: 'fixture' });
  const racingBucket = { name: bucket.name, storage: bucket.storage, file: () => ({
    async getMetadata() { const metadata = await file.getMetadata(); await f.request.delete(); return metadata; },
    setMetadata: (...args) => file.setMetadata(...args),
  }) };
  await assert.rejects(revoke(f.identity, db, missingAuth, racingBucket, path, f.options), /confirmed-deletion/);
  assert.equal((await file.getMetadata())[0].metageneration, before.metageneration);
});
test('an object with no issued tokens replays without any metadata write; absence is a checked no-op', { skip: !enabled }, async () => {
  const f = await fixture(false), file = bucket.file(path), [before] = await file.getMetadata();
  assert.deepEqual(await f.run(), { state: 'tokens-absent', changed: false });
  assert.deepEqual(await f.run(), { state: 'tokens-absent', changed: false });
  assert.equal((await file.getMetadata())[0].metageneration, before.metageneration);
  await file.delete(); assert.deepEqual(await f.run(), { state: 'absent', changed: false });
});
