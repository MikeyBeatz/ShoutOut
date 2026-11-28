// Prepared B4b only. Host must opt in; no new collection, callable or timer.
import { createHmac } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { feedCursorCodec } from './feed_cursor.js';
import { FeedSessionExpired } from './feed_session_policy.js';
import { createFeedGenerationStore, feedRuntimeBlockCache } from './feed_runtime.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { distanceKm } from './feed_spatial.js';
import { scanFeedNews } from './feed_news_scan.js';
import { verifyNode } from './feed_block_index.js';
import { admitNewsRead, captureNewsSignals, newsControl } from './feed_news_signals.js';
import { measureNewsReads } from './feed_news_meter.js';
import { readPublicAuthorAvailability } from './public_author_availability.js';

const codecFor = key => feedCursorCodec({ key: createHmac('sha256', key).update('shoutout-b4-news-v1').digest() });
const stamp = value => [value.seconds, value.nanoseconds];
const after = (time, cutoff) => time.seconds > cutoff.seconds || time.seconds === cutoff.seconds && time.nanoseconds > cutoff.nanoseconds;
const abort = () => { throw new HttpsError('aborted', 'News changed during verification. Retry the same checkpoint.'); };
export function feedNewsBaseline({ key, uid, project, snapshot, binding, baseline, startedAt }) {
  return codecFor(key).start({ uid, project, readTime: snapshot.readTime, now: startedAt,
    context: { kind: 'feed-news-v1', snapshot, binding, baseline } });
}
export async function getFeedNewsOperation(request, db, { key, enabled = false, runtime = false, clock = () => new Date(), workNodes = 32, observeMetrics = () => {} } = {}) {
  const { uid } = requireCallableIdentity(request), input = request.data;
  if (!enabled) throw new HttpsError('failed-precondition', 'Feed news is not enabled.');
  assertFeedRuntimeTarget(db);
  if (!input || Object.keys(input).some(k => !['format', 'mode', 'expectedUserId', 'checkpoint'].includes(k)) ||
      input.format !== 'delta-v1' || !['news', 'news-signals'].includes(input.mode) || input.expectedUserId !== uid) throw new HttpsError('invalid-argument', 'Invalid news request.');
  const now = () => clock().getTime(), codec = codecFor(key), scope = () => ({ uid, project: db.projectId, now: now() });
  const decoded = codec.decode(input.checkpoint, scope()), base = decoded.context;
  const meter = runtime ? measureNewsReads(db) : null;
  if (meter) db = meter.db;
  if (base.kind !== 'feed-news-v1' || !base.snapshot || !base.binding || typeof base.baseline !== 'string') throw new HttpsError('invalid-argument', 'Invalid news checkpoint.');
  if (input.mode === 'news-signals' && !runtime) throw new HttpsError('failed-precondition', 'News signals are not enabled.');
  if (runtime) await admitNewsRead(request, db, base.binding, clock);
  const store = createFeedGenerationStore(db, base.binding.generation, { cardProjection: true, contentIdentity: true });
  async function guard(tx, current = null) {
    const control = validateFeedIndexControl((await tx.get(db.doc('feedIndexControl/current'))).data());
    const marker = await tx.get(store.base);
    if (runtime) await newsControl(tx, db, base.binding, { state: control, marker });
    if (!['active', 'building'].includes(control.mode) || control.cardReadGenerationId !== base.binding.generation ||
        !control.cardWriteGenerationIds?.includes(base.binding.generation) || marker.get('cardReady') !== true ||
        JSON.stringify(stamp(marker.createTime)) !== JSON.stringify(base.binding.incarnation)) throw new FeedSessionExpired();
    const roots = new Map(base.snapshot.roots.map(root => [root.path, root]));
    const retention = { ...base.snapshot.retention };
    for (const root of current?.roots ?? []) {
      if (roots.has(root.path) && retention[root.path] !== current.retention[root.path]) throw new FeedSessionExpired();
      roots.set(root.path, root); retention[root.path] = current.retention[root.path];
    }
    await store.readHeaderRows(tx, [], { marker, snapshot: { ...base.snapshot, roots: [...roots.values()], retention } });
    return marker;
  }
  if (input.mode === 'news-signals') {
    const signals = await captureNewsSignals(request, db, base, { clock, confirm: false });
    await db.runTransaction(async tx => { await requireEligibleActor({ request, db, reader: tx, now: new Date(now()) }); await guard(tx); }, { readOnly: true });
    codec.decode(input.checkpoint, scope());
    return { version: 1, state: 'signals', signals, readUnits: meter.reads };
  }
  await db.runTransaction(async tx => { await requireEligibleActor({ request, db, reader: tx, now: new Date(now()) }); await guard(tx); }, { readOnly: true });
  let current = decoded.position.current;
  if (!current) current = await store.capturePortable({ ...base.snapshot.context, uid, now: now(), unreadFirst: false });
  const captureTime = new Timestamp(current.readTime.seconds, current.readTime.nanoseconds);
  const eligible = (row, time = current.context.now) => row.status === 'active' && row.createdAt <= current.context.now && row.expiresAt > time &&
    (current.context.category === null || row.categories.includes(current.context.category)) &&
    (!row.businessSpotlight || row.businessHighlighted) && distanceKm(current.context.point, row.location) <= current.context.radiusKm;
  const ready = (count, validUntil, capped) => ({ version: 1, state: 'ready', baseline: base.baseline,
    checkpoint: codec.advance(input.checkpoint, {}, scope()), count, capped, checkedAt: Math.floor(captureTime.toMillis()),
    validForMillis: Math.max(0, Math.floor(validUntil - now())), ...(meter ? { readUnits: meter.reads } : {}) });
  const beforeHashes = new Map(base.snapshot.roots.map(root => [root.path, root.hash]));
  if (current.roots.length === beforeHashes.size && current.roots.every(root => beforeHashes.get(root.path) === root.hash)) {
    await db.runTransaction(async tx => { await requireEligibleActor({ request, db, reader: tx, now: new Date(now()) }); await guard(tx, current); }, { readOnly: true });
    codec.decode(input.checkpoint, scope()); observeMetrics({ nodeLoads: 0, skippedHashes: current.roots.length, metadataExamined: 0 });
    return ready(0, decoded.expiresAt, false);
  }
  const result = await db.runTransaction(async tx => {
    // Caller was checked immediately before capture and is checked again
    // before ANY reply, including continuation. Do not repeat a frozen account
    // read here or load private filters when all changed IDs are old.
    await guard(tx, current);
    return scanFeedNews({ before: base.snapshot.roots, current: current.roots, position: decoded.position.scan,
      budget: workNodes, eligible,
      load: async hash => (await feedRuntimeBlockCache.load(`${db.projectId}:${store.base.path}:${hash}`,
        async () => verifyNode(hash, (await tx.get(store.base.collection('nodes').doc(hash))).data(), { cardProjection: true }))).node,
      accept: async rows => {
        if (!rows.length) return [];
        const states = rows.length ? await tx.getAll(...rows.map(row => store.base.collection('publicStates').doc(row.id))) : [];
        const first = rows.filter((row, i) => states[i].exists && after(states[i].createTime, base.snapshot.readTime));
        if (!first.length) return [];
        const blocked = await tx.get(db.collection(`users/${uid}/blocked`).limit(200)), blockedIds = new Set(blocked.docs.map(doc => doc.id));
        const authors = [...new Set(first.map(row => row.authorId))];
        const { unavailable } = await readPublicAuthorAvailability(tx, db, authors);
        return first.filter(row => !blockedIds.has(row.authorId) && !unavailable.has(row.authorId));
      } });
  }, { readOnly: true, readTime: captureTime });
  observeMetrics(result.metrics);
  codec.decode(input.checkpoint, scope());
  if (result.state === 'preparing') {
    await db.runTransaction(async tx => { await requireEligibleActor({ request, db, reader: tx, now: new Date(now()) }); await guard(tx, current); }, { readOnly: true });
    return { version: 1, state: 'preparing', checkpoint: codec.advance(input.checkpoint, { current, scan: result.position }, scope()), ...(meter ? { readUnits: meter.reads } : {}) };
  }
  const verified = await db.runTransaction(async tx => {
    await requireEligibleActor({ request, db, reader: tx, now: new Date(now()) }); const marker = await guard(tx, current);
    const blocked = result.rows.length ? await tx.get(db.collection(`users/${uid}/blocked`).limit(200)) : null, blockedIds = new Set(blocked?.docs.map(doc => doc.id) ?? []);
    const headers = new Map(), budget = new Set();
    for (let offset = 0; offset < result.rows.length; offset += 50) {
      const rows = await store.readHeaderRows(tx, result.rows.slice(offset, offset + 50), { marker, fenceSnapshot: current, budget });
      for (const [id, row] of rows) headers.set(id, row);
    }
    const authors = [...new Set(result.rows.map(row => row.authorId))];
    const { unavailable } = await readPublicAuthorAvailability(tx, db, authors);
    const states = result.rows.length ? await tx.getAll(...result.rows.map(row => store.base.collection('publicStates').doc(row.id))) : [];
    result.rows.forEach((old, i) => {
      const row = headers.get(old.id);
      if (!row || row.selectionVersion !== old.selectionVersion || !eligible(row, now()) || blockedIds.has(row.authorId) || unavailable.has(row.authorId) ||
          !states[i].exists || !after(states[i].createTime, base.snapshot.readTime)) abort();
    });
    return { count: result.rows.length, validUntil: Math.min(decoded.expiresAt, ...result.rows.map(row => row.expiresAt)) };
  }, { readOnly: true });
  codec.decode(input.checkpoint, scope());
  if (verified.validUntil <= now()) abort();
  return ready(verified.count, verified.validUntil, result.capped);
}
