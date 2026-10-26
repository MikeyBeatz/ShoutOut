import test from 'node:test';
import assert from 'node:assert/strict';
import { validateShoutSave, saveTransition, toggleShoutSaveOperation } from './toggle_shout_save.js';

test('save requests accept only the target and retry identity, never ownership or counters', () => {
  const data = { idempotencyKey: 'once', shoutId: 'target' };
  assert.deepEqual(validateShoutSave({ shoutId: 'target', idempotencyKey: 'once' }), data);
  for (const input of [null, [], { ...data, authorId: 'fake' }, { ...data, saved: true },
    { ...data, savesCount: 99 }, { ...data, shoutId: '../path' }, { ...data, idempotencyKey: '' },
    { ...data, expectedUserId: 42 }]) {
    assert.throws(() => validateShoutSave(input), error => error.code === 'invalid-argument');
  }
});

test('save transitions add or remove exactly one and reject invalid counter state', () => {
  assert.deepEqual(saveTransition(false, 0), { saved: true, count: 1 });
  assert.deepEqual(saveTransition(true, 1), { saved: false, count: 0 });
  for (const args of [[true, 0], [false, Number.MAX_SAFE_INTEGER], [false, -1], [false, null], [false, 1.5], [null, 1]]) {
    assert.throws(() => saveTransition(...args), error => error.code === 'failed-precondition');
  }
});

test('Auth, App Check, verified email and expected account are checked before database access', async () => {
  const request = { auth: { uid: 'alice', token: { email: 'test@example.test', email_verified: true } },
    app: { appId: 'test' }, data: { idempotencyKey: 'once', shoutId: 'target', expectedUserId: 'alice' } };
  for (const change of [{ auth: null }, { app: null }, { auth: { ...request.auth, uid: 'bob' } }]) {
    await assert.rejects(toggleShoutSaveOperation({ ...request, ...change }, null), error => error.code === 'unauthenticated');
  }
  await assert.rejects(toggleShoutSaveOperation({ ...request,
    auth: { ...request.auth, token: { email: 'test@example.test', email_verified: false } } }, null),
  error => error.code === 'permission-denied');
});
