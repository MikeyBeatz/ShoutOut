import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountDeletionDevProposal, assertAccountDeletionDevTarget } from './account_deletion_dev.js';

test('proposed account worker rejects production and arbitrary projects before database operations', () => {
  assert.doesNotThrow(() => assertAccountDeletionDevTarget('shoutout-dev-46c81'));
  for (const project of ['shoutout-production-a1b34', 'some-other-project', undefined]) {
    assert.throws(() => assertAccountDeletionDevTarget(project), /account-deletion-dev-target-required/);
  }
});

test('rules project requires the exact local emulator endpoint', () => {
  const previous = process.env.FIRESTORE_EMULATOR_HOST;
  try {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    assert.throws(() => assertAccountDeletionDevTarget('shoutout-rules-test'), /account-deletion-dev-target-required/);
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    assert.doesNotThrow(() => assertAccountDeletionDevTarget('shoutout-rules-test'));
    assert.throws(() => assertAccountDeletionDevTarget('shoutout-production-a1b34'), /account-deletion-dev-target-required/);
  } finally {
    if (previous === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = previous;
  }
});


test('private cleanup stays disabled until its separate data rollout approval', () => {
  assert.equal(accountDeletionDevProposal.privateCleanupEnabled, false);
});
