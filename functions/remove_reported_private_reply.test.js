import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReportedPrivateReplyRemoval as validate, privateReportModeratorLevel as level,
  assertPrivateReportScope as scope, removeReportedPrivateReplyOperation as remove } from './remove_reported_private_reply.js';
const valid = { expectedUserId: 'moderator', reportId: 'recipient_shout_private', idempotencyKey: 'request', note: ' reviewed ' };
const denied = e => e.code === 'permission-denied';
test('private removal accepts only decision identity and an existing-size note, never caller authority or replacement report data', () => {
  assert.equal(validate(valid).note, 'reviewed'); assert.equal(validate({ ...valid, note: undefined }).note, '');
  for (const invalid of [null, [], { ...valid, expectedUserId: '' }, { ...valid, reportId: '../report' }, { ...valid, idempotencyKey: 'x/y' },
    { ...valid, note: 7 }, { ...valid, note: 'x'.repeat(501) }, { ...valid, role: 'owner' }, { ...valid, countryCode: 'CZ' },
    { ...valid, authorId: 'someone' }, { ...valid, status: 'resolved' }, { ...valid, action: 'banPermanent' }, { ...valid, text: 'changed' }]) {
    assert.throws(() => validate(invalid), e => e.code === 'invalid-argument');
  }
});
test('role and geographic authority use stored numeric levels and exact region lists, with no implicit legacy/global permission', () => {
  for (const n of [3, 4, 5, 6]) assert.equal(level({ level: n }), n);
  for (const role of [null, {}, { level: 2 }, { level: '6' }, { level: 99 }, { level: 4, accountStatus: 'deleted' }]) assert.throws(() => level(role), denied);
  assert.equal(level(null, {}), 3); assert.throws(() => level(null, { accountStatus: 'deleted' }), denied);
  const cz = { geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' } };
  for (const s of [{ global: true }, { countries: ['CZ'] }, { subdivisions: ['CZ-42'] }]) assert.doesNotThrow(() => scope({ moderationScope: s }, 3, cz));
  for (const s of [null, {}, { countries: ['US'] }, { subdivisions: ['CZ-10'] }, { countries: ['cz'] }, { global: 'true' }, { countries: 'CZ' }, { countries: [''] }])
    assert.throws(() => scope({ moderationScope: s }, 3, cz), denied);
  assert.throws(() => scope({ moderationScope: { countries: ['CZ'] } }, 3, null), denied);
  assert.throws(() => scope({ moderationScope: { countries: ['CZ'] } }, 3, { geography: { countryCode: 'CZ' } }), denied);
  assert.doesNotThrow(() => scope(null, 5, null)); assert.doesNotThrow(() => scope(null, 6, null));
});
test('missing identity, App Check, verified email and changed account fail before opening a transaction', async () => {
  const db = { runTransaction() { throw Error('database-must-not-be-used'); } };
  const request = { auth: { uid: 'moderator', token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: valid };
  for (const input of [{ ...request, auth: null }, { ...request, app: null },
    { ...request, auth: { ...request.auth, token: { email: 'fixture@example.test', email_verified: false } } },
    { ...request, data: { ...valid, expectedUserId: 'other' } }]) {
    await assert.rejects(remove(input, db), e => ['unauthenticated', 'permission-denied'].includes(e.code));
  }
});
