import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { inspectTransitionRelease } from './feed_generation_transition.mjs';
import { assertModerationQueueRelease, moderationQueueProject as project } from './moderation_queue_dev_release.mjs';
import { preparedArchiveIdentityRuntime } from '../functions/archive_identity_runtime.js';
import { legalPolicy } from '../functions/legal_policy.js';
import * as pilot from '../functions/moderation_queue_pilot.js';
const root = resolve(import.meta.dirname, '..');
function local(value) {
  if (!value) throw Error('moderation-pilot-local-file-required');
  const full = resolve(root, value), rel = relative(root, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('moderation-pilot-local-file-required'); return full;
}
function output(path, value) {
  const full = local(path); mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); return full;
}
async function credentialTransport() {
  const cli = createRequire(resolve(root, 'tools/package.json'))('firebase-tools/lib/auth.js');
  const account = cli.getGlobalDefaultAccount(); if (!account?.tokens?.refresh_token) throw Error('moderation-pilot-existing-auth-required');
  const token = await cli.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  return async (kind, ids) => {
    const url = kind === 'identity' ? `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`
      : `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/SHOUTOUT_ARCHIVE_IDENTITY_KEY/versions/1:access`;
    const response = await fetch(url, { method: kind === 'identity' ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      ...(kind === 'identity' ? { body: JSON.stringify({ localId: ids }) } : {}) });
    if (!response.ok) throw Error('moderation-pilot-existing-credential-unavailable'); return response.json();
  };
}
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease, credentials = credentialTransport } = {}) {
  const [action, ...args] = argv, o = {};
  if (!['plan', 'seed', 'status', 'retire', 'drain-reports', 'cleanup-plan', 'cleanup'].includes(action) || args.length % 2) throw Error('moderation-pilot-explicit-action-required');
  const allowed = ['--project', '--plan', '--output', '--approved-digest', '--ci-run', '--confirm-project', '--client-ready', '--cleanup-plan', '--cleanup-digest'];
  for (let n = 0; n < args.length; n += 2) {
    if (!allowed.includes(args[n]) || !args[n + 1] || args[n + 1].startsWith('--') || Object.hasOwn(o, args[n])) throw Error('moderation-pilot-invalid-options'); o[args[n]] = args[n + 1];
  }
  if (o['--project'] !== project || process.env.FIRESTORE_EMULATOR_HOST) throw Error('moderation-pilot-live-dev-required');
  const readOnly = ['plan', 'status', 'cleanup-plan'].includes(action);
  if (action === 'seed' && o['--client-ready'] !== 'yes') throw Error('moderation-pilot-available-client-required');
  const proof = inspectRelease(o); assertModerationQueueRelease(proof);
  if (!readOnly && o['--confirm-project'] !== project) throw Error('moderation-pilot-confirm-project-required');
  const db = await openDatabase(project);
  try {
    if (db.projectId !== project) throw Error('moderation-pilot-database-mismatch');
    if (action === 'plan') {
      const actors = [];
      for (const nickname of ['Bright_Otter_182', 'TestBusiness', 'TestModerator', 'TestAdmin']) {
        const result = await db.collection('users').where('nickname', '==', nickname).limit(2).get();
        if (result.size !== 1) throw Error('moderation-pilot-unique-existing-actor-required');
        const d = result.docs[0]; actors.push({ uid: d.id, nickname, profileCreateTime: [d.createTime.seconds, d.createTime.nanoseconds] });
      }
      const auth = await (await credentials())('identity', actors.map(a => a.uid));
      if (auth.users?.length !== actors.length || actors.some(a => !auth.users.some(u => u.localId === a.uid && u.emailVerified === true && !u.disabled))) throw Error('moderation-pilot-existing-verified-auth-required');
      const plan = await pilot.planModerationQueuePilot(db, actors, { sourceCommit: proof.commit });
      return { output: output(o['--output'], plan), digest: plan.digest, shouts: 1, comments: 50, privateReplies: 1, reports: 53, cases: 52, cloudWrites: 0 };
    }
    const plan = JSON.parse(readFileSync(local(o['--plan']), 'utf8'));
    pilot.validateModerationQueuePilot(db, plan, readOnly ? plan.digest : o['--approved-digest']);
    if (plan.sourceCommit !== proof.commit) throw Error('moderation-pilot-exact-source-required');
    if (action === 'status') return await pilot.moderationQueuePilotStatus(db, plan);
    if (action === 'cleanup-plan') {
      const p = await pilot.planModerationQueuePilotCleanup(db, plan); return { output: output(o['--output'], p), digest: p.digest, documents: p.rows.length, cloudWrites: 0 };
    }
    if (action === 'drain-reports') return await pilot.purgeModerationQueuePilotReports(db, plan);
    if (action === 'cleanup') return await pilot.cleanupModerationQueuePilot(db, plan, JSON.parse(readFileSync(local(o['--cleanup-plan']), 'utf8')), o['--cleanup-digest']);
    const access = await (await credentials())('secret');
    const encodedKey = Buffer.from(access.payload.data, 'base64').toString('utf8');
    const identityRuntime = preparedArchiveIdentityRuntime(db, { enabled: true, purgeEnabled: true, captureEnabled: true, encodedKey,
      disclosurePolicy: legalPolicy({ archiveDisclosureEnabled: true, version: '2026-11-27' }) });
    return await (action === 'seed' ? pilot.seedModerationQueuePilot(db, plan, { clientAvailable: true, identityRuntime }) : pilot.retireModerationQueuePilot(db, plan, { identityRuntime }));
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(v => console.log(JSON.stringify(v)))
  .catch(error => { console.error(/^moderation-pilot-[a-z0-9-]+$/.test(error.message) ? error.message : 'moderation-pilot-command-failed'); process.exitCode = 1; });
