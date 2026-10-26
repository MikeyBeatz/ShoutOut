import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { validateCreatePrivateReply, nextPrivateReplyRate } from './create_private_reply.js';

const valid = { idempotencyKey: 'request-1', shoutId: 'shout-1', text: 'Soukromě', targetType: 'shout' };
test('private reply payload rejects forged participants, identity, time and target combinations', () => {
  for (const change of [{ recipientId: 'victim' }, { authorId: 'forged' }, { recipientNickname: 'Fake' },
    { authorNickname: 'Fake' }, { participants: ['a', 'b'] }, { createdAt: 1 },
    { targetType: 'other' }, { targetType: 'comment' }, { targetType: 'privateReply' },
    { parentCommentId: 'comment' }, { parentPrivateReplyId: 'reply' },
    { targetType: 'comment', parentCommentId: '../parent' },
    { targetType: 'privateReply', parentPrivateReplyId: 'parent', parentCommentId: 'forged' },
    { text: ' ' }, { text: 'x'.repeat(221) }, { shoutId: 'a/b' }]) {
    assert.throws(() => validateCreatePrivateReply({ ...valid, ...change }), (error) => error.code === 'invalid-argument');
  }
  assert.deepEqual(validateCreatePrivateReply({ targetType: 'shout', text: 'Soukromě', shoutId: 'shout-1', idempotencyKey: 'request-1' }), valid);
  assert.equal(validateCreatePrivateReply({ ...valid, targetType: 'comment', parentCommentId: 'parent' }).parentCommentId, 'parent');
  assert.equal(validateCreatePrivateReply({ ...valid, targetType: 'privateReply', parentPrivateReplyId: 'parent' }).parentPrivateReplyId, 'parent');
  assert.doesNotThrow(() => validateCreatePrivateReply({ ...valid, text: '😀'.repeat(220) }));
  assert.throws(() => validateCreatePrivateReply({ ...valid, text: '😀'.repeat(221) }), (error) => error.code === 'invalid-argument');
});

test('private reply rate preserves existing hourly maximum and exact cooldown boundary', () => {
  const now = Timestamp.fromMillis(7200000);
  const previous = { lastAt: Timestamp.fromMillis(now.toMillis() - 9999),
    windowStartedAt: Timestamp.fromMillis(now.toMillis() - 300000), count: 59 };
  assert.throws(() => nextPrivateReplyRate(previous, now, 'id'), (error) => error.code === 'resource-exhausted');
  previous.lastAt = Timestamp.fromMillis(now.toMillis() - 10000);
  assert.equal(nextPrivateReplyRate(previous, now, 'id').count, 60);
  previous.count = 60;
  assert.throws(() => nextPrivateReplyRate(previous, now, 'id'), (error) => error.code === 'resource-exhausted');
  previous.windowStartedAt = Timestamp.fromMillis(now.toMillis() - 3600000);
  assert.equal(nextPrivateReplyRate(previous, now, 'id').count, 1);
  assert.throws(() => nextPrivateReplyRate({ ...previous, count: -1 }, now, 'id'), (error) => error.code === 'failed-precondition');
});
