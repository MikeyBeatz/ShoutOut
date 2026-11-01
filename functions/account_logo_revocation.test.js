import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { listDeletedAccountLogos, revokeDeletedAccountLogo } from './account_logo_revocation.js';
import { revokeDeletedAccountLogoLab } from './account_logo_revocation_lab.js';

function fixture() {
  const created = Timestamp.now(), path = 'businessLogos/owner/logo-1.png';
  const state = { request: { userId: 'owner', status: 'pending' }, marker: { schemaVersion: 1, accountStatus: 'deleted' },
    created, reads: 0, writes: 0, beforeWrite: null, loseAck: false,
    metadata: { generation: '123', metageneration: '8', contentType: 'image/png', cacheControl: 'public,max-age=31536000,immutable',
      metadata: { firebaseStorageDownloadTokens: 'first,second', retained: 'yes' } } };
  const db = { projectId: 'shoutout-rules-test', doc: p => p, async runTransaction(fn) {
    return fn({ async getAll() { return [
      { exists: Boolean(state.request), data: () => state.request, createTime: state.created },
      { data: () => state.marker },
    ]; } });
  } };
  const auth = { async getUser() { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); } };
  const file = { async getMetadata() { state.reads++; return [globalThis.structuredClone(state.metadata)]; },
    async setMetadata(patch, conditions) {
      state.beforeWrite?.();
      assert.deepEqual(patch, { metadata: { firebaseStorageDownloadTokens: null } });
      if (conditions.ifGenerationMatch !== state.metadata.generation || conditions.ifMetagenerationMatch !== state.metadata.metageneration) {
        throw Object.assign(new Error('version-changed'), { code: 412 });
      }
      state.writes++; delete state.metadata.metadata.firebaseStorageDownloadTokens;
      state.metadata.metageneration = String(Number(state.metadata.metageneration) + 1);
      if (state.loseAck) { state.loseAck = false; throw new Error('ack-lost'); }
    } };
  const bucket = { name: 'shoutout-rules-test.appspot.com', file(name) { assert.equal(name, path); return file; },
    async getFiles(query) { state.query = query; return [[{ name: path }], { pageToken: 'next' }]; } };
  const identity = { projectId: db.projectId, userId: 'owner', requestCreateTime: created };
  const options = { clock: () => created.toDate(), transactionGuard: async () => {} };
  return { state, db, auth, file, bucket, identity, options, path,
    run: () => revokeDeletedAccountLogo(identity, db, auth, bucket, path, options) };
}

test('logo revocation removes every token with both version conditions, preserves unrelated metadata and replays without writing', async () => {
  const f = fixture(), before = globalThis.structuredClone(f.state.metadata);
  assert.deepEqual(await f.run(), { state: 'tokens-absent', changed: true });
  delete before.metadata.firebaseStorageDownloadTokens; before.metageneration = '9';
  assert.deepEqual(f.state.metadata, before);
  assert.deepEqual(await f.run(), { state: 'tokens-absent', changed: false }); assert.equal(f.state.writes, 1);
});
test('a lost successful patch acknowledgement safely replays without minting a new token', async () => {
  const f = fixture(); f.state.loseAck = true; await assert.rejects(f.run(), /ack-lost/);
  assert.deepEqual(await f.run(), { state: 'tokens-absent', changed: false }); assert.equal(f.state.writes, 1);
});
for (const field of ['generation', 'metageneration']) test(`a concurrent ${field} change fails its conditional patch without overwriting`, async () => {
  const f = fixture(); f.state.beforeWrite = () => { f.state.metadata[field] = '999'; f.state.metadata.metadata.other = 'new'; };
  await assert.rejects(f.run(), error => error.code === 412); assert.equal(f.state.writes, 0);
  assert.equal(f.state.metadata.metadata.firebaseStorageDownloadTokens, 'first,second');
  assert.equal(f.state.metadata.metadata.other, 'new');
});
test('remaining tokens or an unexpected replacement cannot be acknowledged', async () => {
  for (const mode of ['tokens', 'replacement']) {
    const f = fixture(); f.file.setMetadata = async () => { if (mode === 'replacement') { delete f.state.metadata.metadata.firebaseStorageDownloadTokens; f.state.metadata.generation = '999'; } };
    await assert.rejects(f.run(), /logo-revocation-not-verified/);
  }
});
test('Auth presence, provider failure, missing or replaced request and missing marker block before Storage access', async () => {
  for (const mutate of [f => { f.auth.getUser = async () => ({}); },
    f => { f.auth.getUser = async () => { throw new Error('auth-unavailable'); }; },
    f => { f.state.request = null; }, f => { f.state.request.status = 'cancelled'; },
    f => { f.state.created = Timestamp.fromMillis(f.state.created.toMillis() + 1); },
    f => { f.state.marker = null; }, f => { f.state.marker.nickname = 'stale'; },
    f => { f.options.clock = () => new Date(f.identity.requestCreateTime.toMillis() + 60 * 86400000); }]) {
    const f = fixture(); mutate(f); await assert.rejects(f.run()); assert.equal(f.state.reads, 0); assert.equal(f.state.writes, 0);
  }
});
test('lease failure, and cancellation after the first metadata read, prevent a patch', async () => {
  const f = fixture(); f.options.transactionGuard = async () => { throw new Error('lease-lost'); };
  await assert.rejects(f.run(), /lease-lost/); assert.equal(f.state.reads, 0);
  const g = fixture(), read = g.file.getMetadata;
  g.file.getMetadata = async () => { const result = await read(); g.state.request = null; return result; };
  await assert.rejects(g.run(), /confirmed-deletion/); assert.equal(g.state.writes, 0);
});
test('a lost confirmation after patch is an error, not a completion; bytes are never deleted', async () => {
  const f = fixture(), patch = f.file.setMetadata;
  f.file.setMetadata = async (...args) => { await patch(...args); f.state.request = null; };
  await assert.rejects(f.run(), /confirmed-deletion/); assert.equal(f.state.writes, 1);
});
test('missing logo is a checked no-op; permission and network errors are not absence', async () => {
  const f = fixture(); f.file.getMetadata = async () => { throw Object.assign(new Error('absent'), { code: 404 }); };
  assert.deepEqual(await f.run(), { state: 'absent', changed: false });
  f.file.getMetadata = async () => { throw Object.assign(new Error('denied'), { code: 403 }); };
  await assert.rejects(f.run(), /denied/);
});
test('target/path and invalid metadata cannot modify a foreign object or project', async () => {
  for (const path of ['businessLogos/another/logo-1.png', 'businessLogos/owner/nested/logo-1.png', 'bugReports/owner/screenshot', '../logo-1.png']) {
    const f = fixture(); await assert.rejects(revokeDeletedAccountLogo(f.identity, f.db, f.auth, f.bucket, path, f.options), /invalid-logo-path/);
    assert.equal(f.state.reads, 0);
  }
  const f = fixture(); f.bucket.name = 'production.appspot.com'; await assert.rejects(f.run(), /invalid-logo-revocation-target/);
  for (const mutate of [g => { delete g.state.metadata.generation; }, g => { g.state.metadata.metadata.firebaseStorageDownloadTokens = []; }]) {
    const g = fixture(); mutate(g); await assert.rejects(g.run()); assert.equal(g.state.writes, 0);
  }
  await assert.rejects(revokeDeletedAccountLogoLab({}, { projectId: 'shoutout-dev-46c81' }), /logo-emulators-required/);
});
test('inventory uses only the exact owner prefix, explicit page and cursor; unexpected paths need review', async () => {
  const f = fixture(); const options = { ...f.options, pageSize: 50, pageToken: 'previous' };
  assert.deepEqual(await listDeletedAccountLogos(f.identity, f.db, f.auth, f.bucket, options), { paths: [f.path], nextPageToken: 'next' });
  assert.deepEqual(f.state.query, { prefix: 'businessLogos/owner/', maxResults: 50, autoPaginate: false, pageToken: 'previous' });
  f.bucket.getFiles = async () => [[{ name: 'businessLogos/another/logo-1.png' }]];
  await assert.rejects(listDeletedAccountLogos(f.identity, f.db, f.auth, f.bucket, options), /unexpected-logo-path/);
});
