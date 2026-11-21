import { packDeltaPosition } from './feed_delta_position.js';
import { publicFeedBody } from './feed_public_body.js';
export { publicFeedBody } from './feed_public_body.js';
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
import { captureFeedReadRevision, feedReadClassifier } from './feed_read_snapshot.js';
import { generationContentIdentity, generationCardProjection } from './feed_generation_format.js';

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
  if (!plain(input) || Object.keys(input).some(key => !['point', 'radiusKm', 'order', 'category', 'readPolicy'].includes(key)) ||
      !(input.readPolicy === undefined || input.readPolicy === 'confirmed-v1') ||
      !plain(input.point) || Object.keys(input.point).some(key => !['latitude', 'longitude'].includes(key)) ||
      !Number.isFinite(input.point.latitude) || Math.abs(input.point.latitude) > 90 ||
      !Number.isFinite(input.point.longitude) || Math.abs(input.point.longitude) > 180 ||
      ![1, 3, 5, 10, 20, 50].includes(input.radiusKm) ||
      !['nearest', 'popular', 'endingSoon', 'followed'].includes(input.order) ||
      !(input.category === null || categories.has(input.category))) fail('invalid-argument', 'Invalid feed filters.');
  return { point: { ...input.point }, radiusKm: input.radiusKm, order: input.order, category: input.category,
    ...(input.readPolicy ? { readPolicy: input.readPolicy } : {}) };
}

// Internal operation: limits/key must be supplied by its trusted host. No
// environment key/default signing secret, collection creation or writes here.
export async function getFeedPageOperation(request, db, { key, workNodes = 32, clock = () => new Date(),
  readOrdering = null, compatibleGenerations = false, observeMetrics = () => {}, cardProjection = false, onSelected = null, onLegacy = null } = {}) {
  assertFeedRuntimeTarget(db);
  const identity = requireCallableIdentity(request), input = request?.data;
  if (!plain(input) || Object.keys(input).some(key => !['expectedUserId', 'context', 'cursor'].includes(key)) ||
      input.expectedUserId !== identity.uid || !(input.cursor === undefined || input.cursor === null || typeof input.cursor === 'string') ||
      input.cursor && input.context !== undefined) fail('invalid-argument', 'Invalid feed request.');
  if (!Number.isInteger(workNodes) || workNodes < 1 || workNodes > 128 || typeof clock !== 'function' || typeof compatibleGenerations !== 'boolean') throw new Error('invalid-feed-host-options');
  if (readOrdering !== null && (!Number.isSafeInteger(readOrdering.maxBlockReads) || readOrdering.maxBlockReads < 1)) {
    throw new Error('invalid-feed-read-options');
  }
  const now = () => {
    const value = clock()?.getTime(); if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid-feed-clock'); return value;
  };
  const codec = feedCursorCodec({ key });
  const requested = input.cursor ? null : filters(input.context);
  let continuation = null;
  try { if (input.cursor) continuation = codec.decode(input.cursor, { uid: identity.uid, project: db.projectId, now: now() }); }
  catch (error) { rethrowFeedError(error); }
  await requireEligibleActor({ request, db, now: new Date(now()) });
  let useCard = cardProjection === true;
  const packed = cardProjection === true || cardProjection === 'generation';
  const controlRef = db.doc('feedIndexControl/current');
  async function generationState(id = null, expected = null) {
    return db.runTransaction(async tx => {
      const control = await tx.get(controlRef);
      const state = control.exists ? validateFeedIndexControl(control.data()) : null;
      if (!state || !['active', 'building'].includes(state.mode) || !state.readGenerationId) fail('unavailable', 'Feed index is not available.');
      const generation = id ?? state.readGenerationId, marker = await tx.get(db.doc(`feedIndexGenerations/${generation}`));
      useCard = cardProjection === 'generation' ? generationCardProjection(marker.data()) : cardProjection;
      if (marker.get('schemaVersion') !== 1 || marker.get('v') !== (useCard ? 2 : 1) || marker.get('accountRetention') !== true ||
          useCard && (state.schemaVersion !== 2 || !state.cardWriteGenerationIds.includes(generation) || marker.get('cardProjection') !== 1 || marker.get('cardReady') !== true || !id && state.cardReadGenerationId !== generation)) throw new FeedSessionExpired();
      const contentIdentity = generationContentIdentity(marker.data());
      if (!compatibleGenerations && contentIdentity !== (readOrdering !== null)) {
        fail('failed-precondition', 'Incompatible feed reading generation.');
      }
      if (expected && JSON.stringify(stamp(marker.createTime)) !== JSON.stringify(expected)) throw new FeedSessionExpired();
      return { generation, incarnation: stamp(marker.createTime), ...(packed ? { controlRevision: state.revision, currentReader: state.readGenerationId } : {}), ...(compatibleGenerations ? { contentIdentity } : {}) };
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
      const actual = await generationState(binding.generation, binding.incarnation);
      if (packed) { binding.controlRevision = actual.controlRevision; binding.currentReader = actual.currentReader; }
      if (compatibleGenerations) {
        if (binding.contentIdentity !== undefined && binding.contentIdentity !== actual.contentIdentity) throw new FeedSessionExpired();
        binding.contentIdentity = actual.contentIdentity;
      }
    } else {
      binding = await generationState();
      const contentIdentity = compatibleGenerations ? binding.contentIdentity : readOrdering !== null;
      const grouped = readOrdering !== null && requested.order === 'nearest' &&
        (!compatibleGenerations || requested.readPolicy === 'confirmed-v1');
      if (grouped && !contentIdentity) fail('failed-precondition', 'Unread feed is not active yet.');
      if (compatibleGenerations && requested.readPolicy && !readOrdering) fail('failed-precondition', 'Unread feed is paused.');
      const store = createFeedGenerationStore(db, binding.generation, { contentIdentity, cardProjection: useCard });
      snapshot = await store.capturePortable({ ...requested, uid: identity.uid, now: now(), unreadFirst: grouped });
      if (snapshot.context.unreadFirst) {
        snapshot.context.readPolicy = 'content-v1';
        snapshot.context.readRevision = await captureFeedReadRevision(db, identity.uid, snapshot.readTime);
      }
      const privateState = await privateIds(new Timestamp(snapshot.readTime.seconds, snapshot.readTime.nanoseconds), true);
      snapshot.context.blocked = privateState.blocked; snapshot.context.followed = privateState.followed;
      baseline = createHash('sha256').update(JSON.stringify([binding, snapshot])).digest('hex');
      cursor = codec.start({ uid: identity.uid, project: db.projectId, readTime: snapshot.readTime,
        context: { snapshot, binding, baseline }, now: now() });
      decoded = codec.decode(cursor, { uid: identity.uid, project: db.projectId, now: now() });
    }
    const alive = () => { if (now() >= decoded.expiresAt) throw new FeedSessionExpired(); };
    if (snapshot.context.unreadFirst && !readOrdering) fail('failed-precondition', 'Unread feed is paused.');
    const store = createFeedGenerationStore(db, binding.generation, { contentIdentity: compatibleGenerations ? binding.contentIdentity : readOrdering !== null, cardProjection: useCard });
    const reading = snapshot.context.unreadFirst ? feedReadClassifier(db, identity.uid, snapshot, readOrdering) : null;
    const position = packed ? await store.restorePosition(snapshot, decoded.position) : decoded.position;
    const page = await store.portablePage(snapshot, position, { uid: identity.uid, assertSessionAlive: alive, nodes: workNodes,
      ...(reading ? { readIds: reading.readIds, classifyRead: reading.classify } : {}) });
    let items = [];
    const current = useCard && page.state !== 'preparing' ? null : await privateIds();
    if (page.state === 'preparing' && [...(page.position?.pending ?? []), ...(page.position?.candidates ?? [])]
      .some(row => current.blocked.includes(row.authorId))) throw new FeedSessionExpired();
    if (useCard && page.state !== 'preparing') {
      if (typeof onSelected !== 'function') throw new Error('delta-page-responder-required');
      observeMetrics({ ...page.metrics, ...reading?.metrics, phase: 'delta-selection' });
      return onSelected({ snapshot, binding, decoded, store, baseline, rows: page.rows,
        readIds: reading?.readIds ?? new Set(), reading: !!reading,
        next: page.position ? codec.advance(cursor, packed ? packDeltaPosition(page.position) : page.position, { uid: identity.uid, project: db.projectId, now: now() }) : null });
    }
    if (page.state !== 'preparing') {
      const hydrated = await store.hydratePortable(snapshot, page.rows.map(row => row.id), now(), { blocked: current.blocked });
      const selected = new Map(page.rows.map(row => [row.id, row]));
      // Never label a changed body with the old version's frozen read group.
      items = hydrated.items.filter(item => !reading || item.row.contentHash === selected.get(item.id).contentHash)
        .map(item => ({ id: item.id, distanceKm: distanceKm(snapshot.context.point, item.row.location), data: publicFeedBody(item.data),
          ...(reading ? { read: reading.readIds.has(item.id) } : {}) }));
      observeMetrics({ ...page.metrics, ...hydrated.metrics, ...reading?.metrics });
    }
    if (page.state === 'preparing') observeMetrics({ ...page.metrics, ...reading?.metrics });
    await generationState(binding.generation, binding.incarnation);
    // Recheck caller eligibility after network waits too; account deletion or
    // a ban during page assembly must not return newly selected full bodies.
    await requireEligibleActor({ request, db, now: new Date(now()) }); alive();
    const reply = { version: useCard ? 2 : 1, state: page.state === 'preparing' ? 'preparing' : 'ready', baseline,
      ...(reading ? { readOrdering: 'unread-first' } : {}),
      expiresAt: decoded.expiresAt, items,
      next: page.position ? codec.advance(cursor, packed ? packDeltaPosition(page.position) : page.position, { uid: identity.uid, project: db.projectId, now: now() }) : null };
    return !useCard && onLegacy ? onLegacy(reply, binding) : reply;
  } catch (error) { rethrowFeedError(error); }
}
