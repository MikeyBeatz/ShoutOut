import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { assertTransitionRelease, inspectTransitionRelease } from './feed_generation_transition.mjs';
import { feedRuntimeConfiguration, createFeedRuntime } from '../functions/feed_runtime.js';
import { contentLifecycleConfiguration } from '../functions/content_lifecycle.js';
import { planLifecycleCaptureStart, startLifecycleCapture, validateLifecycleCaptureStartPlan, planLifecycleInventory, validateLifecycleInventoryPlan,
  readLifecycleInventoryPage, validateLifecycleInventoryPage, planLifecycleTransitionBatch, validateLifecycleTransitionBatch,
  applyLifecycleTransitionBatch, auditLifecycleInventoryPage, resolveLifecycleReportCandidates,
  assembleLifecycleInventory, finishLifecycleInventoryAudit } from '../functions/content_lifecycle_transition.js';

const root = resolve(import.meta.dirname, '..'), project = 'shoutout-dev-46c81';
export const requiredLifecycleTransitionChecks = Object.freeze(['Test inactive content lifecycle',
  'Test prepared content report decisions', 'Test prepared moderation sanctions']);
export function assertLifecycleTransitionRelease(projectId, proof) {
  if (projectId !== project) throw new Error('lifecycle-transition-dev-only');
  assertTransitionRelease(projectId, proof);
  if (!requiredLifecycleTransitionChecks.every(name => proof.ci.jobs.some(job => job.conclusion === 'success' &&
    job.steps?.some(step => step.name === name && step.conclusion === 'success')))) throw new Error('lifecycle-transition-full-archive-ci-required');
}
function localPath(path) {
  if (typeof path !== 'string' || !path) throw new Error('lifecycle-transition-workspace-file-required');
  const full = resolve(root, path), inside = relative(root, full);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('lifecycle-transition-workspace-file-required');
  return full;
}
const read = path => JSON.parse(readFileSync(localPath(path), 'utf8'));
function save(path, value) {
  const file = localPath(path); mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); return file;
}
export function parseLifecycleTransitionArguments(argv) {
  const [action, ...rest] = argv, options = {}, mutating = ['start', 'apply'].includes(action);
  const shared = ['--project', '--output'];
  const allowed = {
    'plan-start': ['--writer-commit'], start: ['--plan', '--approved-digest', '--confirm-project', '--ci-run', '--confirm-compatible-writers'],
    plan: [], inventory: ['--plan', '--checkpoint'], prepare: ['--plan', '--phase', '--candidates', '--text-policy'],
    apply: ['--plan', '--approved-digest', '--confirm-project', '--ci-run', '--confirm-compatible-writers', '--confirm-compatible-readers'],
    audit: ['--plan', '--page', '--text-policy'], resolve: ['--plan', '--page', '--archives'],
    assemble: ['--plan', '--pages'], 'finish-audit': ['--plan', '--pages', '--audits', '--text-policy'],
  };
  if (!Object.hasOwn(allowed, action) || rest.length % 2) throw new Error('explicit-lifecycle-transition-action-required');
  for (let n = 0; n < rest.length; n += 2) {
    if (![...shared, ...allowed[action]].includes(rest[n]) || typeof rest[n + 1] !== 'string' || rest[n + 1].startsWith('--') ||
        Object.hasOwn(options, rest[n])) throw new Error('invalid-lifecycle-transition-options');
    options[rest[n]] = rest[n + 1];
  }
  if (options['--project'] !== project) throw new Error('lifecycle-transition-explicit-dev-project-required');
  if (['plan-start', 'plan', 'inventory', 'prepare'].includes(action) && !options['--output']) throw new Error('lifecycle-transition-output-required');
  if (options['--output']) localPath(options['--output']);
  if (action === 'plan-start' && !/^[a-f0-9]{40}$/.test(options['--writer-commit'] ?? '') ||
      !['plan-start', 'plan'].includes(action) && !options['--plan'] ||
      action === 'prepare' && (!['sources', 'reports', 'accounts', 'compatibility'].includes(options['--phase']) || !options['--candidates']) ||
      ['audit', 'resolve'].includes(action) && !options['--page'] || action === 'resolve' && !options['--archives'] ||
      ['assemble', 'finish-audit'].includes(action) && !options['--pages'] || action === 'finish-audit' && !options['--audits'] ||
      options['--text-policy'] !== undefined && !['preserve', 'scrub'].includes(options['--text-policy'])) throw new Error('invalid-lifecycle-transition-options');
  if (mutating && (options['--confirm-project'] !== project || options['--confirm-compatible-writers'] !== project ||
      !/^[0-9]+$/.test(options['--ci-run'] ?? '') || !/^[a-f0-9]{64}$/.test(options['--approved-digest'] ?? ''))) throw new Error('lifecycle-transition-explicit-approval-and-ci-required');
  return { action, projectId: project, options, mutating };
}
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease,
  configuration = contentLifecycleConfiguration, feedConfiguration = feedRuntimeConfiguration, runtime = createFeedRuntime } = {}) {
  const { action, projectId, options, mutating } = parseLifecycleTransitionArguments(argv);
  const plan = options['--plan'] ? read(options['--plan']) : null;
  if (action === 'start') validateLifecycleCaptureStartPlan(plan, projectId, options['--approved-digest']);
  if (plan && action !== 'start') {
    if (action === 'apply') validateLifecycleTransitionBatch(plan, projectId, options['--approved-digest']);
    else validateLifecycleInventoryPlan(plan, projectId);
  }
  const page = options['--page'] ? validateLifecycleInventoryPage(plan, read(options['--page'])) : null;
  if (action === 'resolve') {
    const value = resolveLifecycleReportCandidates(plan, page, read(options['--archives']));
    return options['--output'] ? { file: save(options['--output'], value), writes: 0 } : value;
  }
  if (action === 'assemble') {
    const value = assembleLifecycleInventory(plan, read(options['--pages']));
    return options['--output'] ? { file: save(options['--output'], value), digest: value.digest, writes: 0 } : value;
  }
  let release;
  if (mutating) {
    release = inspectRelease(options); assertLifecycleTransitionRelease(projectId, release);
    if (!(configuration.captureEnabled === true || configuration.enabled === true) || feedConfiguration.compatibleGenerations !== true || feedConfiguration.cardStateEnabled !== true) throw new Error('lifecycle-transition-capture-release-required');
    if (action === 'start' && configuration.enabled !== false) throw new Error('lifecycle-transition-capture-only-release-required');
    if (action === 'start' && (plan?.digest !== options['--approved-digest'] || plan.writerCommit !== release.commit)) throw new Error('lifecycle-transition-start-source-mismatch');
    if (action === 'apply' && ['reports', 'compatibility'].includes(plan.phase) && !plan.core.preserveLegacyText &&
        (options['--confirm-compatible-readers'] !== projectId || configuration.enabled !== true)) throw new Error('lifecycle-transition-reader-release-required');
  }
  const db = await openDatabase(projectId);
  try {
    if (db.projectId !== projectId) throw new Error('lifecycle-transition-database-project-mismatch');
    let value;
    if (action === 'plan-start') value = await planLifecycleCaptureStart(db, options['--writer-commit']);
    else if (action === 'start') value = await startLifecycleCapture(db, plan, { approvedDigest: options['--approved-digest'], compatibleWriters: true });
    else if (action === 'plan') value = await planLifecycleInventory(db);
    else if (action === 'inventory') value = await readLifecycleInventoryPage(db, plan, options['--checkpoint'] ? read(options['--checkpoint']) : null);
    else if (action === 'prepare') value = await planLifecycleTransitionBatch(db, plan, options['--phase'], read(options['--candidates']),
      { preserveLegacyText: options['--text-policy'] !== 'scrub' });
    else if (action === 'audit') value = await auditLifecycleInventoryPage(db, plan, page, { requireTextCleanup: options['--text-policy'] !== 'preserve' });
    else if (action === 'finish-audit') value = await finishLifecycleInventoryAudit(db, plan, read(options['--pages']), read(options['--audits']),
      { requireTextCleanup: options['--text-policy'] !== 'preserve' });
    else {
      // The operator has the same budgeted index writer, but deliberately no
      // archive proxy around metadata adoption (the cores own those writes).
      const rt = runtime(db, { async getUser() { throw new Error('lifecycle-operator-auth-is-unavailable'); } },
        { enabled: true, contentLifecycleEnabled: false, contentCaptureEnabled: false, contentMaintenanceEnabled: false });
      value = await applyLifecycleTransitionBatch(rt.database, plan, { approvedDigest: options['--approved-digest'],
        compatibleWriters: true, compatibleReaders: options['--confirm-compatible-readers'] === projectId, indexWriter: rt.indexWriter });
    }
    // No default overwrite or unbounded output. Inventory/batch plans stay in
    // immutable workspace files; stdout contains technical results only.
    const file = options['--output'] ? save(options['--output'], value) : null;
    if (['plan-start', 'plan', 'inventory', 'prepare'].includes(action) && !file) throw new Error('lifecycle-transition-output-required');
    return file ? { projectId, action, file, digest: value.digest ?? value.pageDigest ?? null, writes: value.writes ?? 0,
      ...(release ? { sourceCommit: release.commit, ciRun: options['--ci-run'] } : {}) } : value;
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(value => process.stdout.write(JSON.stringify(value) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: /^(lifecycle-|invalid-|explicit-|feed-)/.test(error.message ?? '') ? error.message : 'lifecycle-transition-command-failed' }) + '\n'); process.exitCode = 1;
  });
}
