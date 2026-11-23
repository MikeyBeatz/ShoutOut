import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSanctionContent, sanctionContentOperation, revokeSanctionOperation, sanctionActions } from './moderation_sanctions.js';
const payload = { expectedUserId: 'mod', expectedTargetUserId: 'author', idempotencyKey: 'opaque', mode: 'report', targetType: 'comment',
  shoutId: 'root', targetId: 'child', reportIds: ['b', 'a'], sourceReportId: 'b', decision: 'warning', note: ' Concrete reason ' };
test('sanction validation is canonical, bounded and rejects client authority/snapshots', () => {
  assert.deepEqual(validateSanctionContent(payload).reportIds, ['a', 'b']); assert.equal(validateSanctionContent(payload).note, 'Concrete reason');
  for (const patch of [{ role: 6 }, { contentSnapshot: {} }, { expiresAt: Date.now() }, { expectedTargetUserId: 'bad/path' },
    { decision: 'ban365d' }, { reportIds: ['a', 'a'] }, { reportIds: Array.from({ length: 51 }, (_, i) => String(i)) },
    { mode: 'report', expectedCreatedAt: 1 }, { note: ' ' }, { note: 'x'.repeat(501) }]) assert.throws(() => validateSanctionContent({ ...payload, ...patch }));
  const observation = { ...payload, mode: 'observation', expectedCreatedAt: 1 }; delete observation.reportIds; delete observation.sourceReportId;
  assert.equal(validateSanctionContent(observation).reportIds.length, 0);
  for (const expectedCreatedAt of [null, 0, -1, '1', 1.2]) assert.throws(() => validateSanctionContent({ ...observation, expectedCreatedAt }));
});
test('existing fixed sanction choices include the documented senior 90-day restriction', () => {
  assert.equal(Object.keys(sanctionActions).length, 10);
  for (const [name, policy] of Object.entries(sanctionActions)) assert.equal(policy.role, name.endsWith('90d') || name === 'banPermanent' ? 4 : 3);
});
test('unauthenticated and invalid operations cannot touch the database', async () => {
  const db = new Proxy({}, { get() { throw Error('database-must-not-run'); } });
  await assert.rejects(sanctionContentOperation({ data: payload }, db), e => e.code === 'unauthenticated');
  await assert.rejects(revokeSanctionOperation({ data: {} }, db), e => e.code === 'unauthenticated');
});
