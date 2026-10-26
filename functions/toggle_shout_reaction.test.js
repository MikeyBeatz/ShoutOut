import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { validateShoutReaction, reactionTransition, nextInteractionRate } from './toggle_shout_reaction.js';

test('reaction requests accept only a button and target, never client identity or counters', () => {
  const input = { idempotencyKey: 'request-1', shoutId: 'shout-1', button: 'like' };
  for (const change of [{ authorId: 'fake' }, { likesCount: 100 }, { button: null },
    { button: 'other' }, { shoutId: '../path' }, { idempotencyKey: '' }]) {
    assert.throws(() => validateShoutReaction({ ...input, ...change }), (e) => e.code === 'invalid-argument');
  }
  assert.deepEqual(validateShoutReaction({ button: 'like', shoutId: 'shout-1', idempotencyKey: 'request-1' }), input);
});

test('buttons add, switch and remove reactions without changing unrelated counts', () => {
  assert.deepEqual(reactionTransition(null, 'like', 2, 3), { type: 'like', likes: 3, dislikes: 3 });
  assert.deepEqual(reactionTransition(null, 'dislike', 2, 3), { type: 'dislike', likes: 2, dislikes: 4 });
  assert.deepEqual(reactionTransition('like', 'like', 3, 3), { type: null, likes: 2, dislikes: 3 });
  assert.deepEqual(reactionTransition('dislike', 'dislike', 2, 4), { type: null, likes: 2, dislikes: 3 });
  assert.deepEqual(reactionTransition('like', 'dislike', 3, 3), { type: 'dislike', likes: 2, dislikes: 4 });
  assert.deepEqual(reactionTransition('dislike', 'like', 2, 4), { type: 'like', likes: 3, dislikes: 3 });
  for (const args of [['like', 'like', 0, 0], ['other', 'like', 1, 0], [null, 'like', Number.MAX_SAFE_INTEGER, 0]]) {
    assert.throws(() => reactionTransition(...args), (e) => e.code === 'failed-precondition');
  }
});

test('interaction rate keeps the one-second cooldown and shared 120/hour maximum', () => {
  const now = Timestamp.fromMillis(7200000);
  const previous = { lastAt: Timestamp.fromMillis(now.toMillis() - 999),
    windowStartedAt: Timestamp.fromMillis(now.toMillis() - 300000), count: 119 };
  assert.throws(() => nextInteractionRate(previous, now, 'id'), (e) => e.code === 'resource-exhausted');
  previous.lastAt = Timestamp.fromMillis(now.toMillis() - 1000);
  assert.equal(nextInteractionRate(previous, now, 'id').count, 120);
  previous.count = 120;
  assert.throws(() => nextInteractionRate(previous, now, 'id'), (e) => e.code === 'resource-exhausted');
  previous.windowStartedAt = Timestamp.fromMillis(now.toMillis() - 3600000);
  assert.equal(nextInteractionRate(previous, now, 'id').count, 1);
  assert.throws(() => nextInteractionRate({ count: -1 }, now, 'id'), (e) => e.code === 'failed-precondition');
});
