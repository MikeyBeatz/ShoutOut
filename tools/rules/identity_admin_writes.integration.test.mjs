import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, after } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AccountIdentityWriteBlocked, runActiveIdentityTransaction } from '../identity_write_fence.mjs';
import { backfillPublicProfileForUser, writeAccountRoleForUser } from '../account_identity_writes.mjs';
import { activateBusinessAccount } from '../business_activation.mjs';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'identity-admin-write-tests') : null;
const db = app ? getFirestore(app) : null;
const roots = [];
after(async () => {
  if (!app) return;
  for (const root of roots) await db.recursiveDelete(root);
  await db.terminate(); await deleteApp(app);
});

async function fixture({ identity = true } = {}) {
  const uid = `guard_${randomUUID()}`;
  const refs = Object.fromEntries(['users', 'publicProfiles', 'accountRoles', 'accountDeletionRequests',
    'businessApplications', 'businessProfiles'].map(collection => [collection, db.doc(`${collection}/${uid}`)]));
  roots.push(...Object.values(refs));
  const user = { nickname: 'Current name', avatarId: 'fox', avatarBackgroundStart: 'teal',
    avatarBackgroundEnd: 'navy', avatarGradientDirection: 'diagonal' };
  if (identity) {
    await refs.users.set(user);
    await refs.publicProfiles.set({ ...user, businessLogoPath: `businessLogos/${uid}/logo-1.png`, businessLogoVersion: 1 });
  }
  const authUser = { uid, email: `${uid}@example.test`, emailVerified: true };
  const application = { userId: uid, countryCode: 'CZ', registrationNumber: '12345678',
    submittedCompanyName: 'Fixture s.r.o.', submittedAddress: 'Test 1', submittedCity: 'Praha', submittedPostalCode: '11000',
    initialLocationName: 'Centrum', initialLocationAddress: 'Test 2, Praha', initialLocationCountryCode: 'CZ',
    initialLocation: new GeoPoint(50.081, 14.426), initialLocationGeohash: 'u2fkbn0',
    initialLocationProviderPlaceId: 'fixture-place', contactEmail: authUser.email, status: 'pending_email' };
  await refs.businessApplications.set(application);
  return { uid, refs, user, authUser, application };
}
const assignment = (role = 'business', level = 2) => ({ role, level, assignedBy: 'set_role.mjs',
  createdAt: FieldValue.serverTimestamp(), moderationScope: { global: level >= 5, countries: ['CZ'], subdivisions: [] } });
const invoke = (kind, target, f) => kind === 'backfill' ? backfillPublicProfileForUser(target, f.uid)
  : kind === 'role' ? writeAccountRoleForUser(target, f.uid, assignment())
    : activateBusinessAccount(target, f.authUser, FieldValue.serverTimestamp);
async function snapshotRoots(f) {
  return Promise.all(Object.values(f.refs).map(async ref => { const d = await ref.get(); return { path: ref.path, exists: d.exists, data: d.data(), updateTime: d.updateTime }; }));
}

test('backfill uses current profile and role, preserves logo fields and skips malformed profiles', { skip: !enabled }, async () => {
  const f = await fixture();
  await f.refs.users.update({ nickname: 'Latest name' });
  await f.refs.accountRoles.set({ role: 'business', level: 2 });
  assert.equal((await backfillPublicProfileForUser(db, f.uid)).written, true);
  const profile = (await f.refs.publicProfiles.get()).data();
  assert.equal(profile.nickname, 'Latest name'); assert.equal(profile.publicRole, 'business');
  assert.equal(profile.businessLogoPath, `businessLogos/${f.uid}/logo-1.png`);
  const missing = await fixture({ identity: false });
  assert.deepEqual(await backfillPublicProfileForUser(db, missing.uid), { written: false, reason: 'missing-profile-fields' });
  assert.equal((await missing.refs.publicProfiles.get()).exists, false);
});

test('all existing role levels retain their assignment data and user downgrade clears only the role', { skip: !enabled }, async () => {
  const f = await fixture();
  for (const [role, level] of [['business', 2], ['moderator', 3], ['seniorModerator', 4], ['administrator', 5], ['owner', 6]]) {
    await writeAccountRoleForUser(db, f.uid, assignment(role, level));
    const stored = (await f.refs.accountRoles.get()).data();
    assert.equal(stored.role, role); assert.equal(stored.level, level); assert.equal(stored.assignedBy, 'set_role.mjs');
    assert.deepEqual(stored.moderationScope, { global: level >= 5, countries: ['CZ'], subdivisions: [] });
    assert(stored.createdAt instanceof Timestamp);
    assert.equal((await f.refs.publicProfiles.get()).data().publicRole, role);
  }
  await writeAccountRoleForUser(db, f.uid, null);
  assert.equal((await f.refs.accountRoles.get()).exists, false);
  const profile = (await f.refs.publicProfiles.get()).data();
  assert.equal('publicRole' in profile, false); assert.equal(profile.nickname, f.user.nickname);
  assert.equal(profile.businessLogoVersion, 1);
});

test('Business activation still works before a regular identity is created', { skip: !enabled }, async () => {
  const f = await fixture({ identity: false });
  await activateBusinessAccount(db, f.authUser, FieldValue.serverTimestamp);
  const [role, profile, location, application] = await db.getAll(f.refs.accountRoles, f.refs.businessProfiles,
    f.refs.businessProfiles.collection('locations').doc('initial'), f.refs.businessApplications);
  assert.equal(role.data().role, 'business'); assert.equal(role.data().level, 2);
  assert.equal(profile.data().displayName, 'Fixture s.r.o.'); assert.equal(profile.data().billingEmail, f.authUser.email);
  assert.equal(location.data().displayName, 'Centrum'); assert.equal(location.data().countryCode, 'CZ');
  assert(location.data().location.isEqual(f.application.initialLocation));
  assert.equal(application.data().status, 'active'); assert.equal(application.data().activationMethod, 'manual_development');
  assert.equal((await f.refs.publicProfiles.get()).exists, false);
});

for (const kind of ['backfill', 'role', 'activation']) {
  for (const state of ['request', 'historical-request', 'marker']) {
    test(`${kind} cannot restore a deleting identity (${state})`, { skip: !enabled }, async () => {
      const f = await fixture();
      if (state === 'marker') await f.refs.publicProfiles.set({ schemaVersion: 1, accountStatus: 'deleted' });
      else await f.refs.accountDeletionRequests.set({ userId: f.uid, status: state === 'request' ? 'pending' : 'completed' });
      const before = await snapshotRoots(f);
      if (kind === 'backfill') assert.deepEqual(await invoke(kind, db, f), { written: false, reason: 'account-deleting' });
      else await assert.rejects(invoke(kind, db, f), AccountIdentityWriteBlocked);
      assert.deepEqual(await snapshotRoots(f), before);
    });
  }
}

for (const kind of ['backfill', 'role', 'activation']) {
  for (const state of ['request', 'marker']) {
    test(`${kind} observes deletion that arrives after the work starts (${state})`, { skip: !enabled, timeout: 30000 }, async () => {
      const f = await fixture();
      let started, release;
      const began = new Promise(resolve => { started = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const proxy = { projectId: db.projectId, doc: db.doc.bind(db), runTransaction: callback => db.runTransaction(async transaction => {
        started(); await gate; return callback(transaction);
      }) };
      const operation = invoke(kind, proxy, f).then(value => ({ value }), error => ({ error }));
      try {
        await Promise.race([began, operation.then(() => { throw new Error('writer bypassed its transaction'); })]);
        if (state === 'marker') await f.refs.publicProfiles.set({ schemaVersion: 1, accountStatus: 'deleted' });
        else await f.refs.accountDeletionRequests.set({ userId: f.uid, status: 'pending' });
        const before = await snapshotRoots(f);
        release();
        const result = await operation;
        if (kind === 'backfill') assert.equal(result.value.reason, 'account-deleting');
        else assert(result.error instanceof AccountIdentityWriteBlocked);
        assert.deepEqual(await snapshotRoots(f), before);
      } finally { release(); }
    });
  }
}

test('a failed role update cannot leave a partially assigned privileged role', { skip: !enabled }, async () => {
  const f = await fixture({ identity: false });
  await assert.rejects(writeAccountRoleForUser(db, f.uid, assignment('owner', 6)));
  assert.equal((await f.refs.accountRoles.get()).exists, false);
});

test('existing privileged roles and existing Business data still prevent activation', { skip: !enabled }, async () => {
  for (const existing of ['role', 'profile', 'location']) {
    const f = await fixture();
    if (existing === 'role') await f.refs.accountRoles.set({ role: 'moderator', level: 3 });
    if (existing === 'profile') await f.refs.businessProfiles.set({ keep: true });
    if (existing === 'location') await f.refs.businessProfiles.collection('locations').doc('initial').set({ keep: true });
    const before = await snapshotRoots(f);
    await assert.rejects(activateBusinessAccount(db, f.authUser, FieldValue.serverTimestamp));
    assert.deepEqual(await snapshotRoots(f), before);
    if (existing === 'location') assert.deepEqual((await f.refs.businessProfiles.collection('locations').doc('initial').get()).data(), { keep: true });
  }
});

test('guarded maintenance never changes another deleting account', { skip: !enabled }, async () => {
  const active = await fixture(), other = await fixture();
  await other.refs.publicProfiles.set({ schemaVersion: 1, accountStatus: 'deleted' });
  const before = await snapshotRoots(other);
  await backfillPublicProfileForUser(db, active.uid);
  await writeAccountRoleForUser(db, active.uid, assignment());
  const priorRole = await active.refs.accountRoles.get();
  await activateBusinessAccount(db, active.authUser, FieldValue.serverTimestamp);
  const afterRole = await active.refs.accountRoles.get();
  assert.deepEqual(afterRole.data(), priorRole.data());
  assert(afterRole.updateTime.isEqual(priorRole.updateTime));
  assert.deepEqual(await snapshotRoots(other), before);
});

test('failure after reading a write fence rolls the entire callback back', { skip: !enabled }, async () => {
  const f = await fixture(), before = await snapshotRoots(f);
  await assert.rejects(runActiveIdentityTransaction(db, f.uid, transaction => {
    transaction.set(f.refs.accountRoles, { role: 'owner', level: 6 });
    throw new Error('callback failed');
  }), /callback failed/);
  assert.deepEqual(await snapshotRoots(f), before);
});
