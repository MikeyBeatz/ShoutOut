import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTransitionRelease, parseTransitionArguments, requiredTransitionChecks, main } from '../tools/feed_generation_transition.mjs';
import { feedRuntimeConfiguration } from './feed_runtime.js';
import { feedPageHostOptions, feedPrivateReadCache } from './feed_serving_options.js';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { canonical } from './feed_block_index.js';
import { main as measure } from '../tools/measure_feed_b3.mjs';

const commit = 'a'.repeat(40), proof = { commit, dirty: '', branch: 'feature/test',
  ci: { headSha: commit, status: 'completed', conclusion: 'success', workflowName: 'Flutter checks',
    jobs: [{ conclusion: 'success', steps: requiredTransitionChecks.map(name => ({ name, conclusion: 'success' })) }] } };
test('operator requires exact clean full CI, not a successful documentation-only run', () => {
  assert.doesNotThrow(() => assertTransitionRelease('shoutout-dev-46c81', proof));
  for (const changed of [{ dirty: '?? new-file' }, { ci: { ...proof.ci, headSha: 'b'.repeat(40) } },
    { ci: { ...proof.ci, status: 'queued' } }, { ci: { ...proof.ci, conclusion: 'failure' } },
    { ci: { ...proof.ci, workflowName: 'Other' } }, { ci: { ...proof.ci, jobs: [] } },
    { ci: { ...proof.ci, jobs: [{ conclusion: 'success', steps: requiredTransitionChecks.map(name => ({ name, conclusion: 'skipped' })) }] } }]) {
    assert.throws(() => assertTransitionRelease('shoutout-dev-46c81', { ...proof, ...changed }), /exact-full-ci/);
  }
  for (const missing of requiredTransitionChecks) assert.throws(() => assertTransitionRelease('shoutout-dev-46c81',
    { ...proof, ci: { ...proof.ci, jobs: [{ conclusion: 'success', steps: proof.ci.jobs[0].steps.filter(s => s.name !== missing) }] } }), /exact-full-ci/);
});
test('production operator additionally requires main and a matching version tag', () => {
  assert.throws(() => assertTransitionRelease('other', proof));
  assert.throws(() => assertTransitionRelease('shoutout-production-a1b34', proof), /production-release/);
  const production = { ...proof, branch: 'main', tag: 'v1.0.0', tagCommit: commit };
  assert.doesNotThrow(() => assertTransitionRelease('shoutout-production-a1b34', production));
  assert.throws(() => assertTransitionRelease('shoutout-production-a1b34', { ...production, tagCommit: 'b'.repeat(40) }));
});
test('ambiguous actions/targets/approval fail before credentials and network', async () => {
  const options = { openDatabase() { assert.fail('Unexpected credential access'); }, inspectRelease() { assert.fail('Unexpected CI request'); } };
  for (const argv of [[], ['start'], ['start', '--project', 'shoutout-dev-46c81'],
    ['plan', '--project', 'other', '--generation', 'new'], ['plan', '--project', 'shoutout-dev-46c81', '--generation', '../new'],
    ['plan', '--project', 'shoutout-dev-46c81', '--generation', 'new', '--project', 'shoutout-production-a1b34'],
    ['status', '--project', 'shoutout-dev-46c81', '--plan', '../outside.json'],
    ['status', '--project', 'shoutout-dev-46c81', '--plan', 'none.json', '--ci-run', '1']]) await assert.rejects(main(argv, options));
  assert.equal(parseTransitionArguments(['plan', '--project', 'shoutout-dev-46c81', '--generation', 'feed-v2']).mutating, false);
});
test('trusted serving profiles stage compatible writers before unread serving', () => {
  const disabled = { ...feedRuntimeConfiguration, compatibleGenerations: false, unreadFirst: false };
  assert.deepEqual(feedPageHostOptions(disabled), { compatibleGenerations: false, readOrdering: null });
  assert.deepEqual(feedPageHostOptions({ ...feedRuntimeConfiguration, compatibleGenerations: true }), { compatibleGenerations: true, readOrdering: null });
  assert.throws(() => feedPageHostOptions({ ...disabled, unreadFirst: true }));
  const on = feedPageHostOptions({ ...feedRuntimeConfiguration, compatibleGenerations: true, unreadFirst: true });
  assert.equal(on.readOrdering.cache, feedPrivateReadCache); assert.equal(on.readOrdering.maxBlockReads, 256);
});
test('CLI checks a valid plan and full release before opening credentials, and a disabled release cannot mutate', async () => {
  const directory = new URL('../build/b3-operator/', import.meta.url); mkdirSync(directory, { recursive: true });
  const file = new URL(`contract-${randomUUID()}.json`, directory);
  const value = { v: 1, kind: 'feed-content-identity-transition', projectId: 'shoutout-dev-46c81', sourceGenerationId: 'feed-v1',
    targetGenerationId: 'feed-v2', sourceIncarnation: [1, 0], controlRevision: 1, batchSize: 50 };
  const digest = createHash('sha256').update(canonical(value)).digest('hex');
  writeFileSync(file, JSON.stringify({ ...value, digest }));
  const argv = ['start', '--project', value.projectId, '--plan', fileURLToPath(file), '--confirm-project', value.projectId,
    '--approved-digest', digest, '--ci-run', '1'];
  const openDatabase = () => assert.fail('Unexpected credentials');
  try {
    await assert.rejects(main(argv, { openDatabase, inspectRelease: () => ({ ...proof, ci: { ...proof.ci, jobs: [] } }) }), /exact-full-ci/);
    await assert.rejects(main(argv, { openDatabase, inspectRelease: () => proof,
      configuration: { ...feedRuntimeConfiguration, compatibleGenerations: false } }), /compatible-writer/);
  } finally { unlinkSync(file); }
});
test('measurement refuses a live/default environment before initialization', { skip: !!process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  await assert.rejects(measure(), /requires-local-firestore-emulator/);
});
