import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReadRetentionCleanup, runContinuingReceiptCleanup } from './retention_cleanup.js';
import { createRetentionChildProbe } from './retention_child_probe.js';

test('retention work bounds and project are rejected before database access', async () => {
  for (const run of [runReadRetentionCleanup, runContinuingReceiptCleanup]) {
    await assert.rejects(run({ projectId: 'unapproved' }), /project-required/);
    for (const options of [{ maxPages: 11 }, { pageSize: 51 }, { maxMillis: 10001 }, { maxPages: 0 }, { pageSize: 1.5 }]) {
      await assert.rejects(run({ projectId: 'shoutout-dev-46c81' }, options), /invalid-retention-options/);
    }
  }
});

test('descendant probe requests one metadata result without auto-pagination', { skip: !!process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  let calls = 0;
  const client = { async listCollectionIds(request, options) {
    calls++; assert.equal(request.pageSize, 1); assert.equal(options.autoPaginate, false);
    assert.equal(request.parent, 'projects/fixture/databases/(default)/documents/users/actor/readBuckets/block');
    return calls === 1 ? [[], null] : [['unexpected'], { pageToken: 'more' }];
  } };
  const probe = createRetentionChildProbe({ projectId: 'fixture' }, { client });
  assert.equal(await probe.hasChildren('users/actor/readBuckets/block'), false);
  assert.equal(await probe.hasChildren('users/actor/readBuckets/block'), true);
  await assert.rejects(probe.hasChildren('../bad'), /invalid-retention-path/);
  await probe.close();
});
