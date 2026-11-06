import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';

const root = resolve(import.meta.dirname, '..');
function command(binary, args) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('feed-bootstrap-verification-command-failed');
  return result.stdout.trim();
}
export function assertBootstrapRelease(projectId, { branch, dirty, commit, tagCommit, tag, ci } = {}) {
  if (!['shoutout-dev-46c81', 'shoutout-production-a1b34'].includes(projectId) || dirty || !/^[a-f0-9]{40}$/.test(commit ?? '') ||
      ci?.headSha !== commit || ci.status !== 'completed' || ci.conclusion !== 'success' || ci.workflowName !== 'Flutter checks') throw new Error('feed-bootstrap-clean-exact-ci-required');
  if (projectId === 'shoutout-production-a1b34' &&
      (branch !== 'main' || !/^v\d+\.\d+\.\d+$/.test(tag ?? '') || tagCommit !== commit)) throw new Error('feed-bootstrap-production-release-required');
}
export async function main(argv) {
  const [action, ...rest] = argv, options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--project', '--generation', '--output', '--plan', '--approved-digest', '--confirm-project', '--ci-run', '--tag'].includes(rest[i]) ||
        typeof rest[i + 1] !== 'string' || rest[i + 1].startsWith('--') || Object.hasOwn(options, rest[i])) throw new Error('invalid-feed-bootstrap-options');
    options[rest[i]] = rest[i + 1];
  }
  const projectId = options['--project'];
  if (!['plan', 'initialize', 'activate', 'pause', 'resume', 'status'].includes(action) ||
      !['shoutout-dev-46c81', 'shoutout-production-a1b34'].includes(projectId)) throw new Error('explicit-bootstrap-action-and-project-required');
  let commit;
  if (!['plan', 'status'].includes(action)) {
    if (options['--confirm-project'] !== projectId || !/^\d+$/.test(options['--ci-run'] ?? '') || !options['--plan'] || !options['--approved-digest']) {
      throw new Error('feed-bootstrap-explicit-approval-and-ci-required');
    }
    commit = command('git', ['rev-parse', 'HEAD']);
    const ci = JSON.parse(command('gh', ['run', 'view', options['--ci-run'], '--repo', 'MikeyBeatz/ShoutOut', '--json', 'headSha,status,conclusion,workflowName']));
    const tag = options['--tag'], branch = command('git', ['branch', '--show-current']);
    assertBootstrapRelease(projectId, { commit, ci, branch, dirty: command('git', ['status', '--porcelain']), tag,
      tagCommit: tag ? command('git', ['rev-parse', `${tag}^{commit}`]) : null });
  }
  const { planEmptyFeedBootstrap, initializeEmptyFeedBootstrap, activateEmptyFeedBootstrap, setBootstrappedReaderPaused } =
    await import('../functions/feed_empty_bootstrap.js');
  const db = await feedAdminDatabase(projectId);
  try {
    if (action === 'plan') {
      const plan = await planEmptyFeedBootstrap(db, options['--generation']);
      const output = resolve(root, options['--output'] ?? `docs/local/migrations/feed-bootstrap-${projectId}-${plan.generationId}.json`);
      if (relative(root, output).startsWith('..')) throw new Error('feed-bootstrap-output-must-stay-in-workspace');
      mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
      return { action, projectId, digest: plan.digest, planFile: output, writes: 0 };
    }
    if (action === 'status') {
      const [control, receipt] = await db.getAll(db.doc('feedIndexControl/current'), db.doc('feedIndexMaintenance/bootstrap'));
      return { action, projectId, controlExists: control.exists, mode: control.get('mode') ?? null, bootstrapStage: receipt.get('stage') ?? null };
    }
    const plan = JSON.parse(readFileSync(resolve(root, options['--plan']), 'utf8')), args = { approvedDigest: options['--approved-digest'], writerCommit: commit };
    const result = action === 'initialize' ? await initializeEmptyFeedBootstrap(db, plan, args) :
      action === 'activate' ? await activateEmptyFeedBootstrap(db, plan, args) :
        await setBootstrappedReaderPaused(db, plan, { ...args, paused: action === 'pause' });
    return { action, projectId, sourceCommit: commit, ...result };
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: typeof error.code === 'string' || typeof error.code === 'number' ? error.code :
      /^(feed-|invalid-|explicit-|existing-)/.test(error.message ?? '') ? error.message : 'feed-bootstrap-failed' }) + '\n');
    process.exitCode = 1;
  });
}
