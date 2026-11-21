import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNewsIndexes, inspectNewsIndexes, newsIndexFields, newsProject, assertNewsRelease, main } from './feed_news_activation.mjs';
import { verifyNewsRevisionDrain, b4WriterFunctions } from './feed_revision_drain.mjs';
import { requiredTransitionChecks } from './feed_generation_transition.mjs';
import { requiredCardChecks } from './feed_card_transition.mjs';

function fields() { return Object.fromEntries(newsIndexFields.map(p => {
  const name = `projects/${newsProject}/databases/(default)/collectionGroups/${p}`;
  return [name, { name, indexConfig: { usesAncestorConfig: true, indexes: [{ order: 'ASCENDING' }] }, ttlConfig: { state: 'ACTIVE' } }];
})); }
test('news index plan is exactly three fields, preserves TTL and rejects drift/tampering', () => {
  const before = fields(), plan = planNewsIndexes(newsProject, before);
  assert.equal(plan.actions.length, 3); assert(plan.actions.every(a => a.updateMask === 'indexConfig'));
  assert(inspectNewsIndexes(plan, before, plan.digest).every(a => !a.ready));
  const after = structuredClone(before); for (const row of Object.values(after)) row.indexConfig = { indexes: [] };
  assert(inspectNewsIndexes(plan, after, plan.digest).every(a => a.ready));
  for (const row of Object.values(after)) row.indexConfig = {};
  assert(inspectNewsIndexes(plan, after, plan.digest).every(a => a.ready));
  Object.values(after)[0].ttlConfig.state = 'DISABLED'; assert.throws(() => inspectNewsIndexes(plan, after, plan.digest), /nonindex-drift/);
  assert.throws(() => inspectNewsIndexes({ ...plan, actions: [] }, before, plan.digest), /approved-plan/);
  assert.throws(() => planNewsIndexes('shoutout-production-a1b34', before), /dev-required/);
  Object.values(before)[0].indexConfig.usesAncestorConfig = false; assert.throws(() => planNewsIndexes(newsProject, before), /unreviewed/);
});
test('news drain checks precisely two services while old ten-service contract remains exported', () => {
  assert.equal(b4WriterFunctions.length, 10);
  const before = ['createShout', 'getFeedPage'].map(name => ({ name, state: 'ACTIVE', revision: name + '-old', service: `services/${name.toLowerCase()}`, memory: '256Mi', min: 0, max: 1, concurrency: 1, timeout: 15 }));
  const after = before.map(f => ({ ...f, revision: f.name + '-new' }));
  const services = after.map(f => ({ name: f.service, latestReadyRevision: f.revision, trafficStatuses: [{ revision: f.revision, percent: 100 }] }));
  const revisions = Object.fromEntries(before.map(f => [f.name.toLowerCase(), [{ name: f.revision, conditions: [{ type: 'Active', state: 'CONDITION_FAILED', revisionReason: 'RETIRED' }] }]]));
  assert.equal(verifyNewsRevisionDrain(newsProject, before, after, services, revisions).functions.length, 2);
  services[0].trafficStatuses[0].percent = 99; assert.throws(() => verifyNewsRevisionDrain(newsProject, before, after, services, revisions));
});
test('news commands reject incomplete approval and unsafe targets before opening database', async () => {
  const options = { openDatabase() { throw Error('must-not-open'); } };
  await assert.rejects(main(['transition', '--project', newsProject, '--plan', 'build/test.json'], options), /explicit-approval/);
  await assert.rejects(main(['plan', '--project', 'shoutout-production-a1b34', '--plan', 'build/test.json'], options), /explicit-dev/);
  await assert.rejects(main(['plan', '--project', newsProject, '--plan', '../outside.json'], options), /workspace/);
  assert.throws(() => assertNewsRelease(newsProject, {}), /clean-exact-full-ci/);
  const proof = { commit: 'a'.repeat(40), dirty: '', branch: 'feature/news', ci: { headSha: 'a'.repeat(40), status: 'completed', conclusion: 'success', workflowName: 'Flutter checks',
    jobs: [{ conclusion: 'success', steps: [...requiredTransitionChecks, ...requiredCardChecks].map(name => ({ name, conclusion: 'success' })) }] } };
  assert.throws(() => assertNewsRelease(newsProject, proof), /full-news-ci/);
  proof.ci.jobs[0].steps.push({ name: 'Test B4 news count and refresh fence', conclusion: 'success' }); assertNewsRelease(newsProject, proof);
  proof.dirty = '?? unreviewed'; assert.throws(() => assertNewsRelease(newsProject, proof), /clean-exact-full-ci/);
});
