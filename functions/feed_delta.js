// Prepared B4 transport on the existing callable; activation remains off.
import { createHmac } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { getFeedPageOperation } from './get_feed_page.js';
import { feedCursorCodec, InvalidFeedCursor } from './feed_cursor.js';
import { FeedSessionExpired, feedSessionLifetimeMillis } from './feed_session_policy.js';
import { createFeedGenerationStore } from './feed_runtime.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { bodyProjection, bodyDigest } from './feed_body_contract.js';
import { publicCardState } from './feed_card_state.js';
import { distanceKm } from './feed_spatial.js';
import { readContentHash } from './read_content_identity.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { feedNewsBaseline, getFeedNewsOperation } from './feed_news.js';
import { captureNewsSignals } from './feed_news_signals.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const stamp = time => [time.seconds, time.nanoseconds];
const routeOf = row => ({ id: row.id, geohash: row.geohash, bodyVersion: row.bodyVersion,
  selectionVersion: row.selectionVersion, frozenContentHash: row.contentHash, read: row.read === true });
const minimalState = row => ({ schema: 1, bodyVersion: row.bodyVersion, authorId: row.authorId,
  status: row.status, expiresAt: row.expiresAt, createdAt: row.createdAt, likesCount: row.likesCount,
  dislikesCount: row.dislikesCount, selectionVersion: row.selectionVersion });
const scopedKey = (key, purpose) => createHmac('sha256', key).update(`shoutout-b4-${purpose}-v1`).digest();

// Old clients treat cursors as opaque. Previously issued V1 cursors keep their
// original reader; new V1 sessions can use the new generation with full bodies.
export async function getCompatibleFeedPageOperation(request, db, options) {
  const input = request.data;
  if (options.enabled && input && (!input.cursor || typeof input.cursor === 'string' && input.cursor.startsWith('d1:'))) {
    const data = { ...input, format: 'delta-v1', cold: true };
    if (input.cursor) data.cursor = input.cursor.slice(3);
    const result = await getFeedDeltaOperation({ ...request, data }, db, { ...options, preserveRetiredCursor: true });
    if (result.version === 1) return { ...result, next: result.next ? `d1:${result.next}` : null };
    return { version: 1, state: result.state, baseline: result.baseline, expiresAt: result.expiresAt,
      ...(result.readOrdering ? { readOrdering: result.readOrdering } : {}),
      next: result.next ? `d1:${result.next}` : null,
      items: result.bodyPage ? result.bodyPage.rows.map(row => ({ id: row.id, distanceKm: row.distanceKm, read: row.read,
        data: { ...result.bodyPage.bodies.find(body => body.id === row.id).body, ...row.state } })) : [] };
  }
  return getFeedPageOperation(request, db, options);
}

export async function getFeedDeltaOperation(request, db, { key, enabled = false, clock = () => new Date(),
  workNodes = 32, readOrdering = null, observeMetrics = () => {}, preserveRetiredCursor = false, newsEnabled = false, newsRuntimeEnabled = false,
  recenterEnabled = false } = {}) {
  const { uid } = requireCallableIdentity(request), input = request.data;
  if (!enabled) fail('failed-precondition', 'Delta feed is not enabled.');
  assertFeedRuntimeTarget(db);
  if (!input || input.format !== 'delta-v1' || input.expectedUserId !== uid) fail('invalid-argument', 'Invalid delta request.');
  const now = () => clock().getTime();
  const cursorKey = scopedKey(key, 'cursor'), bodyCodec = feedCursorCodec({ key: scopedKey(key, 'body') });
  const movementCodec = recenterEnabled ? feedCursorCodec({ key: scopedKey(key, 'movement') }) : null;
  const liveContext = (generation, incarnation, revision) => ({ project: db.projectId, uid, generation, incarnation: JSON.stringify(incarnation), mode: 'card-v1', revision });
  async function capability(tx, state = null) {
    state ??= validateFeedIndexControl((await tx.get(db.doc('feedIndexControl/current'))).data());
    if (!['active', 'building'].includes(state.mode) || !state.readGenerationId) throw new FeedSessionExpired();
    const marker = await tx.get(db.doc(`feedIndexGenerations/${state.readGenerationId}`));
    if (marker.get('schemaVersion') !== 1 || marker.get('accountRetention') !== true) throw new FeedSessionExpired();
    const card = marker.get('v') === 2;
    if (card && (state.cardReadGenerationId !== marker.id || marker.get('cardReady') !== true || marker.get('cardProjection') !== 1 ||
        marker.get('readIdentity') !== 1 || !state.cardWriteGenerationIds?.includes(marker.id)) || !card && marker.get('v') !== 1) throw new FeedSessionExpired();
    return { ...liveContext(marker.id, stamp(marker.createTime), state.revision), mode: card ? 'card-v1' : 'source-v1' };
  }
  const reset = value => ({ version: 2, state: 'reset', capability: value });
  const currentCapability = () => db.runTransaction(async tx => { await actor(tx); return capability(tx); }, { readOnly: true });
  async function generation(tx, binding = null, control = null) {
    control ??= validateFeedIndexControl((await tx.get(db.doc('feedIndexControl/current'))).data());
    const id = binding?.generation ?? control.cardReadGenerationId;
    if (control.schemaVersion !== 2 || !['active', 'building'].includes(control.mode) ||
        !id || !control.cardWriteGenerationIds.includes(id)) throw new FeedSessionExpired();
    const marker = await tx.get(db.doc(`feedIndexGenerations/${id}`));
    if (!marker.exists || marker.get('v') !== 2 || marker.get('schemaVersion') !== 1 || marker.get('cardProjection') !== 1 ||
        marker.get('accountRetention') !== true || marker.get('readIdentity') !== 1 || marker.get('cardReady') !== true ||
        binding && JSON.stringify(stamp(marker.createTime)) !== JSON.stringify(binding.incarnation)) throw new FeedSessionExpired();
    return { marker, control, binding: { generation: id, incarnation: stamp(marker.createTime), contentIdentity: true } };
  }
  async function actor(tx) { await requireEligibleActor({ request, db, reader: tx, now: new Date(now()) }); }
  async function policy(tx, rows) {
    const blocked = await tx.get(db.collection(`users/${uid}/blocked`).limit(200));
    const blockedIds = new Set(blocked.docs.map(doc => doc.id));
    const authors = [...new Set(rows.map(row => row.authorId))];
    const profiles = authors.length ? await tx.getAll(...authors.map(id => db.doc(`publicProfiles/${id}`))) : [];
    const erased = new Set(profiles.filter(doc => doc.get('accountStatus') === 'deleted').map(doc => doc.id));
    return row => !blockedIds.has(row.authorId) && !erased.has(row.authorId);
  }
  async function finish(context, missing, token = null) {
    const { snapshot, binding, rows, baseline } = context;
    if (!snapshot || !binding || !Array.isArray(rows) || rows.length > 50 || !Array.isArray(missing) || missing.length > 50 ||
        new Set(rows.map(row => row.id)).size !== rows.length || new Set(missing).size !== missing.length || missing.some(id => !rows.some(row => row.id === id))) fail('invalid-argument', 'Invalid completion.');
    const deadline = context.expiresAt;
    const alive = () => { if (!Number.isSafeInteger(deadline) || now() >= deadline) throw new FeedSessionExpired(); };
    alive();
    const result = await db.runTransaction(async tx => {
      await actor(tx); const current = await generation(tx, binding);
      if (!preserveRetiredCursor && current.control.cardReadGenerationId !== binding.generation) return { redirect: await capability(tx, current.control) };
      const store = createFeedGenerationStore(db, binding.generation, { cardProjection: true, contentIdentity: true });
      const headers = await store.readHeaderRows(tx, rows, { marker: current.marker, fenceSnapshot: snapshot });
      const allowed = await policy(tx, [...headers.values()]);
      const c = snapshot.context;
      const descriptors = rows.map(frozen => {
        const row = headers.get(frozen.id);
        if (!row || !allowed(row) || row.status !== 'active' || row.createdAt > c.now || row.expiresAt <= now() ||
            row.bodyVersion !== frozen.bodyVersion || row.selectionVersion !== frozen.selectionVersion ||
            context.reading && row.contentHash !== frozen.frozenContentHash) {
          throw new FeedSessionExpired();
        }
        if (distanceKm(c.point, row.location) > c.radiusKm ||
            !context.presentation && (c.category !== null && !row.categories.includes(c.category) || row.businessSpotlight && !row.businessHighlighted) ||
            context.presentation && !row.businessSpotlight) throw new FeedSessionExpired();
        return { id: row.id, bodyVersion: row.bodyVersion, selectionVersion: row.selectionVersion,
          frozenContentHash: frozen.frozenContentHash, read: frozen.read,
          distanceKm: distanceKm(c.point, row.location), state: minimalState(row) };
      });
      const sources = missing.length ? await tx.getAll(...missing.map(id => db.doc(`shouts/${id}`))) : [];
      const bodies = sources.map(doc => {
        const descriptor = descriptors.find(row => row.id === doc.id);
        if (!doc.exists || bodyProjection(doc.data()).version !== descriptor.bodyVersion ||
            readContentHash(doc.get('title'), doc.get('text')) !== descriptor.frozenContentHash) throw new FeedSessionExpired();
        descriptor.state = publicCardState(doc.id, doc.data());
        return { id: doc.id, bodyVersion: descriptor.bodyVersion, body: bodyProjection(doc.data()).body };
      });
      return { rows: descriptors, bodies, live: liveContext(binding.generation, binding.incarnation, current.control.revision) };
    }, { readOnly: true });
    alive();
    if (result.redirect) return result;
    if (result.rows.some(row => row.state.expiresAt <= now())) throw new FeedSessionExpired();
    const proof = token ?? bodyCodec.start({ uid, project: db.projectId, readTime: snapshot.readTime,
      context: { ...context, kind: 'complete' }, now: context.startedAt });
    let newsSignals = null;
    if (newsEnabled && newsRuntimeEnabled && !context.presentation) {
      try { newsSignals = await captureNewsSignals(request, db, context, { historical: true, clock }); }
      catch (error) {
        if (!['news-paused', 'news-off', 'invalid-news-control'].includes(error.details?.reason)) throw error;
      }
    }
    alive();
    return { schema: 1, project: db.projectId, uid, generation: binding.generation,
      incarnation: JSON.stringify(binding.incarnation), context: bodyDigest([baseline, snapshot]), expiresAt: deadline,
      token: proof, unreadFirst: context.reading === true, ...result,
      ...(movementCodec && !context.presentation ? { movementToken: movementCodec.start({ uid, project: db.projectId,
        readTime: snapshot.readTime, now: context.startedAt, context: { snapshot, binding, baseline,
          reading: context.reading, startedAt: context.startedAt, expiresAt: deadline, kind: 'movement' } }) } : {}),
      ...(newsSignals ? { newsSignals } : {}),
      ...(newsEnabled && (!newsRuntimeEnabled || newsSignals) && !context.presentation ? { newsCheckpoint: feedNewsBaseline({ key, uid, project: db.projectId,
        snapshot, binding, baseline, startedAt: context.startedAt }) } : {}) };
  }
  try {
    // Prepared only. No deployed host enables this option. Rebase is a child
    // of the original signed view, not a refresh or a new publication cutoff.
    if (input.mode === 'recenter') {
      if (!recenterEnabled) fail('failed-precondition', 'Feed movement is not enabled.');
      if (Object.keys(input).some(k => !['format', 'expectedUserId', 'mode', 'token', 'point', 'cold'].includes(k)) ||
          typeof input.cold !== 'boolean' || !input.point ||
          Object.keys(input.point).some(k => !['latitude', 'longitude'].includes(k)) ||
          !Number.isFinite(input.point.latitude) || Math.abs(input.point.latitude) > 90 ||
          !Number.isFinite(input.point.longitude) || Math.abs(input.point.longitude) > 180) fail('invalid-argument', 'Invalid feed movement.');
      const parent = movementCodec.decode(input.token, { uid, project: db.projectId, now: now() });
      const prior = parent.context;
      if (prior.kind !== 'movement' || !prior.snapshot || !prior.binding ||
          prior.startedAt !== parent.startedAt || prior.expiresAt !== parent.expiresAt) fail('invalid-argument', 'Invalid movement proof.');
      await db.runTransaction(async tx => {
        await actor(tx);
        const current = await generation(tx, prior.binding);
        if (current.control.cardReadGenerationId !== prior.binding.generation) throw new FeedSessionExpired();
        const store = createFeedGenerationStore(db, prior.binding.generation, { cardProjection: true, contentIdentity: true });
        // An R5 invalidation of the parent cannot be hidden by changing region.
        await store.readHeaderRows(tx, [], { marker: current.marker, fenceSnapshot: prior.snapshot });
      }, { readOnly: true });
      const store = createFeedGenerationStore(db, prior.binding.generation, { cardProjection: true, contentIdentity: true });
      const snapshot = await store.capturePortable({ ...prior.snapshot.context, point: input.point, now: now() },
        { readTime: new Timestamp(prior.snapshot.readTime.seconds, prior.snapshot.readTime.nanoseconds) });
      // Keep read groups frozen and exclude publications after the original
      // database readTime, including backdated source.createdAt values.
      if (prior.reading) Object.assign(snapshot.context, {
        readPolicy: prior.snapshot.context.readPolicy, readRevision: prior.snapshot.context.readRevision,
      });
      snapshot.context.geographyRevision = (prior.snapshot.context.geographyRevision ?? 0) + 1;
      const baseline = bodyDigest([prior.binding, snapshot]);
      const cursor = feedCursorCodec({ key: cursorKey }).start({ uid, project: db.projectId,
        readTime: snapshot.readTime, context: { snapshot, binding: prior.binding, baseline }, now: parent.startedAt });
      return await getFeedDeltaOperation({ ...request, data: { format: 'delta-v1', expectedUserId: uid, cursor, cold: input.cold } }, db,
        { key, enabled, clock, workNodes, readOrdering, observeMetrics, preserveRetiredCursor, newsEnabled, newsRuntimeEnabled, recenterEnabled });
    }
    if (['news', 'news-signals'].includes(input.mode)) return await getFeedNewsOperation(request, db, { key, enabled: newsEnabled, runtime: newsRuntimeEnabled, clock, workNodes, observeMetrics });
    if (input.mode === 'liveContext') {
      if (Object.keys(input).some(k => !['format', 'expectedUserId', 'mode'].includes(k))) fail('invalid-argument', 'Invalid live context.');
      return await currentCapability();
    }
    if (input.mode === 'complete') {
      if (Object.keys(input).some(k => !['format', 'expectedUserId', 'mode', 'token', 'missing'].includes(k))) fail('invalid-argument', 'Invalid completion.');
      const decoded = bodyCodec.decode(input.token, { uid, project: db.projectId, now: now() });
      if (decoded.context.kind !== 'complete') fail('invalid-argument', 'Invalid proof.');
      await requireEligibleActor({ request, db, now: new Date(now()) });
      const bodyPage = await finish(decoded.context, input.missing, input.token);
      return bodyPage.redirect ? reset(bodyPage.redirect) : { version: 2, bodyPage };
    }
    if (input.mode === 'presentation') {
      if (Object.keys(input).some(k => !['format', 'expectedUserId', 'mode', 'routes', 'point', 'cold'].includes(k)) ||
          typeof input.cold !== 'boolean' || !Array.isArray(input.routes) || input.routes.length > 50 ||
          new Set(input.routes.map(row => row?.id)).size !== input.routes.length || input.routes.some(row =>
            !row || Object.keys(row).some(k => !['id', 'geohash'].includes(k)) || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id) ||
            !/^[0123456789bcdefghjkmnpqrstuvwxyz]{7}$/.test(row.geohash)) ||
          !input.point || Object.keys(input.point).some(k => !['latitude', 'longitude'].includes(k)) ||
          !Number.isFinite(input.point.latitude) || Math.abs(input.point.latitude) > 90 ||
          !Number.isFinite(input.point.longitude) || Math.abs(input.point.longitude) > 180) fail('invalid-argument', 'Invalid presentation request.');
      const context = await db.runTransaction(async tx => {
        await actor(tx);
        const control = validateFeedIndexControl((await tx.get(db.doc('feedIndexControl/current'))).data());
        if (!control.cardReadGenerationId) return { redirect: await capability(tx, control) };
        const current = await generation(tx, null, control), capture = {};
        const store = createFeedGenerationStore(db, current.binding.generation, { cardProjection: true, contentIdentity: true });
        const headers = await store.readHeaderRows(tx, input.routes, { marker: current.marker, capture });
        const allowed = await policy(tx, [...headers.values()]), time = now();
        const selected = input.routes.map(route => headers.get(route.id)).filter(row => row && row.status === 'active' &&
          row.createdAt <= time && row.expiresAt > time && row.businessSpotlight && allowed(row) && distanceKm(input.point, row.location) <= 20);
        const snapshot = { v: 1, project: db.projectId, namespace: current.binding.generation,
          readTime: { seconds: current.marker.readTime.seconds, nanoseconds: current.marker.readTime.nanoseconds },
          ...capture, context: { uid, point: { ...input.point }, radiusKm: 20, now: time, order: 'presentation', category: null, unreadFirst: false } };
        const startedAt = Math.min(time, Math.floor(current.marker.readTime.toMillis()));
        return { snapshot, binding: current.binding, rows: selected.map(routeOf), reading: false, presentation: true,
          startedAt, expiresAt: startedAt + feedSessionLifetimeMillis, baseline: bodyDigest([current.binding, input.routes, input.point, time]) };
      }, { readOnly: true });
      if (context.redirect) return reset(context.redirect);
      const bodyPage = await finish(context, input.cold ? context.rows.map(row => row.id) : []);
      return bodyPage.redirect ? reset(bodyPage.redirect) : { version: 2, state: 'ready', baseline: context.baseline, expiresAt: context.expiresAt, next: null, bodyPage };
    }
    if (input.mode !== undefined || Object.keys(input).some(k => !['format', 'expectedUserId', 'context', 'cursor', 'cold'].includes(k)) ||
        typeof input.cold !== 'boolean') fail('invalid-argument', 'Invalid delta request.');
    const data = { expectedUserId: uid, ...(input.cursor ? { cursor: input.cursor } : { context: input.context }) };
    return await getFeedPageOperation({ ...request, data }, db, { key: cursorKey, clock, workNodes, readOrdering,
      compatibleGenerations: true, cardProjection: 'generation', observeMetrics,
      onLegacy: async (reply, binding) => {
        if (!preserveRetiredCursor && binding.currentReader !== binding.generation) return reset(await currentCapability());
        return { ...reply, capability: { ...liveContext(binding.generation, binding.incarnation, binding.controlRevision), mode: 'source-v1' } };
      },
      onSelected: async ({ snapshot, binding, decoded, rows, baseline, reading, readIds, next }) => {
        const selected = rows.map(row => routeOf({ ...row, read: reading && readIds.has(row.id) }));
        const context = { snapshot, binding, rows: selected, baseline, reading,
          startedAt: decoded.startedAt, expiresAt: decoded.expiresAt };
        const bodyPage = await finish(context, input.cold ? selected.map(row => row.id) : []);
        if (bodyPage.redirect) return reset(bodyPage.redirect);
        return { version: 2, state: 'ready', baseline, expiresAt: decoded.expiresAt, next,
          ...(reading ? { readOrdering: 'unread-first' } : {}),
          ...(bodyPage.newsCheckpoint ? { newsCheckpoint: bodyPage.newsCheckpoint } : {}),
          bodyPage };
      } });
  } catch (error) {
    if (error instanceof FeedSessionExpired) throw new HttpsError('failed-precondition', 'Refresh the feed.', { reason: 'feed-session-expired' });
    if (error instanceof InvalidFeedCursor) fail('invalid-argument', 'Invalid delta proof.');
    throw error;
  }
}
