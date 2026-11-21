import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { inspectTransitionRelease } from './feed_generation_transition.mjs';
import { assertNewsRelease, newsProject } from './feed_news_activation.mjs';
import { planNewsPilot, validateNewsPilot, publishNewsFixture, adoptNewsClientFixture, cleanupNewsPilot } from '../functions/feed_news_pilot.js';
const root = resolve(import.meta.dirname, '..');
function inside(value) {
  const path = resolve(root, value), rel = relative(root, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('news-pilot-workspace-path-required'); return path;
}
export async function main(argv, { openDatabase = feedAdminDatabase, inspectRelease = inspectTransitionRelease } = {}) {
  delete process.env.DEBUG;
  const [action, ...args] = argv, o = {};
  if (!['plan', 'status', 'publish', 'adopt', 'cleanup'].includes(action)) throw Error('news-pilot-explicit-action-required');
  const allowed = ['--project', '--state', '--actors', '--slot', '--ci-run', '--approved-digest', '--confirm-project', '--clients-complete'];
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(o, args[i])) throw Error('news-pilot-invalid-options');
    o[args[i]] = args[i + 1];
  }
  if (o['--project'] !== newsProject || !o['--state']) throw Error('news-pilot-explicit-dev-required');
  const file = inside(o['--state']);
  if (['publish', 'adopt', 'cleanup'].includes(action)) {
    if (o['--confirm-project'] !== newsProject || !/^\d+$/.test(o['--ci-run'] ?? '') || !/^[a-f0-9]{64}$/.test(o['--approved-digest'] ?? '')) throw Error('news-pilot-explicit-approval-required');
    assertNewsRelease(newsProject, inspectRelease(o));
  }
  if (action === 'plan' && (!o['--actors'] || existsSync(file))) throw Error('news-pilot-new-state-required');
  const db = await openDatabase(newsProject);
  try {
    if (db.projectId !== newsProject) throw Error('news-pilot-database-project-mismatch');
    let state = action === 'plan' ? null : JSON.parse(readFileSync(file, 'utf8'));
    const persist = () => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(state, null, 2) + '\n'); renameSync(file + '.tmp', file); };
    if (action === 'plan') {
      const actors = JSON.parse(readFileSync(inside(o['--actors']), 'utf8')); if (actors.projectId !== newsProject) throw Error('news-pilot-actor-project-mismatch');
      state = { v: 1, phase: 'planned', bindings: {}, plan: await planNewsPilot(db, actors.actors, `mvp-b4b-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`) }; persist();
      return { digest: state.plan.digest, slots: state.plan.slots.map(({ label, title, text, duration }) => ({ label, title, text, duration })), cloudWrites: 0 };
    }
    validateNewsPilot(db, state.plan);
    if (['publish', 'adopt', 'cleanup'].includes(action) && state.plan.digest !== o['--approved-digest']) throw Error('news-pilot-approved-digest-required');
    if (action === 'status') {
      const sources = Object.fromEntries(await Promise.all(Object.entries(state.bindings).map(async ([label, b]) => [label, (await db.doc(`shouts/${b.id}`).get()).exists])));
      return { phase: state.phase, sources, bindings: state.bindings, cloudWrites: 0 };
    }
    if (['cleaning', 'cleaned'].includes(state.phase) && action !== 'cleanup') throw Error('news-pilot-already-cleaning');
    if (action === 'publish') {
      const label = o['--slot']; if (!['A', 'C'].includes(label)) throw Error('news-pilot-only-admin-slots-A-C');
      const slot = state.plan.slots.find(s => s.label === label);
      state.bindings[label] ??= { id: slot.id, createdAt: Date.now() }; persist();
      const result = await publishNewsFixture(db, state.plan, label, state.bindings[label].createdAt);
      state.bindings[label].expiresAt = state.bindings[label].createdAt + slot.duration; state.phase = 'running'; persist(); return result;
    }
    if (action === 'adopt') {
      const binding = await adoptNewsClientFixture(db, state.plan);
      if (state.bindings.B && state.bindings.B.id !== binding.id) throw Error('news-pilot-client-binding-conflict');
      state.bindings.B = binding; persist(); return { adopted: true, id: binding.id, cloudWrites: 0 };
    }
    if (o['--clients-complete'] !== 'yes') throw Error('news-pilot-client-completion-required');
    state.phase = 'cleaning'; persist(); const result = await cleanupNewsPilot(db, state.plan, state.bindings);
    state.phase = 'cleaned'; state.cleanup = result; persist(); return result;
  } finally { await db.terminate(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
  .then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: /^(news-|feed-|card-)/.test(error.message ?? '') ? error.message : 'news-pilot-failed' }) + '\n'); process.exitCode = 1;
  });
