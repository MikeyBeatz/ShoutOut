import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalPolicy, currentLegalPolicy, assertCaptureDisclosure } from './legal_policy.js';
import { accountDocumentRefs } from './callable_security.js';
import { createFeedRuntime } from './feed_runtime.js';

test('inactive legal policy preserves existing acceptance and refuses silent version changes', () => {
  assert.equal(currentLegalPolicy().version, '2026-07-25');
  const db = { doc: path => path };
  assert.equal(accountDocumentRefs(db, 'actor').legal, 'users/actor/legal/acceptance_2026_07_25');
  assert.throws(() => legalPolicy({ version: '2099-01-01' }));
  assert.throws(() => legalPolicy({ archiveDisclosureEnabled: true }));
  assert.throws(() => legalPolicy({ archiveDisclosureEnabled: true, version: '2099-02-31' }));
});
test('prepared disclosure can precede readers and has a matching server acceptance document', () => {
  const policy = legalPolicy({ archiveDisclosureEnabled: true, version: '2099-01-01' });
  assert.equal(accountDocumentRefs({ doc: path => path }, 'actor', policy).legal, 'users/actor/legal/acceptance_2099_01_01');
  assert.doesNotThrow(() => assertCaptureDisclosure(policy, true));
  assert.throws(() => assertCaptureDisclosure(currentLegalPolicy(), true), /disclosure/);
  assert.doesNotThrow(() => assertCaptureDisclosure(currentLegalPolicy(), false));
  assert.throws(() => createFeedRuntime({}, {}, { contentCaptureEnabled: true, enforceArchiveDisclosure: true }), /disclosure/);
});
