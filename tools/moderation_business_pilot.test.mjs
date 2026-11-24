import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main, parseModerationBusinessPilot } from './moderation_business_pilot.mjs';
const state = ['--project', 'shoutout-dev-46c81', '--state', 'docs/local/moderation-business-pilot.json'];
const approve = ['--confirm-project', 'shoutout-dev-46c81', '--approved-digest', 'a'.repeat(64), '--ci-run', '123'];
test('pilot requires explicit DEV, contained local state, explicit digest and readiness/acceptance', () => {
  assert.equal(parseModerationBusinessPilot(['plan', ...state]).mutating, false);
  assert.equal(parseModerationBusinessPilot(['avatar-plan', ...state]).mutating, false);
  assert.equal(parseModerationBusinessPilot(['account', ...state, ...approve, '--clients-ready', 'yes']).mutating, true);
  assert.equal(parseModerationBusinessPilot(['avatar-repair', ...state, ...approve, '--approved-repair-digest', 'b'.repeat(64)]).mutating, true);
  for (const args of [['avatar-repair', ...state, ...approve], ['account', ...state, ...approve], ['cleanup', ...state, ...approve], ['content', ...state], ['unknown', ...state],
    ['plan', '--project', 'shoutout-production-a1b34', '--state', 'docs/local/a.json'], ['plan', '--project', 'shoutout-dev-46c81', '--state', 'docs/local-other/a.json'],
    ['plan', '--project', 'shoutout-dev-46c81', '--state', '../a.json'], ['plan', ...state, '--project', 'shoutout-dev-46c81']]) assert.throws(() => parseModerationBusinessPilot(args));
});
test('a failed exact full release proof prevents even opening live database or Auth', async () => {
  let opened = 0;
  await assert.rejects(main(['account', ...state, ...approve, '--clients-ready', 'yes'], { inspectRelease: () => ({}), openDatabase: () => { opened++; }, openAuth: () => { opened++; } }), /clean-exact-full-ci/);
  assert.equal(opened, 0);
});
