import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from './private_report_removal_pilot.mjs';
test('moderation pilot rejects other projects, unsafe paths and missing bounded approval before opening a database', async () => {
  for (const args of [[], ['status', '--project', 'shoutout-production-a1b34', '--state', 'build/test.json'],
    ['status', '--project', 'shoutout-dev-46c81', '--state', '../outside.json'],
    ['seed', '--project', 'shoutout-dev-46c81', '--state', 'build/test.json']])
    await assert.rejects(main(args, { openDatabase() { throw Error('must-not-open'); } }), e => /^private-pilot-/.test(e.message));
});
test('moderation pilot requires exact clean full CI and client readiness before any mutation', async () => {
  const args = ['seed', '--project', 'shoutout-dev-46c81', '--state', 'build/moderation-test.json', '--confirm-project', 'shoutout-dev-46c81',
    '--ci-run', '123', '--approved-digest', 'a'.repeat(64), '--clients-ready', 'yes'];
  await assert.rejects(main(args, { inspectRelease: () => ({ dirty: 'M config/dev.json' }), openDatabase() { throw Error('must-not-open'); } }), /clean-exact-full-ci/);
});
