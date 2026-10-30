import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { validateCommentDeletion, nextDeleteRate, deleteCommentOperation } from './delete_comment.js';

test('comment deletion rejects injected identities, counters and invalid document paths', () => {
  const input = { shoutId: 'shout', commentId: 'comment', idempotencyKey: 'retry', expectedUserId: 'actor' };
  assert.deepEqual(validateCommentDeletion(input), input);
  for (const invalid of [null, [], {}, { ...input, authorId: 'victim' }, { ...input, count: 0 },
    { ...input, shoutId: '../shouts' }, { ...input, commentId: 'a/b' },
    { ...input, idempotencyKey: '' }, { ...input, expectedUserId: null }]) {
    assert.throws(() => validateCommentDeletion(invalid), error => error.code === 'invalid-argument');
  }
});

test('delete rate preserves exact cooldown and hourly boundaries and fails closed on corrupt data', () => {
  const now = Timestamp.fromMillis(10000000);
  const stored = { lastAt: Timestamp.fromMillis(now.toMillis() - 1000),
    windowStartedAt: Timestamp.fromMillis(now.toMillis() - 3599999), count: 120 };
  assert.throws(() => nextDeleteRate(stored, now, 'comment'), error => error.code === 'resource-exhausted');
  const reset = nextDeleteRate(stored, Timestamp.fromMillis(now.toMillis() + 1), 'comment');
  assert.equal(reset.count, 1);
  assert.equal(reset.lastEventId, 'comment');
  assert.throws(() => nextDeleteRate({ ...stored, count: 1, lastAt: now }, now, 'comment'),
    error => error.code === 'resource-exhausted');
  for (const count of [null, 0, -1, 1.5, '1']) {
    assert.throws(() => nextDeleteRate({ ...stored, count }, now, 'comment'),
      error => error.code === 'failed-precondition');
  }
  assert.throws(() => nextDeleteRate({ ...stored, lastAt: null }, now, 'comment'),
    error => error.code === 'failed-precondition');
});

test('comment deletion requires Auth, App Check, verified email and the expected account before database access', async () => {
  const request = { auth: { uid: 'actor', token: { email: 'actor@example.test', email_verified: true } },
    app: { appId: 'web' }, data: { shoutId: 'shout', commentId: 'comment', idempotencyKey: 'retry', expectedUserId: 'actor' } };
  for (const invalid of [{ ...request, auth: null }, { ...request, app: null },
    { ...request, auth: { ...request.auth, token: { email: 'actor@example.test' } } },
    { ...request, data: { ...request.data, expectedUserId: 'other' } }]) {
    await assert.rejects(deleteCommentOperation(invalid, {}), error =>
      ['unauthenticated', 'permission-denied'].includes(error.code));
  }
});
