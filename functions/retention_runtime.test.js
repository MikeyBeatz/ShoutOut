import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRetentionRuntime } from './retention_runtime.js';

test('retention adapter is dormant by default and cannot access the database', async () => {
  const runtime = createRetentionRuntime({ projectId: 'shoutout-dev-46c81', doc() { assert.fail('disabled'); } });
  assert.equal((await runtime.run()).state, 'disabled');
  assert.throws(() => createRetentionRuntime({ projectId: 'other' }), /project-required/);
  assert.throws(() => createRetentionRuntime({ projectId: 'shoutout-dev-46c81' }, { enabled: 'true' }), /runtime-options/);
});
