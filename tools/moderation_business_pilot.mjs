import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { openDevPilotAuth } from './dev_pilot_auth.mjs';
import { inspectTransitionRelease, assertTransitionRelease } from './feed_generation_transition.mjs';
import { moderationBusinessProject as project, planModerationBusinessPilot, validateModerationBusinessPilot,
  ensureModerationBusinessAuth, seedModerationBusinessAccount, seedModerationBusinessContent, moderationBusinessPilotStatus,
  orphanModerationBusinessComment, cleanupModerationBusinessPilot, planModerationBusinessAvatarRepair, repairModerationBusinessAvatar } from '../functions/moderation_business_pilot.js';
const root = resolve(import.meta.dirname, '..');
function inside(value) { const p = resolve(root, value), r = relative(root, p); if (!r || r.startsWith('..') || isAbsolute(r)) throw Error('mod-business-pilot-workspace-path-required'); return p; }
export function parseModerationBusinessPilot(argv) {
  const [action, ...args] = argv, o = {};
  if (!['plan', 'status', 'account', 'content', 'orphan', 'cleanup', 'avatar-plan', 'avatar-repair'].includes(action)) throw Error('mod-business-pilot-action-required');
  const allowed = ['--project', '--state', '--ci-run', '--confirm-project', '--approved-digest', '--clients-ready', '--clients-complete', '--approved-repair-digest'];
  for (let i = 0; i < args.length; i += 2) { if (!allowed.includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(o, args[i])) throw Error('mod-business-pilot-invalid-options'); o[args[i]] = args[i + 1]; }
  if (o['--project'] !== project || !o['--state']) throw Error('mod-business-pilot-explicit-dev-required');
  const file = inside(o['--state']), local = relative(resolve(root, 'docs/local'), file);
  if (!local || local.startsWith('..') || isAbsolute(local)) throw Error('mod-business-pilot-local-state-required');
  const mutating = !['plan', 'status', 'avatar-plan'].includes(action);
  if (mutating && (o['--confirm-project'] !== project || !/^\d+$/.test(o['--ci-run'] ?? '') || !/^[a-f0-9]{64}$/.test(o['--approved-digest'] ?? ''))) throw Error('mod-business-pilot-approval-required');
  if (['account', 'content'].includes(action) && o['--clients-ready'] !== 'yes') throw Error('mod-business-pilot-readiness-required');
  if (action === 'cleanup' && o['--clients-complete'] !== 'yes') throw Error('mod-business-pilot-acceptance-required');
  if (action === 'avatar-repair' && !/^[a-f0-9]{64}$/.test(o['--approved-repair-digest'] ?? '')) throw Error('mod-business-pilot-avatar-approval-required');
  return { action, o, file, mutating };
}
export async function main(argv, { openDatabase = feedAdminDatabase, openAuth = openDevPilotAuth, inspectRelease = inspectTransitionRelease } = {}) {
  delete process.env.DEBUG; const { action, o, file, mutating } = parseModerationBusinessPilot(argv);
  if (mutating) {
    const proof = inspectRelease(o); assertTransitionRelease(project, proof);
    for (const name of ['Test prepared Business review', 'Test prepared moderation sanctions']) if (!proof.ci.jobs.some(j => j.steps?.some(s => s.name === name && s.conclusion === 'success'))) throw Error('mod-business-pilot-specific-full-ci-required');
  }
  if (action === 'plan' && existsSync(file)) throw Error('mod-business-pilot-new-plan-required');
  const db = await openDatabase(project); let handle;
  try {
    if (db.projectId !== project) throw Error('mod-business-pilot-project-mismatch');
    let state = action === 'plan' ? null : JSON.parse(readFileSync(file, 'utf8'));
    const persist = () => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(state, null, 2) + '\n'); renameSync(file + '.tmp', file); };
    if (action === 'plan') { state = { v: 1, phase: 'planned', plan: await planModerationBusinessPilot(db) }; persist(); return { digest: state.plan.digest, uid: state.plan.uid, originals: state.plan.base.originals.length, cloudWrites: 0 }; }
    const p = state.plan; validateModerationBusinessPilot(db, p);
    if (action === 'status') return { phase: state.phase, ...await moderationBusinessPilotStatus(db, p) };
    if (action === 'avatar-plan') {
      if (state.avatarRepairPlan || ['cleaning', 'cleaned'].includes(state.phase)) throw Error('mod-business-pilot-avatar-existing-or-cleaned');
      state.avatarRepairPlan = await planModerationBusinessAvatarRepair(db, p); persist();
      return { digest: state.avatarRepairPlan.digest, documents: 2, cloudWrites: 0 };
    }
    if (p.digest !== o['--approved-digest']) throw Error('mod-business-pilot-approved-digest-required');
    if (action !== 'cleanup' && ['cleaning', 'cleaned'].includes(state.phase)) throw Error('mod-business-pilot-cleanup-started');
    if (action === 'avatar-repair') {
      if (state.avatarRepairPlan?.digest !== o['--approved-repair-digest']) throw Error('mod-business-pilot-avatar-approved-digest-required');
      const result = await repairModerationBusinessAvatar(db, p, state.avatarRepairPlan);
      state.avatarRepair = result; persist(); return result;
    }
    if (action === 'account') {
      if (!state.credentials) { state.credentials = { email: p.email, password: randomBytes(24).toString('base64url') }; state.phase = 'account-seeding'; persist(); }
      handle = await openAuth(project); const auth = await ensureModerationBusinessAuth(db, handle.auth, p, state.credentials.password);
      const seeded = await seedModerationBusinessAccount(db, handle.auth, p); state.phase = 'account-ready'; state.auth = auth; persist(); return { uid: p.uid, email: p.email, ...seeded, passwordPrinted: false };
    }
    if (action === 'content') { const result = await seedModerationBusinessContent(db, p); state.phase = result.waitingForCooldown ? 'content-seeding' : 'content-ready'; persist(); return result; }
    if (action === 'orphan') { const result = await orphanModerationBusinessComment(db, p); state.orphan = result; persist(); return result; }
    if (state.phase === 'cleaned') return { ...state.cleanup, repeated: true };
    state.phase = 'cleaning'; persist(); handle = await openAuth(project);
    const result = await cleanupModerationBusinessPilot(db, handle.auth, p); state.phase = 'cleaned'; delete state.credentials; state.cleanup = result; persist(); return result;
  } finally { if (handle) await handle.close(); await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(r => process.stdout.write(JSON.stringify(r) + '\n')).catch(e => {
  process.stderr.write(JSON.stringify({ error: /^(mod-business-pilot-|feed-transition-)/.test(e.message ?? '') ? e.message : 'mod-business-pilot-failed' }) + '\n'); process.exitCode = 1;
});
