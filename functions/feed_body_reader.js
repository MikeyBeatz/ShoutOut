// Inactive B4 reader. Its binding/snapshot/selected rows are trusted host
// inputs, never accepted directly from callable request data. No live host
// imports this module. Read projections require complete atomic writer coverage.
import { Buffer } from 'node:buffer';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { assertIndexBinding } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { retentionCell } from './feed_account_retention_store.js';
import { generationContentIdentity } from './feed_generation_format.js';
import { feedReadClassifier } from './feed_read_snapshot.js';
import { feedSessionLifetimeMillis, FeedSessionExpired } from './feed_session_policy.js';
import { metadataOf } from './feed_block_index.js';
import { distanceKm } from './feed_spatial.js';
import { bodyDigest, canonicalBody, validateDescriptors } from './feed_body_contract.js';
import { feedBodyState, selectionIdentity, validateBodyReadState, publicBodyReadState } from './feed_body_state.js';
import { readPublicAuthorAvailability } from './public_author_availability.js';

const stale = () => { throw new FeedSessionExpired(); };
const copy = value => JSON.parse(JSON.stringify(value));
const bytes = value => Buffer.byteLength(canonicalBody(value));

function measuredDatabase(db, binding, metrics) {
  function note(result, refs) {
    metrics.sdkRequests++;
    const query = Array.isArray(result.docs), docs = query ? result.docs : Array.isArray(result) ? result : [result];
    if (query) { metrics.queries++; if (!docs.length) metrics.emptyQueries++; }
    for (let i = 0; i < Math.max(query ? 1 : 0, docs.length); i++) {
      const doc = docs[i], path = doc?.ref.path ?? refs[i]?.path ?? '';
      metrics.documentReads++;
      if (path.startsWith(binding.source.path + '/')) {
        metrics.sourceReads++;
        if (doc?.exists && !doc.get('contentPurged')) metrics.sourceJsonBytes += bytes(feedBodyState(doc.id, doc.data()));
      } else if (path.startsWith(binding.base.path + '/projection/')) {
        metrics.blockReads++; if (doc?.exists) metrics.projectionJsonBytes += bytes(doc.data());
      } else if (path.includes('/readBuckets/')) metrics.readStateReads++;
      else metrics.policyReads++;
    }
    return result;
  }
  function reader(target) {
    return new Proxy(target, { get(real, method) {
      if (method === 'getAll') return async (...refs) => note(await real.getAll(...refs), refs);
      if (method === 'get') return async ref => note(await real.get(ref), [ref]);
      if (['set', 'create', 'update', 'delete'].includes(method)) return () => { throw new Error('body-reader-is-read-only'); };
      return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
    } });
  }
  const direct = reader(db);
  return new Proxy(direct, { get(real, method) {
    if (method === 'runTransaction') return (operation, options) => {
      if (options?.readOnly !== true) throw new Error('body-reader-is-read-only');
      metrics.transactions++;
      if (options.readTime) metrics.classificationTransactions++; else metrics.finalTransactions++;
      return db.runTransaction(tx => { metrics.transactionAttempts++; return operation(reader(tx)); }, options);
    };
    return real[method];
  } });
}

export function consistentBodyReader(db, { binding, store, request, snapshot, session, codec,
  clock = () => Date.now(), maxReadBlockReads = 256 } = {}) {
  assertIndexBinding(db, binding);
  const uid = requireCallableIdentity(request).uid;
  if (request.data?.expectedUserId !== uid || snapshot?.project !== db.projectId || snapshot.namespace !== binding.namespace ||
      snapshot.context?.uid !== uid || !snapshot.retention || !Array.isArray(snapshot.roots) ||
      snapshot.roots.some(root => !/^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(root.path)) ||
      !Number.isSafeInteger(session?.startedAt) || !Number.isSafeInteger(session?.expiresAt) ||
      session.expiresAt - session.startedAt !== feedSessionLifetimeMillis ||
      !Array.isArray(session.incarnation) || session.incarnation.length !== 2 ||
      !session.incarnation.every(Number.isSafeInteger) ||
      store?.binding?.base.path !== binding.base.path || typeof store.readStates !== 'function' || typeof store.readBodies !== 'function' ||
      !codec || typeof clock !== 'function') throw new Error('invalid-body-read-host');
  // Freeze host inputs as well: a caller mutating a snapshot during an await
  // must not silently change the signed scope or the retained R5 versions.
  snapshot = copy(snapshot); session = copy(session);
  const c = snapshot.context;
  if (!c.point || !Number.isFinite(c.point.latitude) || Math.abs(c.point.latitude) > 90 ||
      !Number.isFinite(c.point.longitude) || Math.abs(c.point.longitude) > 180 || ![1, 3, 5, 10, 20, 50].includes(c.radiusKm) ||
      !['nearest', 'popular', 'endingSoon', 'followed'].includes(c.order) || !(c.category === null || typeof c.category === 'string') ||
      !Number.isSafeInteger(c.now) || typeof c.unreadFirst !== 'boolean') throw new Error('invalid-body-read-context');
  const scope = Object.freeze({ uid, project: db.projectId, generation: binding.namespace,
    incarnation: JSON.stringify(session.incarnation), context: bodyDigest(snapshot) });
  const metrics = {};
  const reset = () => { for (const name of ['documentReads', 'blockReads', 'sourceReads', 'policyReads', 'readStateReads', 'sdkRequests',
    'queries', 'emptyQueries', 'sourceJsonBytes', 'projectionJsonBytes', 'transactions', 'transactionAttempts',
    'classificationTransactions', 'finalTransactions']) metrics[name] = 0; };
  reset();
  const database = measuredDatabase(db, binding, metrics);
  function now() {
    const value = clock();
    if (!Number.isSafeInteger(value) || value < session.startedAt || value >= session.expiresAt) stale();
    return value;
  }
  function identity() {
    if (requireCallableIdentity(request).uid !== uid || request.data?.expectedUserId !== uid) throw new Error('body-read-account-changed');
  }
  async function admission() {
    identity(); await requireEligibleActor({ request, db: database, now: new Date(now()) }); identity(); now();
  }
  async function policy(tx, states) {
    identity();
    await requireEligibleActor({ request, db: database, reader: tx, now: new Date(now()) });
    const [controlDoc, marker] = await tx.getAll(database.doc('feedIndexControl/current'), binding.base);
    const control = validateFeedIndexControl(controlDoc.data());
    if (!['active', 'building'].includes(control.mode) || !control.readGenerationId || !control.writeGenerationIds.includes(binding.namespace) ||
        marker.get('v') !== 1 || marker.get('schemaVersion') !== 1 || marker.get('accountRetention') !== true ||
        !generationContentIdentity(marker.data()) || !marker.exists ||
        JSON.stringify([marker.createTime.seconds, marker.createTime.nanoseconds]) !== scope.incarnation) stale();
    const fences = snapshot.roots.length ? await tx.getAll(...snapshot.roots.map(root => binding.base.collection('cellRetention').doc(root.path))) : [];
    for (let i = 0; i < fences.length; i++) {
      const fence = retentionCell(fences[i].data());
      if (fence.phase === 'erasing' || fence.version !== snapshot.retention[snapshot.roots[i].path]) stale();
    }
    const blocked = await tx.get(database.collection(`users/${uid}/blocked`).limit(200));
    const blockedIds = new Set(blocked.docs.map(doc => doc.id));
    if ([...states.values()].some(state => blockedIds.has(state.authorId))) stale();
    const authors = [...new Set([...states.values()].map(state => state.authorId))];
    const { unavailable } = await readPublicAuthorAvailability(tx, database, authors);
    if (unavailable.size) stale();
  }
  function available(state) {
    const row = state.eligibility;
    return row.status === 'active' && row.createdAt <= c.now && row.expiresAt > now() &&
      (c.category === null || row.categories.includes(c.category)) && (!row.businessSpotlight || row.businessHighlighted) &&
      distanceKm(c.point, row.location) <= c.radiusKm;
  }
  async function finish(rows, missing, completing) {
    const ids = rows.map(row => row.id);
    if (ids.length > 50 || new Set(ids).size !== ids.length || !Array.isArray(missing) || missing.length > 50 ||
        new Set(missing).size !== missing.length || missing.some(id => !ids.includes(id))) throw new Error('invalid-body-missing');
    const result = await database.runTransaction(async tx => {
      const states = await store.readStates(tx, ids);
      for (const row of rows) {
        const state = states.get(row.id); if (!state) stale(); validateBodyReadState(row.id, state);
        if (!available(state) || state.selectionVersion !== row.selectionVersion ||
            c.unreadFirst && state.eligibility.contentHash !== row.frozenContentHash ||
            completing && state.bodyVersion !== row.bodyVersion) stale();
      }
      await policy(tx, states);
      const sources = missing.length ? await store.readBodies(tx, missing) : new Map();
      const bodies = missing.map(id => {
        if (!sources.has(id)) stale();
        const projection = feedBodyState(id, sources.get(id));
        if (canonicalBody(projection.state) !== canonicalBody(states.get(id))) throw new Error('body-projection-inconsistent');
        return { id, bodyVersion: projection.version, body: projection.body };
      });
      return { rows: rows.map(row => ({ ...row, bodyVersion: states.get(row.id).bodyVersion, state: publicBodyReadState(states.get(row.id)) })), bodies };
    }, { readOnly: true });
    // The transaction is the authorization/availability snapshot. Enforce
    // absolute deadlines after network return without another database round.
    identity(); now(); if (result.rows.some(row => row.state.expiresAt <= now())) stale();
    return { schema: 1, ...scope, unreadFirst: c.unreadFirst, expiresAt: session.expiresAt, ...result };
  }
  return { scope, metrics,
    async select(selectedRows, { cold = false } = {}) {
      reset(); await admission();
      const classifier = c.unreadFirst ? feedReadClassifier(database, uid, snapshot, { maxBlockReads: maxReadBlockReads }) : null;
      // Resolver is a trusted host's existing progressive selector, invoked
      // only after admission. Its immutable snapshot and work budget remain.
      const input = typeof selectedRows === 'function' ? await selectedRows({
        classifyRead: classifier?.classify, readIds: classifier?.readIds ?? new Set(), assertSessionAlive: now,
      }) : selectedRows;
      if (!Array.isArray(input) || input.length > 50 || new Set(input.map(row => row.id)).size !== input.length) {
        throw new Error('invalid-body-selection');
      }
      const selected = input.map(row => metadataOf(copy(row), { contentIdentity: true }));
      if (classifier) await classifier.classify(selected); now();
      const rows = selected.map(row => ({ id: row.id, read: classifier?.readIds.has(row.id) ?? false,
        frozenContentHash: row.contentHash, selectionVersion: selectionIdentity(row), distanceKm: distanceKm(c.point, row.location) }));
      const result = await finish(rows, cold ? rows.map(row => row.id) : [], false);
      validateDescriptors(result.rows, { unreadFirst: c.unreadFirst });
      const token = codec.encode({ ...scope, startedAt: session.startedAt, expiresAt: session.expiresAt,
        unreadFirst: c.unreadFirst, rows: result.rows });
      return { ...result, token };
    },
    async complete(token, missing) {
      reset(); await admission();
      const selected = codec.decode(token, scope, now());
      if (selected.startedAt !== session.startedAt || selected.expiresAt !== session.expiresAt || selected.unreadFirst !== c.unreadFirst ||
          selected.rows.some(row => !row.selectionVersion || !row.frozenContentHash)) throw new Error('invalid-body-read-proof');
      const result = await finish(selected.rows, missing, true);
      validateDescriptors(result.rows, { unreadFirst: c.unreadFirst });
      return { ...result, token };
    },
  };
}
