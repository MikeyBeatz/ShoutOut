import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { encodeGeohash, publicCoordinate, validateCreateShout, nextShoutRate } from './create_shout.js';

const valid = () => ({ idempotencyKey: 'request-1', title: 'Ahoj', text: 'Sousedé',
  categories: ['Dotaz'], durationMinutes: 120, location: { latitude: 50.0755, longitude: 14.4378 } });
const code = (expected) => (error) => error.code === expected;

test('server rejects client author, counters, invalid text, categories and coordinates', () => {
  for (const change of [{ authorId: 'attacker' }, { likesCount: 5 },
    { title: ' ' }, { text: 'a'.repeat(221) }, { categories: ['invalid'] },
    { categories: [] }, { durationMinutes: 14 }, { durationMinutes: 10081 },
    { location: { latitude: NaN, longitude: 0 } }, { idempotencyKey: '../path' },
    { businessHighlighted: 'true' }]) {
    assert.throws(() => validateCreateShout({ ...valid(), ...change }), code('invalid-argument'));
  }
});

test('request fingerprint input has stable property and coordinate ordering', () => {
  const input = valid();
  assert.deepEqual(validateCreateShout(input), validateCreateShout({ ...input,
    location: { longitude: 14.4378, latitude: 50.0755 } }));
});

test('server public grid matches Dart rounding and seven-character geohash', () => {
  assert.equal(publicCoordinate(50.0755), 50.08);
  assert.equal(publicCoordinate(-1.125), -1.13);
  assert.equal(encodeGeohash(0, 0), 's000000');
  assert.equal(encodeGeohash(50.08, 14.44).length, 7);
});

test('rate limits preserve personal and Business cooldown and daily maximum', () => {
  const now = Timestamp.fromMillis(100000000);
  const previous = { lastAt: Timestamp.fromMillis(now.toMillis() - 2000),
    windowStartedAt: Timestamp.fromMillis(now.toMillis() - 300000), count: 49 };
  assert.throws(() => nextShoutRate(previous, false, now, 'id'), code('resource-exhausted'));
  assert.equal(nextShoutRate(previous, true, now, 'id').count, 50);
  const ready = { ...previous, lastAt: Timestamp.fromMillis(now.toMillis() - 120000) };
  assert.equal(nextShoutRate(ready, false, now, 'id').count, 50);
  assert.throws(() => nextShoutRate({ ...ready, count: 50 }, false, now, 'id'), code('resource-exhausted'));
  assert.throws(() => nextShoutRate({ ...ready, count: 500 }, true, now, 'id'), code('resource-exhausted'));
  assert.equal(nextShoutRate({ ...ready, windowStartedAt: Timestamp.fromMillis(0), count: 500 },
    false, now, 'id').count, 1);
  assert.throws(() => nextShoutRate({ count: -1 }, false, now, 'id'), code('failed-precondition'));
});
