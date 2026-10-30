import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { receiptRetentionFields as check, operationRetryWindowMillis as week } from './operation_retention.js';
import { createShoutOperation, validateCreateShout } from './create_shout.js';
import { createCommentOperation, validateCreateComment } from './create_comment.js';
import { createPrivateReplyOperation, validateCreatePrivateReply } from './create_private_reply.js';

const now = Timestamp.fromDate(new Date('2026-10-30T12:00:00Z'));
const keyAt = millis => `op1_${Math.floor(millis / 1000)}_${'a'.repeat(32)}`;
const key = keyAt(now.toMillis());
const error = message => actual => actual.code === 'failed-precondition' && actual.message === message;

test('new timed requests receive exactly seven days from the server commit time', () => {
  assert.deepEqual(check(key, now), { keyVersion: 1, expiresAt: Timestamp.fromMillis(now.toMillis() + week) });
  assert.equal(check(keyAt(now.toMillis() - week + 1000), now).keyVersion, 1);
  assert.throws(() => check(keyAt(now.toMillis() - week), now), error('operation-expired'));
  assert.throws(() => check(keyAt(now.toMillis() + 1000), now), error('operation-key-time-invalid'));
  assert.throws(() => check('op1_corrupt', now), error('operation-key-upgrade-required'));
});

test('expired requests remain rejected after physical receipt deletion', () => {
  const receipt = { createdAt: now, ...check(key, now) };
  const before = Timestamp.fromMillis(now.toMillis() + week - 1);
  assert.deepEqual(check(key, before, receipt), {});
  for (const stored of [receipt, undefined]) {
    assert.throws(() => check(key, Timestamp.fromMillis(now.toMillis() + week), stored), error('operation-expired'));
  }
});

test('receipt expiry uses actual server commit time, including a request first executed later', () => {
  const later = Timestamp.fromMillis(now.toMillis() + 3600000);
  const receipt = { createdAt: later, ...check(key, later) };
  assert.deepEqual(check(key, Timestamp.fromMillis(now.toMillis() + week), receipt), {});
  assert.throws(() => check(key, Timestamp.fromMillis(later.toMillis() + week), receipt), error('operation-expired'));
});

test('compatibility phase preserves legacy clients and never makes legacy receipts eligible for cleanup', () => {
  assert.deepEqual(check('legacy-key', now, undefined, { allowLegacy: true }), {});
  assert.deepEqual(check('legacy-key', now, { createdAt: Timestamp.fromMillis(0) }, { allowLegacy: true }), {});
  assert.throws(() => check('legacy-key', now), error('operation-key-upgrade-required'));
  assert.throws(() => check('legacy-key', now, undefined, { allowLegacy: false }), error('operation-key-upgrade-required'));
  assert.deepEqual(check('legacy-key', now, { createdAt: now }, { allowLegacy: false }), {});
  assert.throws(() => check('legacy-key', Timestamp.fromMillis(now.toMillis() + week), { createdAt: now },
    { allowLegacy: false }), error('operation-expired'));
});

test('malformed or extended receipt deadlines fail closed', () => {
  for (const stored of [{}, { createdAt: now }, { createdAt: now, keyVersion: 1, expiresAt: 'tomorrow' },
    { createdAt: now, keyVersion: 1, expiresAt: Timestamp.fromMillis(now.toMillis() + week + 1) }]) {
    assert.throws(() => check(key, now, stored), error('invalid-operation-retention'));
  }
});

test('publication endpoints accept an expected account and fence account switches before database access', async () => {
  const identity = { auth: { uid: 'actor', token: { email: 'actor@example.test', email_verified: true } }, app: { appId: 'web' } };
  const publications = [
    [createShoutOperation, validateCreateShout, { title: 'Title', text: 'Text', categories: ['Dotaz'],
      durationMinutes: 120, location: { latitude: 50, longitude: 14 } }],
    [createCommentOperation, validateCreateComment, { shoutId: 'shout', text: 'Comment' }],
    [createPrivateReplyOperation, validateCreatePrivateReply, { shoutId: 'shout', text: 'Private', targetType: 'shout' }],
  ];
  for (const [operation, validate, payload] of publications) {
    const data = { ...payload, idempotencyKey: key, expectedUserId: 'actor' };
    assert.equal(validate(data).expectedUserId, 'actor');
    assert.throws(() => validate({ ...data, expectedUserId: '../forged' }), actual => actual.code === 'invalid-argument');
    await assert.rejects(operation({ ...identity, data: { ...data, expectedUserId: 'other' } }, {}),
      actual => actual.code === 'unauthenticated');
  }
});
