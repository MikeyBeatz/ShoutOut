import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { inspectTransitionRelease, assertTransitionRelease } from './feed_generation_transition.mjs';
import { parsePrivatePilot } from './private_reply_deletion_pilot.mjs';
import { planDecisionPilot, validateDecisionPilot, seedDecisionPilot, decisionPilotStatus, cleanupDecisionPilot } from '../functions/content_report_decision_pilot.js';
const project = 'shoutout-dev-46c81', root = resolve(import.meta.dirname, '..');
function inside(value) {
  const file = resolve(root, value), rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('decision-pilot-workspace-path-required');
  return file;
}
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease } = {}) {
  delete process.env.DEBUG;
  const { action, options: o } = parsePrivatePilot(argv), file = inside(o['--state']);
  if (['seed', 'cleanup'].includes(action)) {
    const proof = inspectRelease(o); assertTransitionRelease(project, proof);
    if (!proof.ci.jobs.some(j => j.conclusion === 'success' && j.steps?.some(s => s.name === 'Test prepared content report decisions' && s.conclusion === 'success'))) throw Error('decision-pilot-full-decision-ci-required');
  }
  if (action === 'plan' && existsSync(file)) throw Error('decision-pilot-new-state-required');
  const db = await openDatabase(project);
  try {
    if (db.projectId !== project) throw Error('decision-pilot-project-mismatch');
    let state = action === 'plan' ? null : JSON.parse(readFileSync(file, 'utf8'));
    const persist = () => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(state, null, 2) + '\n'); renameSync(file + '.tmp', file); };
    if (action === 'plan') {
      const actors = JSON.parse(readFileSync(inside(o['--actors']), 'utf8'));
      if (actors.projectId !== project) throw Error('decision-pilot-actor-project-mismatch');
      state = { v: 1, phase: 'planned', plan: await planDecisionPilot(db, actors.actors, actors.staff) }; persist();
      return { digest: state.plan.digest, originals: state.plan.base.originals.length, cloudWrites: 0 };
    }
    validateDecisionPilot(db, state.plan);
    if (action === 'status') return { phase: state.phase, ...await decisionPilotStatus(db, state.plan) };
    if (state.plan.digest !== o['--approved-digest']) throw Error('decision-pilot-approved-digest-required');
    if (action === 'seed') {
      if (!['planned', 'seeding', 'seeded'].includes(state.phase)) throw Error('decision-pilot-cleanup-started');
      state.phase = 'seeding'; persist(); const result = await seedDecisionPilot(db, state.plan);
      state.phase = result.waitingForReportCooldown ? 'seeding' : 'seeded'; state.seed = result; persist(); return result;
    }
    if (!['seeded', 'cleaning', 'cleaned'].includes(state.phase)) throw Error('decision-pilot-not-seeded');
    state.phase = 'cleaning'; persist(); const result = await cleanupDecisionPilot(db, state.plan);
    state.phase = 'cleaned'; state.cleanup = result; persist(); return result;
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
  .then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: /^(private-|decision-pilot-|feed-transition-)/.test(error.message ?? '') ? error.message : 'decision-pilot-failed' }) + '\n'); process.exitCode = 1;
  });
