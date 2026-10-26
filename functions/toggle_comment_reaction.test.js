import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommentReaction, toggleCommentReactionOperation } from './toggle_comment_reaction.js';

test('comment reaction protocol accepts only a target, button and retry identity', () => {
  const input = { idempotencyKey: 'once', shoutId: 'parent', commentId: 'comment', button: 'like' };
  assert.deepEqual(validateCommentReaction({ button: 'like', commentId: 'comment', shoutId: 'parent', idempotencyKey: 'once' }), input);
  for (const change of [{ authorId: 'fake' }, { targetTitle: 'fake' }, { likesCount: 99 },
    { commentId: '../parent' }, { shoutId: '' }, { button: null }, { expectedUserId: 42 }]) {
    assert.throws(() => validateCommentReaction({ ...input, ...change }), (e) => e.code === 'invalid-argument');
  }
});

test('comment reactions check Auth, App Check and expected account before database access', async () => {
  const request = { data: { idempotencyKey: 'once', shoutId: 'parent', commentId: 'comment', button: 'like', expectedUserId: 'alice' },
    auth: { uid: 'alice', token: { email: 'test@example.test', email_verified: true } }, app: { appId: 'test' } };
  for (const change of [{ auth: null }, { app: null }, { auth: { ...request.auth, uid: 'bob' } }]) {
    await assert.rejects(toggleCommentReactionOperation({ ...request, ...change }, null), (e) => e.code === 'unauthenticated');
  }
});
