import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrivatePilot, main } from './private_reply_deletion_pilot.mjs';
const base = ['--project', 'shoutout-dev-46c81', '--state', 'docs/local/private-delete.json'];
test('private pilot rejects other projects, ambiguous flags, paths and mutation without client readiness before opening database', async () => {
  const approval = ['--confirm-project', 'shoutout-dev-46c81', '--ci-run', '123', '--approved-digest', 'a'.repeat(64)];
  for (const args of [[], ['status', '--project', 'shoutout-production-a1b34', '--state', 'build/test.json'],
    ['status', ...base, '--state', 'build/test.json'], ['status', '--project', 'shoutout-dev-46c81', '--state', '../outside.json'],
    ['seed', ...base, ...approval], ['cleanup', ...base, ...approval]]) {
    await assert.rejects(main(args, { openDatabase() { throw Error('must-not-open'); } }), e => /^private-pilot-/.test(e.message));
  }
  assert.equal(parsePrivatePilot(['seed', ...base, ...approval, '--clients-ready', 'yes']).action, 'seed');
});
test('mutations require clean exact full CI including the private deletion step before opening database', async () => {
  const args = ['seed', ...base, '--confirm-project', 'shoutout-dev-46c81', '--ci-run', '123', '--approved-digest', 'a'.repeat(64), '--clients-ready', 'yes'];
  await assert.rejects(main(args, { inspectRelease: () => ({ dirty: 'M config/dev.json' }), openDatabase() { throw Error('must-not-open'); } }), /clean-exact-full-ci/);
});
