import { encodeGeohash } from './geohash.js';
export { encodeGeohash } from './geohash.js';
import { receiptRetentionFields } from './operation_retention.js';
import { createHash } from 'node:crypto';
import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';

const categories = new Set([
  'Událost', 'Dotaz', 'Nabídka', 'Pomoc', 'Ztráty a nálezy',
  'Tip', 'Doprava', 'Diskuze', 'Varování!', 'Ostatní',
]);
const day = 86400000;
const fail = (code, message) => { throw new HttpsError(code, message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');

function identifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function coordinates(value) {
  return value && Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180;
}

// Same seven-character grid and rounding as lib/geography.dart, including
// Dart's away-from-zero rounding at negative half-grid boundaries.
export function publicCoordinate(value) {
  return Math.sign(value) * Math.round(Math.abs(value) * 100) / 100;
}

export function validateCreateShout(input) {
  const allowed = new Set([
    'idempotencyKey', 'title', 'text', 'categories', 'durationMinutes',
    'location', 'businessLocationId', 'businessHighlighted',
    'businessSpotlight', 'businessExtendedDuration', 'expectedUserId',
  ]);
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !allowed.has(key))) {
    fail('invalid-argument', 'Invalid Shout fields.');
  }
  if (!identifier(input.idempotencyKey)) fail('invalid-argument', 'Invalid idempotency key.');
  if (input.expectedUserId !== undefined && !identifier(input.expectedUserId)) {
    fail('invalid-argument', 'Invalid expected account.');
  }
  for (const [key, maximum] of [['title', 60], ['text', 220]]) {
    if (typeof input[key] !== 'string' || input[key].trim().length === 0 ||
        [...input[key]].length > maximum) fail('invalid-argument', `Invalid ${key}.`);
  }
  if (!Array.isArray(input.categories) || input.categories.length < 1 ||
      input.categories.length > 2 ||
      input.categories.some((category) => !categories.has(category))) {
    fail('invalid-argument', 'Invalid categories.');
  }
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 15 ||
      input.durationMinutes > 10080) fail('invalid-argument', 'Invalid duration.');
  if (input.businessLocationId !== undefined && !identifier(input.businessLocationId)) {
    fail('invalid-argument', 'Invalid branch identifier.');
  }
  for (const field of ['businessHighlighted', 'businessSpotlight', 'businessExtendedDuration']) {
    if (input[field] !== undefined && typeof input[field] !== 'boolean') {
      fail('invalid-argument', `Invalid ${field}.`);
    }
  }
  if (input.location !== undefined && (!coordinates(input.location) ||
      Object.keys(input.location).some((key) => !['latitude', 'longitude'].includes(key)))) {
    fail('invalid-argument', 'Invalid location.');
  }
  // Canonical ordering makes retries independent of JSON property order.
  return Object.fromEntries([...allowed].filter((key) => input[key] !== undefined)
    .map((key) => [key, key === 'location'
      ? { latitude: input.location.latitude, longitude: input.location.longitude }
      : input[key]]));
}

export function nextShoutRate(data, isBusiness, now, eventId) {
  const nowMs = now.toMillis();
  if (data) {
    if (!(data.lastAt instanceof Timestamp) || !(data.windowStartedAt instanceof Timestamp) ||
        !Number.isInteger(data.count) || data.count < 1) {
      fail('failed-precondition', 'Invalid stored rate limit.');
    }
    if (nowMs < data.lastAt.toMillis() + (isBusiness ? 1000 : 120000)) {
      fail('resource-exhausted', 'rate-shout-cooldown');
    }
  }
  const reset = !data || nowMs >= data.windowStartedAt.toMillis() + day;
  const count = reset ? 1 : data.count + 1;
  if (count > (isBusiness ? 500 : 50)) fail('resource-exhausted', 'rate-shout-daily-limit');
  return { lastAt: now, lastEventId: eventId,
    windowStartedAt: reset ? now : data.windowStartedAt, count };
}

export async function createShoutOperation(request, db, clock = () => new Date(), { indexWriter = null } = {}) {
  const { uid } = requireCallableIdentity(request);
  const input = validateCreateShout(request.data);
  if (input.expectedUserId !== undefined && input.expectedUserId !== uid) {
    fail('unauthenticated', 'The signed-in account changed.');
  }
  const key = digest(`${uid}\n${input.idempotencyKey}`);
  const fingerprint = digest(JSON.stringify(input));
  const receiptRef = db.doc(`serverOperations/${key}`);
  const shoutRef = db.doc(`shouts/${key}`);
  const rateRef = db.doc(`rateLimits/${uid}/actions/shout`);
  return db.runTransaction(async (transaction) => {
    const now = Timestamp.fromDate(clock());
    const actor = await requireEligibleActor({ request, db, reader: transaction,
      requireContentPermission: true, now: now.toDate() });
    const receipt = await transaction.get(receiptRef);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) {
      if (receipt.data().fingerprint !== fingerprint) {
        fail('already-exists', 'Idempotency key was already used for another payload.');
      }
      return { shoutId: key };
    }
    const [role, rate] = await transaction.getAll(db.doc(`accountRoles/${uid}`), rateRef);
    const isBusiness = role.data()?.role === 'business' && role.data()?.level === 2;
    let location;
    let nickname = actor.profile.nickname;
    const businessFields = {};
    if (isBusiness) {
      if (!input.businessLocationId || input.location !== undefined) {
        fail('invalid-argument', 'Business Shouts require a branch, not device coordinates.');
      }
      const [business, branch] = await transaction.getAll(
        db.doc(`businessProfiles/${uid}`),
        db.doc(`businessProfiles/${uid}/locations/${input.businessLocationId}`),
      );
      const data = branch.data();
      if (business.data()?.status !== 'active' || data?.active !== true ||
          data.deleted !== false || data.geocodingStatus !== 'verified' ||
          !(data.location instanceof GeoPoint) || typeof data.displayName !== 'string') {
        fail('failed-precondition', 'business-location-unavailable');
      }
      location = data.location;
      nickname = data.displayName;
      businessFields.businessLocationId = input.businessLocationId;
      businessFields.businessAuthorFormat = 'branch';
      for (const field of ['businessHighlighted', 'businessSpotlight', 'businessExtendedDuration']) {
        if (input[field]) businessFields[field] = true;
      }
      if (input.durationMinutes > 1440 && input.businessExtendedDuration !== true ||
          input.businessExtendedDuration === true && input.durationMinutes <= 1440) {
        fail('invalid-argument', 'Invalid extended Business duration.');
      }
    } else {
      if (!coordinates(input.location) || input.durationMinutes > 1440 ||
          ['businessLocationId', 'businessHighlighted', 'businessSpotlight',
            'businessExtendedDuration'].some((field) => input[field] !== undefined)) {
        fail('invalid-argument', 'Invalid personal Shout settings.');
      }
      location = new GeoPoint(publicCoordinate(input.location.latitude),
        publicCoordinate(input.location.longitude));
    }
    if (typeof nickname !== 'string' || nickname.length === 0) {
      fail('failed-precondition', 'The author profile is incomplete.');
    }
    const avatar = {};
    for (const field of ['avatarId', 'avatarBackgroundStart', 'avatarBackgroundEnd', 'avatarGradientDirection']) {
      if (actor.profile[field] === undefined) fail('failed-precondition', 'The avatar profile is incomplete.');
      avatar[field] = actor.profile[field];
    }
    const rateData = nextShoutRate(rate.data(), isBusiness, now, key);
    const shoutData = {
      ...businessFields, ...avatar, authorId: uid, authorNickname: nickname,
      title: input.title, text: input.text, categories: input.categories,
      location, geohash: encodeGeohash(location.latitude, location.longitude),
      createdAt: now, expiresAt: Timestamp.fromMillis(now.toMillis() + input.durationMinutes * 60000),
      status: 'active', likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0,
    };
    const indexPlan = await indexWriter?.prepare(transaction, key, null, shoutData, { operationId: receiptRef.id });
    transaction.create(shoutRef, shoutData);
    indexPlan?.apply();
    transaction.set(rateRef, rateData);
    transaction.create(receiptRef, { ...retention, userId: uid, action: 'createShout', fingerprint,
      shoutId: key, createdAt: now });
    return { shoutId: key };
  });
}
