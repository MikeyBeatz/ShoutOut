import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePrivateReplyDeletion as validate, deletePrivateReplyOperation as remove } from './delete_private_reply.js';

const input = { expectedUserId: 'author', shoutId: 'shout', privateReplyId: 'reply', idempotencyKey: 'retry' };
test('private deletion accepts only a bounded target and explicit expected identity', () => {
  assert.deepEqual(validate(input), input);
  for (const value of [null, [], {}, { ...input, expectedUserId: undefined }, { ...input, authorId: 'other' },
    { ...input, text: 'private content' }, { ...input, count: 1 }, { ...input, shoutId: '../shouts' },
    { ...input, privateReplyId: 'a/b' }, { ...input, privateReplyId: 'a'.repeat(129) }, { ...input, idempotencyKey: '' }]) {
    assert.throws(() => validate(value), error => error.code === 'invalid-argument');
  }
});
test('private deletion rejects missing identity/App Check/verified email or account change before database access', async () => {
  const request = { auth: { uid: 'author', token: { email: 'author@example.test', email_verified: true } },
    app: { appId: 'web' }, data: input };
  for (const value of [{ ...request, auth: null }, { ...request, app: null },
    { ...request, auth: { ...request.auth, token: { email: 'author@example.test' } } },
    { ...request, data: { ...input, expectedUserId: 'other' } }]) {
    await assert.rejects(remove(value, {}), error => ['unauthenticated', 'permission-denied'].includes(error.code));
  }
});
