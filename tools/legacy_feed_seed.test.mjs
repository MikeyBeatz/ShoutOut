import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const script of ['seed_test_users.mjs', 'reset_integration_scenario.mjs', 'seed_moderation_queue.mjs']) {
  test(`${script} stops before credentials, Auth, Firestore or confirmation can be used`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)),
      '--confirm-project=shoutout-dev-46c81', '--apply'], {
      encoding: 'utf8', timeout: 10000, env: { ...process.env,
        FIREBASE_SERVICE_ACCOUNT_PATH: 'must-not-be-opened-r6b.json', SHOUTOUT_TEST_PASSWORD: '',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:1', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:1' },
    });
    assert.ifError(result.error); assert.equal(result.status, 1);
    assert.match(result.stderr, /legacy-feed-seed-disabled/);
    assert.doesNotMatch(result.stderr, /ENOENT|ECONNREFUSED|credential implementation|Set FIREBASE_SERVICE_ACCOUNT_PATH/);
  });
}
