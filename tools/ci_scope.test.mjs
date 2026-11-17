import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyChanges, parseChangedPaths, selectCiScope } from './ci_scope.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const change = path => ({ status: 'M', paths: [path] });
function fixture(t) {
  const workspace = mkdtempSync(resolve(tmpdir(), 'shoutout-ci-scope-')), root = resolve(workspace, 'project');
  mkdirSync(root);
  t.after(() => { assert.equal(dirname(workspace), resolve(tmpdir())); assert(workspace.startsWith(resolve(tmpdir(), 'shoutout-ci-scope-'))); rmSync(workspace, { recursive: true }); });
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (path, content) => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), content); };
  git(['init', '-q', '--initial-branch=main']);
  git(['config', 'user.name', 'CI fixture']); git(['config', 'user.email', 'ci-fixture@example.invalid']); git(['config', 'core.autocrlf', 'false']);
  const commit = () => { git(['add', '-A']); git(['commit', '-qm', 'Fixture change']); return git(['rev-parse', 'HEAD']).trim(); };
  write('README.md', 'Documentation\n'); write('lib/app.dart', 'initial app\n'); write('docs/TODO.md', 'initial plan\n');
  const base = commit();
  return { workspace, root, git, write, commit, base,
    push(before, after) { return selectCiScope({ cwd: root, eventName: 'push', expectedSha: after, event: { before, after, ref: 'refs/heads/feature' } }); } };
}

test('documentation/progress use the lightweight path while app, config, dependencies and unknown paths run full', () => {
  for (const path of ['docs/TODO.md', 'docs/PROGRESS.md', 'docs/progress.json', 'docs/archive/snapshots.json', 'docs/archive/TODO.txt', 'README.md', 'tools/README.md', 'AGENTS.md', 'tools/project_progress.mjs', 'tools/project_progress.test.mjs', 'tools/check_docs.mjs']) {
    assert.equal(classifyChanges([change(path)]).full, false, path);
  }
  for (const path of ['lib/main.dart', 'functions/read_sync.js', 'firestore.rules', 'storage.rules', 'config/dev.json', 'docs/benchmarks/result.json', 'tools/package-lock.json', 'tools/package.json', 'tools/web_environment.mjs', 'tools/ci_scope.mjs', '.github/workflows/flutter.yml', '.nvmrc', '.gitattributes', 'assets/avatar.png', 'unknown', '../docs/TODO.md']) {
    assert.equal(classifyChanges([change('docs/TODO.md'), change(path)]).full, true, path);
  }
});

test('NUL diff parsing handles spaces, Unicode, newlines and both rename paths without shell parsing', () => {
  const parsed = parseChangedPaths('M\0docs/přehled změn.md\0R100\0docs/old name.md\0docs/new\nname.md\0');
  assert.equal(parsed.length, 2); assert.equal(parsed[1].paths[1], 'docs/new\nname.md');
  assert.equal(classifyChanges(parsed).full, false);
  assert.equal(classifyChanges([{ status: 'R100', paths: ['lib/app.dart', 'docs/app.md'] }]).full, true);
  assert.equal(classifyChanges([{ status: 'R100', paths: ['docs/app.md', 'lib/app.dart'] }]).full, true);
  assert.equal(classifyChanges([{ status: 'R100', paths: ['tools/check_docs.mjs', 'docs/removed.md'] }]).full, true);
  assert.equal(classifyChanges([{ status: 'D', paths: ['tools/project_progress.mjs'] }]).full, true);
  assert.equal(classifyChanges([{ status: 'D', paths: ['docs/old.md'] }]).full, false);
  for (const raw of ['', 'M\0', 'R100\0docs/old.md\0', 'bad\0docs/a.md\0', 'M\0docs/a.md']) assert.throws(() => parseChangedPaths(raw));
  for (const status of ['T', 'U', 'X', 'bad']) assert.equal(classifyChanges([{ status, paths: ['docs/a.md'] }]).full, true);
});

test('the whole push range detects an earlier app change followed by a docs-only final commit', t => {
  const f = fixture(t); f.write('lib/app.dart', 'changed app\n'); f.commit();
  f.write('docs/TODO.md', 'new plan\n'); const head = f.commit();
  assert.equal(f.push(f.base, head).full, true);
});

test('multiple documentation commits form a lightweight push', t => {
  const f = fixture(t); f.write('docs/TODO.md', 'new plan\n'); f.commit();
  f.write('docs/přehled změn.md', 'Unicode document\n'); const head = f.commit();
  const result = f.push(f.base, head); assert.equal(result.full, false); assert.equal(result.changed, 2);
});

test('a first documentation branch push can use an existing remote parent without GitHub API calls', t => {
  const f = fixture(t), remote = resolve(f.workspace, 'remote.git');
  execFileSync('git', ['init', '--bare', '-q', remote]); f.git(['remote', 'add', 'origin', remote]); f.git(['push', '-q', 'origin', 'main']);
  f.git(['checkout', '-qb', 'feature/docs']); f.write('docs/TODO.md', 'new plan\n'); const head = f.commit();
  const event = { before: '0'.repeat(40), after: head, ref: 'refs/heads/feature/docs', created: true };
  assert.equal(selectCiScope({ cwd: f.root, eventName: 'push', expectedSha: head, event }).full, false);
  // An app change in a new branch must not hide behind a later docs commit.
  f.write('lib/app.dart', 'new app\n'); f.commit(); f.write('docs/TODO.md', 'next plan\n'); const later = f.commit();
  assert.equal(selectCiScope({ cwd: f.root, eventName: 'push', expectedSha: later, event: { ...event, after: later } }).full, true);
});

test('a PR checks the exact synthetic merge tree against its base, with a conservative head-checkout fallback', t => {
  const f = fixture(t);
  f.git(['checkout', '-qb', 'feature/docs']); f.write('docs/TODO.md', 'feature plan\n'); const source = f.commit();
  f.git(['checkout', '-q', 'main']); f.write('lib/app.dart', 'new base app\n'); const base = f.commit();
  f.git(['merge', '--no-ff', '-qm', 'Synthetic PR merge', 'feature/docs']); const head = f.git(['rev-parse', 'HEAD']).trim();
  const event = { pull_request: { base: { sha: base }, head: { sha: source } } };
  assert.equal(selectCiScope({ cwd: f.root, eventName: 'pull_request', expectedSha: head, event }).full, false);
  f.git(['checkout', '-q', 'feature/docs']);
  assert.equal(selectCiScope({ cwd: f.root, eventName: 'pull_request', expectedSha: source, event }).full, true);
});

test('renaming application code into documentation still selects full checks on a real Git diff', t => {
  const f = fixture(t); f.git(['mv', 'lib/app.dart', 'docs/app.md']); const head = f.commit();
  assert.equal(f.push(f.base, head).full, true);
});

test('missing shallow base fetches only a validated immutable SHA; a failed fetch runs full', () => {
  const head = 'a'.repeat(40), base = 'b'.repeat(40), calls = [];
  const options = { eventName: 'push', expectedSha: head, event: { before: base, after: head, ref: 'refs/heads/test' } };
  const git = args => {
    calls.push(args);
    if (args[0] === 'rev-parse') return head;
    if (args[0] === 'cat-file') throw Error('shallow');
    if (args[0] === 'fetch') return '';
    return 'M\0docs/TODO.md\0';
  };
  assert.equal(selectCiScope({ ...options, git }).full, false);
  assert.deepEqual(calls.find(args => args[0] === 'fetch'), ['fetch', '--no-tags', '--depth=1', 'origin', base]);
  assert.equal(selectCiScope({ ...options, git: args => { if (args[0] === 'rev-parse') return head; throw Error('unavailable'); } }).full, true);
  assert.equal(selectCiScope({ ...options, event: { ...options.event, before: '$(unsafe)' }, git }).full, true);
});

test('manual runs, tags, empty/invalid ranges, unknown events and checkout mismatches always run full', t => {
  const f = fixture(t), after = f.base;
  for (const eventName of ['workflow_dispatch', 'merge_group', undefined]) assert.equal(selectCiScope({ cwd: f.root, eventName, expectedSha: after, event: {} }).full, true);
  const event = { before: after, after, ref: 'refs/tags/v1.0.0' };
  assert.equal(selectCiScope({ cwd: f.root, eventName: 'push', expectedSha: after, event }).full, true);
  assert.equal(f.push(after, after).full, true);
  assert.equal(selectCiScope({ cwd: f.root, eventName: 'push', expectedSha: 'f'.repeat(40), event: { ...event, ref: 'refs/heads/test' } }).full, true);
});

test('the CLI emits a fixed boolean output and an explicit mode summary without installing dependencies', t => {
  const f = fixture(t); f.write('docs/TODO.md', 'changed plan\n'); const after = f.commit();
  const event = resolve(f.workspace, 'event.json'), output = resolve(f.workspace, 'outputs.txt'), summary = resolve(f.workspace, 'summary.md');
  writeFileSync(event, JSON.stringify({ before: f.base, after, ref: 'refs/heads/test' }));
  const result = spawnSync(process.execPath, [resolve(repository, 'tools/ci_scope.mjs')], { cwd: f.root, encoding: 'utf8',
    env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_SHA: after, GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary } });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).full, false);
  assert.equal(readFileSync(output, 'utf8'), 'full=false\n');
  assert(readFileSync(summary, 'utf8').includes('documentation and progress only'));
});

test('workflow keeps verify stable and gates every heavy step, while docs/selector checks always run', () => {
  const text = readFileSync(resolve(repository, '.github/workflows/flutter.yml'), 'utf8');
  assert(text.includes('  verify:')); assert(text.includes('  workflow_dispatch:')); assert(text.includes('fetch-depth: 2'));
  const always = new Set(['Check out repository', 'Set up Node.js', 'Select CI checks', 'Test CI selection and progress tools', 'Check documentation links and metrics']);
  const matches = [...text.matchAll(/^      - name: (.+)\r?$/gm)];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].trim(), block = text.slice(matches[i].index, matches[i + 1]?.index ?? text.length);
    if (always.has(name)) { assert(!block.includes('if:'), name); always.delete(name); }
    else assert(block.includes("steps.scope.outputs.full != 'false'"), name);
    if (name === 'Set up Node.js') assert(!block.includes('cache:'), 'Light checks must not restore dependency caches');
  }
  assert.equal(always.size, 0);
});
