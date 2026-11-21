import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import {inspectTransitionRelease} from './feed_generation_transition.mjs';
import {assertCardTransitionRelease as assertTransitionRelease} from './feed_card_transition.mjs';
import { feedRuntimeConfiguration } from '../functions/feed_runtime.js';
import { planB4Pilot, seedB4Pilot, seedB4PilotReads, verifyB4Pilot, cleanupB4Pilot, assertB4PilotBaseline, setB4PilotPromos } from '../functions/feed_b4_pilot.js';

const root = resolve(import.meta.dirname, '..'), project = 'shoutout-dev-46c81';
const pathInRoot = value => {
  const path = resolve(root, value), inside = relative(root, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('pilot-path-must-stay-in-workspace'); return path;
};
async function signingKey() {
  const require = createRequire(new URL('./package.json', import.meta.url)), auth = require('firebase-tools/lib/auth.js');
  const actor = auth.getGlobalDefaultAccount(); if (!actor?.tokens?.refresh_token) throw new Error('pilot-cli-auth-required');
  const token = await auth.getAccessToken(actor.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const response = await fetch(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/SHOUTOUT_FEED_CURSOR_KEY/versions/latest:access`,
    { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!response.ok) throw new Error(`pilot-key-access-${response.status}`);
  const payload = await response.json(), encoded = Buffer.from(payload.payload.data, 'base64').toString(), key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('pilot-invalid-signing-key'); return key;
}
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease, keyProvider = signingKey } = {}) {
  delete process.env.DEBUG;
  const [action, ...args] = argv, options = {};
  if (!['plan', 'status', 'create', 'seed-reads', 'verify', 'promos', 'cleanup'].includes(action)) throw new Error('pilot-explicit-action-required');
  const allowed = action === 'plan' ? ['--project', '--state', '--actors'] : action === 'status' ? ['--project', '--state'] :
    action === 'verify' ? ['--project', '--state', '--ci-run'] :
      ['--project', '--state', '--ci-run', '--confirm-project', '--approved-digest', ...(action === 'cleanup' ? ['--clients-complete'] : [])];
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) ||
        !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(options, args[i])) throw new Error('pilot-invalid-options');
    options[args[i]] = args[i + 1];
  }
  if (options['--project'] !== project || !options['--state']) throw new Error('pilot-explicit-dev-target-required');
  const file = pathInRoot(options['--state']), mutating = ['create', 'seed-reads', 'promos', 'cleanup'].includes(action);
  if (action === 'cleanup' && options['--clients-complete'] !== 'yes') throw new Error('pilot-client-completion-required');
  if (mutating && (options['--confirm-project'] !== project || !/^[a-f0-9]{64}$/.test(options['--approved-digest'] ?? '') ||
      !/^\d+$/.test(options['--ci-run'] ?? ''))) throw new Error('pilot-explicit-approval-and-ci-required');
  if (mutating || action === 'verify') {
    if (!/^\d+$/.test(options['--ci-run'] ?? '')) throw new Error('pilot-full-ci-required');
    assertTransitionRelease(project, inspectRelease(options));
    if (!feedRuntimeConfiguration.compatibleGenerations || !feedRuntimeConfiguration.cardStateEnabled || !feedRuntimeConfiguration.deltaResponsesEnabled) throw new Error('pilot-compatible-writer-required');
  }
  let state = action === 'plan' ? null : JSON.parse(readFileSync(file, 'utf8'));
  if (state && (state.v !== 1 || state.plan.projectId !== project || mutating && state.plan.digest !== options['--approved-digest'])) throw new Error('pilot-state-ownership-conflict');
  if (action === 'plan' && (existsSync(file) || !options['--actors'])) throw new Error('pilot-new-state-and-actors-required');
  if (action === 'create' && !['planned', 'creating', 'seeded'].includes(state.phase) ||
      action === 'seed-reads' && !['seeded', 'reads-seeded'].includes(state.phase) ||
      action === 'verify' && !['reads-seeded', 'verified'].includes(state.phase) ||
      action === 'cleanup' && (!['verified', 'cleaning', 'cleaned'].includes(state.phase) || options['--clients-complete'] !== 'yes')) throw new Error('pilot-invalid-phase');
  const db = await openDatabase(project); if (db.projectId !== project) { await db.terminate(); throw new Error('pilot-database-project-mismatch'); }
  const persist = () => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(state, null, 2) + '\n'); renameSync(file + '.tmp', file); };
  try {
    let result;
    if (action === 'plan') {
      const original = JSON.parse(readFileSync(pathInRoot(options['--actors']), 'utf8'));
      if (original.projectId !== project || original.actors?.length !== 2) throw new Error('pilot-actor-manifest-required');
      const actors = original.actors.map(({ uid, nickname }) => ({ uid, nickname }));
      const runId = `mvp-b4-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
      state = { v: 1, phase: 'planned', plan: await planB4Pilot(db, actors, { runId }) }; persist();
      result = { digest: state.plan.digest, fixtures: 120, cloudWrites: 0 };
    } else if (action === 'status') {
      const baseline = await assertB4PilotBaseline(db, state.plan);
      const sources = await db.getAll(...state.plan.rows.map(row => db.doc(`shouts/${row.id}`)));
      result = { phase: state.phase, sourcesPresent: sources.filter(doc => doc.exists).length, unrelatedSourcesUnchanged: baseline, cloudWrites: 0 };
    } else if (action === 'create') {
      state.phase = 'creating'; persist(); result = await seedB4Pilot(db, state.plan); state.phase = 'seeded'; persist();
    } else if (action === 'seed-reads') {
      result = await seedB4PilotReads(db, state.plan); state.phase = 'reads-seeded'; persist();
    } else if (action === 'verify') {
      result = await verifyB4Pilot(db, state.plan, await keyProvider()); state.phase = 'verified'; state.coreProof = result; persist();
    } else if(action==='promos') {
      if(state.phase!=='verified')throw new Error('pilot-invalid-phase');
      result=await setB4PilotPromos(db,state.plan,await keyProvider());state.promoProof=result;persist();
    } else {
      state.phase = 'cleaning'; persist(); result = await cleanupB4Pilot(db, state.plan); state.phase = 'cleaned'; state.cleanupProof ??= result; persist();
    }
    return { action, projectId: project, phase: state.phase, ...result };
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(value => console.log(JSON.stringify(value))).catch(error => {
    console.error(JSON.stringify({ error: /^(pilot-|b4-pilot-|feed-)/.test(error.message ?? '') ? error.message : 'b4-pilot-operation-failed' })); process.exitCode = 1;
  });
}
