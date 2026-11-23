import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from './content_report_decision_pilot.mjs';
import { requiredTransitionChecks } from './feed_generation_transition.mjs';

test('decision pilot rejects unsafe scope and incomplete clean/full CI before database access', async () => {
  const never = () => { throw Error('must-not-open'); };
  for (const args of [[], ['status', '--project', 'shoutout-production-a1b34', '--state', 'build/x.json'],
    ['status', '--project', 'shoutout-dev-46c81', '--state', '../x.json'],
    ['seed', '--project', 'shoutout-dev-46c81', '--state', 'build/x.json']])
    await assert.rejects(main(args, { openDatabase: never }), /private-pilot-/);
  const args = ['seed', '--project', 'shoutout-dev-46c81', '--state', 'build/decision-test.json', '--confirm-project', 'shoutout-dev-46c81',
    '--ci-run', '123', '--approved-digest', 'a'.repeat(64), '--clients-ready', 'yes'];
  const proof = { dirty: '', commit: 'a'.repeat(40), ci: { headSha: 'a'.repeat(40), status: 'completed', conclusion: 'success', workflowName: 'Flutter checks',
    jobs: [{ conclusion: 'success', steps: requiredTransitionChecks.map(name => ({ name, conclusion: 'success' })) }] } };
  await assert.rejects(main(args, { openDatabase: never, inspectRelease: () => ({ ...proof, dirty: 'M config/dev.json' }) }), /clean-exact-full-ci/);
  await assert.rejects(main(args, { openDatabase: never, inspectRelease: () => proof }), /full-decision-ci-required/);
});
