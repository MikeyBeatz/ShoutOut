import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { assertTransitionRelease, inspectTransitionRelease, parseTransitionArguments } from './feed_generation_transition.mjs';
import { feedRuntimeConfiguration } from '../functions/feed_runtime.js';
import { planCardTransition, validateCardTransitionPlan, cardTransitionStatus, runCardTransitionStep } from '../functions/feed_card_transition_operator.js';

const root = resolve(import.meta.dirname, '..');
export const requiredCardChecks = ['Test consistent B4 reader', 'Test B4 card states and resumable backfill',
  'Test B4 client transport, state Rules and Chrome against emulator', 'Test B4 controlled transition'];
export function assertCardTransitionRelease(projectId, proof) {
  assertTransitionRelease(projectId, proof);
  if (!requiredCardChecks.every(name => proof.ci.jobs.some(job => job.conclusion === 'success' && job.steps?.some(step => step.name === name && step.conclusion === 'success')))) throw new Error('card-transition-complete-b4-ci-required');
}
function pathInRoot(input) {
  const path = resolve(root, input), inside = relative(root, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('card-transition-workspace-path-required'); return path;
}
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease, configuration = feedRuntimeConfiguration } = {}) {
  const { action, projectId, options, mutating } = parseTransitionArguments(argv);
  const plan = action === 'plan' ? null : JSON.parse(readFileSync(pathInRoot(options['--plan']), 'utf8'));
  if (plan) validateCardTransitionPlan(plan, projectId, mutating ? options['--approved-digest'] : plan.digest);
  let release;
  if (mutating) {
    release = inspectRelease(options); assertCardTransitionRelease(projectId, release);
    if (!configuration.compatibleGenerations || !configuration.cardStateEnabled || !configuration.deltaResponsesEnabled) throw new Error('card-transition-activation-release-required');
  }
  const db = await openDatabase(projectId);
  try {
    if (db.projectId !== projectId) throw new Error('card-transition-database-project-mismatch');
    if (action === 'plan') {
      const plan = await planCardTransition(db, options['--generation']);
      const file = pathInRoot(options['--output'] ?? `docs/local/migrations/feed-card-${projectId}-${plan.targetGenerationId}.json`);
      mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
      return { projectId, file, digest: plan.digest, writes: 0 };
    }
    if (action === 'status') return await cardTransitionStatus(db, plan);
    return { sourceCommit: release.commit, ciRun: options['--ci-run'], ...(await runCardTransitionStep(db, plan, action,
      { approvedDigest: options['--approved-digest'], compatibleWriters: true })) };
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: /^(card-|invalid-|explicit-|feed-)/.test(error.message ?? '') ? error.message : 'card-transition-command-failed' }) + '\n'); process.exitCode = 1;
  });
}
