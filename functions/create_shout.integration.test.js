import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { createShoutOperation } from './create_shout.js';

// A test can never use ADC or accidentally connect to a live project.
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'create-shout-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-10-25T12:00:00Z');
const profile = { nickname: 'Tester', avatarId: 'avatar_01', avatarBackgroundStart: 1,
  avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' };
async function fixture(business = false) {
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set(profile);
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  if (business) {
    await db.doc(`accountRoles/${uid}`).set({ role: 'business', level: 2 });
    await db.doc(`businessProfiles/${uid}`).set({ status: 'active' });
    await db.doc(`businessProfiles/${uid}/locations/branch`).set({ displayName: 'Pobočka',
      active: true, deleted: false, geocodingStatus: 'verified', location: new GeoPoint(49.1234, 16.4567) });
  }
  const request = { auth: { uid, token: { email: 'test@example.test', email_verified: true } },
    app: { appId: 'test-app' }, data: { idempotencyKey: 'request-1', title: 'Dotaz', text: 'Ahoj',
      categories: ['Dotaz'], durationMinutes: 120,
      ...(business ? { businessLocationId: 'branch' } : { location: { latitude: 50.0755, longitude: 14.4378 } }) } };
  return { uid, request };
}

test('concurrent retries create one Shout and charge the rate once', { skip: !enabled }, async () => {
  const { uid, request } = await fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => createShoutOperation(request, db, () => now)));
  assert.equal(new Set(results.map((r) => r.shoutId)).size, 1);
  const shout = (await db.doc(`shouts/${results[0].shoutId}`).get()).data();
  assert.equal(shout.authorId, uid);
  assert.equal(shout.authorNickname, profile.nickname);
  assert.equal(shout.location.latitude, 50.08);
  assert.equal(shout.createdAt.toMillis(), now.getTime());
  assert.equal(shout.expiresAt.toMillis(), now.getTime() + 120 * 60000);
  assert.equal(shout.likesCount, 0);
  assert.equal((await db.doc(`rateLimits/${uid}/actions/shout`).get()).data().count, 1);
  await assert.rejects(createShoutOperation({ ...request, data: { ...request.data, text: 'Jiné' } }, db, () => now),
    (e) => e.code === 'already-exists');
});

test('concurrent distinct requests cannot bypass the cooldown', { skip: !enabled }, async () => {
  const { uid, request } = await fixture();
  const results = await Promise.allSettled(['one', 'two'].map((idempotencyKey) =>
    createShoutOperation({ ...request, data: { ...request.data, idempotencyKey } }, db, () => now)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await db.doc(`rateLimits/${uid}/actions/shout`).get()).data().count, 1);
});

test('Business uses the active verified branch and rejects suspended profiles', { skip: !enabled }, async () => {
  const { uid, request } = await fixture(true);
  request.data.durationMinutes = 2880;
  request.data.businessExtendedDuration = true;
  request.data.businessHighlighted = true;
  const result = await createShoutOperation(request, db, () => now);
  const shout = (await db.doc(`shouts/${result.shoutId}`).get()).data();
  assert.equal(shout.authorNickname, 'Pobočka');
  assert.equal(shout.location.latitude, 49.1234);
  assert.equal(shout.businessAuthorFormat, 'branch');
  assert.equal(shout.businessHighlighted, true);
  await db.doc(`businessProfiles/${uid}`).update({ status: 'suspended' });
  await assert.rejects(createShoutOperation({ ...request, data: { ...request.data, idempotencyKey: 'new' } },
    db, () => new Date(now.getTime() + 2000)), (e) => e.code === 'failed-precondition');
});

test('restriction and ban are checked inside the transaction, including a retry', { skip: !enabled }, async () => {
  const { uid, request } = await fixture();
  await db.doc(`contentRestrictions/${uid}`).set({ expiresAt: Timestamp.fromMillis(now.getTime() + 60000) });
  await assert.rejects(createShoutOperation(request, db, () => now), (e) => e.code === 'permission-denied');
  assert.equal((await db.doc(`rateLimits/${uid}/actions/shout`).get()).exists, false);
  await db.doc(`contentRestrictions/${uid}`).delete();
  await createShoutOperation(request, db, () => now);
  await db.doc(`bans/${uid}`).set({ expiresAt: null });
  await assert.rejects(createShoutOperation(request, db, () => now), (e) => e.code === 'permission-denied');
});
