import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { validateCreateComment, nextCommentRate } from './create_comment.js';

const valid = { idempotencyKey: 'request-1', shoutId: 'shout-1', text: 'Ahoj' };
test('comment payload rejects forged identity, counters, timestamps and reply metadata', () => {
  for (const change of [{ authorId: 'attacker' }, { authorNickname: 'Fake' },
    { createdAt: 1 }, { likesCount: 1 }, { replyToNickname: 'Fake' },
    { shoutId: '../shout' }, { idempotencyKey: '' }, { replyToCommentId: '../parent' },
    { text: ' ' }, { text: 'a'.repeat(221) }]) {
    assert.throws(() => validateCreateComment({ ...valid, ...change }),
      (error) => error.code === 'invalid-argument');
  }
  assert.deepEqual(validateCreateComment({ text: 'Ahoj', shoutId: 'shout-1', idempotencyKey: 'request-1' }), valid);
});

test('comment rate enforces exact ten-second cooldown and sixty per hour', () => {
  const now = Timestamp.fromMillis(7200000);
  const previous = { lastAt: Timestamp.fromMillis(now.toMillis() - 9999),
    windowStartedAt: Timestamp.fromMillis(now.toMillis() - 300000), count: 59 };
  assert.throws(() => nextCommentRate(previous, now, 'id'),
    (error) => error.code === 'resource-exhausted');
  previous.lastAt = Timestamp.fromMillis(now.toMillis() - 10000);
  assert.equal(nextCommentRate(previous, now, 'id').count, 60);
  previous.count = 60;
  assert.throws(() => nextCommentRate(previous, now, 'id'),
    (error) => error.code === 'resource-exhausted');
  previous.windowStartedAt = Timestamp.fromMillis(now.toMillis() - 3600000);
  assert.equal(nextCommentRate(previous, now, 'id').count, 1);
  assert.throws(() => nextCommentRate({ ...previous, count: -1 }, now, 'id'),
    (error) => error.code === 'failed-precondition');
});
