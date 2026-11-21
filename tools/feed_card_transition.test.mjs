import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { requiredTransitionChecks, parseTransitionArguments } from './feed_generation_transition.mjs';
import { requiredCardChecks, assertCardTransitionRelease, main } from './feed_card_transition.mjs';
import { planCardIndexes, inspectCardIndexProgress } from './feed_card_index_plan.mjs';
import { canonical } from '../functions/feed_block_index.js';
const project = 'shoutout-dev-46c81', base = `projects/${project}/databases/(default)/collectionGroups`;
function proof() {
  return { commit: 'a'.repeat(40), dirty: '', branch: 'feature/test', ci: { headSha: 'a'.repeat(40), status: 'completed', conclusion: 'success', workflowName: 'Flutter checks',
    jobs: [{ conclusion: 'success', steps: [...requiredTransitionChecks, ...requiredCardChecks].map(name => ({ name, conclusion: 'success' })) }] } };
}
test('operator requires exact complete CI, clean tree, explicit target and production tag', () => {
  assertCardTransitionRelease(project, proof());
  for (const key of ['headSha', 'status', 'conclusion']) { const bad = proof(); bad.ci[key] = 'bad'; assert.throws(() => assertCardTransitionRelease(project, bad)); }
  for (const name of requiredCardChecks) { const bad = proof(); bad.ci.jobs[0].steps = bad.ci.jobs[0].steps.filter(step => step.name !== name); assert.throws(() => assertCardTransitionRelease(project, bad)); }
  assert.throws(() => assertCardTransitionRelease(project, { ...proof(), dirty: '?? unknown' }));
  assert.throws(() => assertCardTransitionRelease('shoutout-production-a1b34', proof()));
  assertCardTransitionRelease('shoutout-production-a1b34', { ...proof(), branch: 'main', tag: 'v1.0.0', tagCommit: 'a'.repeat(40) });
  for (const args of [[], ['start', '--project', project], ['plan', '--project', 'other', '--generation', 'card']]) assert.throws(() => parseTransitionArguments(args));
});
test('disabled activation and incorrect proof fail before database/auth access', async t => {
  const dir = mkdtempSync(join(import.meta.dirname, '../build/card-plan-test-')); t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, 'plan.json'), data = { batchSize: 50, controlRevision: 6, kind: 'feed-card-state-transition', projectId: project,
    sourceGenerationId: 'feed-v2', sourceIncarnation: [1, 0], targetGenerationId: 'feed-v3', v: 1, writeGenerationIds: ['feed-v1', 'feed-v2'], writeIncarnations: { 'feed-v1': [1, 0], 'feed-v2': [1, 0] } };
  const digest = createHash('sha256').update(canonical(data)).digest('hex'); writeFileSync(file, JSON.stringify({ ...data, digest }));
  const args = ['start', '--project', project, '--plan', relative(join(import.meta.dirname, '..'), file), '--approved-digest', digest, '--confirm-project', project, '--ci-run', '123'];
  const openDatabase = () => { assert.fail('database must not open'); };
  await assert.rejects(main(args, { openDatabase, inspectRelease: proof, configuration: {compatibleGenerations: true, cardStateEnabled: false, deltaResponsesEnabled: false} }), /activation-release-required/);
  await assert.rejects(main(args, { openDatabase, inspectRelease: () => ({ ...proof(), dirty: 'changed' }) }), /clean-exact-full-ci/);
});
function inventory() {
  const fields = {};
  for (const [group, names] of [['publicStates', ['schemaVersion', 'schema', 'bodyVersion', 'selectionVersion', 'revision', 'geohash', 'businessHighlighted', 'businessSpotlight', 'likesCount', 'dislikesCount', 'commentsCount', 'savesCount']], ['shouts', ['cardRevision']]]) {
    for (const field of names) { const name = `${base}/${group}/fields/${field}`; fields[name] = { name, indexConfig: { usesAncestorConfig: true, indexes: [{ queryScope: 'COLLECTION', fields: [{ fieldPath: field, order: 'ASCENDING' }] }] }, ttlConfig: { state: 'ACTIVE' } }; }
  }
  return { complete: true, indexes: [{ name: `${base}/other/indexes/existing`, queryScope: 'COLLECTION', state: 'READY', fields: [{ fieldPath: 'kept', order: 'ASCENDING' }] }], fields };
}
test('selective plan preserves inventory and TTL, recognizes partial completion and readiness', () => {
  const initial = inventory(), copy = structuredClone(initial), plan = planCardIndexes(project, initial);
  assert.equal(plan.actions.length, 14); assert.deepEqual(initial, copy);
  let status = inspectCardIndexProgress(plan, initial, plan.digest); assert(!status.complete);
  assert.equal(status.actions.filter(row => row.request).length, 14);
  const current = structuredClone(initial), composite = plan.actions[0];
  current.indexes.push({ ...composite.desired, name: composite.resource + '/new', state: 'CREATING' });
  for (const action of plan.actions.slice(1, 5)) current.fields[action.resource].indexConfig = { indexes: [] };
  status = inspectCardIndexProgress(plan, current, plan.digest);
  assert.equal(status.actions.filter(row => row.state === 'ready').length, 4);
  assert.equal(status.actions[0].state, 'pending');
  for (const action of plan.actions.slice(1)) {
    current.fields[action.resource].indexConfig = { indexes: [] };
    assert.equal(action.updateMask, 'indexConfig'); assert(!Object.hasOwn(action.desired, 'ttlConfig'));
  }
  current.indexes.at(-1).state = 'READY'; assert(inspectCardIndexProgress(plan, current, plan.digest).complete);
  assert.deepEqual(current.indexes[0], initial.indexes[0]);
  assert(Object.values(current.fields).every(row => row.ttlConfig.state === 'ACTIVE'));
});
test('index planner rejects incomplete inventory, foreign overrides, wrong digest and target drift', () => {
  const initial = inventory(), plan = planCardIndexes(project, initial), field = plan.actions[1].resource;
  assert.throws(() => planCardIndexes(project, { ...initial, complete: false }));
  assert.throws(() => inspectCardIndexProgress(plan, initial, '0'.repeat(64)));
  const ttl = structuredClone(initial); ttl.fields[field].ttlConfig.state = 'DISABLED'; assert.throws(() => inspectCardIndexProgress(plan, ttl, plan.digest), /nonindex-field-drift/);
  const foreign = structuredClone(initial); foreign.fields[field].indexConfig.usesAncestorConfig = false;
  assert.throws(() => planCardIndexes(project, foreign), /unreviewed-explicit/);
  assert.throws(() => inspectCardIndexProgress(plan, foreign, plan.digest), /field-drift/);
});
