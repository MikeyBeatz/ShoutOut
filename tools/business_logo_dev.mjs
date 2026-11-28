import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { inspectTransitionRelease } from './feed_generation_transition.mjs';
import { planBusinessLogoIndex } from './business_logo_index_plan.mjs';
import { collectModerationCloudSnapshot, moderationCloudTransport } from './moderation_queue_cloud.mjs';
import { assertBusinessLogoRelease, prepareBusinessLogoDevRelease, logoHash, businessLogoProject as project } from './business_logo_dev_release.mjs';
import { proveBusinessLogoEnvironment, proveBusinessLogoBaselineRules } from './business_logo_dev_cloud.mjs';
import { canonical } from '../functions/feed_block_index.js';
const root = resolve(import.meta.dirname, '..'), fieldPath = `projects/${project}/databases/(default)/collectionGroups/logoState/fields/cleanupAt`;
const fail = s => { throw Error('business-logo-' + s); };
export function validateBusinessLogoPlan(plan, digest = plan?.digest) {
  const { digest: stored, ...body } = plan ?? {};
  if (!/^[a-f0-9]{64}$/.test(stored ?? '') || stored !== digest || stored !== logoHash(body) ||
      body.projectId !== project || body.kind !== 'business-logo-dev' || !/^[a-f0-9]{40}$/.test(body.sourceCommit ?? '') ||
      body.inventory?.files?.length !== 0 || body.inventory?.control !== null || !body.inventory?.actor ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(body.inventory.actor.id ?? '') ||
      !Array.isArray(body.inventory.users) || !Array.isArray(body.inventory.profiles) ||
      !Array.isArray(body.indexes?.actions) || body.indexes.actions.length > 1 || body.indexes.changesTTL !== false ||
      body.indexes.before?.ttlConfig != null) fail('invalid-plan');
  return plan;
}
export async function collectBusinessLogoInventory(db, call) {
  if (db.projectId !== project) fail('explicit-dev-required');
  const list = async name => {
    const page = await db.collection(name).select('nickname', 'businessLogoPath', 'businessLogoVersion',
      'avatarId', 'avatarBackgroundStart', 'avatarBackgroundEnd', 'avatarGradientDirection').limit(1000).get();
    if (page.size === 1000) fail('inventory-budget');
    return page.docs.map(d => ({ id: d.id, updateTime: [d.updateTime.seconds, d.updateTime.nanoseconds], data: d.data() }));
  };
  const users = await list('users'), profiles = await list('publicProfiles'), control = await db.doc('businessLogoMaintenance/current').get();
  const objects = await call('GET', `https://storage.googleapis.com/storage/v1/b/${project}.firebasestorage.app/o?prefix=businessLogos%2F&maxResults=50&fields=items(name,generation,size),nextPageToken`);
  if (objects.nextPageToken) fail('nonempty-inventory-budget');
  const actors = users.filter(d => d.data.nickname === 'TestBusiness');
  if (actors.length !== 1) fail('test-business-required');
  const actor = actors[0], pub = profiles.find(d => d.id === actor.id), role = await db.doc(`accountRoles/${actor.id}`).get();
  const legal = await db.doc(`users/${actor.id}/legal/acceptance_2026_11_27`).get(), deletion = await db.doc(`accountDeletionRequests/${actor.id}`).get();
  if (!pub || canonical(actor.data) !== canonical(pub.data) || role.get('role') !== 'business' || role.get('level') !== 2 || !legal.exists || deletion.exists) fail('test-business-eligibility');
  return { users, profiles, files: objects.items ?? [], control: control.exists ? control.data() : null, actor };
}
async function cloud() {
  const read = await moderationCloudTransport(), require = createRequire(resolve(root, 'tools/package.json'));
  const auth = require('firebase-tools/lib/auth.js'), account = auth.getGlobalDefaultAccount();
  const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  return async (method, url, body = null) => {
    if (method === 'GET') return read(method, url);
    const u = new URL(url);
    if (method !== 'PATCH' || u.origin !== 'https://firestore.googleapis.com' || u.pathname !== '/v1/' + fieldPath ||
        u.search !== '?updateMask=indexConfig' || Object.keys(body ?? {}).sort().join(',') !== 'indexConfig,name' ||
        body.name !== fieldPath) fail('unsafe-cloud-mutation');
    const response = await fetch(u, { method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) fail('index-http-' + response.status);
    return response.json();
  };
}
const indexSnapshot = async call => ({ status: 200, data: await call('GET', 'https://firestore.googleapis.com/v1/' + fieldPath) });
async function currentLogoIndex(call) {
  const plan = planBusinessLogoIndex(project, await indexSnapshot(call));
  // cleanupAt is an ordered work pointer, never an automatic document TTL.
  if (plan.before.ttlConfig != null) fail('unexpected-logo-ttl');
  return plan;
}
export async function installBusinessLogoControl(db, plan) {
  validateBusinessLogoPlan(plan);
  assertDatabase(db);
  return db.runTransaction(async tx => {
    const ref = db.doc('businessLogoMaintenance/current'), state = await tx.get(ref);
    if (state.exists) {
      if (state.get('planDigest') !== plan.digest || state.get('sourceCommit') !== plan.sourceCommit) fail('foreign-control');
      return { installed: false, mode: state.get('mode'), revision: state.get('revision') };
    }
    tx.create(ref, { schemaVersion: 1, mode: 'off', revision: 1, planDigest: plan.digest, sourceCommit: plan.sourceCommit });
    return { installed: true, mode: 'off', revision: 1 };
  });
}
export async function changeBusinessLogoMode(db, plan, from, revision, to) {
  validateBusinessLogoPlan(plan);
  assertDatabase(db);
  if (!['off', 'active', 'paused'].includes(from) || !['active', 'paused'].includes(to) || from === to ||
      !Number.isSafeInteger(revision) || revision < 1) fail('explicit-mode-required');
  return db.runTransaction(async tx => {
    const ref = db.doc('businessLogoMaintenance/current'), row = await tx.get(ref);
    if (row.get('planDigest') !== plan.digest || row.get('sourceCommit') !== plan.sourceCommit || row.get('schemaVersion') !== 1) fail('foreign-control');
    if (row.get('mode') === to && row.get('revision') === revision + 1) return { mode: to, revision: revision + 1 };
    if (row.get('mode') !== from || row.get('revision') !== revision) fail('control-drift');
    tx.update(ref, { mode: to, revision: revision + 1 });
    return { mode: to, revision: revision + 1 };
  });
}
function assertDatabase(db) {
  if (db.projectId !== project && !(db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) fail('explicit-dev-required');
}
function local(p) {
  const full = resolve(root, p ?? ''), rel = relative(root, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) fail('workspace-path-required');
  return full;
}
export async function main(argv, { openDatabase = feedAdminDatabase, connect = cloud, inspectRelease = inspectTransitionRelease,
  verifyDeployment = async (plan, evidence, proof, call) => {
    validateBusinessLogoDeploymentProof(plan, evidence, proof);
    return proveBusinessLogoEnvironment(root, call, plan, evidence.manifest);
  }, proveEnvironment = proveBusinessLogoEnvironment } = {}) {
  const [action, ...args] = argv, o = {}, mutations = ['indexes', 'install', 'mode'];
  if (!['plan', 'status', 'verify', ...mutations].includes(action) || args.length % 2) fail('explicit-action-required');
  for (let n = 0; n < args.length; n += 2) {
    if (!['--project', '--ci-run', '--plan', '--output', '--approved-digest', '--confirm-project', '--from', '--revision', '--to', '--deployment-proof', '--manifest'].includes(args[n]) ||
        !args[n + 1] || args[n + 1].startsWith('--') || Object.hasOwn(o, args[n])) fail('invalid-option');
    o[args[n]] = args[n + 1];
  }
  if (o['--project'] !== project || process.env.FIRESTORE_EMULATOR_HOST) fail('explicit-live-dev-required');
  let proof;
  if (action !== 'status') { proof = inspectRelease(o); assertBusinessLogoRelease(proof); }
  const plan = action === 'plan' ? null : validateBusinessLogoPlan(JSON.parse(readFileSync(local(o['--plan']), 'utf8')),
    mutations.includes(action) ? o['--approved-digest'] : undefined);
  if (mutations.includes(action) && (o['--confirm-project'] !== project || plan.sourceCommit !== proof.commit)) fail('exact-source-required');
  const db = await openDatabase(project);
  try {
    if (db.projectId !== project) fail('explicit-dev-required');
    if (action === 'status') { const row = await db.doc('businessLogoMaintenance/current').get(); return { control: row.data() ?? null, cloudWrites: 0 }; }
    const call = await connect();
    if (action === 'plan') {
      const inventory = await collectBusinessLogoInventory(db, call);
      if (inventory.control || inventory.files.length || [...inventory.users, ...inventory.profiles].some(d => Object.hasOwn(d.data, 'businessLogoPath') || Object.hasOwn(d.data, 'businessLogoVersion'))) fail('empty-baseline-changed');
      await proveBusinessLogoBaselineRules(call, prepareBusinessLogoDevRelease(root).manifest);
      const indexes = await currentLogoIndex(call), before = await collectModerationCloudSnapshot(call);
      const body = { schemaVersion: 1, kind: 'business-logo-dev', projectId: project, sourceCommit: proof.commit, inventory, indexes, before };
      const plan = { ...body, digest: logoHash(body) }, output = local(o['--output']);
      mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
      return { digest: plan.digest, indexActions: indexes.actions.length, files: 0, cloudWrites: 0 };
    }
    if (action === 'indexes') {
      const fresh = await currentLogoIndex(call);
      if (fresh.actions.some(a => !plan.indexes.actions.some(b => canonical(a) === canonical(b)))) fail('index-drift');
      const results = [];
      for (const a of fresh.actions) results.push(await call('PATCH', 'https://firestore.googleapis.com/v1/' + a.resource + '?updateMask=indexConfig', a.body));
      return { submitted: results.length, changesTTL: false };
    }
    if (action === 'verify') {
      const evidence = await proveEnvironment(root, call, plan, JSON.parse(readFileSync(local(o['--manifest']), 'utf8')));
      writeFileSync(local(o['--output']), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
      return { verified: true, cloudWrites: 0, digest: evidence.digest };
    }
    if (action === 'install') {
      if (!(await currentLogoIndex(call)).ready) fail('index-not-ready');
      if (!(await db.doc('businessLogoMaintenance/current').get()).exists &&
          canonical(await collectBusinessLogoInventory(db, call)) !== canonical(plan.inventory)) fail('inventory-changed');
      return installBusinessLogoControl(db, plan);
    }
    if (o['--to'] === 'active') {
      if (!(await currentLogoIndex(call)).ready) fail('index-not-ready');
      const control = await db.doc('businessLogoMaintenance/current').get();
      if (o['--from'] === 'off' && control.get('mode') === 'off') {
        const fresh = await collectBusinessLogoInventory(db, call);
        if (fresh.files.length || [...fresh.users, ...fresh.profiles].some(d =>
          Object.hasOwn(d.data, 'businessLogoPath') || Object.hasOwn(d.data, 'businessLogoVersion'))) fail('empty-baseline-changed-before-activation');
      }
      await verifyDeployment(plan, JSON.parse(readFileSync(local(o['--deployment-proof']), 'utf8')), proof, call);
    }
    return changeBusinessLogoMode(db, plan, o['--from'], Number(o['--revision']), o['--to']);
  } finally { await db.terminate(); }
}
export function validateBusinessLogoDeploymentProof(plan, evidence, proof) {
  const { digest, ...body } = evidence ?? {};
  if (digest !== logoHash(body) || body.planDigest !== plan.digest || body.sourceCommit !== proof.commit ||
      body.phase !== 'active' || body.manifest?.phase !== 'active' ||
      body.projectId !== project || body.functionsVerified !== true || body.rulesVerified !== true || body.webVerified !== true) fail('deployment-evidence-required');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then(value => process.stdout.write(JSON.stringify(value) + '\n'))
    .catch(error => { process.stderr.write((/^business-logo-/.test(error.message ?? '') ? error.message : 'business-logo-command-failed') + '\n'); process.exitCode = 1; });
}
