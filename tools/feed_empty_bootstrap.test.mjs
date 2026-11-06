import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBootstrapRelease, main } from './feed_empty_bootstrap.mjs';

const commit = 'a'.repeat(40), release = { branch: 'feature/fixture', dirty: '', commit,
  ci: { headSha: commit, status: 'completed', conclusion: 'success', workflowName: 'Flutter checks' } };
test('bootstrap mutators require clean exact successful CI and production requires main plus matching version', () => {
  assert.doesNotThrow(() => assertBootstrapRelease('shoutout-dev-46c81', release));
  for (const change of [{ dirty: ' M file' }, { commit: 'short' }, { ci: { ...release.ci, status: 'queued' } },
    { ci: { ...release.ci, headSha: 'b'.repeat(40) } }, { ci: { ...release.ci, workflowName: 'Other checks' } }, { ci: { ...release.ci, conclusion: 'failure' } }]) {
    assert.throws(() => assertBootstrapRelease('shoutout-dev-46c81', { ...release, ...change }), /exact-ci-required/);
  }
  assert.throws(() => assertBootstrapRelease('other', release));
  assert.throws(() => assertBootstrapRelease('shoutout-production-a1b34', release), /production-release-required/);
  assert.doesNotThrow(() => assertBootstrapRelease('shoutout-production-a1b34', { ...release, branch: 'main', tag: 'v1.0.0', tagCommit: commit }));
  assert.throws(() => assertBootstrapRelease('shoutout-production-a1b34', { ...release, branch: 'main', tag: 'v1.0.0', tagCommit: 'b'.repeat(40) }));
});
test('missing/ambiguous project and mutation approval are rejected before credentials or network access', async () => {
  for (const args of [[], ['initialize'], ['initialize', '--project', 'other'], ['activate', '--project', 'shoutout-dev-46c81'],
    ['plan', '--project', 'shoutout-dev-46c81', '--project', 'shoutout-production-a1b34'], ['plan', '--wat', 'x']]) {
    await assert.rejects(main(args));
  }
});
