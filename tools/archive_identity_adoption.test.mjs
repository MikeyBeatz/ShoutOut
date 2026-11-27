import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIdentityAdoptionArguments, main } from './archive_identity_adoption.mjs';
import { parseLifecycleTransitionArguments } from './content_lifecycle_transition.mjs';
const project = 'shoutout-dev-46c81';
test('author operator rejects implicit/production target, unsafe paths and unapproved apply', async () => {
  const valid = ['plan', '--project', project, '--paths', 'build/candidates.json', '--output', 'build/plan.json'];
  assert.equal(parseIdentityAdoptionArguments(valid).action, 'plan');
  for (const args of [[], ['plan', '--project', 'shoutout-production-a1b34'], [...valid, '--unknown', 'value'],
    [...valid.slice(0, -1), '../escape.json'], ['apply', '--project', project, '--output', 'build/ack.json']]) {
    assert.throws(() => parseIdentityAdoptionArguments(args));
  }
  await assert.rejects(main(valid, { openDatabase() { assert.fail('off release accessed database'); } }), /active-release/);
});
test('advisory inventory requires explicit DEV and output but no capture control or apply approval', () => {
  assert.equal(parseLifecycleTransitionArguments(['preflight-plan', '--project', project, '--output', 'build/preflight.json']).mutating, false);
  assert.equal(parseLifecycleTransitionArguments(['preflight', '--project', project, '--plan', 'build/preflight.json', '--output', 'build/page.json']).mutating, false);
  assert.throws(() => parseLifecycleTransitionArguments(['preflight-plan', '--project', project]));
});
