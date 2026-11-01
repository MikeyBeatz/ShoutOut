// Explicit DEV Storage probe; never exported/deployed as a Function.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { revokeDeletedAccountLogo } from './account_logo_revocation.js';

export async function verifyLogoRevocationDev({ bucket, auth, sourceCommit, record = () => {} }) {
  const projectId = 'shoutout-dev-46c81';
  if (bucket?.name !== `${projectId}.firebasestorage.app` || bucket?.storage?.apiEndpoint !== 'https://storage.googleapis.com' ||
      typeof auth?.getUser !== 'function' || !/^[a-f0-9]{40}$/.test(sourceCommit ?? '') || typeof record !== 'function') {
    throw new Error('invalid-dev-logo-probe-target');
  }
  const uid = `mvp_logo_probe_${randomUUID().replaceAll('-', '')}`, prefix = `businessLogos/${uid}/`;
  const proof = { projectId, bucket: bucket.name, sourceCommit, prefix, startedAt: new Date().toISOString(),
    mode: 'isolated-storage-probe', liveFirestoreWrites: 0, authAccountsCreated: 0, cleanup: [], checks: {} };
  const persist = () => record(proof);
  // No live request, marker or worker job is created: this probe isolates Storage.
  const created = Timestamp.now();
  const identity = { projectId, userId: uid, requestCreateTime: created };
  const db = { projectId, doc: path => path, async runTransaction(work) {
    return work({ async getAll(request, profile) {
      assert.equal(request, `accountDeletionRequests/${uid}`); assert.equal(profile, `publicProfiles/${uid}`);
      return [{ exists: true, createTime: created, data: () => ({ userId: uid, status: 'pending' }) },
        { data: () => ({ schemaVersion: 1, accountStatus: 'deleted' }) }];
    } });
  } };
  const entries = [1, 2, 3, 4].map(n => ({ file: bucket.file(`${prefix}logo-${n}.png`), token: randomUUID(), written: false }));
  const metadata = entry => ({ contentType: 'image/png', cacheControl: 'private,no-store',
    metadata: { firebaseStorageDownloadTokens: entry.token, probeRun: uid, retained: 'yes' } });
  const oldUrl = entry => `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(entry.file.name)}?alt=media&token=${entry.token}`;
  const download = async (entry, includeToken = true) => {
    const url = new URL(oldUrl(entry)); if (!includeToken) url.searchParams.delete('token');
    const response = await fetch(url, { cache: 'no-store', signal: globalThis.AbortSignal.timeout(20000) });
    const bytes = await response.arrayBuffer(); return { status: response.status, bytes: [...new Uint8Array(bytes)] };
  };
  try {
    try { await auth.getUser(uid); throw new Error('probe-uid-already-exists'); }
    catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    const [bucketMetadata] = await bucket.getMetadata();
    // Avoid leaving old versions behind; a versioned bucket needs its own cleanup plan.
    if (bucketMetadata.versioning?.enabled) throw new Error('versioned-probe-requires-explicit-plan');
    proof.bucketControls = { versioningEnabled: false,
      uniformBucketLevelAccess: bucketMetadata.iamConfiguration?.uniformBucketLevelAccess?.enabled === true,
      publicAccessPrevention: bucketMetadata.iamConfiguration?.publicAccessPrevention ?? 'unspecified' };
    persist();
    for (const entry of entries) {
      await entry.file.save(Buffer.from([1, 2, 3]), { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: metadata(entry) });
      entry.written = true; [entry.before] = await entry.file.getMetadata(); persist();
    }
    const [main, metaRace, objectRace, control] = entries;
    assert.equal((await download(main)).status, 200);
    const withoutToken = await download(main, false); assert.ok([401, 403].includes(withoutToken.status));
    proof.checks.preexistingTokenWorks = true; proof.checks.anonymousWithoutTokenDenied = withoutToken.status;

    await metaRace.file.setMetadata({ metadata: { retained: 'modified' } }, {
      ifGenerationMatch: metaRace.before.generation, ifMetagenerationMatch: metaRace.before.metageneration,
    });
    await assert.rejects(metaRace.file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } }, {
      ifGenerationMatch: metaRace.before.generation, ifMetagenerationMatch: metaRace.before.metageneration,
    }), error => error?.code === 412);
    const [afterMetaRace] = await metaRace.file.getMetadata();
    assert.equal(afterMetaRace.metadata.retained, 'modified');
    assert.equal(afterMetaRace.metadata.firebaseStorageDownloadTokens, metaRace.token);
    proof.checks.metadataCollision412 = true;

    await objectRace.file.save(Buffer.from([4, 5, 6]), { resumable: false,
      preconditionOpts: { ifGenerationMatch: objectRace.before.generation }, metadata: metadata(objectRace) });
    const [replacement] = await objectRace.file.getMetadata(); assert.notEqual(replacement.generation, objectRace.before.generation);
    await assert.rejects(objectRace.file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } }, {
      ifGenerationMatch: objectRace.before.generation, ifMetagenerationMatch: replacement.metageneration,
    }), error => error?.code === 412);
    assert.equal((await objectRace.file.getMetadata())[0].metadata.firebaseStorageDownloadTokens, objectRace.token);
    proof.checks.objectCollision412 = true;

    assert.deepEqual(await revokeDeletedAccountLogo(identity, db, auth, bucket, main.file.name,
      { transactionGuard: async () => {} }), { state: 'tokens-absent', changed: true });
    const [revoked] = await main.file.getMetadata();
    assert.equal(revoked.generation, main.before.generation); assert.equal(revoked.md5Hash, main.before.md5Hash);
    assert.equal(revoked.cacheControl, main.before.cacheControl); assert.equal(revoked.metadata.retained, 'yes');
    assert.equal(revoked.metadata.probeRun, uid); assert.ok(!revoked.metadata.firebaseStorageDownloadTokens);
    const revokedDownload = await download(main); assert.ok([401, 403].includes(revokedDownload.status));
    proof.checks.oldTokenDenied = revokedDownload.status; proof.checks.bytesAndOtherMetadataPreserved = true;
    assert.deepEqual(await revokeDeletedAccountLogo(identity, db, auth, bucket, main.file.name,
      { transactionGuard: async () => {} }), { state: 'tokens-absent', changed: false });
    assert.equal((await main.file.getMetadata())[0].metageneration, revoked.metageneration);
    proof.checks.replayWithoutWrite = true;
    const [unchanged] = await control.file.getMetadata();
    assert.equal(unchanged.generation, control.before.generation); assert.equal(unchanged.metageneration, control.before.metageneration);
    assert.deepEqual((await download(control)).bytes, [1, 2, 3]); proof.checks.controlUnchanged = true;
    proof.verified = true;
  } catch (error) {
    proof.verified = false; proof.failure = { name: error.name, code: typeof error.code === 'number' ? error.code : undefined };
    throw error;
  } finally {
    // Exact owned objects only, conditional on current generation + fixture marker.
    for (const entry of entries.filter(item => item.written)) {
      try {
        const [current] = await entry.file.getMetadata();
        assert.equal(current.metadata?.probeRun, uid);
        await entry.file.delete({ ifGenerationMatch: current.generation });
        await assert.rejects(entry.file.getMetadata(), error => error?.code === 404);
        proof.cleanup.push({ path: entry.file.name, absent: true });
      } catch (error) {
        proof.cleanup.push({ path: entry.file.name, absent: false, code: typeof error.code === 'number' ? error.code : undefined });
      }
    }
    proof.finishedAt = new Date().toISOString(); persist();
  }
  assert.equal(proof.cleanup.length, 4); assert.ok(proof.cleanup.every(item => item.absent));
  return proof;
}
