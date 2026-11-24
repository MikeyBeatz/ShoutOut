// Prepared Business state machine. No callable export or live activation.
import { createHash } from 'node:crypto';
import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { receiptRetentionFields } from './operation_retention.js';
import { encodeGeohash } from './geohash.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const email = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const businessReviewEnabled = false;
// Existing application constraints; branch names also obey locations.validLocation.
const fields = Object.freeze({ countryCode: [2, 5], registrationNumber: [3, 40], submittedCompanyName: [2, 160],
  submittedAddress: [3, 200], submittedCity: [1, 100], submittedPostalCode: [2, 20], initialLocationName: [1, 80],
  initialLocationAddress: [3, 200], initialLocationCity: [0, 100], initialLocationPostalCode: [0, 20],
  initialLocationCountryCode: [2, 2], initialLocationProviderPlaceId: [1, 200] });
export function validateBusinessFields(input, { stored = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !stored &&
      Object.keys(input).some(k => ![...Object.keys(fields), 'initialLocation'].includes(k))) fail('invalid-argument', 'Invalid Business application fields.');
  const value = {};
  for (const [key, [minimum, maximum]] of Object.entries(fields)) {
    const text = input[key];
    if (typeof text !== 'string' || [...text.trim()].length < minimum || [...text.trim()].length > maximum) fail('invalid-argument', `Invalid Business application field: ${key}.`);
    value[key] = text.trim();
  }
  value.countryCode = value.countryCode.toUpperCase(); value.initialLocationCountryCode = value.initialLocationCountryCode.toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(value.countryCode) || !/^[A-Z]{2}$/.test(value.initialLocationCountryCode)) fail('invalid-argument', 'Invalid Business country.');
  const point = input.initialLocation;
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180 ||
      !(point instanceof GeoPoint) && Object.keys(point).some(k => !['latitude', 'longitude'].includes(k))) fail('invalid-argument', 'Invalid Business location.');
  value.initialLocation = new GeoPoint(point.latitude, point.longitude);
  value.initialLocationGeohash = encodeGeohash(point.latitude, point.longitude);
  return value;
}
export function validateBusinessReview(input) {
  const allowed = ['expectedUserId', 'applicationId', 'expectedRevision', 'decision', 'note', 'application', 'idempotencyKey'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k)) ||
      !id(input.expectedUserId) || !id(input.applicationId) || !id(input.idempotencyKey) ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision === Number.MAX_SAFE_INTEGER ||
      !['approve', 'reject', 'suspend', 'reactivate', 'resubmit'].includes(input.decision) ||
      input.note !== undefined && (typeof input.note !== 'string' || [...input.note].length > 500)) fail('invalid-argument', 'Invalid Business decision.');
  const note = (input.note ?? '').trim();
  if (['reject', 'suspend'].includes(input.decision) && !note) fail('invalid-argument', 'A decision reason is required.');
  if (input.decision === 'resubmit' ? input.application === undefined || input.expectedUserId !== input.applicationId : input.application !== undefined || input.expectedUserId === input.applicationId) {
    fail('invalid-argument', 'Invalid Business decision subject.');
  }
  return { expectedUserId: input.expectedUserId, applicationId: input.applicationId, expectedRevision: input.expectedRevision,
    decision: input.decision, note, ...(input.decision === 'resubmit' ? { application: validateBusinessFields(input.application) } : {}), idempotencyKey: input.idempotencyKey };
}
const resultStatus = decision => ({ approve: 'active', reactivate: 'active', reject: 'rejected', suspend: 'suspended', resubmit: 'checking' })[decision];

export async function reviewBusinessApplicationOperation(request, db, auth, clock = () => new Date()) {
  const actor = requireCallableIdentity(request), input = validateBusinessReview(request.data);
  if (actor.uid !== input.expectedUserId) fail('unauthenticated', 'The signed-in account changed.');
  const own = input.decision === 'resubmit', target = input.applicationId;
  const needsAuth = ['approve', 'reactivate', 'resubmit'].includes(input.decision);
  let authUser = null, authRead = null;
  const readAuth = async () => {
    if (typeof auth?.getUser !== 'function') throw new Error('business-auth-reader-required');
    try { authUser = await (authRead ??= auth.getUser(target)); }
    catch (error) { if (error?.code === 'auth/user-not-found') fail('not-found', 'The Business account is unavailable.'); throw error; }
    if (authUser?.uid !== target || authUser.emailVerified !== true || authUser.disabled === true || !email(authUser.email)) fail('failed-precondition', 'The Business account email is not verified or available.');
    if (own && email(authUser.email) !== email(actor.email)) fail('unauthenticated', 'The signed-in account email changed.');
  };
  // Coordinates and string field order are normalized before fingerprinting.
  const fingerprint = hash(JSON.stringify(input)), action = 'reviewBusinessApplication';
  const receiptRef = db.doc(`serverOperations/${hash(`${actor.uid}\n${action}\n${input.idempotencyKey}`)}`);
  const applicationRef = db.doc(`businessApplications/${target}`), profileRef = db.doc(`businessProfiles/${target}`);
  const roleRef = db.doc(`accountRoles/${target}`), initialRef = profileRef.collection('locations').doc('initial');
  const auditRef = db.doc(`businessActivationAudits/${receiptRef.id}`);
  return db.runTransaction(async tx => {
    const date = clock(); if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) throw new Error('invalid-business-review-clock');
    const now = Timestamp.fromDate(date);
    if (!own) {
      await requireEligibleActor({ request, db, reader: tx, now: date });
      const role = await tx.get(db.doc(`accountRoles/${actor.uid}`));
      if (![5, 6].includes(role.get('level')) || role.get('accountStatus') === 'deleted') fail('permission-denied', 'Administrator permission is required.');
    }
    // Never probe another Auth account before checking the caller's authority.
    // This is read-only and memoized across Firestore transaction retries.
    if (needsAuth) await readAuth();
    const [application, profile, role, legacy, deletion, marker, ban, receipt, audit, initial] = await tx.getAll(applicationRef, profileRef, roleRef,
      db.doc(`moderators/${target}`), db.doc(`accountDeletionRequests/${target}`), db.doc(`publicProfiles/${target}`), db.doc(`bans/${target}`), receiptRef, auditRef, initialRef);
    if (deletion.exists || marker.get('accountStatus') === 'deleted' || role.get('accountStatus') === 'deleted') fail('failed-precondition', 'Business account deletion is pending or confirmed.');
    if (own && ban.exists && (!(ban.get('expiresAt') instanceof Timestamp) || ban.get('expiresAt').toMillis() > now.toMillis())) fail('permission-denied', 'The account cannot resubmit this application.');
    if (legacy.exists || role.exists && (role.get('level') !== 1 && !(role.get('level') === 2 && role.get('role') === 'business'))) fail('failed-precondition', 'The account has another privileged role.');
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      const saved = receipt.data();
      if (saved.action !== action || saved.fingerprint !== fingerprint) fail('already-exists', 'Idempotency key was already used for another payload.');
      if (saved.userId !== actor.uid || saved.authorId !== target || saved.applicationId !== target || saved.decision !== input.decision ||
          saved.result?.status !== resultStatus(input.decision) || saved.result?.revision !== input.expectedRevision + 1 ||
          !audit.exists || audit.get('applicationId') !== target || audit.get('operationId') !== receipt.id || audit.get('action') !== input.decision ||
          audit.get('administratorId') !== (own ? null : actor.uid) || audit.get('revision') !== input.expectedRevision + 1) fail('failed-precondition', 'Invalid stored Business decision result.');
      return { status: saved.result.status, revision: saved.result.revision };
    }
    const body = application.data(), revision = body?.revision ?? 0;
    if (!application.exists || body.userId !== target || !Number.isSafeInteger(revision) || revision !== input.expectedRevision) fail('failed-precondition', 'The Business application changed. Refresh before deciding.');
    const status = body.status;
    if (['approve', 'reject'].includes(input.decision) ? !['pending_email', 'checking'].includes(status) :
        input.decision === 'resubmit' ? status !== 'rejected' : input.decision === 'suspend' ? status !== 'active' : status !== 'suspended') {
      fail('failed-precondition', 'The Business application state changed.');
    }
    if (['approve', 'reject', 'resubmit'].includes(input.decision) && (profile.exists || initial.exists || role.get('level') === 2)) fail('failed-precondition', 'Business activation already exists.');
    if (['suspend', 'reactivate'].includes(input.decision) && (!profile.exists || role.get('role') !== 'business' || role.get('level') !== 2 || profile.get('status') !== status)) fail('failed-precondition', 'The active Business identity is inconsistent.');
    if (needsAuth && input.decision !== 'resubmit' && email(authUser.email) !== email(body.contactEmail)) fail('failed-precondition', 'The Business contact email changed.');
    // Keep the actor only in administratorId, already covered by account purge.
    // State snapshots deliberately exclude copied historical actor references.
    let appPatch = { status: resultStatus(input.decision), revision: revision + 1, reviewedAt: now, reviewReason: input.note };
    if (own) appPatch = { ...input.application, contactEmail: authUser.email.trim(), status: 'checking', revision: revision + 1, resubmittedAt: now, emailVerifiedAt: now };
    if (input.decision === 'approve') {
      const v = validateBusinessFields(body, { stored: true });
      tx.set(roleRef, { role: 'business', level: 2, assignedBy: actor.uid, moderationScope: { global: false, countries: [], subdivisions: [] }, createdAt: now });
      tx.create(profileRef, { displayName: v.submittedCompanyName, officialName: v.submittedCompanyName, registrationNumber: v.registrationNumber,
        vatId: '', countryCode: v.countryCode, registryAddress: v.submittedAddress, billingCity: v.submittedCity, billingPostalCode: v.submittedPostalCode,
        billingEmail: authUser.email.trim(), status: 'active', activationMethod: 'manual_admin', emailVerifiedAt: now, createdAt: now, updatedAt: now });
      tx.create(initialRef, { displayName: v.initialLocationName, address: v.initialLocationAddress, active: true, deleted: false, geocodingStatus: 'verified',
        location: v.initialLocation, geohash: v.initialLocationGeohash, providerPlaceId: v.initialLocationProviderPlaceId, countryCode: v.initialLocationCountryCode, createdAt: now, updatedAt: now });
      appPatch = { ...appPatch, activationMethod: 'manual_admin', activatedBy: actor.uid, activatedAt: now, emailVerifiedAt: now };
      if (marker.exists) tx.update(marker.ref, { publicRole: 'business' });
    } else if (['suspend', 'reactivate'].includes(input.decision)) tx.update(profileRef, { status: appPatch.status, reviewReason: input.note, reviewedAt: now, updatedAt: now });
    tx.update(applicationRef, appPatch);
    tx.create(auditRef, { applicationId: target, administratorId: own ? null : actor.uid, action: input.decision, operationId: receipt.id,
      revision: revision + 1, reason: input.note, before: { status, revision }, after: { status: appPatch.status, revision: revision + 1 }, createdAt: now });
    const result = { status: appPatch.status, revision: revision + 1 };
    tx.create(receiptRef, { ...retention, action, userId: actor.uid, authorId: target, applicationId: target, decision: input.decision, fingerprint, result, createdAt: now });
    return result;
  });
}
