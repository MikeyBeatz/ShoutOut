import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { getFeedDeltaOperation } from './feed_delta.js';
import { createFeedRuntime } from './feed_runtime.js';
import { publicCardState } from './feed_card_state.js';
import { metadataOf, treeBuilder } from './feed_block_index.js';
import { cellGrid } from './feed_block_index_store.js';
import { encodeGeohash } from './geohash.js';
import { getCompatibleFeedPageOperation } from './feed_delta.js';
import { feedRuntimeBlockCache } from './feed_runtime.js';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout, clearTimeout } from 'node:timers';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createReadSyncRuntime } from './read_sync_runtime.js';
import { readContentHash } from './read_sync_blocks.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'delta-integration') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const point = { latitude: 50.08, longitude: 14.44 };
const filters = { point, radiusKm: 50, order: 'nearest', category: null, readPolicy: 'confirmed-v1' };
async function fixture(t, count = 120) {
  const uid = randomUUID(), generation = 'delta-' + uid.slice(0, 8), base = db.doc(`feedIndexGenerations/${generation}`),
    control = db.doc('feedIndexControl/current'), profile = db.doc(`users/${uid}`), key = randomBytes(32), now = Date.now();
  const roots = [base, control, profile], ids = [];
  t.after(async () => {
    for (let i = 0; i < ids.length; i += 450) { const b = db.batch(); ids.slice(i, i + 450).forEach(id => b.delete(db.doc(`shouts/${id}`))); await b.commit(); }
    for (const ref of roots) await db.recursiveDelete(ref);
  });
  await profile.set({ nickname: 'Delta actor' }); await profile.collection('legal').doc('acceptance_2026_07_25').set({});
  const rows = Array.from({ length: count }, (_, i) => {
    const location = new GeoPoint(point.latitude + i / 100000, point.longitude);
    return { id: `${uid}-${String(i).padStart(4, '0')}`, authorId: uid + '-author', authorNickname: 'Writer',
      title: `Delta ${i}`, text: 'Synthetic content. '.repeat(30), status: 'active', location,
      geohash: encodeGeohash(location.latitude, location.longitude), createdAt: Timestamp.fromMillis(now - 1000),
      expiresAt: Timestamp.fromMillis(now + 86400000), categories: ['Dotaz'], likesCount: 1, dislikesCount: 0,
      commentsCount: 2, savesCount: 3, cardRevision: 0, privateFixture: 'Never public' };
  });
  const builder = treeBuilder({ cardProjection: true }), writes = [];
  for (const row of rows) {
    ids.push(row.id); writes.push([db.doc(`shouts/${row.id}`), row], [base.collection('publicStates').doc(row.id), publicCardState(row.id, row)]);
  }
  for (const cell of new Set(rows.map(row => row.geohash.slice(0, 4)))) {
    const root = builder.build(rows.filter(row => row.geohash.startsWith(cell)).map(row => metadataOf(row, { contentIdentity: true, cardProjection: true })), cell);
    writes.push([base.collection('cells').doc(cell), { v: 1, hash: root.hash, minExpiry: root.minExpiry, revision: 1, ...cellGrid(cell) }]);
  }
  writes.push(...[...builder.writes].map(([hash, node]) => [base.collection('nodes').doc(hash), node]),
    [base, { schemaVersion: 1, v: 2, accountRetention: true, cardProjection: 1, readIdentity: 1, cardReady: true, erasureRevision: 0, prunedThrough: -1 }],
    [control, { schemaVersion: 2, revision: 1, mode: 'active', readGenerationId: generation, writeGenerationIds: [generation], cardReadGenerationId: generation, cardWriteGenerationIds: [generation] }]);
  for (let i = 0; i < writes.length; i += 450) { const b = db.batch(); writes.slice(i, i + 450).forEach(([ref, value]) => b.set(ref, value)); await b.commit(); }
  const f = { uid, generation, base, control, profile, key, roots, rows, now: now + 10 };
  f.request = data => ({ app: { appId: 'fixture' }, auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, data: { expectedUserId: uid, format: 'delta-v1', ...data } });
  f.database = db;
  f.step = (data, options = {}) => getFeedDeltaOperation(f.request(data), f.database, { key, clock: () => new Date(f.now), readOrdering: { maxBlockReads: 256 }, enabled: true, ...options });
  f.page = async (data = {}) => {
    let input = { context: filters, cold: false, ...data };
    for (let i = 0; i < 32; i++) {
      const value = await f.step(input);
      if (value.state === 'ready') return value;
      assert.equal(value.state, 'preparing'); assert(value.next);
      input = { cursor: value.next, cold: input.cold };
    }
    assert.fail('bounded preparation did not finish');
  };
  f.mutate = async (id, change) => {
    const runtime = createFeedRuntime(db, { getUser() { throw new Error('not-used'); } }, { cardStateEnabled: true });
    return runtime.database.runTransaction(async tx => {
      const ref = db.doc(`shouts/${id}`), before = (await tx.get(ref)).data(), after = { ...before, ...change };
      const plan = await runtime.indexWriter.prepare(tx, id, before, after); plan.apply(); tx.set(ref, after);
    });
  };
  return f;
}

test('delta is off by default before database access', async () => {
  const db = new Proxy({}, { get() { throw new Error('unexpected-access'); } });
  const request = { auth: { uid: 'fixture', token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: {} };
  await assert.rejects(getFeedDeltaOperation(request, db, { key: randomBytes(32) }), error => error.code === 'failed-precondition');
});

test('V1 client starts and paginates on card generation using full bodies', { skip: !enabled }, async t => {
  const f = await fixture(t, 55);
  const request = f.request({ context: { ...filters, readPolicy: undefined } }); delete request.data.format;
  let value = await getCompatibleFeedPageOperation(request, db, { key: f.key, enabled: true, clock: () => new Date(f.now), readOrdering: { maxBlockReads: 256 } });
  assert.equal(value.version, 1); assert.equal(value.items.length, 50); assert(value.items[0].data.text); assert(value.next.startsWith('d1:'));
  value = await getCompatibleFeedPageOperation({ ...request, data: { expectedUserId: f.uid, cursor: value.next } }, db,
    { key: f.key, enabled: true, clock: () => new Date(f.now), readOrdering: { maxBlockReads: 256 } });
  assert.equal(value.items.length, 5); assert.equal(value.next, null);
});

test('preparing proofs contain no coordinates of sources; final fences reject revoked actor/R5', { skip: !enabled }, async t => {
  const f = await fixture(t, 200);
  let data = { context: filters, cold: false }, preparing = 0, page;
  for (let i = 0; i < 32; i++) {
    const value = await f.step(data, { workNodes: 1 });
    if (value.next) {
      const proof = JSON.parse(Buffer.from(value.next.split('.')[1], 'base64url').toString());
      const serialized = JSON.stringify(proof.position);
      assert(!serialized.includes('latitude')); assert(!serialized.includes('longitude')); assert(!serialized.includes('location'));
    }
    if (value.state === 'ready') { page = value; break; }
    preparing++; data = { cursor: value.next, cold: false };
  }
  assert(preparing > 0); assert(page);
  const blocked = f.profile.collection('blocked').doc(f.rows[0].authorId);
  await blocked.set({});
  await assert.rejects(f.step({ mode: 'complete', token: page.bodyPage.token, missing: [] }), error => error.code === 'failed-precondition');
  await blocked.delete();
  await f.base.update({ erasureRevision: 1 });
  const cell = f.rows[0].geohash.slice(0, 4);
  await f.base.collection('cellRetention').doc(cell).set({ version: 1, phase: 'erasing' });
  await assert.rejects(f.step({ mode: 'complete', token: page.bodyPage.token, missing: [] }));
  await f.base.collection('cellRetention').doc(cell).delete();
  await f.profile.delete();
  await assert.rejects(f.step({ mode: 'complete', token: page.bodyPage.token, missing: [] }), error => error.code === 'failed-precondition');
});

test('presentation uses exact 20 km, legacy promo semantics and rejects malformed/ineligible requests', { skip: !enabled }, async t => {
  const f = await fixture(t, 4);
  await f.mutate(f.rows[0].id, { businessPromotion: 'spotlight' });
  await f.mutate(f.rows[1].id, { businessSpotlight: true });
  await f.mutate(f.rows[2].id, { businessSpotlight: true, location: new GeoPoint(point.latitude + 1, point.longitude), geohash: encodeGeohash(point.latitude + 1, point.longitude) });
  const routes = f.rows.map(row => ({ id: row.id, geohash: row.id === f.rows[2].id ? encodeGeohash(point.latitude + 1, point.longitude) : row.geohash }));
  const result = await f.step({ mode: 'presentation', routes, point, cold: true });
  assert.deepEqual(result.bodyPage.rows.map(row => row.id), f.rows.slice(0, 2).map(row => row.id));
  assert(result.bodyPage.rows.every(row => row.state.businessSpotlight));
  assert(result.bodyPage.bodies.every(row => !Object.hasOwn(row.body, 'location')));
  await assert.rejects(f.step({ mode: 'presentation', routes: Array(51).fill(routes[0]), point, cold: true }), error => error.code === 'invalid-argument');
  const context = await f.step({ mode: 'liveContext' }); assert.equal(context.generation, f.generation);
  await f.control.update({ mode: 'paused', readGenerationId: null, cardReadGenerationId: null });
  await assert.rejects(f.step({ mode: 'liveContext' }), error => error.code === 'failed-precondition');
});

function measured(raw) {
  let metric;
  const reset = () => { metric = { reads: 0, queries: 0, sourceReads: 0, documentJsonBytes: 0, attemptedWrites: 0 }; }; reset();
  const note = value => {
    const docs = Array.isArray(value) ? value : value.docs ?? [value];
    if (value.docs) metric.queries++;
    metric.reads += Math.max(1, docs.length);
    for (const doc of docs) {
      if (/^shouts\/[^/]+$/.test(doc.ref?.path ?? '')) metric.sourceReads++;
      metric.documentJsonBytes += Buffer.byteLength(JSON.stringify(doc.data?.() ?? null));
    }
    return value;
  };
  const wrap = target => new Proxy(target, { get(real, key) {
    if (['get', 'getAll'].includes(key)) return async (...args) => note(await real[key](...args));
    if (['set', 'create', 'update', 'delete'].includes(key)) return (...args) => { metric.attemptedWrites++; return real[key](...args); };
    return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
  } });
  const observer = wrap(raw);
  return { reset, snapshot: () => ({ ...metric }), db: new Proxy(observer, { get(real, key) {
    if (key === 'runTransaction') return (fn, options) => raw.runTransaction(tx => fn(wrap(tx)), options);
    return real[key];
  } }) };
}

test('full API measurements with fresh per-request stores at 50/200/2000 sources', { skip: !enabled }, async t => {
  const report = { schema: 1, scope: 'Actual Admin SDK reads/writes + JSON payloads, emulator. Includes B2 upload/download and ensuing B3 refresh; excludes platform Auth/AppCheck, billed Rules reads, live listener delivery and HTTP framing. Logical listener sharing has a separate Dart regression.', cases: [] };
  for (const count of [50, 200, 2000]) {
    await t.test(String(count), async t => {
      const f = await fixture(t, count), observer = measured(db); f.database = observer.db;
      feedRuntimeBlockCache.clear();
      observer.reset(); const cold = await f.page({ cold: true }); const coldMetric = observer.snapshot();
      observer.reset(); const warm = await f.page(); const warmMetric = observer.snapshot();
      assert.equal(coldMetric.sourceReads, 50); assert.equal(warmMetric.sourceReads, 0);
      observer.reset(); await f.step({ mode: 'complete', token: warm.bodyPage.token, missing: [warm.bodyPage.rows[0].id] }); const refillMetric = observer.snapshot();
      assert.equal(refillMetric.sourceReads, 1);
      const oldHome = await db.collection('shouts').where('status', '==', 'active').orderBy('createdAt', 'desc').limit(50).get();
      const newHome = await f.base.collection('publicStates').where('status', '==', 'active').orderBy('createdAt', 'desc').limit(50).get();
      const bytes = docs => Buffer.byteLength(JSON.stringify(docs.map(doc => doc.data())));
      const syncControl = db.doc('maintenanceState/readSyncControl'); f.roots.push(syncControl, db.doc(`rateLimits/${f.uid}`));
      await syncControl.set({ v: 1, revision: 1, mode: 'active' });
      const runtime = createReadSyncRuntime(observer.db, { key: f.key, clock: () => new Date(f.now) });
      const request = data => { const result = f.request(data); delete result.data.format; return result; };
      const selected = new Set(cold.bodyPage.rows.map(row => row.id));
      const markers = f.rows.filter(row => selected.has(row.id)).map(row => ({ shoutId: row.id, contentHash: readContentHash(row.title, row.text), expiresAt: row.expiresAt.toMillis() }));
      observer.reset();
      for (let i = 0; i < markers.length; i += 32) await runtime.upload(request({ items: markers.slice(i, i + 32) }));
      const upload = observer.snapshot(); observer.reset();
      const downloaded = await runtime.download(request({ knownRevision: 0 })); assert.equal(downloaded.items.length, 50); assert.equal(downloaded.next, null);
      const download = observer.snapshot(); observer.reset();
      const reordered = await f.page();
      assert(reordered.bodyPage.rows.every(row => row.read === (count === 50)));
      const afterSync = observer.snapshot();
      const missing = reordered.bodyPage.rows.filter(row => !selected.has(row.id)).map(row => row.id);
      observer.reset(); if (missing.length) await f.step({ mode: 'complete', token: reordered.bodyPage.token, missing });
      const shiftedBodies = observer.snapshot();
      report.cases.push({ sources: count, cold: { ...coldMetric, responseJsonBytes: Buffer.byteLength(JSON.stringify(cold)) },
        warm: { ...warmMetric, responseJsonBytes: Buffer.byteLength(JSON.stringify(warm)) }, refillOne: refillMetric,
        home: { oldReads: oldHome.size, newReads: newHome.size, oldJsonBytes: bytes(oldHome.docs), newJsonBytes: bytes(newHome.docs) },
        readSync50: { uploadCalls: 2, upload, downloadCalls: 1, download, responseJsonBytes: Buffer.byteLength(JSON.stringify(downloaded)),
          ensuingB3Refresh: afterSync, missingBodiesAfterReorder: missing.length, refillAfterReorder: shiftedBodies } });
    });
  }
  if (process.env.FEED_DELTA_REPORT) writeFileSync(process.env.FEED_DELTA_REPORT, JSON.stringify(report, null, 2) + '\n');
});

test('Chrome delta transport against real Firestore emulator, disconnect and refill retry', { skip: !enabled || process.env.B4_BROWSER !== '1', timeout: 180000 }, async t => {
  const f = await fixture(t, 120); let failNext = false;
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*'); response.setHeader('Access-Control-Allow-Headers', 'content-type');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    try {
      if (request.url === '/info') { response.end(JSON.stringify({ uid: f.uid, project: db.projectId, context: filters })); return; }
      if (request.url === '/fail') { failNext = true; response.end('{}'); return; }
      if (request.url === '/unblock') { failNext = false; response.end('{}'); return; }
      if (request.url !== '/call') { response.writeHead(404); response.end(); return; }
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const data = JSON.parse(Buffer.concat(chunks).toString());
      const result = await f.step(data);
      if (failNext && data.mode === 'complete') { response.destroy(); return; }
      response.end(JSON.stringify(result));
    } catch { response.writeHead(409); response.end('{}'); }
  });
  await new Promise(resolve => server.listen(49328, '127.0.0.1', resolve));
  try {
    const args = ['test', '--platform', 'chrome', 'test/feed_delta_transport_browser.dart'];
    const child = spawn(process.env.DART_BIN ?? 'dart', args, { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit' });
    const timer = setTimeout(() => child.kill(), 150000);
    try { assert.equal(await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }), 0); }
    finally { clearTimeout(timer); }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('real V2 cold/manifest/refill and 50/100/120 pages retain B3 and never expose source locations in cursor', { skip: !enabled }, async t => {
  const f = await fixture(t);
  const cold = await f.page({ cold: true });
  assert.equal(cold.version, 2); assert.equal(cold.bodyPage.rows.length, 50); assert.equal(cold.bodyPage.bodies.length, 50);
  assert.equal(cold.bodyPage.rows[0].state.commentsCount, 2);
  assert(!JSON.stringify(cold.bodyPage).includes('privateFixture'));
  const proof = JSON.parse(Buffer.from(cold.bodyPage.token.split('.')[1], 'base64url').toString());
  assert(proof.context.rows.every(row => !Object.hasOwn(row, 'location')));
  const warm = await f.page(); assert.equal(warm.bodyPage.bodies.length, 0);
  const missing = [warm.bodyPage.rows[0].id];
  const refill = await f.step({ mode: 'complete', token: warm.bodyPage.token, missing });
  assert.equal(refill.bodyPage.token, warm.bodyPage.token); assert.equal(refill.bodyPage.bodies.length, 1);
  assert.equal(refill.bodyPage.rows[0].state.revision, 0);
  let total = cold.bodyPage.rows.length, cursor = cold.next;
  while (cursor) { const next = await f.page({ cursor, context: undefined }); total += next.bodyPage.rows.length; cursor = next.next; }
  assert.equal(total, 120);
});

test('completion rechecks body version, author deletion, permissions and original deadline', { skip: !enabled }, async t => {
  const f = await fixture(t, 3), page = await f.page(), id = page.bodyPage.rows[0].id;
  await f.mutate(id, { text: 'Changed after selection' });
  await assert.rejects(f.step({ mode: 'complete', token: page.bodyPage.token, missing: [id] }), error => error.code === 'failed-precondition');
  const current = await f.page();
  const foreign = { ...f.request({ mode: 'complete', token: current.bodyPage.token, missing: [id] }), auth: { uid: 'different', token: { email: 'fixture@example.test', email_verified: true } } };
  foreign.data.expectedUserId = 'different';
  await assert.rejects(getFeedDeltaOperation(foreign, db, { key: f.key, enabled: true }), error => error.code === 'invalid-argument');
  f.now += 3600001;
  await assert.rejects(f.step({ mode: 'complete', token: current.bodyPage.token, missing: [id] }), error => error.code === 'failed-precondition');
});
