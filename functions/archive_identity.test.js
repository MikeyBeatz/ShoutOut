import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityContact, createArchiveIdentityCodec, createArchiveIdentityRuntime, observeArchiveIdentity, archiveIdentityConfiguration } from './archive_identity.js';
import { getArchiveIdentityPageOperation } from './archive_identity_reader.js';
import { accountPurgeStages } from './account_purge_policy.js';
import { Buffer } from 'node:buffer';
import { Timestamp } from 'firebase-admin/firestore';
import { preparedArchiveIdentityRuntime } from './archive_identity_runtime.js';
import { legalPolicy } from './legal_policy.js';

test('exact contact normalization preserves aliases and requires E164 phones', () => {
  assert.equal(identityContact('email', ' Alice+test@Example.cz '), 'alice+test@example.cz');
  assert.notEqual(identityContact('email', 'a.b@example.cz'), identityContact('email', 'ab@example.cz'));
  for (const value of ['420123456789', '+0123456789', '+420 123456789']) assert.throws(() => identityContact('phone', value));
  assert.equal(identityContact('phone', '+420123456789'), '+420123456789');
  assert.throws(() => identityContact('email', 'invalid'));
});
test('HMAC separates projects, contact types, key versions and account incarnations', () => {
  const key = Buffer.alloc(32, 3), a = createArchiveIdentityCodec('one', key), b = createArchiveIdentityCodec('two', key), c = createArchiveIdentityCodec('one', key, 'v2');
  assert.notEqual(a.contact('email', 'a@example.cz'), b.contact('email', 'a@example.cz'));
  assert.notEqual(a.contact('email', 'a@example.cz'), c.contact('email', 'a@example.cz'));
  assert.notEqual(a.account('uid', 1000, Timestamp.fromMillis(1000)), a.account('uid', 2000, Timestamp.fromMillis(1000)));
  assert.notEqual(a.account('uid', 1000, new Timestamp(1, 1)), a.account('uid', 1000, new Timestamp(1, 2)));
  assert.throws(() => createArchiveIdentityCodec('one', Buffer.alloc(10)));
});
test('disabled operations do not inspect the database or Auth and purge additions are append-only', async () => {
  const db = new Proxy({}, { get() { throw new Error('unexpected-database-access'); } });
  const runtime = createArchiveIdentityRuntime(db);
  await assert.rejects(observeArchiveIdentity({}, runtime, db), /disabled/);
  await assert.rejects(getArchiveIdentityPageOperation({}, runtime), /disabled/);
  const old = accountPurgeStages('uid', { moderationCopiesEnabled: true, contentLifecycleEnabled: true });
  const next = accountPurgeStages('uid', { moderationCopiesEnabled: true, contentLifecycleEnabled: true, archiveIdentityEnabled: true });
  assert.deepEqual(next.slice(0, old.length), old); assert.equal(next.length, old.length + 4);
});
test('prepared integration requires a key, capture and independent disclosure before any database access', () => {
  const db = { projectId: 'shoutout-dev-46c81' };
  assert.deepEqual(archiveIdentityConfiguration, { enabled: false, purgeEnabled: false });
  assert.throws(() => preparedArchiveIdentityRuntime(db, { enabled: true }), /key-required/);
  assert.throws(() => preparedArchiveIdentityRuntime(db, { enabled: true, encodedKey: '0'.repeat(64), captureEnabled: true }), /purge-required/);
  assert.throws(() => preparedArchiveIdentityRuntime(db, { enabled: true, purgeEnabled: true, encodedKey: '0'.repeat(64), captureEnabled: false }), /capture-required/);
  assert.throws(() => preparedArchiveIdentityRuntime(db, { enabled: true, purgeEnabled: true, encodedKey: '0'.repeat(64), captureEnabled: true }), /disclosure/);
  assert(preparedArchiveIdentityRuntime(db, { enabled: true, purgeEnabled: true, encodedKey: '0'.repeat(64), captureEnabled: true,
    disclosurePolicy: legalPolicy({ archiveDisclosureEnabled: true, version: '2099-01-01' }) }).enabled);
  const cleanup = accountPurgeStages('uid', { archiveIdentityEnabled: true });
  assert(cleanup.some(stage => stage.collection === 'contentLifecycleArchive'));
  assert.throws(() => accountPurgeStages('uid', { archiveIdentityEnabled: true, contentLifecycleEnabled: false }));
});
