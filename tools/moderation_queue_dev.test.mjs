import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requiredTransitionChecks } from './feed_generation_transition.mjs';
import { assertModerationQueueRelease, moderationQueueRequiredChecks, prepareModerationQueueDevRelease } from './moderation_queue_dev_release.mjs';
import { verifyModerationQueueRevisionDrain, moderationQueueWriterFunctions } from './feed_revision_drain.mjs';
import { collectModerationIndexPlan, applyModerationIndexPlan, validateModerationIndexPlan } from './moderation_queue_dev_indexes.mjs';
import { main as operator, setModerationQueueMode } from './moderation_queue_dev.mjs';
import { main as pilot } from './moderation_queue_pilot.mjs';
import { collectModerationCloudSnapshot, proveModerationQueueDeployment } from './moderation_queue_cloud.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonical } from '../functions/feed_block_index.js';
import { moderationQueueTransitionPlan } from '../functions/moderation_queue_transition_core.js';
const root = resolve(import.meta.dirname, '..'), project = 'shoutout-dev-46c81';
const release = () => ({ branch: 'feature/queue', dirty: '', commit: 'a'.repeat(40), ci: { headSha: 'a'.repeat(40), status: 'completed', conclusion: 'success', workflowName: 'Flutter checks', jobs: [{ conclusion: 'success', steps: [...requiredTransitionChecks, ...moderationQueueRequiredChecks].map(name => ({ name, conclusion: 'success' })) }] } });
test('DEV mutators require exact full CI before connecting; pilot seed also requires an available client', async () => {
  assertModerationQueueRelease(release());
  for (const bad of [p => p.dirty = ' M functions/content.js', p => p.ci.headSha = 'b'.repeat(40), p => p.ci.jobs[0].steps.pop(), p => p.ci.jobs[0].steps[0].conclusion = 'skipped']) {
    const proof = release(); bad(proof); assert.throws(() => assertModerationQueueRelease(proof));
  }
  const deps = { openDatabase() { assert.fail('no database before gates'); }, inspectRelease() { return { ...release(), dirty: 'dirty' }; } };
  await assert.rejects(operator(['begin', '--project', project, '--ci-run', '1'], deps), /clean-exact/);
  await assert.rejects(operator(['begin', '--project', 'shoutout-production-a1b34'], deps), /live-dev/);
  await assert.rejects(pilot(['seed', '--project', project], deps), /available-client/);
});
test('selective index operator resumes exactly four approved creates, never TTL or deletions', async () => {
  const installed = [], submitted = [];
  const call = async (method, url, body) => {
    const u = new URL(url), collection = u.pathname.split('/').at(-2);
    if (method === 'GET') return { indexes: installed.filter(i => i.collectionGroup === collection).map(({ collectionGroup, ...i }) => ({ ...i,
      name: `projects/${project}/databases/(default)/collectionGroups/${collectionGroup}/indexes/${i.id}` })) };
    assert.equal(method, 'POST'); submitted.push(body); installed.push({ ...body, collectionGroup: collection, state: 'CREATING', id: String(installed.length) });
    return { name: 'operation-' + installed.length };
  };
  const plan = await collectModerationIndexPlan(call); assert.equal(plan.actions.length, 4); validateModerationIndexPlan(plan);
  assert.equal((await applyModerationIndexPlan(plan, call)).submitted, 4);
  assert.equal((await applyModerationIndexPlan(plan, call)).submitted, 0); assert.equal(submitted.length, 4);
  assert.equal((await collectModerationIndexPlan(call)).ready, false);
  installed.forEach(i => i.state = 'READY'); assert.equal((await collectModerationIndexPlan(call)).ready, true);
  assert.throws(() => validateModerationIndexPlan({ ...plan, changesTTL: true }), /invalid-index-plan/);
  assert.throws(() => validateModerationIndexPlan({ ...plan, actions: [{ method: 'DELETE', resource: 'other' }] }), /invalid-index-plan/);
});
test('all eight old writers require actual retired revisions and stable resources', () => {
  const before = moderationQueueWriterFunctions.map(name => ({ name, state: 'ACTIVE', revision: name + '-old', service: name.toLowerCase(), memory: '256Mi', max: 1, min: 0, concurrency: 1, timeout: 15 }));
  const after = before.map(f => ({ ...f, revision: f.name + '-new' }));
  const services = after.map(f => ({ name: f.service, latestReadyRevision: f.revision, trafficStatuses: [{ revision: f.revision, percent: 100 }] }));
  const revisions = Object.fromEntries(before.map(f => [f.service, [{ name: f.revision, conditions: [{ type: 'Active', state: 'CONDITION_FAILED', revisionReason: 'RETIRED' }] }]]));
  assert.equal(verifyModerationQueueRevisionDrain(project, before, after, services, revisions).functions.length, 8);
  revisions[before[7].service][0].conditions[0].revisionReason = 'OTHER';
  assert.throws(() => verifyModerationQueueRevisionDrain(project, before, after, services, revisions), /not-retired/);
});
test('active and rollback artifacts preserve managed archive, full queue and original maintenance', () => {
  const active = prepareModerationQueueDevRelease(root), rollback = prepareModerationQueueDevRelease(root, 'rollback');
  assert.notEqual(active.target, rollback.target); assert.equal(active.manifest.sourceCommit.length, 40);
  for (const item of [active, rollback]) {
    assert.equal(Object.values(item.manifest.functions).flatMap(g => g.names).length, 11);
    const config = JSON.parse(readFileSync(item.config, 'utf8'));
    assert.equal(config.serverModerationQueue, true); assert.equal(config.serverContentLifecycle, true); assert.equal(config.legalVersion, '2026-11-27');
    for (const g of Object.values(item.manifest.functions)) {
      assert(Object.keys(g.hashes).every(n => !/pilot|transition|\.test\./.test(n)));
      assert(readFileSync(resolve(g.source, '.env.' + project), 'utf8').includes('SHOUTOUT_ARCHIVE_RELEASE_PHASE=active'));
      assert(g.hashes['moderation_queue_deployment.js']);
    }
  }
  assert.notEqual(active.manifest.functions.content.hashes['.env.' + project], rollback.manifest.functions.content.hashes['.env.' + project]);
});
test('live evidence checks actual uploaded source, resources and retired infrastructure before adoption', async () => {
  const names = [...moderationQueueWriterFunctions, 'getModerationCasePage', 'startModerationCaseDecision', 'stepModerationCaseDecision'];
  let deployed = false, badSource = false;
  const zip = execFileSync('python', ['-c', "import io,zipfile,sys; b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); z.writestr('sentinel.js','checked source'); z.close(); sys.stdout.buffer.write(b.getvalue())"], { windowsHide: true });
  const sourceHash = createHash('sha256').update('checked source').digest('hex');
  const functions = () => (deployed ? names : moderationQueueWriterFunctions).map(name => ({
    name: `projects/${project}/locations/europe-west3/functions/${name}`, state: 'ACTIVE',
    buildConfig: { runtime: 'nodejs22', source: { storageSource: { bucket: 'gcf-v2-sources-fixture', object: 'source.zip', generation: '1' } } },
    serviceConfig: { service: `projects/${project}/locations/europe-west3/services/${name.toLowerCase()}`, revision: name + (deployed ? '-new' : '-old'),
      availableMemory: '256Mi', minInstanceCount: 0, maxInstanceCount: 1, maxInstanceRequestConcurrency: 1,
      environmentVariables: deployed ? { SHOUTOUT_MODERATION_QUEUE_PHASE: 'active', SHOUTOUT_ARCHIVE_RELEASE_PHASE: 'active' } : {},
      timeoutSeconds: ['accountDeletionRequestCreatedDev', 'resumeAccountDeletionJobsDev', 'cleanupOperationReceipts'].includes(name) ? 60 : 15, availableCpu: '1', ingressSettings: 'ALLOW_ALL', serviceAccountEmail: 'fixture@example.test' },
  }));
  const call = async (_, url) => {
    const u = new URL(url);
    if (u.hostname === 'cloudfunctions.googleapis.com') return { functions: functions() };
    if (u.hostname === 'cloudscheduler.googleapis.com') return { jobs: [] };
    if (u.hostname === 'firebasehosting.googleapis.com') return { releases: [{ version: { name: 'unchanged' } }] };
    if (u.hostname === 'firebaserules.googleapis.com') return { rulesetName: 'unchanged' };
    if (u.hostname === 'storage.googleapis.com') return badSource ? Buffer.from('not a zip') : zip;
    if (u.pathname.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] };
    const service = u.pathname.replace(/^\/v2\//, '').replace(/\/revisions$/, ''), name = names.find(n => service.endsWith('/' + n.toLowerCase()));
    if (u.pathname.endsWith('/revisions')) return { revisions: [{ name: name + '-old', conditions: [{ type: 'Active', state: 'CONDITION_FAILED', revisionReason: 'RETIRED' }] }] };
    return { name: service, latestReadyRevision: name + '-new', trafficStatuses: [{ revision: name + '-new', percent: 100 }] };
  };
  const before = await collectModerationCloudSnapshot(call); deployed = true;
  const manifest = { projectId: project, kind: 'moderation-queue-dev', phase: 'active', sourceCommit: 'a'.repeat(40), dirty: false,
    functions: { content: { names, hashes: { 'sentinel.js': sourceHash } } } };
  const proof = await proveModerationQueueDeployment(call, before, manifest);
  assert.equal(proof.verified.length, 11); assert.equal(proof.drain.functions.length, 8);
  await assert.rejects(proveModerationQueueDeployment(call, before, { ...manifest, dirty: true }), /clean-artifact/);
  const changed = structuredClone(manifest); changed.functions.content.hashes['sentinel.js'] = 'b'.repeat(64);
  await assert.rejects(proveModerationQueueDeployment(call, before, changed), /source-mismatch/);
});
test('pause/resume uses an exact incarnation and revision and tolerates a lost reply', async () => {
  const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
  const cloud = { projectId: project, functions: [], jobs: [], rules: {}, hosting: 'baseline' };
  const body = { schemaVersion: 1, kind: 'moderation-queue-dev-install', projectId: project, sourceCommit: 'a'.repeat(40), inventory: { control: null },
    transition: moderationQueueTransitionPlan({ projectId: project, sourceCommit: 'a'.repeat(40), incarnation: 'b'.repeat(64) }),
    cloud: { ...cloud, digest: hash(cloud) }, indexes: await collectModerationIndexPlan(async () => ({ indexes: [] })) };
  const plan = { ...body, digest: hash(body) };
  const control = { schemaVersion: 1, mode: 'active', revision: 2, incarnation: plan.transition.incarnation, planDigest: plan.transition.digest };
  let writes = 0;
  const db = { doc: () => ({}), runTransaction: op => op({ get: async () => ({ data: () => ({ ...control }) }),
    update: (_, patch) => { writes++; Object.assign(control, patch); } }) };
  const pause = { from: 'active', to: 'paused', revision: 2 };
  assert.deepEqual(await setModerationQueueMode(db, plan, pause), { mode: 'paused', revision: 3 });
  await setModerationQueueMode(db, plan, pause); assert.equal(writes, 1);
  await assert.rejects(setModerationQueueMode(db, plan, { from: 'paused', to: 'active', revision: 2 }), /revision-drift/);
  await setModerationQueueMode(db, plan, { from: 'paused', to: 'active', revision: 3 }); assert.equal(control.revision, 4);
  control.incarnation = 'c'.repeat(64);
  await assert.rejects(setModerationQueueMode(db, plan, { from: 'active', to: 'paused', revision: 4 }), /incarnation-drift/);
});
