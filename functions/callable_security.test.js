import test from 'node:test';
import assert from 'node:assert/strict';
import {
  legalAcceptanceId,
  requireCallableIdentity,
  requireEligibleActor,
  secureCallableOptions,
} from './callable_security.js';

const uid = 'user-1';
const now = new Date('2026-10-25T12:00:00Z');

function validRequest(overrides = {}) {
  return {
    auth: {
      uid,
      token: { email: 'user@example.test', email_verified: true },
    },
    app: { appId: 'test-app' },
    ...overrides,
  };
}

function documentSnapshot(exists, data = {}) {
  return { exists, data: () => data };
}

function accountFixture(overrides = {}) {
  const documents = new Map([
    [`users/${uid}`, documentSnapshot(true, { nickname: 'Tester' })],
    [
      `users/${uid}/legal/${legalAcceptanceId}`,
      documentSnapshot(true, { termsVersion: '2026-07-25' }),
    ],
    [`bans/${uid}`, documentSnapshot(false)],
    [`accountDeletionRequests/${uid}`, documentSnapshot(false)],
    [`contentRestrictions/${uid}`, documentSnapshot(false)],
    ...Object.entries(overrides),
  ]);
  const db = { doc: (path) => path };
  const reader = {
    getAll: async (...refs) => refs.map((ref) => documents.get(ref)),
  };
  return { db, reader };
}

function expectCode(code) {
  return (error) => error?.code === code;
}

test('secure callable options require App Check in the production region', () => {
  assert.deepEqual(secureCallableOptions, {
    region: 'europe-west3',
    enforceAppCheck: true,
  });
});

test('callable identity requires Auth, App Check and a verified email', () => {
  assert.throws(
    () => requireCallableIdentity({ app: { appId: 'test-app' } }),
    expectCode('unauthenticated'),
  );
  assert.throws(
    () => requireCallableIdentity({ ...validRequest(), app: undefined }),
    expectCode('unauthenticated'),
  );
  assert.throws(
    () =>
      requireCallableIdentity({
        ...validRequest(),
        auth: {
          uid,
          token: { email: 'user@example.test', email_verified: false },
        },
      }),
    expectCode('permission-denied'),
  );
});

test('eligible actor returns trusted identity and profile', async () => {
  const { db, reader } = accountFixture();
  const actor = await requireEligibleActor({
    request: validRequest(),
    db,
    reader,
    requireContentPermission: true,
    now,
  });
  assert.equal(actor.uid, uid);
  assert.equal(actor.email, 'user@example.test');
  assert.equal(actor.profile.nickname, 'Tester');
});

test('profile and current legal acceptance are both required', async () => {
  let fixture = accountFixture({
    [`users/${uid}`]: documentSnapshot(false),
  });
  await assert.rejects(
    requireEligibleActor({ request: validRequest(), ...fixture, now }),
    expectCode('failed-precondition'),
  );

  fixture = accountFixture({
    [`users/${uid}/legal/${legalAcceptanceId}`]: documentSnapshot(false),
  });
  await assert.rejects(
    requireEligibleActor({ request: validRequest(), ...fixture, now }),
    expectCode('failed-precondition'),
  );
});

test('permanent, future and malformed bans fail closed', async () => {
  for (const expiresAt of [
    null,
    new Date('2026-10-25T12:00:01Z'),
    'invalid',
  ]) {
    const fixture = accountFixture({
      [`bans/${uid}`]: documentSnapshot(true, { expiresAt }),
    });
    await assert.rejects(
      requireEligibleActor({ request: validRequest(), ...fixture, now }),
      expectCode('permission-denied'),
    );
  }
});

test('an expired ban does not block the account', async () => {
  const fixture = accountFixture({
    [`bans/${uid}`]: documentSnapshot(true, {
      expiresAt: new Date('2026-10-25T11:59:59Z'),
    }),
  });
  const actor = await requireEligibleActor({
    request: validRequest(),
    ...fixture,
    now,
  });
  assert.equal(actor.uid, uid);
});

test('a deletion request blocks every callable operation', async () => {
  const fixture = accountFixture({
    [`accountDeletionRequests/${uid}`]: documentSnapshot(true, {
      status: 'pending',
    }),
  });
  await assert.rejects(
    requireEligibleActor({ request: validRequest(), ...fixture, now }),
    expectCode('failed-precondition'),
  );
});

test('content restriction blocks creation but not a read-only operation', async () => {
  const fixture = accountFixture({
    [`contentRestrictions/${uid}`]: documentSnapshot(true, {
      expiresAt: new Date('2026-10-25T12:30:00Z'),
    }),
  });
  await assert.rejects(
    requireEligibleActor({
      request: validRequest(),
      ...fixture,
      requireContentPermission: true,
      now,
    }),
    expectCode('permission-denied'),
  );
  const actor = await requireEligibleActor({
    request: validRequest(),
    ...fixture,
    requireContentPermission: false,
    now,
  });
  assert.equal(actor.uid, uid);
});

test('transaction-like readers using get() are supported', async () => {
  const fixture = accountFixture();
  const reader = {
    get: async (ref) => fixture.reader.getAll(ref).then(([result]) => result),
  };
  const actor = await requireEligibleActor({
    request: validRequest(),
    db: fixture.db,
    reader,
    now,
  });
  assert.equal(actor.uid, uid);
});
