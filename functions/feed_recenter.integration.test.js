import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { newsFixture, meterNewsDatabase } from './feed_news_lab.js';
import { feedCursorCodec } from './feed_cursor.js';
import { syncReadBatchOperation } from './read_sync.js';
import { readContentHash } from './read_content_identity.js';
import { encodeGeohash } from './geohash.js';
import { feedRuntimeBlockCache } from './feed_runtime.js';
import { writeFileSync } from 'node:fs';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'feed-recenter') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const options = { recenterEnabled: true, readOrdering: { maxBlockReads: 256 } };
const decode = (f, token) => feedCursorCodec({ key: createHmac('sha256', f.key).update('shoutout-b4-movement-v1').digest() })
  .decode(token, { uid: f.uid, project: db.projectId, now: f.now });
async function initial(f, radiusKm = 1) {
  let cursor;
  for (let i = 0; i < 32; i++) {
    const result = await f.step(cursor ? { cursor, cold: false } : {
      context: { point: f.point, radiusKm, order: 'nearest', category: null, readPolicy: 'confirmed-v1' }, cold: false,
    }, options);
    if (result.state === 'ready') return result;
    cursor = result.next;
  }
  throw new Error('movement-fixture-budget');
}
async function moved(f, page, point, extra = {}) {
  let result = await f.step({ mode: 'recenter', token: page.bodyPage.movementToken, point, cold: false }, { ...options, ...extra });
  for (let i = 0; result.state === 'preparing' && i < 32; i++) {
    result = await f.step({ cursor: result.next, cold: false }, options);
  }
  assert.equal(result.state, 'ready');
  return result;
}

test('movement is disabled by default; proof, point and account are validated', { skip: !enabled }, async t => {
  const f = await newsFixture(db, t, 2), page = await initial(f);
  const request = { mode: 'recenter', token: page.bodyPage.movementToken, point: f.point, cold: false };
  await assert.rejects(f.step(request), e => e.code === 'failed-precondition');
  for (const patch of [{ point: { latitude: 91, longitude: 0 } }, { token: page.bodyPage.movementToken + 'x' }, { radiusKm: 50 }]) {
    await assert.rejects(f.step({ ...request, ...patch }, options), e => e.code === 'invalid-argument');
  }
  await assert.rejects(f.step({ ...request, token: page.bodyPage.token }, options), e => e.code === 'invalid-argument');
  const old = f.uid;
  // Signed proof cannot be replayed with another authenticated account.
  const req = f.request(request); req.auth.uid = old + '-other'; req.data.expectedUserId = req.auth.uid;
  const { getFeedDeltaOperation } = await import('./feed_delta.js');
  await assert.rejects(getFeedDeltaOperation(req, db, { ...options, enabled: true, key: f.key, clock: f.clock }), e => e.code === 'invalid-argument');
});

test('signed retained pages revalidate distance, deletion and account without bodies or writes', { skip: !enabled }, async t => {
  const f = await newsFixture(db, t, 3), page = await initial(f);
  const next = await moved(f, page, { latitude: f.point.latitude + .001, longitude: f.point.longitude });
  const ids = page.bodyPage.rows.map(row => row.id);
  const input = { mode: 'movement-state', token: page.bodyPage.token, movementToken: next.bodyPage.movementToken, ids };
  const result = await f.step(input, options);
  assert.equal(result.state, 'movement-state'); assert.equal(result.baseline, next.baseline);
  assert.deepEqual(result.rows.map(row => row.id), ids);
  assert(result.rows.every(row => Object.keys(row).sort().join(',') === 'distanceKm,id' && row.distanceKm >= 0));
  await assert.rejects(f.step({ ...input, ids: [...ids, 'not-signed'] }, options), e => e.code === 'invalid-argument');
  await assert.rejects(f.step({ ...input, ids: Array(51).fill(ids[0]) }, options), e => e.code === 'invalid-argument');
  await assert.rejects(f.step(input), e => e.code === 'failed-precondition');
  await f.change(1, { status: 'deleted' });
  assert(!(await f.step(input, options)).rows.some(row => row.id === f.rows[1].id));
  const foreign = await initial(f, 3);
  await assert.rejects(f.step({ ...input, movementToken: foreign.bodyPage.movementToken }, options), e => e.code === 'invalid-argument');
});

test('current expiry and deletion during historical capture cannot leak a stale page', { skip: !enabled }, async t => {
  const f = await newsFixture(db, t, 2), expires = Date.now() + 2000;
  await f.change(1, { expiresAt: Timestamp.fromMillis(expires) });
  const page = await initial(f);
  f.now = expires;
  const result = await moved(f, page, f.point);
  assert.deepEqual(result.bodyPage.rows.map(row => row.id), [f.rows[0].id]);
  const deletion = db.doc(`accountDeletionRequests/${f.uid}`);
  t.after(() => deletion.delete());
  let changed = false;
  f.database = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async (run, opts) => {
      const value = await target.runTransaction(run, opts);
      if (opts.readTime && !changed) { changed = true; await deletion.set({ status: 'pending' }); }
      return value;
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await assert.rejects(moved(f, page, f.point), e => e.code === 'failed-precondition');
  assert(changed);
});

test('rebase retains original publication/read cutoff, deadline and cache-compatible bodies', { skip: !enabled }, async t => {
  const f = await newsFixture(db, t, 3);
  // One old source starts outside the old radius and enters the moved area.
  const far = new GeoPoint(f.point.latitude + .02, f.point.longitude);
  await f.change(2, { location: far, geohash: encodeGeohash(far.latitude, far.longitude) });
  const page = await initial(f), parent = decode(f, page.bodyPage.movementToken);
  assert.equal(page.bodyPage.rows.length, 2);
  const metered = meterNewsDatabase(db); f.database = metered.db;
  // Reading after the original baseline must not silently reorder movement.
  const row = f.rows[0];
  await syncReadBatchOperation({ ...f.request({}), data: { expectedUserId: f.uid, items: [{ shoutId: row.id,
    contentHash: readContentHash(row.title, row.text), expiresAt: row.expiresAt.toMillis() }] } }, db);
  await f.change(3, {}, { create: true }); // deliberately backdated createdAt
  f.now = Math.max(Date.now(), f.now + 100);
  const destination = { latitude: far.latitude - .004, longitude: far.longitude };
  const result = await moved(f, page, destination), child = decode(f, result.bodyPage.movementToken);
  assert.deepEqual(result.bodyPage.rows.map(r => r.id), [f.rows[2].id]);
  assert.equal(result.bodyPage.bodies.length, 0);
  assert.equal(child.context.snapshot.context.geographyRevision, 1);
  assert.deepEqual(child.readTime, parent.readTime);
  assert.equal(child.startedAt, parent.startedAt); assert.equal(child.expiresAt, parent.expiresAt);
  assert.equal(child.context.snapshot.context.readRevision, parent.context.snapshot.context.readRevision);
  assert.notEqual(result.baseline, page.baseline);
  const replay = await moved(f, page, destination);
  assert.deepEqual(replay.bodyPage.rows.map(r => r.id), result.bodyPage.rows.map(r => r.id));
  const back = await moved(f, result, f.point);
  assert(back.bodyPage.rows.every(r => !r.read));
  assert(back.bodyPage.rows.every(r => r.id !== f.row(3).id));
  assert.equal(decode(f, back.bodyPage.movementToken).context.snapshot.context.geographyRevision, 2);
  const news = await f.news(result.newsCheckpoint);
  // New source is outside the new 1km region, so it cannot inflate its badge.
  assert.equal(news.count, 0);
  assert.equal((await f.news(back.newsCheckpoint)).count, 1);
});

test('current expiry, deleted authors, R5 and retired generation reject stale movement', { skip: !enabled }, async t => {
  const f = await newsFixture(db, t, 2), page = await initial(f);
  const source = f.rows[0], cell = source.geohash.slice(0, 4);
  const fence = f.base.collection('cellRetention').doc(cell);
  await fence.set({ v: 1, version: 1, phase: 'ready' });
  await assert.rejects(moved(f, page, f.point), e => e.details?.reason === 'feed-session-expired');
  await fence.delete();
  const author = db.doc(`publicProfiles/${source.authorId}`);
  await author.set({ accountStatus: 'deleted' }); t.after(() => author.delete());
  await assert.rejects(moved(f, page, f.point), e => e.details?.reason === 'feed-session-expired');
  await author.delete();
  // A current account gate is checked before any historical reads.
  const deletion = db.doc(`accountDeletionRequests/${f.uid}`);
  await deletion.set({ status: 'pending' });
  t.after(() => deletion.delete());
  await assert.rejects(moved(f, page, f.point));
  await deletion.delete();
  await f.control.update({ mode: 'paused', readGenerationId: null, cardReadGenerationId: null });
  await assert.rejects(moved(f, page, f.point), e => e.code === 'failed-precondition');
  await f.control.update({ mode: 'active', readGenerationId: f.generation, cardReadGenerationId: f.generation });
  const originalMarker = (await f.base.get()).data();
  await f.base.delete(); await f.base.create(originalMarker);
  await assert.rejects(moved(f, page, f.point), e => e.details?.reason === 'feed-session-expired');
  // Deadline is never extended by movement.
  f.now = page.expiresAt;
  await assert.rejects(moved(f, page, f.point), e => e.details?.reason === 'feed-session-expired');
  assert.equal((await fence.get()).exists, false);
});

test('measured bounded movement 50/200/2000 sources; cold restart preserves full ordering', { skip: !enabled }, async t => {
  const report = [];
  for (const size of [50, 200, 2000]) {
    const f = await newsFixture(db, t, size);
    const page = await initial(f, 50);
    const meter = meterNewsDatabase(db); f.database = meter.db;
    const point = { latitude: f.point.latitude + .002, longitude: f.point.longitude };
    feedRuntimeBlockCache.clear();
    const before = { ...f.transfer };
    const child = await moved(f, page, point);
    const movementTransfer = Object.fromEntries(Object.keys(before).map(key => [key, f.transfer[key] - before[key]]));
    const cold = meter.snapshot(); meter.reset();
    const replay = await moved(f, page, point);
    const warm = meter.snapshot();
    meter.reset();
    const retainedBefore = { ...f.transfer };
    const retainedReply = await f.step({ mode: 'movement-state', token: page.bodyPage.token,
      movementToken: child.bodyPage.movementToken, ids: page.bodyPage.rows.map(row => row.id) }, options);
    const retained = meter.snapshot();
    const retainedTransfer = Object.fromEntries(Object.keys(retainedBefore).map(key => [key, f.transfer[key] - retainedBefore[key]]));
    assert.equal(retainedReply.rows.length, 50); assert.equal(retained.writes, 0); assert.equal(retained.sourceReads, 0);
    assert.deepEqual(child.bodyPage.rows, replay.bodyPage.rows);
    assert.equal(child.bodyPage.rows.length, 50);
    assert.equal(cold.writes, 0); assert.equal(cold.sourceReads, 0);
    const ids = new Set(child.bodyPage.rows.map(r => r.id));
    let cursor = child.next, pages = 1;
    while (cursor) {
      const next = await f.step({ cursor, cold: false }, options);
      cursor = next.next;
      if (next.state === 'preparing') continue;
      pages++;
      for (const row of next.bodyPage.rows) { assert(!ids.has(row.id)); ids.add(row.id); }
    }
    assert.equal(ids.size, size);
    report.push({ sources: size, cold, warm, retained, retainedTransfer, pages, selected: ids.size,
      movementProofBytes: Buffer.byteLength(page.bodyPage.movementToken), movementTransfer, transfer: f.transfer });
  }
  writeFileSync(new URL('../build/feed-recenter-measurement.json', import.meta.url), JSON.stringify({
    model: 'Firestore emulator SDK operations/JSON bytes, not production billing or latency', report,
  }, null, 2) + '\n');
});
