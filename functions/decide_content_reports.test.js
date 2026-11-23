import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateContentReportDecision as validate, decideContentReportsOperation as decide } from './decide_content_reports.js';
import { accountPurgeStages, purgeScrubPatch } from './account_purge_policy.js';
const valid = () => ({ expectedUserId: 'mod', idempotencyKey: 'key', targetType: 'comment', shoutId: 'shout', targetId: 'comment',
  reportIds: ['b_shout_comment', 'a_shout_comment'], decision: 'approve', note: '  A note  ' });
test('decision payload is canonical, immutable, bounded and accepts only the three existing non-punitive decisions', () => {
  const input = valid(), before = JSON.parse(JSON.stringify(input)), value = validate(input);
  assert.deepEqual(input, before); assert.deepEqual(value.reportIds, ['a_shout_comment', 'b_shout_comment']); assert.equal(value.note, 'A note');
  for (const patch of [{ decision: 'remove' }, { decision: 'ban1d' }, { role: 6 }, { moderationScope: { global: true } },
    { expectedUserId: '../mod' }, { targetType: 'unknown' }, { targetType: ['shout'] }, { targetType: {} }, { shoutId: '' }, { targetId: '../comment' },
    { note: 'x'.repeat(501) }, { reportIds: [] }, { reportIds: ['a', 'a'] }, { reportIds: Array.from({ length: 51 }, (_, i) => `r${i}`) },
    { reportIds: ['a/b'] }, { reportIds: 'one' }]) assert.throws(() => validate({ ...input, ...patch }), e => e.code === 'invalid-argument');
  assert.equal(validate({ ...input, reportIds: Array.from({ length: 50 }, (_, i) => `r${i}`) }).reportIds.length, 50);
  for (const decision of ['approve', 'escalate', 'resolve']) assert.equal(validate({ ...input, decision }).decision, decision);
  assert.throws(() => validate({ ...input, targetType: 'shout' }), e => e.code === 'invalid-argument');
  const { targetId, ...root } = input; assert(targetId); assert.equal(validate({ ...root, targetType: 'shout' }).targetId, undefined);
});
test('missing Auth, App Check, verified identity and mismatched account stop before database access', async () => {
  const auth = { uid: 'mod', token: { email: 'm@example.test', email_verified: true } }, app = { appId: 'fixture' };
  const database = { runTransaction() { throw Error('must-not-run'); } };
  for (const request of [{ data: valid() }, { auth, data: valid() }, { auth: { ...auth, token: {} }, app, data: valid() },
    { auth, app, data: { ...valid(), expectedUserId: 'other' } }]) await assert.rejects(decide(request, database), e => ['unauthenticated', 'permission-denied'].includes(e.code));
});
test('actor cleanup is appended after existing purge stages and removes only the selected audit identity', () => {
  const stages = accountPurgeStages('moderator');
  assert.deepEqual(stages.slice(-6).map(s => [s.collection, s.field, s.action]),
    ['reports', 'commentReports', 'privateReplyReports'].flatMap(c => ['resolvedBy', 'escalatedBy'].map(f => [c, f, 'scrub'])));
  assert.deepEqual(stages.at(-7), { action: 'delete', direct: 'users/moderator' });
  const data = { resolvedBy: 'moderator', escalatedBy: 'other', resolvedAt: 'original', reason: 'Evidence' };
  assert.deepEqual(Object.keys(purgeScrubPatch(data, 'scrub', 'resolvedBy')), ['resolvedBy']);
});
