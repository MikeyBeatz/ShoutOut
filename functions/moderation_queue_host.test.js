import test from 'node:test';
import assert from 'node:assert/strict';
import { getModerationCasePage, startModerationCaseDecision, stepModerationCaseDecision } from './content.js';
import { moderationQueueDeploymentProfile } from './moderation_queue_deployment.js';
import { secureCallableOptions } from './callable_security.js';

test('queue hosts preserve the approved envelope and require shared App Check', () => {
  for (const callable of [getModerationCasePage, startModerationCaseDecision, stepModerationCaseDecision]) {
    const e = callable.__endpoint;
    assert.deepEqual(e.region, ['europe-west3']); assert.equal(e.platform, 'gcfv2');
    assert.equal(e.minInstances, 0); assert.equal(e.maxInstances, 1); assert.equal(e.concurrency, 1);
    assert.equal(e.availableMemoryMb, 256); assert.equal(e.timeoutSeconds, 15); assert.deepEqual(e.callableTrigger, {});
  }
  assert.equal(secureCallableOptions.enforceAppCheck, true);
});
test('queue activation is DEV only and rollback never disables projection or retention', () => {
  for (const env of [{}, { GCLOUD_PROJECT: 'shoutout-production-a1b34' },
    { GCLOUD_PROJECT: 'shoutout-dev-46c81', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }]) {
    assert.deepEqual(moderationQueueDeploymentProfile(env), { phase: 'off', enabled: false });
  }
  const env = { GCLOUD_PROJECT: 'shoutout-dev-46c81' };
  assert.deepEqual(moderationQueueDeploymentProfile(env), { phase: 'active', enabled: true });
  assert.deepEqual(moderationQueueDeploymentProfile({ ...env, SHOUTOUT_MODERATION_QUEUE_PHASE: 'rollback' }), { phase: 'rollback', enabled: true });
  assert.throws(() => moderationQueueDeploymentProfile({ ...env, GOOGLE_CLOUD_PROJECT: 'other' }), /ambiguous/);
  assert.throws(() => moderationQueueDeploymentProfile({ ...env, SHOUTOUT_MODERATION_QUEUE_PHASE: 'off' }), /escalation/);
});
