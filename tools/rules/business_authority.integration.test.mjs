import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, query, where, limit, getDoc, getDocs, setDoc, updateDoc, writeBatch, serverTimestamp, GeoPoint } from 'firebase/firestore';
import { businessAuthorityCandidate, legacyModerationRules } from './business_authority_candidate.mjs';
import { reviewBusinessApplicationOperation as review } from '../../functions/business_review.js';
import { operationTestKey } from '../../functions/test_helpers.js';
const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const sdk = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = sdk('firebase-admin/app'), { getFirestore } = sdk('firebase-admin/firestore');
const token = { email: 'fixture@example.test', email_verified: true }, roles = { member: 1, business: 2, mod: 3, senior: 4, admin: 5, owner: 6 };
let env, beforeEnv, app, db;
const client = (uid, e = env) => uid ? e.authenticatedContext(uid, token).firestore() : e.unauthenticatedContext().firestore();
const application = () => ({ userId: 'applicant', countryCode: 'CZ', registrationNumber: '12345678', submittedCompanyName: 'Synthetic Company',
  submittedAddress: 'Test 12', submittedCity: 'City', submittedPostalCode: '12345', initialLocationName: 'Branch', initialLocationAddress: 'Test 12',
  initialLocationCity: 'City', initialLocationPostalCode: '12345', initialLocationCountryCode: 'CZ', initialLocation: new GeoPoint(50.53, 14.13),
  initialLocationGeohash: 'u2fhxxx', initialLocationProviderPlaceId: 'fixture', contactEmail: token.email, status: 'checking', submittedAt: new Date() });
async function seed(e) {
  await e.withSecurityRulesDisabled(async c => {
    for (const [uid, level] of Object.entries({ ...roles, applicant: 1, legacy: 3 })) {
      await setDoc(doc(c.firestore(), `users/${uid}`), { nickname: uid });
      await setDoc(doc(c.firestore(), `users/${uid}/legal/acceptance_2026_07_25`), {});
      if (uid !== 'applicant') await setDoc(doc(c.firestore(), `${uid === 'legacy' ? 'moderators' : 'accountRoles'}/${uid}`), { role: uid === 'business' ? 'business' : uid, level });
    }
    await setDoc(doc(c.firestore(), 'businessApplications/applicant'), application());
  });
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: { host: '127.0.0.1', port: 8080, rules: businessAuthorityCandidate(source) } });
  beforeEnv = await initializeTestEnvironment({ projectId: 'shoutout-rules-test-before', firestore: { host: '127.0.0.1', port: 8080, rules: legacyModerationRules(source) } });
  app = initializeApp({ projectId: 'shoutout-rules-test' }, 'business-authority-rules'); db = getFirestore(app);
});
beforeEach(async () => { await env.clearFirestore(); await seed(env); });
after(async () => { if (db) await db.terminate(); if (app) await deleteApp(app); if (env) await env.cleanup(); if (beforeEnv) await beforeEnv.cleanup(); });
function activation(f, uid) {
  const b = writeBatch(f), now = serverTimestamp();
  b.set(doc(f, 'accountRoles/applicant'), { role: 'business', level: 2, assignedBy: uid, createdAt: now });
  b.set(doc(f, 'businessProfiles/applicant'), { displayName: 'Synthetic Company', status: 'active', activationMethod: 'manual_admin', createdAt: now, updatedAt: now });
  b.set(doc(f, 'businessProfiles/applicant/locations/initial'), { displayName: 'Branch', address: 'Test 12', active: true, deleted: false, geocodingStatus: 'verified', createdAt: now, updatedAt: now });
  b.update(doc(f, 'businessApplications/applicant'), { status: 'active', activatedBy: uid, activatedAt: now, activationMethod: 'manual_admin' });
  b.set(doc(f, 'businessActivationAudits/activation'), { applicationId: 'applicant', administratorId: uid, action: 'activate', createdAt: now });
  return b;
}
test('historical activation remains a valid before case; active candidate is strict, idempotent and leaves source unchanged', async () => {
  await beforeEnv.clearFirestore(); await seed(beforeEnv); await assertSucceeds(activation(client('admin', beforeEnv), 'admin').commit());
  assert.equal(businessAuthorityCandidate(businessAuthorityCandidate(source)), businessAuthorityCandidate(source));
  assert.throws(() => businessAuthorityCandidate(source + source), /source-drift/);
  assert.throws(() => legacyModerationRules('unrelated'), /source-drift/);
  assert.equal(readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), source);
});
test('all client roles, legacy and anonymous cannot activate, forge audit, elevate role or bypass by batch', async () => {
  for (const uid of [...Object.keys(roles), 'applicant', 'legacy', null]) {
    const f = client(uid); await assertFails(activation(f, uid ?? 'anonymous').commit());
    for (const path of ['accountRoles/applicant', 'businessProfiles/applicant', 'businessProfiles/applicant/locations/initial', 'businessActivationAudits/forged']) {
      await assertFails(setDoc(doc(f, path), { role: 'owner', level: 6, userId: uid, text: 'x'.repeat(20000), administratorId: uid, status: 'active' }));
    }
    for (const patch of [{ status: 'active' }, { status: 'rejected', revision: 1 }, { userId: uid }, { submittedCompanyName: 7 }, { reviewReason: 'x'.repeat(20000) }, { status: 'checking', emailVerificationMethod: 'manual_admin', emailVerifiedBy: uid, emailVerifiedAt: serverTimestamp() }]) {
      await assertFails(updateDoc(doc(f, 'businessApplications/applicant'), patch));
    }
  }
});
test('private reads and real admin queue queries are preserved; anonymous and cross-account reads fail', async () => {
  await assertSucceeds(getDoc(doc(client('applicant'), 'businessApplications/applicant')));
  for (const status of [['pending_email', 'checking'], ['active'], ['suspended']]) await assertSucceeds(getDocs(query(collection(client('admin'), 'businessApplications'), where('status', 'in', status), limit(50))));
  await assertSucceeds(getDocs(collection(client('admin'), 'businessActivationAudits')));
  for (const uid of [null, 'member', 'business']) {
    await assertFails(getDoc(doc(client(uid), 'businessApplications/applicant')));
    await assertFails(getDocs(collection(client(uid), 'businessApplications')));
    await assertFails(getDocs(collection(client(uid), 'businessActivationAudits')));
  }
});
test('own registration email transition and cancellation stay usable while manual admin confirmation is closed', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'businessApplications/applicant'), { ...application(), status: 'pending_email' }));
  await assertFails(updateDoc(doc(client('admin'), 'businessApplications/applicant'), { status: 'checking', emailVerificationMethod: 'manual_admin', emailVerifiedBy: 'admin', emailVerifiedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(client('applicant'), 'businessApplications/applicant'), { status: 'checking', emailVerifiedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(client('applicant'), 'businessApplications/applicant'), { status: 'cancelled', cancelledAt: serverTimestamp() }));
});
test('server Business lifecycle succeeds through active Rules; suspended owner retains legitimate data/branch edits and cannot restore status', async () => {
  const clock = new Date(), request = (decision, revision, uid = 'admin') => ({ auth: { uid, token }, app: { appId: 'fixture' }, data: {
    expectedUserId: uid, applicationId: 'applicant', decision, expectedRevision: revision, note: ['reject', 'suspend'].includes(decision) ? 'Synthetic reason' : '', idempotencyKey: operationTestKey(`${decision}-${revision}`, clock),
    ...(decision === 'resubmit' ? { application: { ...Object.fromEntries(Object.entries(application()).filter(([k]) => !['userId', 'contactEmail', 'initialLocationGeohash', 'status', 'submittedAt'].includes(k))), initialLocation: { latitude: 50.53, longitude: 14.13 } } } : {}) } });
  const auth = { getUser: async () => ({ uid: 'applicant', email: token.email, emailVerified: true }) };
  await review(request('reject', 0), db, auth); await review(request('resubmit', 1, 'applicant'), db, auth);
  await review(request('approve', 2), db, auth); await review(request('suspend', 3), db, auth);
  const f = client('applicant'); await assertSucceeds(getDoc(doc(f, 'businessProfiles/applicant')));
  await assertSucceeds(getDocs(collection(f, 'businessProfiles/applicant/locations')));
  await assertSucceeds(updateDoc(doc(f, 'businessProfiles/applicant'), { displayName: 'Updated display', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(f, 'businessProfiles/applicant/locations/initial'), { displayName: 'Updated branch', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(f, 'businessProfiles/applicant'), { status: 'active', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(f, 'accountRoles/applicant'), { level: 6 }));
  await review(request('reactivate', 4), db, auth); assert.equal((await db.doc('accountRoles/applicant').get()).get('level'), 2);
  assert.equal((await db.doc('businessProfiles/applicant').get()).get('status'), 'active');
});
