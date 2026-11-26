import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { canonical } from '../functions/feed_block_index.js';
import { requiredTransitionChecks } from './feed_generation_transition.mjs';
import { requiredLifecycleTransitionChecks, assertLifecycleTransitionRelease, parseLifecycleTransitionArguments, main } from './content_lifecycle_transition.mjs';
const project = 'shoutout-dev-46c81', root = resolve(import.meta.dirname, '..');
function proof() {
  return { commit: 'a'.repeat(40), dirty: '', branch: 'feature/test', ci: { headSha: 'a'.repeat(40), status: 'completed', conclusion: 'success', workflowName: 'Flutter checks',
    jobs: [{ conclusion: 'success', steps: [...requiredTransitionChecks, ...requiredLifecycleTransitionChecks].map(name => ({ name, conclusion: 'success' })) }] } };
}
function fixture(t) {
  const base = resolve(root, 'build'), dir = mkdtempSync(join(base, 'lifecycle-operator-test-'));
  t.after(() => { const inside = relative(base, resolve(dir)); assert(inside && !inside.startsWith('..') && !isAbsolute(inside)); rmSync(dir, { recursive: true }); });
  const identity = { createTime: [1, 0], updateTime: [1, 0], hash: 'b'.repeat(64) };
  const body = { v: 1, kind: 'content-lifecycle-capture-start', projectId: project, writerCommit: 'a'.repeat(40), control: null,
    feed: { control: identity, generations: [{ id: 'feed-v3', createTime: [1, 0], format: 'c'.repeat(64) }] } };
  const digest = createHash('sha256').update(canonical(body)).digest('hex'), plan = { ...body, digest }, file = join(dir, 'plan.json');
  writeFileSync(file, JSON.stringify(plan));
  const args = ['start', '--project', project, '--plan', relative(root, file), '--approved-digest', digest, '--confirm-project', project,
    '--ci-run', '123', '--confirm-compatible-writers', project];
  return { plan, args, dir };
}
test('archive operator accepts only a clean exact full CI and never a production target', () => {
  assertLifecycleTransitionRelease(project, proof());
  for (const key of ['headSha', 'status', 'conclusion']) { const p = proof(); p.ci[key] = 'bad'; assert.throws(() => assertLifecycleTransitionRelease(project, p)); }
  for (const name of [...requiredTransitionChecks, ...requiredLifecycleTransitionChecks]) {
    const p = proof(); p.ci.jobs[0].steps = p.ci.jobs[0].steps.filter(s => s.name !== name); assert.throws(() => assertLifecycleTransitionRelease(project, p));
  }
  const skipped = proof(); skipped.ci.jobs[0].steps[0].conclusion = 'skipped'; assert.throws(() => assertLifecycleTransitionRelease(project, skipped));
  assert.throws(() => assertLifecycleTransitionRelease(project, { ...proof(), dirty: '?? changed' }));
  assert.throws(() => assertLifecycleTransitionRelease('shoutout-production-a1b34', { ...proof(), branch: 'main', tag: 'v1.0.0', tagCommit: 'a'.repeat(40) }));
});
test('arguments refuse implicit targets, duplicate flags, unknown actions, path escapes and absent approvals', () => {
  for (const args of [[], ['activate', '--project', project], ['plan'], ['plan', '--project', project],
    ['plan', '--project', project, '--output', '../outside.json'], ['plan', '--project', project, '--output', 'build/x', '--project', project],
    ['plan', '--project', project, '--output', 'build/x', '--force', 'true'], ['start', '--project', project, '--plan', 'build/x'],
    ['plan', '--project', 'shoutout-production-a1b34', '--output', 'build/x']]) assert.throws(() => parseLifecycleTransitionArguments(args));
  assert.equal(parseLifecycleTransitionArguments(['plan', '--project', project, '--output', 'build/x']).mutating, false);
});
test('disabled capture, mismatched release and malformed plan stop before database or Auth access', async t => {
  const f = fixture(t), openDatabase = () => assert.fail('database must not open');
  const feedConfiguration = { compatibleGenerations: true, cardStateEnabled: true };
  await assert.rejects(main(f.args, { openDatabase, inspectRelease: proof, feedConfiguration, configuration: { enabled: false, captureEnabled: false } }), /capture-release-required/);
  await assert.rejects(main(f.args, { openDatabase, inspectRelease: () => ({ ...proof(), dirty: 'changed' }) }), /clean-exact-full-ci/);
  await assert.rejects(main(f.args, { openDatabase, inspectRelease: proof, feedConfiguration, configuration: { enabled: true, captureEnabled: true } }), /capture-only-release-required/);
  const p = proof(); p.commit = p.ci.headSha = 'd'.repeat(40);
  await assert.rejects(main(f.args, { openDatabase, inspectRelease: () => p, feedConfiguration, configuration: { enabled: false, captureEnabled: true } }), /start-source-mismatch/);
  const bad = [...f.args]; bad[bad.indexOf('--approved-digest') + 1] = '0'.repeat(64);
  await assert.rejects(main(bad, { openDatabase, inspectRelease: proof }), /invalid-lifecycle/);
});
test('read-only inventory commands verify the opened project and always terminate the database', async t => {
  const f = fixture(t); let closed = false;
  await assert.rejects(main(['plan', '--project', project, '--output', relative(root, join(f.dir, 'inventory.json'))], {
    openDatabase: async () => ({ projectId: 'wrong', async terminate() { closed = true; } }),
  }), /database-project-mismatch/);
  assert(closed);
});
