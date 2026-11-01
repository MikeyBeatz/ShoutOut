import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Preparation only. Separate codebase; does not run Firebase or deploy anything.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'build/functions-account-deletion');
mkdirSync(target, { recursive: true });
for (const file of ['account_deletion_dev.js', 'account_deletion_job.js', 'account_deletion_job_scan.js',
  'account_deletion_event.js', 'account_shout_hiding.js', 'account_private_cleanup.js', 'package-lock.json']) {
  copyFileSync(resolve(root, 'functions', file), resolve(target, file));
}
const manifest = JSON.parse(readFileSync(resolve(root, 'functions/package.json'), 'utf8'));
manifest.main = 'account_deletion_dev.js'; delete manifest.scripts;
writeFileSync(resolve(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(resolve(root, 'build/firebase-account-deletion.json'), JSON.stringify({
  functions: { source: 'functions-account-deletion', codebase: 'account-deletion' },
}, null, 2) + '\n');
console.log('Prepared proposed DEV account-deletion artifact; nothing deployed.');
