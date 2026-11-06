import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { createFeedGenerationStore } from './feed_runtime.js';
import { feedCursorCodec, InvalidFeedCursor } from './feed_cursor.js';
import { FeedSessionExpired } from './feed_session_policy.js';
import { distanceKm } from './feed_spatial.js';

const fail = (code, message, details) => { throw new HttpsError(code, message, details); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const categories = new Set(['Událost', 'Dotaz', 'Nabídka', 'Pomoc', 'Ztráty a nálezy', 'Tip', 'Doprava', 'Diskuze', 'Varování!', 'Ostatní']);
const stamp = time => [time.seconds, time.nanoseconds];
function rethrowFeedError(error) {
  if (error instanceof FeedSessionExpired) fail('failed-precondition', 'Refresh the feed.', { reason: 'feed-session-expired' });
  if (error instanceof InvalidFeedCursor) fail('invalid-argument', 'Invalid feed cursor.');
  throw error;
}
function filters(input) {
  if (!plain(input) || Object.keys(input).some(key => !['point', 'radiusKm', 'order', 'category'].includes(key)) ||
      !plain(input.point) || Object.keys(input.point).some(key => !['latitude', 'longitude'].includes(key)) ||
      !Number.isFinite(input.point.latitude) || Math.abs(input.point.latitude) > 90 ||
      !Number.isFinite(input.point.longitude) || Math.abs(input.point.longitude) > 180 ||
      ![1, 3, 5, 10, 20, 50].includes(input.radiusKm) ||
      !['nearest', 'popular', 'endingSoon', 'followed'].includes(input.order) ||
      !(input.category === null || categories.has(input.category))) fail('invalid-argument', 'Invalid feed filters.');
  return { point: { ...input.point }, radiusKm: input.radiusKm, order: input.order, category: input.category };
}

export function publicFeedBody(data) {
  if (typeof data.authorId !== 'string' || typeof data.authorNickname !== 'string' || typeof data.title !== 'string' ||
      typeof data.text !== 'string' || !(data.createdAt instanceof Timestamp) || !(data.expiresAt instanceof Timestamp)) {
    fail('data-loss', 'Invalid feed source.');
  }
  const result = Object.fromEntries(['authorId', 'authorNickname', 'title', 'text', 'categories', 'geohash', 'status',
    'likesCount', 'dislikesCount', 'commentsCount', 'savesCount', 'avatarId', 'avatarBackgroundStart', 'avatarBackgroundEnd',
    'avatarGradientDirection', 'businessLocationId', 'businessAuthorFormat', 'businessHighlighted', 'businessSpotlight',
    'businessExtendedDuration', 'businessPromotion'].filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]));
  result.createdAt = data.createdAt.toMillis(); result.expiresAt = data.expiresAt.toMillis();
  if (plain(data.geography)) result.geography = Object.fromEntries(['countryCode', 'subdivisionCode', 'localityName', 'providerPlaceId']
    .filter(key => typeof data.geography[key] === 'string').map(key => [key, data.geography[key]]));
  return result;
}

// Internal operation: limits/key must be supplied by its trusted host. No
// environment key/default signing secret, collection creation or writes here.
export async function getFeedPageOperation(request, db, { key, workNodes = 32, clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db);
  const identity = requireCallableIdentity(request), input = request?.data;
  if (!plain(input) || Object.keys(input).some(key => !['expectedUserId', 'context', 'cursor'].includes(key)) ||
      input.expectedUserId !== identity.uid || !(input.cursor === undefined || input.cursor === null || typeof input.cursor === 'string') ||
      input.cursor && input.context !== undefined) fail('invalid-argument', 'Invalid feed request.');
  if (!Number.isInteger(workNodes) || workNodes < 1 || workNodes > 128 || typeof clock !== 'function') throw new Error('invalid-feed-host-options');
  const now = () => {
    const value = clock()?.getTime(); if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid-feed-clock'); return value;
  };
  const codec = feedCursorCodec({ key });
  const requested = input.cursor ? null : filters(input.context);
  let continuation = null;
  try { if (input.cursor) continuation = codec.decode(input.cursor, { uid: identity.uid, project: db.projectId, now: now() }); }
  catch (error) { rethrowFeedError(error); }
  await requireEligibleActor({ request, db, now: new Date(now()) });
  const controlRef = db.doc('feedIndexControl/current');
  async function generationState(id = null, expected = null) {
    return db.runTransaction(async tx => {
      const control = await tx.get(controlRef);
      const state = control.exists ? validateFeedIndexControl(control.data()) : null;
      if (!state || !['active', 'building'].includes(state.mode) || !state.readGenerationId) fail('unavailable', 'Feed index is not available.');
      const generation = id ?? state.readGenerationId, marker = await tx.get(db.doc(`feedIndexGenerations/${generation}`));
      if (marker.get('schemaVersion') !== 1 || marker.get('v') !== 1 || marker.get('accountRetention') !== true) throw new FeedSessionExpired();
      if (expected && JSON.stringify(stamp(marker.createTime)) !== JSON.stringify(expected)) throw new FeedSessionExpired();
      return { generation, incarnation: stamp(marker.createTime) };
    }, { readOnly: true });
  }
  const privateIds = async (readTime = null, includeFollowing = false) => db.runTransaction(async tx => {
    const user = db.doc(`users/${identity.uid}`);
    // Reuse the existing blocked/followed limits. These are server-owned
    // filters; the caller cannot submit an invented block or following list.
    const blocked = await tx.get(user.collection('blocked').limit(200));
    const followed = includeFollowing ? await tx.get(user.collection('following').limit(200)) : null;
    return { blocked: blocked.docs.map(doc => doc.id), followed: followed?.docs.map(doc => doc.id) ?? [] };
  }, { readOnly: true, ...(readTime ? { readTime } : {}) });
  try {
    let cursor = input.cursor ?? null, decoded, snapshot, binding, baseline;
    if (cursor) {
      decoded = continuation;
      ({ snapshot, binding, baseline } = decoded.context);
      if (!plain(snapshot) || !plain(binding) || typeof baseline !== 'string' ||
          !/^[a-z][a-z0-9-]{0,39}$/.test(binding.generation)) throw new InvalidFeedCursor();
      await generationState(binding.generation, binding.incarnation);
    } else {
      binding = await generationState();
      const store = createFeedGenerationStore(db, binding.generation);
      snapshot = await store.capturePortable({ ...requested, uid: identity.uid, now: now(), unreadFirst: false });
      const privateState = await privateIds(new Timestamp(snapshot.readTime.seconds, snapshot.readTime.nanoseconds), true);
      snapshot.context.blocked = privateState.blocked; snapshot.context.followed = privateState.followed;
      baseline = createHash('sha256').update(JSON.stringify([binding, snapshot])).digest('hex');
      cursor = codec.start({ uid: identity.uid, project: db.projectId, readTime: snapshot.readTime,
        context: { snapshot, binding, baseline }, now: now() });
      decoded = codec.decode(cursor, { uid: identity.uid, project: db.projectId, now: now() });
    }
    const alive = () => { if (now() >= decoded.expiresAt) throw new FeedSessionExpired(); };
    const store = createFeedGenerationStore(db, binding.generation);
    const page = await store.portablePage(snapshot, decoded.position, { uid: identity.uid, assertSessionAlive: alive, nodes: workNodes });
    let items = [];
    const current = await privateIds();
    if (page.state === 'preparing' && [...(page.position?.pending ?? []), ...(page.position?.candidates ?? [])]
      .some(row => current.blocked.includes(row.authorId))) throw new FeedSessionExpired();
    if (page.state !== 'preparing') {
      const hydrated = await store.hydratePortable(snapshot, page.rows.map(row => row.id), now(), { blocked: current.blocked });
      items = hydrated.items.map(item => ({ id: item.id, distanceKm: distanceKm(snapshot.context.point, item.row.location), data: publicFeedBody(item.data) }));
    }
    await generationState(binding.generation, binding.incarnation);
    // Recheck caller eligibility after network waits too; account deletion or
    // a ban during page assembly must not return newly selected full bodies.
    await requireEligibleActor({ request, db, now: new Date(now()) }); alive();
    return { version: 1, state: page.state === 'preparing' ? 'preparing' : 'ready', baseline,
      expiresAt: decoded.expiresAt, items,
      next: page.position ? codec.advance(cursor, page.position, { uid: identity.uid, project: db.projectId, now: now() }) : null };
  } catch (error) { rethrowFeedError(error); }
}
