import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Preparation only: does not run Firebase or change any external environment.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'build/functions-content');
mkdirSync(target, { recursive: true });
for (const file of ['content.js', 'create_shout.js', 'create_comment.js', 'create_private_reply.js', 'toggle_shout_reaction.js', 'callable_security.js', 'package-lock.json']) {
  copyFileSync(resolve(root, 'functions', file), resolve(target, file));
}
const manifest = JSON.parse(readFileSync(resolve(root, 'functions/package.json'), 'utf8'));
manifest.main = 'content.js';
// No test/lint sources are part of the deployable artifact.
delete manifest.scripts;
writeFileSync(resolve(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(resolve(root, 'build/firebase-content.json'), JSON.stringify({
  functions: { source: 'functions-content', codebase: 'content' },
}, null, 2) + '\n');
console.log('Prepared content-only Functions artifact at build/functions-content.');
