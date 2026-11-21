// DEV orchestration only. No callable entry or credentials in saved plans.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { inspectTransitionRelease } from './feed_generation_transition.mjs';
import { assertCardTransitionRelease } from './feed_card_transition.mjs';
import { verifyNewsRevisionDrain } from './feed_revision_drain.mjs';
import { prepareNewsControlChange } from '../functions/feed_news_signals.js';

export const newsProject = 'shoutout-dev-46c81';
export const newsIndexFields = Object.freeze(['publicationHeads/fields/*', 'feedNewsControl/fields/*', 'feedIndexGenerations/fields/newsIncarnation']);
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ?
  Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const same = (a, b) => canonical(a) === canonical(b);
const stamp = t => t ? [t.seconds, t.nanoseconds] : null;
function target(db) {
  if (db.projectId !== newsProject && !(db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) throw Error('news-activation-dev-required');
}
export function assertNewsRelease(project, proof) {
  if (project !== newsProject) throw Error('news-activation-dev-required');
  assertCardTransitionRelease(project, proof);
  if (!proof.ci.jobs.some(job => job.conclusion === 'success' && job.steps?.some(step => step.name === 'Test B4 news count and refresh fence' && step.conclusion === 'success'))) throw Error('news-activation-full-news-ci-required');
}
export function validateNewsPlan(plan, project, approved = plan?.digest) {
  const { digest, ...data } = plan ?? {};
  if (digest !== approved || hash(data) !== digest || plan.v !== 1 || plan.projectId !== project ||
      plan.generation !== 'feed-v3' || !Array.isArray(plan.incarnation) || plan.incarnation.length !== 2 ||
      !plan.incarnation.every(Number.isSafeInteger) || !Array.isArray(plan.originals) || !Array.isArray(plan.requests) ||
      !Array.isArray(plan.transitions) || plan.transitions.length !== 5 ||
      !same(plan.transitions, ['paused', 'active', 'paused', 'active', 'paused'])) throw Error('news-activation-approved-plan-required');
}
export async function planNewsActivation(db, { expectedSources = 38 } = {}) {
  target(db);
  if (db.projectId !== 'shoutout-rules-test' && expectedSources !== 38) throw Error('news-activation-original-scope-required');
  const plan = await db.runTransaction(async tx => {
    const c = await tx.get(db.doc('feedIndexControl/current')), marker = await tx.get(db.doc('feedIndexGenerations/feed-v3'));
    const news = await tx.get(db.doc('feedNewsControl/current'));
    const heads = await tx.get(db.collection('feedIndexGenerations/feed-v3/publicationHeads').limit(1));
    const sources = await tx.get(db.collection('shouts').select().limit(expectedSources + 1));
    const requests = await tx.get(db.collection('accountDeletionRequests').select().limit(51));
    if (news.exists || !heads.empty || marker.get('newsIncarnation') !== undefined || !marker.exists || marker.get('cardReady') !== true ||
        c.get('mode') !== 'active' || c.get('cardReadGenerationId') !== 'feed-v3' || !c.get('cardWriteGenerationIds')?.includes('feed-v3') ||
        sources.size !== expectedSources || requests.size > 50) throw Error('news-activation-initial-state-conflict');
    return { v: 1, projectId: db.projectId, generation: 'feed-v3', incarnation: stamp(marker.createTime), markerUpdate: stamp(marker.updateTime),
      feedControlUpdate: stamp(c.updateTime), originals: sources.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })),
      requests: requests.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })), transitions: ['paused', 'active', 'paused', 'active', 'paused'] };
  }, { readOnly: true });
  return { ...plan, digest: hash(plan) };
}
export async function assertNewsOriginals(reader, db, plan) {
  const refs = [...plan.originals.map(d => ['shouts', d]), ...plan.requests.map(d => ['accountDeletionRequests', d])];
  const docs = refs.length ? await reader.getAll(...refs.map(([collection, d]) => db.doc(`${collection}/${d.id}`)), { fieldMask: [] }) : [];
  if (!docs.every((d, i) => d.exists && same(stamp(d.updateTime), refs[i][1].update))) throw Error('news-activation-original-data-drift');
  return docs.length;
}
export async function applyNewsTransition(db, plan, revision, { approvedDigest = plan?.digest, drain = null } = {}) {
  target(db); validateNewsPlan(plan, db.projectId, approvedDigest);
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > plan.transitions.length) throw Error('news-activation-explicit-transition-required');
  if (revision === 2 && (drain?.projectId !== newsProject || drain.validated !== true ||
      !same(drain.functions?.map(f => f.function).sort(), ['createShout', 'getFeedPage']))) throw Error('news-activation-drain-required');
  return db.runTransaction(async tx => {
    await assertNewsOriginals(tx, db, plan);
    const c = await tx.get(db.doc('feedIndexControl/current')), marker = await tx.get(db.doc(`feedIndexGenerations/${plan.generation}`));
    const current = await tx.get(db.doc('feedNewsControl/current'));
    if (!same(stamp(c.updateTime), plan.feedControlUpdate) || !same(stamp(marker.createTime), plan.incarnation)) throw Error('news-activation-generation-drift');
    const desired = { v: 1, revision, mode: plan.transitions[revision - 1], generation: plan.generation, incarnation: plan.incarnation };
    if (current.exists && same(current.data(), desired)) return { revision, mode: desired.mode, replay: true, writes: 0 };
    if ((current.get('revision') ?? 0) !== revision - 1 || revision > 1 &&
        (!same(current.get('incarnation'), plan.incarnation) || current.get('generation') !== plan.generation || current.get('mode') !== plan.transitions[revision - 2])) throw Error('news-activation-transition-conflict');
    if (revision === 1 && (current.exists || !same(stamp(marker.updateTime), plan.markerUpdate) ||
        !(await tx.get(marker.ref.collection('publicationHeads').limit(1))).empty)) throw Error('news-activation-bootstrap-drift');
    const change = await prepareNewsControlChange(tx, db, desired); change.apply();
    return { revision, mode: desired.mode, replay: false, writes: change.writes };
  });
}
export function planNewsIndexes(projectId, fields) {
  if (projectId !== newsProject) throw Error('news-activation-dev-required');
  const actions = newsIndexFields.map(field => {
    const resource = `projects/${projectId}/databases/(default)/collectionGroups/${field}`, before = fields[resource];
    if (before?.name !== resource || !before.indexConfig || before.indexConfig.usesAncestorConfig !== true && (before.indexConfig.indexes ?? []).length) throw Error('news-index-unreviewed-field');
    return { resource, before, desired: { name: resource, indexConfig: { indexes: [] } }, updateMask: 'indexConfig' };
  });
  const data = { v: 1, projectId, changesTTL: false, actions }; return { ...data, digest: hash(data) };
}
export function inspectNewsIndexes(plan, fields, approved) {
  const { digest, ...data } = plan;
  if (digest !== approved || hash(data) !== digest || plan.projectId !== newsProject || plan.actions.length !== 3 ||
      !same(plan.actions.map(a => a.resource), newsIndexFields.map(p => `projects/${newsProject}/databases/(default)/collectionGroups/${p}`))) throw Error('news-index-approved-plan-required');
  return plan.actions.map(a => {
    const row = fields[a.resource], nonIndex = v => Object.fromEntries(Object.entries(v ?? {}).filter(([key]) => key !== 'indexConfig'));
    if (!same(nonIndex(row), nonIndex(a.before))) throw Error('news-index-nonindex-drift');
    if (row?.indexConfig && row.indexConfig.usesAncestorConfig !== true && same(row.indexConfig.indexes ?? [], [])) return { resource: a.resource, ready: true };
    if (!same(row, a.before)) throw Error('news-index-config-drift');
    return { resource: a.resource, ready: false, request: { method: 'PATCH', updateMask: a.updateMask, body: a.desired } };
  });
}
const root = resolve(import.meta.dirname, '..');
function workspacePath(input) {
  const path = resolve(root, input), inside = relative(root, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw Error('news-activation-workspace-path-required'); return path;
}
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease } = {}) {
  delete process.env.DEBUG;
  const [action, ...args] = argv, o = {}, allowed = ['--project', '--plan', '--approved-digest', '--confirm-project', '--ci-run', '--revision', '--drain'];
  if (!['plan', 'status', 'transition'].includes(action)) throw Error('news-activation-explicit-action-required');
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(o, args[i])) throw Error('news-activation-invalid-options');
    o[args[i]] = args[i + 1];
  }
  if (o['--project'] !== newsProject || !o['--plan']) throw Error('news-activation-explicit-dev-required');
  const file = workspacePath(o['--plan']);
  let release;
  if (action === 'transition') {
    if (o['--confirm-project'] !== newsProject || !/^\d+$/.test(o['--ci-run'] ?? '') || !/^[a-f0-9]{64}$/.test(o['--approved-digest'] ?? '') || !/^[1-5]$/.test(o['--revision'] ?? '')) throw Error('news-activation-explicit-approval-required');
    release = inspectRelease(o); assertNewsRelease(newsProject, release);
  }
  const db = await openDatabase(newsProject);
  try {
    if (db.projectId !== newsProject) throw Error('news-activation-database-project-mismatch');
    if (action === 'plan') {
      const plan = await planNewsActivation(db); mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' }); return { digest: plan.digest, writes: 0 };
    }
    const plan = JSON.parse(readFileSync(file, 'utf8')); validateNewsPlan(plan, newsProject, action === 'transition' ? o['--approved-digest'] : plan.digest);
    if (action === 'status') return { originals: await assertNewsOriginals(db, db, plan), control: (await db.doc('feedNewsControl/current').get()).data() ?? null, writes: 0 };
    let drain = null;
    if (o['--drain']) {
      const evidence = JSON.parse(readFileSync(workspacePath(o['--drain']), 'utf8'));
      if (evidence.sourceCommit !== release.commit) throw Error('news-activation-drain-source-mismatch');
      drain = verifyNewsRevisionDrain(newsProject, evidence.before, evidence.after, evidence.services, evidence.revisions);
    }
    return await applyNewsTransition(db, plan, Number(o['--revision']), { approvedDigest: o['--approved-digest'], drain });
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
  .then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: /^(news-|feed-|card-)/.test(error.message ?? '') ? error.message : 'news-activation-failed' }) + '\n'); process.exitCode = 1;
  });
