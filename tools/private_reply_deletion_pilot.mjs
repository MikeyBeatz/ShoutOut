import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { inspectTransitionRelease, assertTransitionRelease } from './feed_generation_transition.mjs';
import { privateDeletionProject, planPrivateDeletionPilot, validatePrivateDeletionPilot, seedPrivateDeletionPilot,
  privateDeletionPilotStatus, cleanupPrivateDeletionPilot } from '../functions/private_reply_deletion_pilot.js';
const root = resolve(import.meta.dirname, '..');
function inside(value) {
  const file = resolve(root, value), rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('private-pilot-workspace-path-required');
  return file;
}
export function parsePrivatePilot(argv) {
  const [action, ...args] = argv, options = {};
  if (!['plan', 'status', 'seed', 'cleanup'].includes(action)) throw Error('private-pilot-explicit-action-required');
  const allowed = ['--project', '--state', '--actors', '--ci-run', '--approved-digest', '--confirm-project', '--clients-ready', '--clients-complete'];
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(options, args[i])) throw Error('private-pilot-invalid-options');
    options[args[i]] = args[i + 1];
  }
  if (options['--project'] !== privateDeletionProject || !options['--state']) throw Error('private-pilot-explicit-dev-required');
  inside(options['--state']);
  if (action === 'plan' && !options['--actors']) throw Error('private-pilot-actors-required');
  if (['seed', 'cleanup'].includes(action) && (options['--confirm-project'] !== privateDeletionProject || !/^\d+$/.test(options['--ci-run'] ?? '') ||
    !/^[a-f0-9]{64}$/.test(options['--approved-digest'] ?? ''))) throw Error('private-pilot-approval-required');
  if (action === 'seed' && options['--clients-ready'] !== 'yes') throw Error('private-pilot-client-readiness-required');
  if (action === 'cleanup' && options['--clients-complete'] !== 'yes') throw Error('private-pilot-client-completion-required');
  return { action, options };
}
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease } = {}) {
  delete process.env.DEBUG;
  const { action, options: o } = parsePrivatePilot(argv), file = inside(o['--state']);
  if (['seed', 'cleanup'].includes(action)) {
    const proof = inspectRelease(o); assertTransitionRelease(privateDeletionProject, proof);
    if (!proof.ci.jobs.some(j => j.conclusion === 'success' && j.steps?.some(s => s.name === 'Test prepared private reply deletion' && s.conclusion === 'success'))) throw Error('private-pilot-full-private-ci-required');
  }
  if (action === 'plan' && existsSync(file)) throw Error('private-pilot-new-state-required');
  const db = await openDatabase(privateDeletionProject);
  try {
    if (db.projectId !== privateDeletionProject) throw Error('private-pilot-project-mismatch');
    let state = action === 'plan' ? null : JSON.parse(readFileSync(file, 'utf8'));
    const persist = () => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(state, null, 2) + '\n'); renameSync(file + '.tmp', file); };
    if (action === 'plan') {
      const actors = JSON.parse(readFileSync(inside(o['--actors']), 'utf8'));
      if (actors.projectId !== privateDeletionProject) throw Error('private-pilot-actor-project-mismatch');
      state = { v: 1, phase: 'planned', plan: await planPrivateDeletionPilot(db, actors.actors) }; persist();
      return { digest: state.plan.digest, originals: state.plan.originals.length, cloudWrites: 0 };
    }
    validatePrivateDeletionPilot(db, state.plan);
    if (action === 'status') return { phase: state.phase, ...await privateDeletionPilotStatus(db, state.plan) };
    if (state.plan.digest !== o['--approved-digest']) throw Error('private-pilot-approved-digest-required');
    if (action === 'seed') {
      if (!['planned', 'seeding', 'seeded'].includes(state.phase)) throw Error('private-pilot-cleanup-started');
      state.phase = 'seeding'; persist(); const result = await seedPrivateDeletionPilot(db, state.plan);
      state.phase = 'seeded'; state.seed = result; persist(); return result;
    }
    state.phase = 'cleaning'; persist(); const result = await cleanupPrivateDeletionPilot(db, state.plan);
    state.phase = 'cleaned'; state.cleanup = result; persist(); return result;
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
  .then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: /^private-pilot-|^feed-transition-/.test(error.message ?? '') ? error.message : 'private-pilot-failed' }) + '\n'); process.exitCode = 1;
  });
