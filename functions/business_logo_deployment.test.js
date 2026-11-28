import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessLogoDeploymentProfile as profile } from './business_logo_deployment.js';
test('logo deployment is DEV-only; rollback preserves the server client and stops mutations', () => {
  assert.deepEqual(profile({}), { enabled: false, clientEnabled: false });
  assert.equal(profile({ GCLOUD_PROJECT: 'shoutout-production-a1b34' }).enabled, false);
  assert.equal(profile({ GCLOUD_PROJECT: 'shoutout-dev-46c81', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }).enabled, false);
  assert.deepEqual(profile({ GCLOUD_PROJECT: 'shoutout-dev-46c81' }), { enabled: true, clientEnabled: true });
  assert.deepEqual(profile({ GCLOUD_PROJECT: 'shoutout-dev-46c81', SHOUTOUT_BUSINESS_LOGO_PHASE: 'rollback' }), { enabled: false, clientEnabled: true });
  assert.throws(() => profile({ GCLOUD_PROJECT: 'a', GOOGLE_CLOUD_PROJECT: 'b' }));
  assert.throws(() => profile({ SHOUTOUT_BUSINESS_LOGO_PHASE: 'active' }, 'off'));
});
