import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateShoutDeletion, deleteShoutOperation } from './delete_shout.js';

test('Shout deletion rejects injected authority, metadata and unsafe paths', () => {
  const input = { shoutId: 'shout', idempotencyKey: 'retry', expectedUserId: 'actor' };
  assert.deepEqual(validateShoutDeletion(input), input);
  for (const invalid of [null, [], {}, { ...input, authorId: 'victim' }, { ...input, status: 'active' },
    { ...input, shoutId: 'a/b' }, { ...input, idempotencyKey: '' }, { ...input, expectedUserId: null }]) {
    assert.throws(() => validateShoutDeletion(invalid), error => error.code === 'invalid-argument');
  }
});
test('Shout deletion requires Auth, App Check, verified email and account binding before DB access', async () => {
  const request = { auth: { uid: 'actor', token: { email: 'actor@example.test', email_verified: true } },
    app: { appId: 'web' }, data: { shoutId: 'shout', idempotencyKey: 'retry', expectedUserId: 'actor' } };
  for (const invalid of [{ ...request, auth: null }, { ...request, app: null },
    { ...request, auth: { ...request.auth, token: { email: 'actor@example.test' } } },
    { ...request, data: { ...request.data, expectedUserId: 'other' } }]) {
    await assert.rejects(deleteShoutOperation(invalid, {}), error => ['unauthenticated', 'permission-denied'].includes(error.code));
  }
});
