import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { feedCursorCodec, InvalidFeedCursor } from './feed_cursor.js';
import { feedSessionLifetimeMillis as hour, FeedSessionExpired } from './feed_session_policy.js';
const scope = { uid: 'actor', project: 'shoutout-rules-test', now: 1000000 };
const start = { ...scope, readTime: { seconds: 1000, nanoseconds: 123000 },
  context: { point: { latitude: 50.08, longitude: 14.44 }, radiusKm: 20, order: 'nearest', roots: [{ hash: 'a'.repeat(64), cell: 'u2fp' }] },
  position: { phase: 'preparing' } };

test('signed context survives a new codec instance without any per-user server state', () => {
  const key = randomBytes(32), token = feedCursorCodec({ key }).start(start);
  const decoded = feedCursorCodec({ key }).decode(token, scope);
  assert.deepEqual(decoded.context, start.context); assert.deepEqual(decoded.readTime, start.readTime);
  assert.deepEqual(decoded.position, start.position);
});
test('payload/signature tampering, wrong key and cross-account/project cursors are refused', () => {
  const codec = feedCursorCodec({ key: randomBytes(32) }), token = codec.start(start);
  const parts = token.split('.');
  const modified = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); modified.context.radiusKm = 50;
  const tampered = `f1.${Buffer.from(JSON.stringify(modified)).toString('base64url')}.${parts[2]}`;
  for (const bad of [tampered, token.slice(0, -5), 'f1.%not-json%.invalid', token + '.extra']) assert.throws(() => codec.decode(bad, scope), InvalidFeedCursor);
  assert.throws(() => feedCursorCodec({ key: randomBytes(32) }).decode(token, scope), InvalidFeedCursor);
  assert.throws(() => codec.decode(token, { ...scope, uid: 'another' }), InvalidFeedCursor);
  assert.throws(() => codec.decode(token, { ...scope, project: 'another-project' }), InvalidFeedCursor);
});
test('continuation cannot renew the fixed deadline or replace its original context', () => {
  const codec = feedCursorCodec({ key: randomBytes(32) }), original = codec.start(start);
  const token = codec.advance(original, { phase: 'page', after: ['last-id'], uid: 'another', expiresAt: scope.now + 2 * hour }, { ...scope, now: scope.now + hour - 1 });
  const decoded = codec.decode(token, { ...scope, now: scope.now + hour - 1 });
  assert.equal(decoded.uid, scope.uid); assert.equal(decoded.expiresAt, scope.now + hour);
  assert.deepEqual(decoded.context, start.context);
  assert.throws(() => codec.decode(token, { ...scope, now: scope.now + hour }), FeedSessionExpired);
  assert.throws(() => codec.advance(token, {}, { ...scope, now: scope.now + hour }), FeedSessionExpired);
});
test('work envelope size is bounded and constructor copies key bytes', () => {
  const key = randomBytes(32), original = Buffer.from(key), codec = feedCursorCodec({ key, maximumBytes: 1024 });
  const token = codec.start(start); key.fill(0);
  assert.equal(feedCursorCodec({ key: original }).decode(token, scope).uid, scope.uid);
  assert.throws(() => codec.start({ ...start, position: { data: 'x'.repeat(2000) } }), /feed-cursor-too-large/);
  assert.throws(() => codec.decode('x'.repeat(1025), scope), InvalidFeedCursor);
});
test('invalid clocks and malformed snapshot precision fail closed', () => {
  const codec = feedCursorCodec({ key: randomBytes(32) });
  for (const invalid of [{ ...start, now: NaN }, { ...start, now: -1 }, { ...start, readTime: { seconds: 1000, nanoseconds: 1 } }]) {
    assert.throws(() => codec.start(invalid), InvalidFeedCursor);
  }
  assert.throws(() => codec.decode(codec.start(start), { ...scope, now: scope.now - 1 }), InvalidFeedCursor);
});

test('a snapshot captured earlier cannot acquire a fresh hour of database history', () => {
  const codec = feedCursorCodec({ key: randomBytes(32) });
  const now = scope.now + 600000;
  const body = codec.decode(codec.start({ ...start, now }), { ...scope, now });
  assert.equal(body.expiresAt, scope.now + hour);
  assert.throws(() => codec.start({ ...start, now: scope.now + hour }), FeedSessionExpired);
});
