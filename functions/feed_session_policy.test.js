import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionDeadline, feedSessionLifetimeMillis as hour, FeedSessionExpired } from './feed_session_policy.js';

test('fixed session deadline never renews and expires at exactly one hour', () => {
  let clock = 100;
  const alive = sessionDeadline(() => clock);
  clock += hour - 1; alive(); alive();
  clock++; assert.throws(alive, FeedSessionExpired);
  sessionDeadline(() => clock)();
});
test('invalid or backwards elapsed clock fails closed', () => {
  assert.throws(() => sessionDeadline(() => NaN), /invalid-feed-clock/);
  let clock = 5; const alive = sessionDeadline(() => clock);
  clock = 4; assert.throws(alive, /invalid-feed-clock/);
});
