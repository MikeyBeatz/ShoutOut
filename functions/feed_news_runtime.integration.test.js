import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { newsFixture, meterNewsDatabase } from './feed_news_lab.js';
import { createFeedRuntime } from './feed_runtime.js';
import { createShoutOperation } from './create_shout.js';
import { operationTestKey } from './test_helpers.js';
import { newsCoverage, admitNewsRead, validateNewsControl, consumeNewsCredit } from './feed_news_signals.js';
import { encodeGeohash } from './geohash.js';
import { writeFileSync } from 'node:fs';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'news-runtime') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t, size = 50) {
  const f = await newsFixture(db, t, size), marker = await f.base.get();
  f.binding = { generation: f.generation, incarnation: [marker.createTime.seconds, marker.createTime.nanoseconds] };
  await f.base.update({ newsIncarnation: f.binding.incarnation });
  f.newsControl = db.doc('feedNewsControl/current');
  await f.newsControl.set({ v: 1, revision: 1, mode: 'active', ...f.binding });
  const rate = db.doc(`rateLimits/${f.uid}`);
  t.after(async () => { await f.newsControl.delete(); await db.recursiveDelete(rate); });
  f.runtime = createFeedRuntime(db, { getUser() {} }, { newsRuntimeEnabled: true });
  f.publish = async (index, options = {}) => {
    const { extraWrites = 0, ...planOptions } = options;
    const row = f.row(index), ref = db.doc(`shouts/${row.id}`);
    await f.runtime.database.runTransaction(async tx => {
      const previous = await tx.get(ref);
      const plan = await f.runtime.indexWriter.prepare(tx, row.id, previous.data() ?? null, row,
        { publication: true, ...planOptions });
      f.lastPublicationPlan = { totalWrites: plan.totalWrites, signalWrites: plan.signalWrites };
      plan.apply(); tx.create(ref, row);
      for (let i = 0; i < extraWrites; i++) tx.set(db.doc(`newsRuntimeScratch/${f.uid}-${i}`), { v: 1 });
    });
    t.after(() => ref.delete()); return row;
  };
  f.pageRuntime = async (context = {}) => {
    let cursor;
    for (let i = 0; i < 32; i++) {
      const result = await f.step(cursor ? { cursor, cold: false } : {
        context: { point: f.point, radiusKm: 50, order: 'nearest', category: null, ...context }, cold: false,
      }, { newsRuntimeEnabled: true });
      if (result.state === 'ready') return result;
      cursor = result.next;
    }
    throw new Error('fixture-page-budget');
  };
  return f;
}

test('coverage includes every sampled circle point, empty cells, date line and polar fallback', () => {
  for (const point of [{ latitude: 50.08, longitude: 14.44 }, { latitude: 0, longitude: 179.999 }, { latitude: 89.999, longitude: 0 }, { latitude: -89.999, longitude: -180 }]) {
    for (const radius of [1, 3, 5, 10, 20, 50]) {
      const cells = newsCoverage(point, radius);
      if (cells === null) continue;
      assert(cells.length <= 64); assert(cells.includes(encodeGeohash(point.latitude, point.longitude).slice(0, 4)));
      for (let i = 0; i < 360; i += 5) {
        const a = radius / 6371, bearing = i * Math.PI / 180, lat = point.latitude * Math.PI / 180, lon = point.longitude * Math.PI / 180;
        const phi = Math.asin(Math.sin(lat) * Math.cos(a) + Math.cos(lat) * Math.sin(a) * Math.cos(bearing));
        const lambda = lon + Math.atan2(Math.sin(bearing) * Math.sin(a) * Math.cos(lat), Math.cos(a) - Math.sin(lat) * Math.sin(phi));
        const x = ((lambda * 180 / Math.PI + 540) % 360) - 180;
        assert(cells.includes(encodeGeohash(phi * 180 / Math.PI, x).slice(0, 4)), `${JSON.stringify(point)} ${radius} ${i}`);
      }
    }
  }
  assert.equal(newsCoverage({ latitude: 90, longitude: 0 }, 50), null);
  assert.throws(() => newsCoverage({ latitude: 0, longitude: 0 }, 100));
  assert.throws(() => validateNewsControl({}));
});

test('news quota fails closed for malformed state and does not refill on backwards clocks', () => {
  for (const data of [null, {}, { v: 1, creditMillis: 40001, updatedAt: Timestamp.fromMillis(1000) }]) assert.throws(() => consumeNewsCredit(data, 1000));
  assert.throws(() => consumeNewsCredit(undefined, -1));
  const empty = { v: 1, creditMillis: 0, updatedAt: Timestamp.fromMillis(2000) };
  assert.equal(consumeNewsCredit(empty, 1000).retryAfterMs, 2000);
  assert.equal(consumeNewsCredit(empty, 3000).record.creditMillis, 0);
});

test('publication signal is atomic; failed budget rolls back and ordinary rewrites do not signal', { skip: !enabled }, async t => {
  const f = await fixture(t), page = await f.pageRuntime();
  const head = f.base.collection('publicationHeads').doc(f.rows[0].geohash.slice(0, 4));
  assert.equal((await head.get()).exists, false);
  await assert.rejects(f.publish(77, { extraWrites: 450 }), /budget/);
  assert.equal((await head.get()).exists, false);
  assert.equal((await db.doc(`shouts/${f.row(77).id}`).get()).exists, false);
  assert.equal((await db.doc(`newsRuntimeScratch/${f.uid}-0`).get()).exists, false);
  const rows = await Promise.all([f.publish(80), f.publish(81)]);
  const first = await head.get(); assert.deepEqual(Object.keys(first.data()).sort(), ['token', 'v']);
  await f.change(0, { likesCount: 99 });
  assert((await head.get()).updateTime.isEqual(first.updateTime));
  const reply = await f.step({ mode: 'news-signals', checkpoint: page.newsCheckpoint }, { newsRuntimeEnabled: true });
  assert.equal(reply.signals.heads[head.id], first.get('token')); assert(reply.readUnits > 0);
  assert.equal((await f.news(page.newsCheckpoint, { newsRuntimeEnabled: true })).count, 2);
  const next = await f.pageRuntime(); assert.equal(next.bodyPage.newsSignals.heads[head.id], first.get('token'));
  assert.equal((await f.news(next.newsCheckpoint, { newsRuntimeEnabled: true })).count, 0);
  assert.equal(new Set(rows.map(r => r.id)).size, 2);
});

test('real createShout retry cannot duplicate the head or partial source writes', { skip: !enabled }, async t => {
  const f = await fixture(t, 0);
  await f.profile.update({ avatarId: 'otter', avatarBackgroundStart: 1, avatarBackgroundEnd: 2, avatarGradientDirection: 'vertical' });
  const request = f.request({ idempotencyKey: operationTestKey('news-runtime', f.clock()), title: 'New fixture', text: 'Only emulator data', categories: ['Dotaz'], durationMinutes: 60, location: f.point });
  delete request.data.format;
  const run = () => createShoutOperation(request, f.runtime.database, f.clock, { indexWriter: f.runtime.indexWriter });
  const result = await run(), source = db.doc(`shouts/${result.shoutId}`), head = f.base.collection('publicationHeads').doc((await source.get()).get('geohash').slice(0, 4));
  t.after(async () => { await source.delete(); const receipts = await db.collection('serverOperations').where('shoutId', '==', result.shoutId).get(); await Promise.all(receipts.docs.map(doc => doc.ref.delete())); });
  const token = await head.get(); assert((await run()).shoutId === result.shoutId);
  assert((await head.get()).updateTime.isEqual(token.updateTime));
});

test('paused reader rejects without bucket writes while publication remains atomic; incarnation and deletion fence', { skip: !enabled }, async t => {
  const f = await fixture(t), page = await f.pageRuntime(), request = f.request({ mode: 'news', checkpoint: page.newsCheckpoint });
  await f.newsControl.update({ mode: 'paused' });
  const pausedPage = await f.pageRuntime();
  assert.equal(pausedPage.newsCheckpoint, undefined);
  assert.equal(pausedPage.bodyPage.newsSignals, undefined);
  await assert.rejects(admitNewsRead(request, db, f.binding, f.clock), e => e.details?.reason === 'news-paused');
  assert.equal((await db.doc(`rateLimits/${f.uid}/actions/feedNews`).get()).exists, false);
  await f.publish(80);
  await f.newsControl.update({ mode: 'active', incarnation: [0, 0] });
  await assert.rejects(admitNewsRead(request, db, f.binding, f.clock), e => e.details?.reason === 'feed-session-expired');
  await f.newsControl.update({ incarnation: f.binding.incarnation });
  const pending = db.doc(`accountDeletionRequests/${f.uid}`); await pending.set({}); t.after(() => pending.delete());
  await assert.rejects(admitNewsRead(request, db, f.binding, f.clock), e => e.message === 'Account deletion is pending.');
});

test('one shared bucket limits concurrent devices; rejected attempts do not rewrite the record', { skip: !enabled }, async t => {
  const f = await fixture(t), request = f.request({});
  for (let i = 0; i < 38; i++) await admitNewsRead(request, db, f.binding, f.clock);
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => admitNewsRead(request, db, f.binding, f.clock)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
  const ref = db.doc(`rateLimits/${f.uid}/actions/feedNews`), before = await ref.get();
  await assert.rejects(admitNewsRead(request, db, f.binding, f.clock), e => e.code === 'resource-exhausted' && e.details.retryAfterMs === 1000);
  assert((await ref.get()).updateTime.isEqual(before.updateTime)); f.now += 1000;
  await admitNewsRead(request, db, f.binding, f.clock);
});

test('signal-only replies keep R5 and current account authority even after the head read', { skip: !enabled }, async t => {
  const f = await fixture(t), page = await f.pageRuntime();
  const fence = f.base.collection('cellRetention').doc(f.rows[0].geohash.slice(0, 4));
  await fence.set({ v: 1, version: 1, phase: 'ready' });
  await assert.rejects(f.step({ mode: 'news-signals', checkpoint: page.newsCheckpoint }, { newsRuntimeEnabled: true }),
    e => e.details?.reason === 'feed-session-expired');
  await fence.delete();
  const pending = db.doc(`accountDeletionRequests/${f.uid}`); let changed = false;
  t.after(() => pending.delete());
  f.database = new Proxy(db, { get(target, name) {
    if (name === 'runTransaction') return (run, ...options) => target.runTransaction(tx => run(new Proxy(tx, { get(real, method) {
      if (method === 'getAll') return async (...refs) => {
        const docs = await real.getAll(...refs);
        if (!changed && refs.some(ref => ref.path.includes('/publicationHeads/'))) { changed = true; await pending.set({}); }
        return docs;
      };
      return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
    } })), ...options);
    return typeof target[name] === 'function' ? target[name].bind(target) : target[name];
  } });
  await assert.rejects(f.step({ mode: 'news-signals', checkpoint: page.newsCheckpoint }, { newsRuntimeEnabled: true }),
    e => e.message === 'Account deletion is pending.');
  assert(changed);
});

test('runtime count and signal SDK costs include authority, quota and retry work, no bodies', { skip: !enabled }, async t => {
  const samples = [];
  for (const size of [50, 200, 2000]) {
    const scope = { callbacks: [], after(fn) { this.callbacks.push(fn); } };
    try {
      const f = await fixture(scope, size), measured = meterNewsDatabase(db);
      f.database = measured.db; measured.reset();
      const page = await f.pageRuntime(), metadataRefresh = measured.snapshot();
      measured.reset(); const quiet = await f.news(page.newsCheckpoint, { newsRuntimeEnabled: true });
      assert.equal(quiet.count, 0); assert.equal(quiet.readUnits, measured.snapshot().reads); assert.equal(measured.snapshot().writes, 1); assert.equal(measured.snapshot().sourceReads, 0);
      const quietCount = measured.snapshot();
      await f.publish(size + 1); const publicationIndexPlan = f.lastPublicationPlan; measured.reset();
      assert.equal(publicationIndexPlan.signalWrites, 1);
      const next = await f.news(page.newsCheckpoint, { newsRuntimeEnabled: true });
      assert.equal(next.count, 1); assert.equal(measured.snapshot().sourceReads, 0); assert(next.readUnits > 0);
      const oneCount = measured.snapshot(); measured.reset();
      const signals = await f.step({ mode: 'news-signals', checkpoint: page.newsCheckpoint }, { newsRuntimeEnabled: true });
      assert.equal(signals.readUnits, measured.snapshot().reads); assert.equal(measured.snapshot().sourceReads, 0);
      const signalBatch = measured.snapshot(), cells = Object.keys(signals.signals.heads).length;
      const row = { sources: size, cells, publicationIndexPlan, metadataRefresh, quietCount, oneCount, signalBatch };
      samples.push(row); t.diagnostic(JSON.stringify(row));
    } finally { for (const cb of scope.callbacks.reverse()) await cb(); }
  }
  const users = 5000, cells = samples[0].cells;
  const model = [0, 1, 100].map(publicationsPerMinute => ({ users, cells, publicationsPerMinute,
    listenerHeadReads: users * (cells + publicationsPerMinute),
    rulesDependentReadUpperModel: users * (cells + publicationsPerMinute) * 7,
    batchRequestsPerMinute: users * 12,
    batchSdkReadsPerMinute: users * 12 * samples[0].signalBatch.reads,
    batchQuotaWritesPerMinute: users * 12,
    headPublicationWritesPerMinute: publicationsPerMinute,
    pendingCountRequestsPerMinuteIfAllPending: users * 4,
    pendingCountSdkReadsPerMinuteIfAllPending: users * 4 * samples[0].oneCount.reads,
  }));
  const path = process.env.B4_NEWS_RUNTIME_REPORT_PATH;
  if (path) {
    if (!/^build\/b4-news-runtime-[a-z0-9-]+\.json$/.test(path.replaceAll('\\', '/'))) throw new Error('news-runtime-report-build-path-required');
    writeFileSync(path, JSON.stringify({ schema: 1, scope: 'Local emulator SDK operations and explicit 5000-session model; no cloud capacity or billing proof', samples, model,
      exclusions: ['metadataRefresh does not hydrate cold body cache; see accepted B4 delta measurements', 'Rules seven dependent documents is a conservative path model, not observed billed reads', 'listener startup is included in listenerHeadReads; reconnection frequency needs explicit addition', 'network JSON bytes exclude headers, compression and billed egress', 'model costs exclude personalized count continuations and transaction retry distribution', 'no live infrastructure, fixtures or switches changed'] }, null, 2) + '\n');
  }
});
