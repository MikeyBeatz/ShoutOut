// Emulator-only adapter. Deliberately cannot run against DEV or production.
import { Buffer } from 'node:buffer';
import { canonical, clone, encodedBytes, metadataOf, lowRated, treeBuilder, verifyNode } from './feed_block_index.js';
import { distanceKm, geohashBounds, FeedMinHeap } from './feed_spatial.js';

const tupleCompare = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };

export function blockCache({ maxBytes = 4194304, maxEntries = 1024 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error('invalid-cache-config');
  const entries = new Map(), flights = new Map();
  let bytes = 0;
  return {
    get size() { return entries.size; }, get bytes() { return bytes; },
    get prefetchWidth() { return Math.max(1, Math.min(8, maxEntries, Math.floor(maxBytes / 65536))); },
    contains(key) { return entries.has(key) || flights.has(key); },
    clear() { entries.clear(); bytes = 0; },
    async load(key, fetcher) {
      if (entries.has(key)) {
        const entry = entries.get(key); entries.delete(key); entries.set(key, entry);
        return { node: entry.node, hit: true, bytes: entry.bytes };
      }
      if (flights.has(key)) return { ...await flights.get(key), hit: true };
      const flight = (async () => {
        const node = frozen(await fetcher()), size = encodedBytes(node);
        if (size <= maxBytes) {
          while (entries.size >= maxEntries || bytes + size > maxBytes) {
            const oldest = entries.keys().next().value;
            bytes -= entries.get(oldest).bytes; entries.delete(oldest);
          }
          entries.set(key, { node, bytes: size }); bytes += size;
        }
        return { node, hit: false, bytes: size };
      })();
      flights.set(key, flight);
      try { return await flight; } finally { flights.delete(key); }
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
    data.revision < 1 || grid.latCell !== data.latCell || grid.lonCell !== data.lonCell) throw new Error('invalid-index-directory');
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

export function createLabBlockIndex(db, { namespace, cache = blockCache(), ...blockOptions }) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('index-lab-emulator-only');
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(namespace)) throw new Error('invalid-index-namespace');
  const base = db.collection('feedIndexLab').doc(namespace);
  const cells = base.collection('cells'), nodes = base.collection('nodes'), source = base.collection('source');
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
      tx.create(base, { v: 1 });
      for (const row of rows) tx.create(source.doc(row.id), row);
      for (const [key, node] of builder.writes) tx.set(nodes.doc(key), node);
      for (const [cell, descriptor] of roots) tx.create(cells.doc(cell), { v: 1, hash: descriptor.hash, revision: 1, ...cellGrid(cell) });
    });
    return { sourceWrites: rows.length, nodeWrites: builder.writes.size, directoryWrites: roots.length, guardWrites: 1 };
  }

  async function mutate(id, value, { beforeCommit } = {}) {
    assertId(id);
    const next = value === null ? null : metadataOf(value);
    if (next && next.id !== id) throw new Error('invalid-index-id');
    let attempts = 0, reads = 0;
    const committed = await db.runTransaction(async tx => {
      attempts++;
      const [original, marker] = await tx.getAll(source.doc(id), base); reads += 2;
      if (!marker.exists || marker.data().v !== 1) throw new Error('index-not-seeded');
      const old = original.exists ? metadataOf(original.data()) : null;
      if (canonical(old) === canonical(next)) return { sourceWrites: 0, nodeWrites: 0, directoryWrites: 0 };
      const oldIndex = old?.status === 'active' ? old : null, newIndex = next?.status === 'active' ? next : null;
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
      for (const cell of regionIds) {
        const originalRoot = roots.get(cell);
        const descriptor = await builder.edit(originalRoot ? { hash: originalRoot.hash } : null, cell,
          oldIndex?.geohash.startsWith(cell) ? oldIndex : null, newIndex?.geohash.startsWith(cell) ? newIndex : null, load);
        if (descriptor?.hash !== originalRoot?.hash) updates.set(cell, descriptor);
      }
      const reachable = builder.reachable([...updates.values()].filter(Boolean));
      for (const key of [...reachable.keys()]) if (loaded.has(key)) reachable.delete(key);
      if (reachable.size + updates.size + 1 > 450) throw new Error('lab-mutation-too-large');
      // All reads precede any writes, ready to compose with real operation checks later.
      if (next) tx.set(source.doc(id), next); else tx.delete(source.doc(id));
      for (const [key, node] of reachable) tx.set(nodes.doc(key), node);
      for (const [cell, descriptor] of updates) {
        if (!descriptor) tx.delete(cells.doc(cell));
        else tx.set(cells.doc(cell), { v: 1, hash: descriptor.hash, revision: (roots.get(cell)?.revision ?? 0) + 1, ...cellGrid(cell) });
      }
      if (beforeCommit) await beforeCommit();
      return { sourceWrites: 1, nodeWrites: reachable.size, directoryWrites: updates.size };
    });
    return { ...committed, reads, attempts };
  }

  async function open(input) {
    const c = context(input), ranges = directoryWindows(c.point, c.radiusKm);
    const metrics = { rootQueries: 0, rootDocuments: 0, emptyRootQueries: 0, nodeReads: 0, nodeFetchRequests: 0, nodeBytes: 0, cacheHits: 0, metadataExamined: 0 };
    const roots = await db.runTransaction(async tx => {
      const result = new Map();
      for (const window of ranges) {
        metrics.rootQueries++;
        const snapshot = await tx.get(cells.where('latCell', '>=', window.latStart).where('latCell', '<=', window.latEnd)
          .where('lonCell', '>=', window.lonStart).where('lonCell', '<=', window.lonEnd)
          .orderBy('latCell').orderBy('lonCell'));
        metrics.rootDocuments += snapshot.size;
        if (snapshot.empty) metrics.emptyRootQueries++;
        for (const doc of snapshot.docs) {
          const data = directoryEntry(doc.id, doc.data());
          result.set(doc.id, data.hash);
        }
      }
      return [...result].map(([path, key]) => ({ hash: key, path, summary: null }));
    }, { readOnly: true });
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
        const [node] = await Promise.all(batch.map(candidate => loadBlock(candidate.hash, metrics)));
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
      page.result = { state: next ? 'continuation' : 'end', rows: clone(page.rows), next, metrics: { ...metrics } };
      active = next;
      return { ...page.result, rows: clone(page.result.rows) };
    }
    const view = {
      first,
      page(token, work = { nodes: 32 }) {
        if (!pages.has(token) || (!pages.get(token).result && token !== active)) return Promise.reject(new Error('invalid-index-cursor'));
        if (!work || !Number.isInteger(work.nodes) || work.nodes < 1) return Promise.reject(new Error('invalid-index-work'));
        const page = pages.get(token);
        if (page.result) return Promise.resolve({ ...page.result, rows: clone(page.result.rows) });
        if (!page.flight) page.flight = advance(token, work).finally(() => { page.flight = null; });
        return page.flight;
      },
    };
    views.set(view, { context: c, roots });
    return view;
  }

  async function hydrate(view, ids, now) {
    const c = views.get(view)?.context;
    if (!c || !Number.isSafeInteger(now) || now < c.now || !Array.isArray(ids) || ids.length > 50 || new Set(ids).size !== ids.length) throw new Error('invalid-index-hydration');
    ids.forEach(assertId);
    const docs = ids.length ? await db.getAll(...ids.map(id => source.doc(id))) : [];
    return { sourceReads: docs.length, items: docs.map(doc => {
      const row = doc.exists ? metadataOf(doc.data()) : null;
      return row && available(row, c, now) ? { id: doc.id, available: true, row } : { id: doc.id, available: false };
    }) };
  }

  async function indexChanges(beforeView, afterView) {
    const before = views.get(beforeView), after = views.get(afterView);
    const identity = c => [c.uid ?? null, c.point, c.radiusKm, c.order, c.lowRatedLast,
      c.category, [...c.blocked].sort(), [...c.followed].sort()];
    if (!before || !after || after.context.now < before.context.now ||
        canonical(identity(before.context)) !== canonical(identity(after.context))) throw new Error('incompatible-index-views');
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
    return clone({ added, removed, updated, metrics });
  }

  return { seed, mutate, open, hydrate, indexChanges, cache, base,
    async audit() {
      const [rootDocs, sourceDocs, nodeDocs] = await Promise.all([cells.get(), source.get(), nodes.get()]);
      const blocks = new Map(nodeDocs.docs.map(doc => [doc.id, doc.data()])), current = new Set(), found = [];
      function visit(key, prefix) {
        if (current.has(key)) throw new Error('duplicate-index-node');
        const node = verifyNode(key, blocks.get(key));
        if (!node.path.startsWith(prefix)) throw new Error('index-path-mismatch');
        current.add(key);
        if (node.kind === 'leaf') found.push(...node.rows);
        else for (const [part, child] of Object.entries(node.children)) visit(child.hash, node.path + part);
      }
      for (const doc of rootDocs.docs) visit(directoryEntry(doc.id, doc.data()).hash, doc.id);
      const expected = sourceDocs.docs.map(doc => metadataOf(doc.data())).filter(row => row.status === 'active');
      const sort = rows => rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (canonical(sort(found)) !== canonical(sort(expected))) throw new Error('incomplete-index');
      return { valid: true, activeMetadata: expected.length, currentNodes: current.size,
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
