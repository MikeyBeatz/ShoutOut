// Emulator-only adapter. Deliberately cannot run against DEV or production.
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { randomUUID, createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { sessionDeadline } from './feed_session_policy.js';
import { beginIndexGcLab } from './feed_index_gc_lab.js';
import { portableIndexPage } from './feed_portable_selection.js';
import { canonical, clone, encodedBytes, metadataOf, lowRated, treeBuilder, verifyNode } from './feed_block_index.js';
import { distanceKm, geohashBounds, FeedMinHeap } from './feed_spatial.js';

const tupleCompare = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };

export function blockCache({ maxBytes = 4194304, maxEntries = 1024 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error('invalid-cache-config');
  const entries = new Map(), flights = new Map(), invalidated = new Set();
  let bytes = 0;
  return {
    get size() { return entries.size; }, get bytes() { return bytes; },
    get prefetchWidth() { return Math.max(1, Math.min(8, maxEntries, Math.floor(maxBytes / 65536))); },
    contains(key) { return entries.has(key) || flights.has(key); },
    clear() { entries.clear(); bytes = 0; },
    invalidate(key) {
      if (entries.has(key)) { bytes -= entries.get(key).bytes; entries.delete(key); }
      if (flights.has(key)) invalidated.add(flights.get(key));
    },
    async load(key, fetcher) {
      if (entries.has(key)) {
        const entry = entries.get(key); entries.delete(key); entries.set(key, entry);
        return { node: entry.node, hit: true, bytes: entry.bytes };
      }
      if (flights.has(key)) return { ...await flights.get(key), hit: true };
      const flight = (async () => {
        const node = frozen(await fetcher()), size = encodedBytes(node);
        if (size <= maxBytes && !invalidated.has(flight)) {
          while (entries.size >= maxEntries || bytes + size > maxBytes) {
            const oldest = entries.keys().next().value;
            bytes -= entries.get(oldest).bytes; entries.delete(oldest);
          }
          entries.set(key, { node, bytes: size }); bytes += size;
        }
        return { node, hit: false, bytes: size };
      })();
      flights.set(key, flight);
      try { return await flight; } finally { flights.delete(key); invalidated.delete(flight); }
    },
  };
}

// A four-character geohash has 10 latitude and 10 longitude bits. A numeric
// directory avoids prefix-boundary/pole gaps and needs at most two queries.
export function cellGrid(cell) {
  if (!/^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(cell)) throw new Error('invalid-index-cell');
  const bounds = geohashBounds(cell);
  return { latCell: Math.floor((bounds.latitude[0] + 90) / 180 * 1024),
    lonCell: Math.floor((bounds.longitude[0] + 180) / 360 * 1024) };
}
export function directoryWindows(point, radiusKm) {
  const radians = value => value * Math.PI / 180, degrees = value => value * 180 / Math.PI;
  const angle = Math.min(Math.PI, radiusKm / 6371), lat = radians(point.latitude);
  const south = Math.max(-90, point.latitude - degrees(angle));
  const north = Math.min(90, point.latitude + degrees(angle));
  const index = (value, start, span) => Math.max(0, Math.min(1023, Math.floor((value - start) / span * 1024)));
  const latStart = index(south, -90, 180), latEnd = index(north, -90, 180);
  let ranges;
  if (angle >= Math.PI / 2 - Math.abs(lat)) ranges = [[-180, 180]];
  else {
    const delta = degrees(Math.asin(Math.min(1, Math.sin(angle) / Math.cos(lat))));
    const west = point.longitude - delta, east = point.longitude + delta;
    ranges = west < -180 ? [[west + 360, 180], [-180, east]] :
      east > 180 ? [[west, 180], [-180, east - 360]] : [[west, east]];
  }
  return ranges.map(([west, east]) => ({ latStart, latEnd,
    lonStart: index(west, -180, 360), lonEnd: index(east, -180, 360) }));
}

function directoryEntry(cell, data) {
  const grid = cellGrid(cell);
  if (!data || data.v !== 1 || !/^[a-f0-9]{64}$/.test(data.hash) || !Number.isSafeInteger(data.revision) ||
    data.revision < 1 || !Number.isFinite(data.minExpiry) || grid.latCell !== data.latCell || grid.lonCell !== data.lonCell) throw new Error('invalid-index-directory');
  return data;
}

function minimumDistance(point, box) {
  const radians = value => value * Math.PI / 180;
  let delta = Infinity;
  for (const lon of [point.longitude - 360, point.longitude, point.longitude + 360]) {
    delta = Math.min(delta, Math.max(box.west - lon, 0, lon - box.east));
  }
  const a = Math.sin(radians(point.latitude)), b = Math.cos(radians(point.latitude)) * Math.cos(radians(delta));
  const south = radians(box.south), north = radians(box.north), optimum = Math.atan2(a, b);
  const candidates = [south, north];
  if (optimum >= south && optimum <= north) candidates.push(optimum);
  const dot = Math.max(...candidates.map(lat => a * Math.sin(lat) + b * Math.cos(lat)));
  return Math.max(0, 6371 * Math.acos(Math.max(-1, Math.min(1, dot))) - .0001);
}

function context(input) {
  const c = { order: 'nearest', unreadFirst: false, lowRatedLast: true,
    readIds: [], blocked: [], followed: [], category: null, ...input };
  // Product decision: rating changes position only in Top; other modes retain
  // geographic/time/followed order and use a collapsed card for negative content.
  c.lowRatedLast = c.order === 'popular';
  if (!c.point || !Number.isFinite(c.point.latitude) || Math.abs(c.point.latitude) > 90 ||
    !Number.isFinite(c.point.longitude) || Math.abs(c.point.longitude) > 180 ||
    !Number.isFinite(c.radiusKm) || c.radiusKm <= 0 || !Number.isSafeInteger(c.now) ||
    !['nearest', 'popular', 'endingSoon', 'followed'].includes(c.order)) throw new Error('invalid-index-context');
  return { ...c, point: { ...c.point }, readIds: new Set(c.readIds), blocked: new Set(c.blocked), followed: new Set(c.followed) };
}
function available(row, c, now = c.now) {
  return row.status === 'active' && row.createdAt <= c.now && row.expiresAt > now &&
    !c.blocked.has(row.authorId) && (c.category === null || row.categories.includes(c.category)) &&
    (!row.businessSpotlight || row.businessHighlighted) && distanceKm(c.point, row.location) <= c.radiusKm;
}
function rowKey(row, c) {
  return [c.lowRatedLast && lowRated(row) ? 1 : 0,
    c.order === 'nearest' && c.unreadFirst && c.readIds.has(row.id) ? 1 : 0,
    c.order === 'followed' && !c.followed.has(row.authorId) ? 1 : 0,
    c.order === 'popular' ? -row.likesCount : c.order === 'endingSoon' ? row.expiresAt : distanceKm(c.point, row.location),
    -row.createdAt, row.id];
}
function nodeKey(summary, c) {
  if (!summary) return [-1, -1, -1, -Infinity, -Infinity, ''];
  return [c.lowRatedLast && !summary.normal ? 1 : 0, 0,
    c.order === 'followed' && !c.followed.size ? 1 : 0,
    c.order === 'popular' ? -summary.maxLikes : c.order === 'endingSoon' ? summary.minExpiry : minimumDistance(c.point, summary),
    -summary.maxCreated, summary.minId];
}

export function createLabBlockIndex(db, { namespace, cache = blockCache(), elapsedClock = () => performance.now(), ...blockOptions }) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('index-lab-emulator-only');
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(namespace)) throw new Error('invalid-index-namespace');
  const base = db.collection('feedIndexLab').doc(namespace);
  const cells = base.collection('cells'), nodes = base.collection('nodes'), source = base.collection('source');
  const reconcile = Symbol('reconcile-current-source');
  const views = new WeakMap();
  let queuedReads = [], flushScheduled = false;
  const assertId = id => { if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('invalid-index-id'); };
  function fetchBlock(key, metrics) {
    return new Promise((resolve, reject) => {
      queuedReads.push({ key, metrics, resolve, reject });
      if (flushScheduled) return;
      flushScheduled = true;
      Promise.resolve().then(async () => {
        const work = queuedReads; queuedReads = []; flushScheduled = false;
        for (let start = 0; start < work.length; start += 32) {
          const batch = work.slice(start, start + 32);
          batch[0].metrics.nodeFetchRequests++;
          try {
            const docs = await db.getAll(...batch.map(job => nodes.doc(job.key)));
            batch.forEach((job, i) => {
              try { job.resolve(verifyNode(job.key, docs[i].data())); } catch (error) { job.reject(error); }
            });
          } catch (error) { batch.forEach(job => job.reject(error)); }
        }
      });
    });
  }
  const cacheKey = key => `${db.projectId}:${namespace}:${key}`;
  async function loadBlock(key, metrics) {
    const result = await cache.load(cacheKey(key), async () => {
      metrics.nodeReads++;
      return fetchBlock(key, metrics);
    });
    if (result.hit) metrics.cacheHits++; else metrics.nodeBytes += result.bytes;
    return result.node;
  }

  async function seed(input) {
    const rows = input.map(metadataOf);
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('duplicate-index-id');
    const builder = treeBuilder(blockOptions), regions = new Map();
    for (const row of rows.filter(row => row.status === 'active')) {
      const cell = row.geohash.slice(0, 4);
      if (!regions.has(cell)) regions.set(cell, []);
      regions.get(cell).push(row);
    }
    const roots = [...regions].map(([cell, entries]) => [cell, builder.build(entries, cell)]);
    const writes = rows.length + builder.writes.size + roots.length + 1;
    if (writes > 450) throw new Error('lab-seed-too-large');
    await db.runTransaction(async tx => {
      if ((await tx.get(base)).exists) throw new Error('index-already-seeded');
      tx.create(base, { v: 1, prunedThrough: -1 });
      for (const row of rows) tx.create(source.doc(row.id), row);
      for (const [key, node] of builder.writes) tx.set(nodes.doc(key), node);
      for (const [cell, descriptor] of roots) tx.create(cells.doc(cell), { v: 1, hash: descriptor.hash, minExpiry: descriptor.minExpiry, revision: 1, ...cellGrid(cell) });
    });
    return { sourceWrites: rows.length, nodeWrites: builder.writes.size, directoryWrites: roots.length, guardWrites: 1 };
  }

  // Read-only planning inside the caller's existing transaction. No nested
  // transaction and no source write: production operations retain full bodies.
  async function prepare(tx, id, beforeValue, afterValue, { operationId = randomUUID(), reconcileExpired = false } = {}) {
    assertId(id); assertId(operationId);
    const old = beforeValue === null ? null : metadataOf({ ...beforeValue, id });
    const next = afterValue === null ? null : metadataOf({ ...afterValue, id });
    let reads = 1;
    const marker = await tx.get(base);
    if (!marker.exists || marker.data().v !== 1) throw new Error('index-not-seeded');
    const sourceChanged = canonical(old) !== canonical(next);
    if (!sourceChanged && !reconcileExpired) return {
      reads, sourceChanged, nodeWrites: 0, directoryWrites: 0, historyWrites: 0, apply() {},
    };
    const retirement = operationId;
    const cutoff = marker.data().prunedThrough ?? -1;
    let oldIndex = old?.status === 'active' ? old : null;
    const newIndex = next?.status === 'active' && next.expiresAt > cutoff ? next : null;
    const regionIds = [...new Set([oldIndex, newIndex].filter(Boolean).map(row => row.geohash.slice(0, 4)))];
    const roots = new Map();
    for (const cell of regionIds) {
      const doc = await tx.get(cells.doc(cell)); reads++;
      roots.set(cell, doc.exists ? directoryEntry(cell, doc.data()) : null);
    }
    const builder = treeBuilder(blockOptions), loaded = new Map();
    const load = async key => {
      if (!loaded.has(key)) {
        const doc = await tx.get(nodes.doc(key)); reads++;
        loaded.set(key, verifyNode(key, doc.data()));
      }
      return loaded.get(key);
    };
    const updates = new Map();
    if (oldIndex && oldIndex.expiresAt <= cutoff) {
      const root = roots.get(oldIndex.geohash.slice(0, 4));
      if (!await builder.find(root ? { hash: root.hash } : null, oldIndex, load)) oldIndex = null;
    }
    for (const cell of regionIds) {
      const originalRoot = roots.get(cell);
      if (!oldIndex?.geohash.startsWith(cell) && !newIndex?.geohash.startsWith(cell)) continue;
      const descriptor = await builder.edit(originalRoot ? { hash: originalRoot.hash } : null, cell,
        oldIndex?.geohash.startsWith(cell) ? oldIndex : null, newIndex?.geohash.startsWith(cell) ? newIndex : null, load);
      if (descriptor?.hash !== originalRoot?.hash) updates.set(cell, descriptor);
    }
    const reachable = builder.reachable([...updates.values()].filter(Boolean));
    for (const key of [...reachable.keys()]) if (loaded.has(key)) reachable.delete(key);
    const historyWrites = [...updates.keys()].filter(cell => roots.get(cell)).length;
    if (reachable.size + updates.size + historyWrites + Number(sourceChanged) > 450) throw new Error('lab-mutation-too-large');
    let applied = false;
    return { reads, sourceChanged, nodeWrites: reachable.size, directoryWrites: updates.size, historyWrites,
      apply() {
        if (applied) throw new Error('index-plan-already-applied');
        applied = true;
        for (const [key, node] of reachable) tx.set(nodes.doc(key), node);
        for (const [cell, descriptor] of updates) {
          if (roots.get(cell)) tx.create(base.collection('retiredRoots').doc(`${cell}-${retirement}`), {
            v: 1, cell, hash: roots.get(cell).hash, retiredAt: FieldValue.serverTimestamp(),
          });
          if (!descriptor) tx.delete(cells.doc(cell));
          else tx.set(cells.doc(cell), { v: 1, hash: descriptor.hash, minExpiry: descriptor.minExpiry, revision: (roots.get(cell)?.revision ?? 0) + 1, ...cellGrid(cell) });
        }
      },
    };
  }

  async function mutate(id, value, { beforeCommit } = {}) {
    assertId(id);
    const requested = value === reconcile || value === null ? null : metadataOf(value);
    if (requested && requested.id !== id) throw new Error('invalid-index-id');
    const operationId = randomUUID();
    let attempts = 0, reads = 0;
    const committed = await db.runTransaction(async tx => {
      attempts++;
      const original = await tx.get(source.doc(id)); reads++;
      const old = original.exists ? metadataOf({ ...original.data(), id }) : null;
      const next = value === reconcile ? old : requested;
      const plan = await prepare(tx, id, old, next, { operationId, reconcileExpired: value === reconcile });
      reads += plan.reads;
      if (plan.sourceChanged) { if (next) tx.set(source.doc(id), next); else tx.delete(source.doc(id)); }
      plan.apply();
      if (beforeCommit) await beforeCommit();
      return { sourceWrites: Number(plan.sourceChanged), nodeWrites: plan.nodeWrites,
        directoryWrites: plan.directoryWrites, historyWrites: plan.historyWrites };
    });
    return { ...committed, reads, attempts };
  }

  async function open(input) {
    const alive = sessionDeadline(elapsedClock);
    const c = context(input), ranges = directoryWindows(c.point, c.radiusKm);
    const metrics = { rootQueries: 0, rootDocuments: 0, emptyRootQueries: 0, nodeReads: 0, nodeFetchRequests: 0, nodeBytes: 0, cacheHits: 0, metadataExamined: 0 };
    let readTime;
    const roots = await db.runTransaction(async tx => {
      const result = new Map();
      for (const window of ranges) {
        metrics.rootQueries++;
        const snapshot = await tx.get(cells.where('latCell', '>=', window.latStart).where('latCell', '<=', window.latEnd)
          .where('lonCell', '>=', window.lonStart).where('lonCell', '<=', window.lonEnd)
          .orderBy('latCell').orderBy('lonCell'));
        readTime = snapshot.readTime;
        metrics.rootDocuments += snapshot.size;
        if (snapshot.empty) metrics.emptyRootQueries++;
        for (const doc of snapshot.docs) {
          const data = directoryEntry(doc.id, doc.data());
          result.set(doc.id, data.hash);
        }
      }
      return [...result].map(([path, key]) => ({ hash: key, path, summary: null }));
    }, { readOnly: true });
    alive();
    const frontier = new FeedMinHeap((a, b) => tupleCompare(a.key, b.key));
    const candidates = new FeedMinHeap((a, b) => tupleCompare(a.key, b.key)), seen = new Set();
    for (const node of roots) frontier.push({ ...node, exact: false, key: nodeKey(null, c) });
    const pages = new WeakMap();
    const issue = () => { const token = Object.freeze({}); pages.set(token, { rows: [], result: null, flight: null }); return token; };
    const first = issue();
    let active = first;
    async function advance(token, work) {
      const page = pages.get(token);
      let processed = 0;
      const initialReads = metrics.nodeReads;
      while (page.rows.length < 50) {
        if (candidates.peek() && (!frontier.peek() || tupleCompare(candidates.peek().key, frontier.peek().key) < 0)) {
          page.rows.push(candidates.pop().row); continue;
        }
        if (!frontier.peek()) break;
        if (processed >= work.nodes) return { state: 'preparing', rows: [], next: token, metrics: { ...metrics } };
        const item = frontier.peek(); processed++;
        let remainingReads = work.nodes - (metrics.nodeReads - initialReads);
        const batch = [];
        const planned = cache.contains(cacheKey(item.hash)) ? [item] : [...frontier.items].sort((a, b) => tupleCompare(a.key, b.key));
        for (const candidate of planned) {
          if (batch.length >= Math.min(cache.prefetchWidth, work.nodes - processed + 1)) break;
          const miss = !cache.contains(cacheKey(candidate.hash));
          if (miss && remainingReads <= 0) break;
          if (miss) remainingReads--;
          batch.push(candidate);
        }
        if (!batch.length) return { state: 'preparing', rows: [], next: token, metrics: { ...metrics } };
        let node;
        try { [node] = await Promise.all(batch.map(candidate => loadBlock(candidate.hash, metrics))); }
        catch (error) { alive(); throw error; }
        alive();
        if ((item.exact ? node.path !== item.path : !node.path.startsWith(item.path)) ||
          (item.summary && canonical(node.summary) !== canonical(item.summary))) throw new Error('index-descriptor-mismatch');
        frontier.pop();
        if (node.kind === 'branch') {
          for (const [key, descriptor] of Object.entries(node.children)) {
            if (minimumDistance(c.point, descriptor) <= c.radiusKm) {
              if (!descriptor.path.startsWith(node.path + key)) throw new Error('index-descriptor-mismatch');
              const summary = { ...descriptor }; delete summary.hash; delete summary.path;
              frontier.push({ hash: descriptor.hash, path: descriptor.path, exact: true, summary, key: nodeKey(descriptor, c) });
            }
          }
        } else {
          metrics.metadataExamined += node.rows.length;
          for (const row of node.rows) {
            if (!seen.has(row.id) && available(row, c)) { seen.add(row.id); candidates.push({ row, key: rowKey(row, c) }); }
          }
        }
      }
      const next = frontier.peek() || candidates.peek() ? issue() : null;
      alive();
      page.result = { state: next ? 'continuation' : 'end', rows: clone(page.rows), next, metrics: { ...metrics } };
      active = next;
      return { ...page.result, rows: clone(page.result.rows) };
    }
    const view = {
      first,
      page(token, work = { nodes: 32 }) {
        try { alive(); } catch (error) { return Promise.reject(error); }
        if (!pages.has(token) || (!pages.get(token).result && token !== active)) return Promise.reject(new Error('invalid-index-cursor'));
        if (!work || !Number.isInteger(work.nodes) || work.nodes < 1) return Promise.reject(new Error('invalid-index-work'));
        const page = pages.get(token);
        if (page.result) return Promise.resolve({ ...page.result, rows: clone(page.result.rows) });
        if (!page.flight) page.flight = advance(token, work).finally(() => { page.flight = null; });
        return page.flight;
      },
    };
    views.set(view, { context: c, roots, alive, readTime });
    return view;
  }

  async function hydrate(view, ids, now) {
    const c = views.get(view)?.context;
    if (!c || !Number.isSafeInteger(now) || now < c.now || !Array.isArray(ids) || ids.length > 50 || new Set(ids).size !== ids.length) throw new Error('invalid-index-hydration');
    ids.forEach(assertId);
    const docs = ids.length ? await db.getAll(...ids.map(id => source.doc(id))) : [];
    return { sourceReads: docs.length, items: docs.map(doc => {
      const row = doc.exists ? metadataOf({ ...doc.data(), id: doc.id }) : null;
      return row && available(row, c, now) ? { id: doc.id, available: true, row } : { id: doc.id, available: false };
    }) };
  }

  async function indexChanges(beforeView, afterView) {
    const before = views.get(beforeView), after = views.get(afterView);
    const identity = c => [c.uid ?? null, c.point, c.radiusKm, c.order, c.lowRatedLast,
      c.category, [...c.blocked].sort(), [...c.followed].sort()];
    if (!before || !after || after.context.now < before.context.now ||
        canonical(identity(before.context)) !== canonical(identity(after.context))) throw new Error('incompatible-index-views');
    before.alive(); after.alive();
    const oldRoots = new Map(before.roots.map(root => [root.path, root.hash]));
    const newRoots = new Map(after.roots.map(root => [root.path, root.hash]));
    const oldRows = new Map(), newRows = new Map();
    const metrics = { nodeReads: 0, nodeFetchRequests: 0, nodeBytes: 0, cacheHits: 0, metadataExamined: 0 };
    async function collect(key, output) {
      if (!key) return;
      const node = await loadBlock(key, metrics);
      if (node.kind === 'branch') {
        for (const child of Object.values(node.children)) await collect(child.hash, output);
      } else {
        metrics.metadataExamined += node.rows.length;
        for (const row of node.rows) output.set(row.id, row);
      }
    }
    async function compare(oldKey, newKey) {
      if (oldKey === newKey) return;
      if (!oldKey || !newKey) { await collect(oldKey, oldRows); await collect(newKey, newRows); return; }
      const old = await loadBlock(oldKey, metrics), next = await loadBlock(newKey, metrics);
      if (old.kind === 'branch' && next.kind === 'branch' && old.path === next.path) {
        for (const part of new Set([...Object.keys(old.children), ...Object.keys(next.children)])) {
          await compare(old.children[part]?.hash, next.children[part]?.hash);
        }
      } else { await collect(oldKey, oldRows); await collect(newKey, newRows); }
    }
    for (const cell of new Set([...oldRoots.keys(), ...newRoots.keys()])) await compare(oldRoots.get(cell), newRoots.get(cell));
    const added = [], removed = [], updated = [];
    for (const [id, row] of oldRows) {
      if (!newRows.has(id)) removed.push(row);
      else if (canonical(row) !== canonical(newRows.get(id))) updated.push({ before: row, after: newRows.get(id) });
    }
    for (const [id, row] of newRows) if (!oldRows.has(id)) added.push(row);
    // Raw index delta, not the UI novelty count. Expiry/access changes require
    // availability checks even when immutable index hashes do not change.
    before.alive(); after.alive();
    return clone({ added, removed, updated, metrics });
  }

  async function beginExpiryPrune(cell, now) {
    cellGrid(cell);
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('invalid-prune-time');
    const alive = sessionDeadline(elapsedClock);
    const root = await db.runTransaction(async tx => {
      const [marker, header] = await tx.getAll(base, cells.doc(cell));
      if (!marker.exists || marker.data().v !== 1) throw new Error('index-not-seeded');
      if (now > (marker.data().prunedThrough ?? -1)) tx.update(base, { prunedThrough: now });
      return header.exists ? directoryEntry(cell, header.data()).hash : null;
    });
    const queue = root ? [root] : [], pending = [];
    const metrics = { nodeReads: 0, nodeFetchRequests: 0, nodeBytes: 0, cacheHits: 0,
      reconciled: 0, sourceWrites: 0, nodeWrites: 0, directoryWrites: 0, historyWrites: 0 };
    let flight = null, cancelled = false;
    async function step(work, hooks) {
      alive();
      let processed = 0, entries = 0;
      while (!cancelled && (pending.length || queue.length)) {
        alive();
        if (pending.length) {
          if (entries >= work.entries) break;
          const id = pending[0];
          if (hooks.beforeReconcile) await hooks.beforeReconcile(id);
          alive();
          const result = await mutate(id, reconcile);
          pending.shift(); entries++; metrics.reconciled++;
          for (const key of ['sourceWrites', 'nodeWrites', 'directoryWrites', 'historyWrites']) metrics[key] += result[key];
        } else {
          if (processed >= work.nodes) break;
          const node = await loadBlock(queue[0], metrics);
          alive(); queue.shift(); processed++;
          if (node.summary.minExpiry > now) continue;
          if (node.kind === 'branch') {
            for (const child of Object.values(node.children)) if (child.minExpiry <= now) queue.push(child.hash);
          } else pending.push(...node.rows.filter(row => row.expiresAt <= now).map(row => row.id));
        }
      }
      return { state: cancelled ? 'cancelled' : pending.length || queue.length ? 'preparing' : 'done', metrics: { ...metrics } };
    }
    return {
      cancel() { cancelled = true; },
      step(work = { nodes: 32, entries: 16 }, hooks = {}) {
        if (!Number.isInteger(work.nodes) || work.nodes < 1 || !Number.isInteger(work.entries) || work.entries < 1) return Promise.reject(new Error('invalid-prune-work'));
        if (!flight) flight = step(work, hooks).finally(() => { flight = null; });
        return flight;
      },
    };
  }

  const readDigest = ids => createHash('sha256').update(canonical([...new Set(ids)].sort())).digest('hex');
  async function capturePortable(input, { readIdsAt } = {}) {
    if (typeof input.uid !== 'string' || !input.uid.length) throw new Error('invalid-portable-context');
    const view = await open(input), captured = views.get(view), c = captured.context;
    const readIds = readIdsAt ? await readIdsAt(captured.readTime) : c.readIds;
    captured.alive();
    return clone({ v: 1, project: db.projectId, namespace, roots: captured.roots,
      readTime: { seconds: captured.readTime.seconds, nanoseconds: captured.readTime.nanoseconds },
      context: { uid: c.uid, point: c.point, radiusKm: c.radiusKm, now: c.now, order: c.order,
        unreadFirst: c.unreadFirst, blocked: [...c.blocked], followed: [...c.followed], category: c.category,
        readDigest: readDigest(readIds) } });
  }
  async function portablePage(snapshot, position, { uid, readIds = [], assertSessionAlive, nodes: workNodes = 32 } = {}) {
    if (snapshot?.v !== 1 || snapshot.project !== db.projectId || snapshot.namespace !== namespace ||
        uid !== snapshot.context?.uid || readDigest(readIds) !== snapshot.context?.readDigest) throw new Error('incompatible-portable-context');
    const c = context({ ...snapshot.context, readIds });
    const metrics = { nodeReads: 0, nodeFetchRequests: 0, nodeBytes: 0, cacheHits: 0 };
    const result = await portableIndexPage({ roots: snapshot.roots, position,
      readNode: key => loadBlock(key, metrics), eligible: row => available(row, c),
      mayContainRows: summary => minimumDistance(c.point, summary) <= c.radiusKm,
      rowKey: row => rowKey(row, c), nodeKey: summary => nodeKey(summary, c), assertSessionAlive }, { nodes: workNodes });
    return { ...result, metrics: { ...result.metrics, ...metrics } };
  }

  return { seed, mutate, prepare, open, hydrate, indexChanges, cache, base, beginExpiryPrune, capturePortable, portablePage,
    async expiredCells(now, limit = 32) {
      if (!Number.isSafeInteger(now) || now < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid-prune-discovery');
      const result = await cells.where('minExpiry', '<=', now).orderBy('minExpiry').limit(limit).get();
      return result.docs.map(doc => doc.id);
    },
    beginGc(cell, testOptions = {}) { return beginIndexGcLab(db, base, cell, { ...testOptions, onNodeDeleted: key => cache.invalidate(cacheKey(key)) }); },
    async audit() {
      const [rootDocs, sourceDocs, nodeDocs, marker] = await Promise.all([cells.get(), source.get(), nodes.get(), base.get()]);
      const cutoff = marker.data()?.prunedThrough ?? -1;
      const blocks = new Map(nodeDocs.docs.map(doc => [doc.id, doc.data()])), current = new Set(), found = [];
      function visit(key, prefix) {
        if (current.has(key)) throw new Error('duplicate-index-node');
        const node = verifyNode(key, blocks.get(key));
        if (!node.path.startsWith(prefix)) throw new Error('index-path-mismatch');
        current.add(key);
        if (node.kind === 'leaf') found.push(...node.rows);
        else for (const [part, child] of Object.entries(node.children)) visit(child.hash, node.path + part);
      }
      for (const doc of rootDocs.docs) {
        const header = directoryEntry(doc.id, doc.data());
        visit(header.hash, doc.id);
        if (blocks.get(header.hash).summary.minExpiry !== header.minExpiry) throw new Error('invalid-index-directory');
      }
      const expected = sourceDocs.docs.map(doc => metadataOf({ ...doc.data(), id: doc.id })).filter(row => row.status === 'active');
      const sort = rows => rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const byId = new Map(expected.map(row => [row.id, row]));
      if (found.some(row => canonical(row) !== canonical(byId.get(row.id) ?? null)) || new Set(found.map(row => row.id)).size !== found.length ||
          canonical(sort(found.filter(row => row.expiresAt > cutoff))) !== canonical(sort(expected.filter(row => row.expiresAt > cutoff)))) throw new Error('incomplete-index');
      return { valid: true, activeMetadata: expected.filter(row => row.expiresAt > cutoff).length,
        expiredPending: found.filter(row => row.expiresAt <= cutoff).length, currentNodes: current.size,
        retainedNodes: blocks.size, historicalNodes: blocks.size - current.size };
    },
    async inspect() {
      const [rootDocs, nodeDocs] = await Promise.all([cells.get(), nodes.get()]);
      return { roots: rootDocs.size, retainedNodes: nodeDocs.size,
        maxNodeBytes: Math.max(0, ...nodeDocs.docs.map(doc => Buffer.byteLength(canonical(doc.data())))),
        retainedBytes: nodeDocs.docs.reduce((sum, doc) => sum + encodedBytes(doc.data()), 0) };
    },
  };
}
