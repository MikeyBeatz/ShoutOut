import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { canonical } from '../functions/feed_block_index.js';
import { createModerationQueueDatabase, moderationReportCollections, moderationReportTarget, validateModerationQueueControl } from '../functions/moderation_queue.js';
import * as transition from '../functions/moderation_queue_transition_core.js';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { inspectTransitionRelease } from './feed_generation_transition.mjs';
import { assertModerationQueueRelease, assertModerationQueueArtifact, moderationQueueProject as project } from './moderation_queue_dev_release.mjs';
import { collectModerationCloudSnapshot, validateModerationCloudSnapshot, proveModerationQueueDeployment, moderationCloudTransport } from './moderation_queue_cloud.mjs';
import { collectModerationIndexPlan, applyModerationIndexPlan, validateModerationIndexPlan } from './moderation_queue_dev_indexes.mjs';
const root = resolve(import.meta.dirname, '..'), hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const { FieldPath } = createRequire(resolve(root, 'functions/package.json'))('firebase-admin/firestore');
const fail = code => { throw Error('moderation-queue-' + code); };
const stamp = time => time ? [time.seconds, time.nanoseconds] : null;
function local(path) {
  if (typeof path !== 'string' || !path) fail('workspace-path-required');
  const full = resolve(root, path), rel = relative(root, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) fail('workspace-path-required');
  return full;
}
export async function inventoryModerationReports(db) {
  if (db.projectId !== project) fail('dev-database-required');
  const reports = [], counts = {};
  for (const collection of Object.keys(moderationReportCollections)) {
    let after = null; counts[collection] = { all: 0, pending: 0 };
    for (;;) {
      let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(50);
      if (after) query = query.startAfter(after);
      const page = await query.get(); counts[collection].all += page.size;
      for (const doc of page.docs) {
        if (!['open', 'escalated'].includes(doc.get('status'))) continue;
        moderationReportTarget(doc.ref.path, doc.data()); counts[collection].pending++;
        reports.push({ path: doc.ref.path, createTime: stamp(doc.createTime), updateTime: stamp(doc.updateTime), fingerprint: hash(doc.data()) });
      }
      if (reports.length > 100000) fail('inventory-budget');
      if (page.size < 50) break; after = page.docs.at(-1).id;
    }
  }
  const control = await db.doc('moderationQueueControl/current').get();
  return { reports, counts, control: control.exists ? { data: control.data(), updateTime: stamp(control.updateTime) } : null };
}
export function validateModerationDevPlan(plan, approvedDigest = plan?.digest) {
  const { digest, ...body } = plan ?? {};
  if (!/^[a-f0-9]{64}$/.test(digest ?? '') || digest !== approvedDigest || hash(body) !== digest ||
      body.schemaVersion !== 1 || body.kind !== 'moderation-queue-dev-install' || body.projectId !== project ||
      body.transition?.projectId !== project || body.sourceCommit !== body.transition?.sourceCommit) fail('invalid-dev-plan');
  const expected = transition.moderationQueueTransitionPlan(body.transition);
  if (canonical(expected) !== canonical(body.transition) || body.inventory?.control !== null) fail('invalid-dev-plan');
  validateModerationCloudSnapshot(body.cloud); validateModerationIndexPlan(body.indexes);
  return plan;
}
export async function setModerationQueueMode(db, plan, { from, revision, to }) {
  validateModerationDevPlan(plan);
  if (!['active', 'paused'].includes(from) || !['active', 'paused'].includes(to) || from === to || !Number.isSafeInteger(revision)) fail('explicit-mode-transition-required');
  return db.runTransaction(async tx => {
    const ref = db.doc('moderationQueueControl/current'), control = await tx.get(ref), state = validateModerationQueueControl(control.data());
    if (state.incarnation !== plan.transition.incarnation || state.planDigest !== plan.transition.digest) fail('mode-incarnation-drift');
    if (state.mode === to && state.revision === revision + 1) return { mode: to, revision: state.revision }; // Lost reply.
    if (state.mode !== from || state.revision !== revision) fail('mode-revision-drift');
    tx.update(ref, { mode: to, revision: revision + 1 }); return { mode: to, revision: revision + 1 };
  });
}
const mutations = ['indexes', 'begin', 'step', 'run', 'activate', 'pause', 'resume'];
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease, connect = moderationCloudTransport } = {}) {
  const [action, ...args] = argv, o = {};
  const allowed = ['--project', '--plan', '--output', '--approved-digest', '--confirm-project', '--ci-run', '--manifest', '--revision'];
  if (!['plan', 'status', ...mutations].includes(action) || args.length % 2) fail('explicit-action-required');
  for (let n = 0; n < args.length; n += 2) {
    if (!allowed.includes(args[n]) || !args[n + 1] || args[n + 1].startsWith('--') || Object.hasOwn(o, args[n])) fail('invalid-options');
    o[args[n]] = args[n + 1];
  }
  if (o['--project'] !== project || process.env.FIRESTORE_EMULATOR_HOST) fail('explicit-live-dev-required');
  const mutating = mutations.includes(action);
  let proof;
  if (action === 'plan' || mutating) {
    if (!/^\d+$/.test(o['--ci-run'] ?? '')) fail('full-ci-required');
    proof = inspectRelease(o); assertModerationQueueRelease(proof);
  }
  const plan = action === 'plan' ? null : validateModerationDevPlan(JSON.parse(readFileSync(local(o['--plan']), 'utf8')), mutating ? o['--approved-digest'] : undefined);
  if (mutating && (o['--confirm-project'] !== project || plan.sourceCommit !== proof.commit)) fail('exact-approved-source-required');
  const db = await openDatabase(project);
  try {
    if (db.projectId !== project) fail('dev-database-required');
    if (action === 'plan') {
      const call = await connect(), inventory = await inventoryModerationReports(db);
      if (inventory.control || !(await db.collection('moderationCases').limit(1).get()).empty || !(await db.collection('moderationCaseDecisions').limit(1).get()).empty) fail('already-installed');
      const body = { schemaVersion: 1, kind: 'moderation-queue-dev-install', projectId: project, sourceCommit: proof.commit, inventory,
        transition: transition.moderationQueueTransitionPlan({ projectId: project, sourceCommit: proof.commit, incarnation: randomBytes(32).toString('hex') }),
        cloud: await collectModerationCloudSnapshot(call), indexes: await collectModerationIndexPlan(call) };
      const prepared = { ...body, digest: hash(body) }, output = local(o['--output']);
      mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(prepared, null, 2) + '\n', { flag: 'wx' });
      return { projectId: project, output, digest: prepared.digest, counts: inventory.counts, indexActions: prepared.indexes.actions.length, cloudWrites: 0 };
    }
    if (action === 'status') {
      const [control, job] = await db.getAll(db.doc('moderationQueueControl/current'), db.doc(`moderationQueueMigrations/${plan.transition.digest}`));
      return { projectId: project, control: control.data() ?? null, migration: job.data() ?? null, cloudWrites: 0 };
    }
    const call = await connect();
    if (action === 'indexes') return await applyModerationIndexPlan(plan.indexes, call);
    const q = createModerationQueueDatabase(db, { enabled: true });
    if (action === 'begin') {
      const c = await db.doc('moderationQueueControl/current').get();
      if (!c.exists && canonical(await inventoryModerationReports(db)) !== canonical(plan.inventory)) fail('inventory-changed-before-install');
      if (!(await collectModerationIndexPlan(call)).ready) fail('indexes-not-ready');
      return await transition.beginModerationQueueTransition(q, plan.transition);
    }
    const manifest = JSON.parse(readFileSync(local(o['--manifest']), 'utf8'));
    if (manifest.sourceCommit !== proof.commit) fail('exact-artifact-required');
    assertModerationQueueArtifact(root, manifest);
    const deployment = await proveModerationQueueDeployment(call, plan.cloud, manifest);
    if (action === 'pause' || action === 'resume') return await setModerationQueueMode(db, plan, { from: action === 'pause' ? 'active' : 'paused', to: action === 'pause' ? 'paused' : 'active', revision: Number(o['--revision']) });
    let result;
    if (action === 'run') {
      const started = performance.now(); let steps = 0;
      do { result = await transition.stepModerationQueueTransition(q, plan.transition); steps++; }
      while (!['ready', 'active'].includes(result.phase) && steps < 32 && performance.now() - started < 10000);
      result = { ...result, steps };
    } else result = action === 'step' ? await transition.stepModerationQueueTransition(q, plan.transition) : await transition.activateModerationQueueTransition(q, plan.transition);
    return { projectId: project, sourceCommit: proof.commit, verifiedFunctions: deployment.verified.length, ...result };
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(v => console.log(JSON.stringify(v)))
  .catch(error => { console.error(/^moderation-queue-[a-z0-9-]+$/.test(error.message) ? error.message : 'moderation-queue-command-failed'); process.exitCode = 1; });
