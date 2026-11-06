import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareFunctionArtifact } from './function_artifact.mjs';

// Preparation only. Separate codebase; does not run Firebase or deploy anything.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
prepareFunctionArtifact(root, 'functions-account-deletion', 'account_deletion_dev.js');
writeFileSync(resolve(root, 'build/firebase-account-deletion.json'), JSON.stringify({
  functions: { source: 'functions-account-deletion', codebase: 'account-deletion' },
}, null, 2) + '\n');
console.log('Prepared proposed DEV account-deletion artifact; nothing deployed.');
