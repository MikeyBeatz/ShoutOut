import { HttpsError } from 'firebase-functions/v2/https';

const legalAcceptanceId = 'acceptance_2026_07_25';

export const secureCallableOptions = Object.freeze({
  region: 'europe-west3',
  enforceAppCheck: true,
});

function reject(code, message) {
  throw new HttpsError(code, message);
}

function timestampMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return null;
}

function hasActiveBan(snapshot, nowMillis) {
  if (!snapshot.exists) return false;
  const expiresAt = snapshot.data()?.expiresAt;
  if (expiresAt == null) return true;
  const expiresAtMillis = timestampMillis(expiresAt);
  // A malformed server-managed ban must fail closed instead of allowing access.
  return expiresAtMillis == null || expiresAtMillis > nowMillis;
}

function hasActiveContentRestriction(snapshot, nowMillis) {
  if (!snapshot.exists) return false;
  const expiresAtMillis = timestampMillis(snapshot.data()?.expiresAt);
  // Restrictions are time-limited. Invalid data is treated as restricted so a
  // damaged server document cannot silently restore content creation.
  return expiresAtMillis == null || expiresAtMillis > nowMillis;
}

export function requireCallableIdentity(request) {
  const uid = request?.auth?.uid;
  if (typeof uid !== 'string' || uid.length === 0) {
    reject('unauthenticated', 'Authentication is required.');
  }
  if (typeof request?.app?.appId !== 'string' || request.app.appId.length === 0) {
    reject('unauthenticated', 'App Check is required.');
  }
  const token = request.auth.token;
  if (token?.email_verified !== true || typeof token.email !== 'string') {
    reject('permission-denied', 'A verified email address is required.');
  }
  return Object.freeze({ uid, email: token.email });
}

export function accountDocumentRefs(db, uid) {
  return Object.freeze({
    profile: db.doc(`users/${uid}`),
    legal: db.doc(`users/${uid}/legal/${legalAcceptanceId}`),
    ban: db.doc(`bans/${uid}`),
    deletion: db.doc(`accountDeletionRequests/${uid}`),
    restriction: db.doc(`contentRestrictions/${uid}`),
  });
}

async function readAccountDocuments(reader, refs) {
  const orderedRefs = [
    refs.profile,
    refs.legal,
    refs.ban,
    refs.deletion,
    refs.restriction,
  ];
  if (typeof reader.getAll === 'function') {
    return reader.getAll(...orderedRefs);
  }
  if (typeof reader.get === 'function') {
    return Promise.all(orderedRefs.map((ref) => reader.get(ref)));
  }
  throw new TypeError('The Firestore reader must provide getAll() or get().');
}

export async function requireEligibleActor({
  request,
  db,
  reader = db,
  requireContentPermission = false,
  now = new Date(),
}) {
  const identity = requireCallableIdentity(request);
  const refs = accountDocumentRefs(db, identity.uid);
  const [profile, legal, ban, deletion, restriction] =
    await readAccountDocuments(reader, refs);
  const nowMillis = now.getTime();

  if (!profile.exists) {
    reject('failed-precondition', 'The account profile is incomplete.');
  }
  if (!legal.exists) {
    reject('failed-precondition', 'Current legal terms must be accepted.');
  }
  if (hasActiveBan(ban, nowMillis)) {
    reject('permission-denied', 'The account is not allowed to perform this action.');
  }
  if (deletion.exists) {
    reject('failed-precondition', 'Account deletion is pending.');
  }
  if (
    requireContentPermission &&
    hasActiveContentRestriction(restriction, nowMillis)
  ) {
    reject('permission-denied', 'Content creation is temporarily restricted.');
  }

  return Object.freeze({
    uid: identity.uid,
    email: identity.email,
    profile: profile.data(),
    refs,
  });
}

export { legalAcceptanceId };
