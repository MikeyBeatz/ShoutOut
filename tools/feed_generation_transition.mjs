import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { feedRuntimeConfiguration } from '../functions/feed_runtime.js';
import { planFeedTransition, validateTransitionPlan, transitionStatus, runFeedTransitionStep } from '../functions/feed_transition_operator.js';

const root = resolve(import.meta.dirname, '..');
const projects = ['shoutout-dev-46c81', 'shoutout-production-a1b34'];
export const requiredTransitionChecks = Object.freeze(['Test CI selection and progress tools', 'Check documentation links and metrics',
  'Verify formatting', 'Analyze', 'Test', 'Test browser read-state persistence',
  'Test development tools', 'Lint Cloud Functions', 'Test Cloud Functions', 'Test Firestore Rules and server transactions',
  'Test prepared B2 runtime', 'Test final account retention cleanup', 'Test Storage Rules and cross-service identity access', 'Build web']);
export function assertTransitionRelease(projectId, { branch, dirty, commit, tag, tagCommit, ci } = {}) {
  if (!projects.includes(projectId) || dirty !== '' || !/^[a-f0-9]{40}$/.test(commit ?? '') ||
      ci?.headSha !== commit || ci.status !== 'completed' || ci.conclusion !== 'success' || ci.workflowName !== 'Flutter checks' ||
      !requiredTransitionChecks.every(name => ci.jobs?.some(job => job.conclusion === 'success' &&
        job.steps?.some(step => step.name === name && step.conclusion === 'success')))) throw new Error('feed-transition-clean-exact-full-ci-required');
  if (projectId === 'shoutout-production-a1b34' &&
      (branch !== 'main' || !/^v\d+\.\d+\.\d+$/.test(tag ?? '') || tagCommit !== commit)) throw new Error('feed-transition-production-release-required');
}
function command(binary, args) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('feed-transition-verification-command-failed');
  return result.stdout.trim();
}
export function inspectTransitionRelease(options) {
  const tag = options['--tag'];
  return { commit: command('git', ['rev-parse', 'HEAD']), branch: command('git', ['branch', '--show-current']),
    dirty: command('git', ['status', '--porcelain', '--untracked-files=all']), tag,
    tagCommit: tag ? command('git', ['rev-parse', `${tag}^{commit}`]) : null,
    ci: JSON.parse(command('gh', ['run', 'view', options['--ci-run'], '--repo', 'MikeyBeatz/ShoutOut',
      '--json', 'headSha,status,conclusion,workflowName,jobs'])) };
}
function workspacePath(path) {
  const full = resolve(root, path), inside = relative(root, full);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('feed-transition-path-must-stay-in-workspace');
  return full;
}
export function parseTransitionArguments(argv) {
  const [action, ...rest] = argv, options = {};
  const mutators = ['start', 'backfill', 'begin-audit', 'audit', 'activate', 'rollback', 'resume', 'abort'];
  if (!['plan', 'status', ...mutators].includes(action)) throw new Error('explicit-feed-transition-action-required');
  const allowed = action === 'plan' ? ['--project', '--generation', '--output'] : action === 'status' ? ['--project', '--plan'] :
    ['--project', '--plan', '--approved-digest', '--confirm-project', '--ci-run', '--tag'];
  for (let i = 0; i < rest.length; i += 2) {
    if (!allowed.includes(rest[i]) || typeof rest[i + 1] !== 'string' || rest[i + 1].startsWith('--') ||
        Object.hasOwn(options, rest[i])) throw new Error('invalid-feed-transition-options');
    options[rest[i]] = rest[i + 1];
  }
  const projectId = options['--project'];
  if (!projects.includes(projectId) || action === 'plan' && !/^[a-z][a-z0-9-]{0,39}$/.test(options['--generation'] ?? '') ||
      action !== 'plan' && !options['--plan']) throw new Error('explicit-feed-transition-project-and-plan-required');
  if (mutators.includes(action) && (options['--confirm-project'] !== projectId || !/^\d+$/.test(options['--ci-run'] ?? '') ||
      !/^[a-f0-9]{64}$/.test(options['--approved-digest'] ?? ''))) throw new Error('feed-transition-explicit-approval-and-ci-required');
  return { action, projectId, options, mutating: mutators.includes(action) };
}
// Dependencies are injectable for offline contract tests, never CLI arguments.
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease,
  configuration = feedRuntimeConfiguration } = {}) {
  const { action, projectId, options, mutating } = parseTransitionArguments(argv);
  const plan = action === 'plan' ? null : JSON.parse(readFileSync(workspacePath(options['--plan']), 'utf8'));
  if (plan) validateTransitionPlan(plan, projectId, mutating ? options['--approved-digest'] : plan.digest);
  let proof;
  if (mutating) {
    proof = inspectRelease(options); assertTransitionRelease(projectId, proof);
    if (configuration.compatibleGenerations !== true) throw new Error('feed-compatible-writer-release-required');
  }
  const db = await openDatabase(projectId);
  if (db.projectId !== projectId) { await db.terminate(); throw new Error('feed-transition-database-project-mismatch'); }
  try {
    if (action === 'plan') {
      const prepared = await planFeedTransition(db, options['--generation']);
      const output = workspacePath(options['--output'] ?? `docs/local/migrations/feed-transition-${projectId}-${prepared.targetGenerationId}.json`);
      mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(prepared, null, 2) + '\n', { flag: 'wx' });
      return { action, projectId, planFile: output, digest: prepared.digest, writes: 0 };
    }
    if (action === 'status') return { action, ...(await transitionStatus(db, plan)), writes: 0 };
    return { sourceCommit: proof.commit, ciRun: options['--ci-run'],
      ...(await runFeedTransitionStep(db, plan, action, { approvedDigest: options['--approved-digest'], compatibleWriters: true })) };
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(value => process.stdout.write(JSON.stringify(value) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: /^(feed-|invalid-|explicit-)/.test(error.message ?? '') ? error.message : 'feed-transition-command-failed' }) + '\n');
    process.exitCode = 1;
  });
}
