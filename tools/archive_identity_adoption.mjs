// Prepared DEV operator. No contact observation, implicit key fetch or Auth scan.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { inspectTransitionRelease } from './feed_generation_transition.mjs';
import { assertLifecycleTransitionRelease } from './content_lifecycle_transition.mjs';
import { preparedArchiveIdentityRuntime } from '../functions/archive_identity_runtime.js';
import { planArchiveIdentityAdoption, applyArchiveIdentityAdoption, validateArchiveIdentityAdoption } from '../functions/archive_identity_adoption.js';
import { archiveIdentityConfiguration } from '../functions/archive_identity.js';
import { currentLegalPolicy } from '../functions/legal_policy.js';

const project = 'shoutout-dev-46c81', root = resolve(import.meta.dirname, '..');
function localFile(path) {
  if (typeof path !== 'string' || !path) throw new Error('identity-adoption-local-file-required');
  const full = resolve(root, path), inside = relative(root, full);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('identity-adoption-local-file-required');
  return full;
}
const read = path => JSON.parse(readFileSync(localFile(path), 'utf8'));
export function parseIdentityAdoptionArguments(argv) {
  const [action, ...rest] = argv, options = {};
  const allowed = ['--project', '--output', ...(action === 'plan' ? ['--paths'] :
    ['--plan', '--approved-digest', '--confirm-project', '--ci-run', '--confirm-compatible-writers'])];
  if (!['plan', 'apply'].includes(action) || rest.length % 2) throw new Error('identity-adoption-explicit-action-required');
  for (let n = 0; n < rest.length; n += 2) {
    if (!allowed.includes(rest[n]) || !rest[n + 1] || rest[n + 1].startsWith('--') || Object.hasOwn(options, rest[n])) throw new Error('identity-adoption-invalid-options');
    options[rest[n]] = rest[n + 1];
  }
  if (options['--project'] !== project) throw new Error('identity-adoption-explicit-dev-project-required');
  for (const name of ['--paths', '--plan', '--output']) if (options[name]) localFile(options[name]);
  if (!options['--output'] || action === 'plan' && !options['--paths'] || action === 'apply' &&
      (!options['--plan'] || options['--confirm-project'] !== project || options['--confirm-compatible-writers'] !== project ||
      !/^[a-f0-9]{64}$/.test(options['--approved-digest'] ?? '') || !/^[0-9]+$/.test(options['--ci-run'] ?? ''))) throw new Error('identity-adoption-explicit-plan-and-approval-required');
  return { action, projectId: project, options };
}
export async function main(argv, { openDatabase = feedAdminDatabase, runtime = preparedArchiveIdentityRuntime,
  inspectRelease = inspectTransitionRelease, configuration = archiveIdentityConfiguration, disclosurePolicy = currentLegalPolicy() } = {}) {
  const { action, projectId, options } = parseIdentityAdoptionArguments(argv);
  // Must stop before opening a database/reading a key on today's off release.
  if (configuration.enabled !== true || configuration.purgeEnabled !== true || !disclosurePolicy.archiveDisclosureEnabled) throw new Error('identity-adoption-active-release-required');
  const plan = options['--plan'] ? read(options['--plan']) : null;
  if (plan) validateArchiveIdentityAdoption(plan, projectId, options['--approved-digest']);
  if (action === 'apply') assertLifecycleTransitionRelease(projectId, inspectRelease(options));
  const output = localFile(options['--output']);
  // Reserve immutable output before any mutation, so an accidental file reuse
  // cannot apply a batch and only then report EEXIST.
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ state: 'started', projectId, action }) + '\n', { flag: 'wx' });
  const db = await openDatabase(projectId);
  try {
    if (db.projectId !== projectId) throw new Error('identity-adoption-database-project-mismatch');
    const rt = runtime(db);
    const result = action === 'plan' ? await planArchiveIdentityAdoption(rt, read(options['--paths']), { disclosurePolicy }) :
      await applyArchiveIdentityAdoption(rt, plan, { approvedDigest: options['--approved-digest'], disclosurePolicy });
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    return { projectId, action, file: output, digest: result.digest ?? plan.digest, writes: result.writes ?? 0 };
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
  .then(value => process.stdout.write(JSON.stringify(value) + '\n'))
  .catch(() => { process.stderr.write('identity-adoption-command-failed\n'); process.exitCode = 1; });
