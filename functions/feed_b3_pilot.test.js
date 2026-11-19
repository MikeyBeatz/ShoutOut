import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { main } from '../tools/feed_b3_pilot.mjs';
import { requiredTransitionChecks } from '../tools/feed_generation_transition.mjs';

test('pilot CLI rejects a foreign project, missing approval and ambiguous options before credentials', async () => {
  const options = { openDatabase() { assert.fail('Unexpected database access'); }, inspectRelease() { assert.fail('Unexpected CI lookup'); } };
  for (const argv of [[], ['plan', '--project', 'shoutout-production-a1b34', '--state', 'build/pilot.json'],
    ['create', '--project', 'shoutout-dev-46c81', '--state', 'build/pilot.json'],
    ['cleanup', '--project', 'shoutout-dev-46c81', '--state', 'build/pilot.json'],
    ['status', '--project', 'shoutout-dev-46c81', '--state', 'build/pilot.json', '--actors', 'x'],
    ['status', '--project', 'shoutout-dev-46c81', '--project', 'other', '--state', 'build/pilot.json']]) {
    await assert.rejects(main(argv, options));
  }
});
test('a cleaned pilot cannot be recreated even with an otherwise valid release proof', async () => {
  const directory = new URL('../build/b3-dev/', import.meta.url); mkdirSync(directory, { recursive: true });
  const file = new URL(`phase-${randomUUID()}.json`, directory), commit = 'a'.repeat(40), digest = 'b'.repeat(64);
  writeFileSync(file, JSON.stringify({ v: 1, phase: 'cleaned', plan: { projectId: 'shoutout-dev-46c81', digest } }));
  const proof = { commit, dirty: '', branch: 'feature/fixture', ci: { headSha: commit, status: 'completed', conclusion: 'success', workflowName: 'Flutter checks',
    jobs: [{ conclusion: 'success', steps: requiredTransitionChecks.map(name => ({ name, conclusion: 'success' })) }] } };
  try {
    await assert.rejects(main(['create', '--project', 'shoutout-dev-46c81', '--confirm-project', 'shoutout-dev-46c81',
      '--state', fileURLToPath(file), '--approved-digest', digest, '--ci-run', '1'], {
      inspectRelease: () => proof, openDatabase() { assert.fail('Unexpected database access'); },
    }), /invalid-phase/);
  } finally { unlinkSync(file); }
});
