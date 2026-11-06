import { copyFileSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

// Follow the actual module graph, not a second hand-maintained list. Reject
// fixture/test entry points and paths escaping the server source directory.
export function prepareFunctionArtifact(root, directory, entry) {
  if (typeof directory !== 'string' || !/^[a-z][a-z0-9-]*$/.test(directory)) throw new Error('unsafe-functions-artifact-directory');
  const source = resolve(root, 'functions'), target = resolve(root, 'build', directory);
  const pending = [entry], files = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (files.has(name)) continue;
    if (basename(name) !== name || !name.endsWith('.js') || /(?:_lab|\.test)\.js$/.test(name)) throw new Error('unsafe-functions-artifact-module');
    const code = readFileSync(resolve(source, name), 'utf8');
    files.add(name);
    for (const match of code.matchAll(/\b(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
      if (!match[1].startsWith('./') || dirname(match[1]) !== '.') throw new Error('unsafe-functions-artifact-import');
      pending.push(match[1].slice(2));
    }
  }
  mkdirSync(target, { recursive: true });
  // Remove obsolete root modules from previous builds; leave installed deps.
  for (const file of readdirSync(target, { withFileTypes: true })) {
    if (file.isFile() && file.name.endsWith('.js') && !files.has(file.name)) unlinkSync(resolve(target, file.name));
  }
  for (const name of [...files, 'package-lock.json']) copyFileSync(resolve(source, name), resolve(target, name));
  const manifest = JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8'));
  manifest.main = entry; delete manifest.scripts;
  writeFileSync(resolve(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { target, files: [...files].sort() };
}
