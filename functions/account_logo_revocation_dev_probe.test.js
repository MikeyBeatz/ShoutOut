import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyLogoRevocationDev } from './account_logo_revocation_dev_probe.js';
test('live Storage probe rejects another project, emulator endpoint or missing source before any API call', async () => {
  for (const bucket of [{ name: 'production.firebasestorage.app', storage: { apiEndpoint: 'https://storage.googleapis.com' } },
    { name: 'shoutout-dev-46c81.firebasestorage.app', storage: { apiEndpoint: 'http://127.0.0.1:9199' } }]) {
    await assert.rejects(verifyLogoRevocationDev({ bucket, auth: { getUser() { assert.fail('must not call Auth'); } }, sourceCommit: 'a'.repeat(40) }), /invalid-dev-logo-probe-target/);
  }
  await assert.rejects(verifyLogoRevocationDev({ bucket: { name: 'shoutout-dev-46c81.firebasestorage.app',
    storage: { apiEndpoint: 'https://storage.googleapis.com' } }, auth: { getUser() { assert.fail('must not call Auth'); } } }), /invalid-dev-logo-probe-target/);
});
