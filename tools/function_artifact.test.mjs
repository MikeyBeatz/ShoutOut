import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareFunctionArtifact } from './function_artifact.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('both real artifacts include runtime dependency closure and exclude all lab/test modules', () => {
  for (const [directory, entry] of [['functions-content', 'content.js'], ['functions-account-deletion', 'account_deletion_dev.js']]) {
    const artifact = prepareFunctionArtifact(root, directory, entry);
    for (const required of ['feed_runtime.js', 'feed_index_paths.js', 'feed_early_erasure_queue.js', 'feed_account_retention_runner.js',
      'feed_block_index_store.js', 'feed_account_retention_store.js', 'feed_index_gc_store.js']) assert(artifact.files.includes(required), required);
    const actual = readdirSync(artifact.target).filter(file => file.endsWith('.js')).sort();
    // B2 is approved only locally. A later rollout must explicitly install its host.
    assert(!actual.includes('read_sync.js'));
    assert(!actual.includes('read_sync_blocks.js'));
    assert.deepEqual(actual, artifact.files);
    const manifest = JSON.parse(readFileSync(resolve(artifact.target, 'package.json')));
    assert.equal(manifest.main, entry); assert.equal(manifest.scripts, undefined);
    for (const name of actual) {
      assert(!/(?:_lab|\.test)\.js$/.test(name));
      const code = readFileSync(resolve(artifact.target, name), 'utf8');
      assert.equal(code, readFileSync(resolve(root, 'functions', name), 'utf8'));
      for (const match of code.matchAll(/\b(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) assert(actual.includes(match[1].slice(2)), `${name}: ${match[1]}`);
      for (const match of code.matchAll(/\bfrom\s*['"]([^.'"][^'"]+)['"]/g)) {
        const dependency = match[1]; if (dependency.startsWith('node:')) continue;
        const packageName = dependency.split('/').slice(0, dependency.startsWith('@') ? 2 : 1).join('/');
        assert(Object.hasOwn(manifest.dependencies, packageName), `${name}: undeclared ${packageName}`);
      }
    }
  }
});

test('artifact preparation rejects fixture imports and removes obsolete root modules', t => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'shoutout-artifact-'));
  t.after(() => {
    assert.equal(dirname(temporary), resolve(tmpdir())); assert(temporary.startsWith(resolve(tmpdir(), 'shoutout-artifact-')));
    rmSync(temporary, { recursive: true });
  });
  const source = resolve(temporary, 'functions'); mkdirSync(source);
  writeFileSync(resolve(source, 'entry.js'), "export { value } from './helper.js';");
  writeFileSync(resolve(source, 'helper.js'), 'export const value = 1;');
  writeFileSync(resolve(source, 'package.json'), '{"scripts":{"test":"unsafe"}}');
  writeFileSync(resolve(source, 'package-lock.json'), '{}');
  const initial = prepareFunctionArtifact(temporary, 'artifact', 'entry.js');
  writeFileSync(resolve(initial.target, 'stale_lab.js'), 'throw new Error();');
  const final = prepareFunctionArtifact(temporary, 'artifact', 'entry.js');
  assert.deepEqual(readdirSync(final.target).filter(name => name.endsWith('.js')).sort(), ['entry.js', 'helper.js']);
  writeFileSync(resolve(source, 'entry.js'), "export { value } from './helper_lab.js';");
  assert.throws(() => prepareFunctionArtifact(temporary, 'artifact', 'entry.js'), /unsafe-functions-artifact-module/);
  writeFileSync(resolve(source, 'entry.js'), "export { value } from '../helper.js';");
  assert.throws(() => prepareFunctionArtifact(temporary, 'artifact', 'entry.js'), /unsafe-functions-artifact-import/);
  assert.throws(() => prepareFunctionArtifact(temporary, '../../outside', 'entry.js'), /unsafe-functions-artifact-directory/);
});
