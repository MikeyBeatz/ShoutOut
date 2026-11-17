import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareFunctionArtifact } from './function_artifact.mjs';

// Preparation only: a separate codebase with exactly the two B2 callables.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
prepareFunctionArtifact(root, 'functions-read-sync', 'read_sync_host.js');
writeFileSync(resolve(root, 'build/firebase-read-sync.json'), JSON.stringify({
  functions: { source: 'functions-read-sync', codebase: 'read-sync' },
}, null, 2) + '\n');
console.log('Prepared isolated B2 Functions artifact; nothing deployed.');
