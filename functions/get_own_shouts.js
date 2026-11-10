import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { publicFeedBody } from './get_feed_page.js';
import { distanceKm } from './feed_spatial.js';

export const ownShoutRetentionMillis = 7 * 86400000;
const fail = () => { throw new HttpsError('invalid-argument', 'Invalid own Shout page.'); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function timestamp(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isSafeInteger) ||
      value[0] < 0 || value[0] > 253402300799 || value[1] < 0 || value[1] >= 1000000000) fail();
  return new Timestamp(value[0], value[1]);
}
function inputFor(input, uid) {
  if (!plain(input) || Object.keys(input).some(key => !['expectedUserId', 'section', 'after', 'point'].includes(key)) ||
      input.expectedUserId !== uid || !['active', 'expired'].includes(input.section)) fail();
  if (input.point != null && (!plain(input.point) || Object.keys(input.point).length !== 2 ||
      !Number.isFinite(input.point.latitude) || Math.abs(input.point.latitude) > 90 ||
      !Number.isFinite(input.point.longitude) || Math.abs(input.point.longitude) > 180)) fail();
  if (input.after != null) {
    const after = input.after;
    if (!plain(after) || Object.keys(after).length !== 5 || after.userId !== uid || after.section !== input.section ||
        !identifier(after.id)) fail();
    timestamp(after.createdAt); timestamp(after.expiresAt);
  }
  return input;
}

// Exposed for the CLI's read-only Query Explain too. createdAt's nonnegative
// range permits its existing newest-first order alongside the expiry range.
// Equality is always the verified actor, never a client-selected author.
export function ownShoutsQuery(db, uid, section, now, after = null) {
  let query = db.collection('shouts').where('authorId', '==', uid)
    .where('status', 'in', ['active', 'expired']).where('createdAt', '>=', Timestamp.fromMillis(0));
  query = section === 'active' ? query.where('expiresAt', '>', now) :
    query.where('expiresAt', '<=', now).where('expiresAt', '>=', Timestamp.fromMillis(Math.max(0, now.toMillis() - ownShoutRetentionMillis)));
  query = query.orderBy('createdAt', 'desc').orderBy('expiresAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (after) query = query.startAfter(timestamp(after.createdAt), timestamp(after.expiresAt), after.id);
  return query.limit(50);
}

export async function getOwnShoutsOperation(request, db, { clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db);
  const { uid } = requireCallableIdentity(request), input = inputFor(request.data, uid), now = Timestamp.fromDate(clock());
  await requireEligibleActor({ request, db, now: now.toDate() });
  const page = await ownShoutsQuery(db, uid, input.section, now, input.after).get();
  const items = page.docs.filter(doc => doc.get('contentPurged') !== true).map(doc => {
    const data = doc.data(), location = data.location;
    return { id: doc.id, distanceKm: input.point && Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)
      ? distanceKm(input.point, location) : 0, data: publicFeedBody(data) };
  });
  const last = page.docs.at(-1), stamp = value => [value.seconds, value.nanoseconds];
  // This unsigned cursor only skips inside the caller's own indexed query.
  // Recheck eligibility after network waits; no session or key is provisioned.
  await requireEligibleActor({ request, db, now: clock() });
  return { version: 1, items, next: page.size === 50 ? { userId: uid, section: input.section, id: last.id,
    createdAt: stamp(last.get('createdAt')), expiresAt: stamp(last.get('expiresAt')) } : null };
}
