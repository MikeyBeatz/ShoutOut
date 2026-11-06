import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareFunctionArtifact } from './function_artifact.mjs';

// Preparation only: does not run Firebase or change any external environment.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
prepareFunctionArtifact(root, 'functions-content', 'content.js');
writeFileSync(resolve(root, 'build/firebase-content.json'), JSON.stringify({
  functions: { source: 'functions-content', codebase: 'content' },
}, null, 2) + '\n');
console.log('Prepared content-only Functions artifact at build/functions-content.');
