// Component measurement only. Synthetic Firestore emulator data; no Auth accounts.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { metadataOf, treeBuilder } from '../functions/feed_block_index.js';
import { cellGrid } from '../functions/feed_block_index_store.js';
import { feedRuntimeBlockCache, feedRuntimeConfiguration } from '../functions/feed_runtime.js';
import { feedPageHostOptions, feedPrivateReadCache } from '../functions/feed_serving_options.js';
import { getFeedPageOperation } from '../functions/get_feed_page.js';
import { planReadBlocks, readContentHash, readRetentionMillis } from '../functions/read_sync_blocks.js';
import { encodeGeohash } from '../functions/geohash.js';

const root = resolve(import.meta.dirname, '..'), point = { latitude: 50.08, longitude: 14.44 };
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const { Timestamp, GeoPoint } = functionsRequire('firebase-admin/firestore');
function meter(db, counts) {
  const record = value => {
    counts.sdkReadCalls++;
    const docs = Array.isArray(value) ? value : value.docs ?? [value];
    counts.sdkDocumentReadUnits += Math.max(1, docs.length);
    if (!docs.length) counts.emptyQueryReadUnits++;
    for (const doc of docs) {
      const path = doc.ref.path;
      const kind = path.startsWith('shouts/') ? 'sourceReadUnits' : /\/readBuckets\//.test(path) ? 'privateBlockReadUnits' :
        /^feedIndexGenerations\/[^/]+\/(nodes|cells)\//.test(path) ? 'publicIndexReadUnits' : 'otherReadUnits';
      counts[kind]++;
    }
    return value;
  };
  const wrap = target => new Proxy(target, { get(real, key) {
    if (key === 'get' || key === 'getAll') return async (...args) => record(await real[key](...args));
    if (key === 'runTransaction') return (fn, ...options) => real.runTransaction(tx => {
      counts.transactionAttempts++; return fn(wrap(tx));
    }, ...options);
    if (['create', 'set', 'update', 'delete'].includes(key)) return (...args) => { counts.writeCalls++; return real[key](...args); };
    return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
  } });
  return wrap(db);
}
async function scenario(db, { history, dayOffset }) {
  const uid = `b3-measure-${randomUUID()}`, users = [uid + '-a', uid + '-b'], generation = `measure-${randomUUID().slice(0, 8)}`;
  const control = db.doc('feedIndexControl/current'), base = db.doc(`feedIndexGenerations/${generation}`), roots = [];
  assert.equal((await control.get()).exists, false, 'measurement requires an isolated emulator');
  const time = Date.now(), key = randomBytes(32), context = { point, radiusKm: 5, order: 'nearest', category: null, readPolicy: 'confirmed-v1' };
  const rows = Array.from({ length: 120 }, (_, i) => {
    const location = { latitude: point.latitude + i * .0001, longitude: point.longitude };
    return { id: `b3-measure-card-${String(i).padStart(3, '0')}`, authorId: uid, authorNickname: 'Synthetic author', title: `Title ${i}`, text: `Body ${i}`,
      status: 'active', location, geohash: encodeGeohash(location.latitude, location.longitude), categories: ['Dotaz'],
      createdAt: time - 1000, expiresAt: time + 7200000, likesCount: 0, dislikesCount: 0 };
  });
  try {
    const batch = db.batch(), builder = treeBuilder(), regions = new Map();
    for (const row of rows) {
      const ref = db.doc(`shouts/${row.id}`); batch.create(ref, { ...row,
        location: new GeoPoint(row.location.latitude, row.location.longitude),
        createdAt: Timestamp.fromMillis(row.createdAt), expiresAt: Timestamp.fromMillis(row.expiresAt) });
      const cell = row.geohash.slice(0, 4); if (!regions.has(cell)) regions.set(cell, []);
      regions.get(cell).push(metadataOf(row, { contentIdentity: true }));
    }
    batch.create(control, { schemaVersion: 1, revision: 1, mode: 'active', readGenerationId: generation, writeGenerationIds: [generation] });
    batch.create(base, { schemaVersion: 1, v: 1, accountRetention: true, readIdentity: 1, erasureRevision: 0, prunedThrough: -1 });
    for (const [cell, items] of regions) {
      const descriptor = builder.build(items, cell);
      batch.create(base.collection('cells').doc(cell), { v: 1, revision: 1, hash: descriptor.hash,
        minExpiry: descriptor.minExpiry, ...cellGrid(cell) });
    }
    for (const [hash, node] of builder.writes) batch.create(base.collection('nodes').doc(hash), node);
    await batch.commit(); roots.push(control, base, ...rows.map(row => db.doc(`shouts/${row.id}`)));
    let historyBlocks = 0;
    for (let account = 0; account < 2; account++) {
      const profile = db.doc(`users/${users[account]}`); roots.push(profile);
      await profile.create({ nickname: 'Synthetic B3 measurement' }); await profile.collection('legal').doc('acceptance_2026_07_25').set({});
      const read = rows.slice(0, account === 0 ? 70 : 20);
      const records = [...Array.from({ length: history }, (_, i) => ({ shoutId: `unrelated-${i}`, contentHash: readContentHash('History', `Body ${i}`),
        expiresAt: rows[0].expiresAt + dayOffset * 86400000 })), ...read.map(row => ({ shoutId: row.id,
        contentHash: readContentHash(row.title, row.text), expiresAt: row.expiresAt }))]
        .map(row => ({ ...row, confirmedAt: time - 1, retainUntil: row.expiresAt + readRetentionMillis }));
      const plan = await planReadBlocks(records, async () => undefined, { maxReads: 2000, maxWrites: 1000 });
      const writes = [...plan.writes]; historyBlocks = Math.max(historyBlocks, writes.length);
      for (let start = 0; start < writes.length; start += 400) {
        const seed = db.batch(); for (const [id, value] of writes.slice(start, start + 400)) seed.create(profile.collection('readBuckets').doc(id), value);
        await seed.commit();
      }
      await profile.collection('readState').doc('current').create({ v: 1, revision: 1 });
    }
    const phases = [], configuration = { ...feedRuntimeConfiguration, compatibleGenerations: true, unreadFirst: true };
    async function page(name, account, cursor = null) {
      const counts = { sdkReadCalls: 0, sdkDocumentReadUnits: 0, emptyQueryReadUnits: 0, sourceReadUnits: 0,
        privateBlockReadUnits: 0, publicIndexReadUnits: 0, otherReadUnits: 0, transactionAttempts: 0, writeCalls: 0 };
      const measured = meter(db, counts), components = {}, start = performance.now(); let steps = 0, result;
      const options = { key, ...feedPageHostOptions(configuration), observeMetrics(values) {
        for (const [name, n] of Object.entries(values)) if (typeof n === 'number') components[name] = (components[name] ?? 0) + n;
      } };
      do {
        result = await getFeedPageOperation({ auth: { uid: users[account], token: { email: 'fixture@example.test', email_verified: true } },
          app: { appId: 'fixture' }, data: { expectedUserId: users[account], ...(cursor ? { cursor } : { context }) } }, measured, options);
        cursor = result.next; steps++; assert(steps <= 32);
      } while (result.state === 'preparing');
      assert.equal(result.items.length, 50); assert.equal(counts.writeCalls, 0);
      assert.equal(counts.sdkDocumentReadUnits, counts.sourceReadUnits + counts.privateBlockReadUnits + counts.publicIndexReadUnits +
        counts.otherReadUnits + counts.emptyQueryReadUnits);
      phases.push({ name, account: account ? 'B' : 'A', steps, cards: result.items.length, elapsedMillis: Math.round(performance.now() - start),
        responseBytes: Buffer.byteLength(JSON.stringify(result)), ...counts, components });
      return result;
    }
    feedRuntimeBlockCache.clear(); feedPrivateReadCache.clear();
    const first = await page('cold-first', 0);
    assert.deepEqual(first.items.map(item => item.id), rows.slice(70).map(row => row.id));
    const second = await page('warm-next', 0, first.next);
    assert.deepEqual(second.items.map(item => item.id), rows.slice(0, 50).map(row => row.id));
    assert.equal(phases.at(-1).privateBlockReadUnits, 0);
    const replay = await page('warm-replay', 0, first.next); assert.deepEqual(replay, second);
    await page('new-refresh', 0); assert(phases.at(-1).privateBlockReadUnits > 0);
    feedRuntimeBlockCache.clear(); feedPrivateReadCache.clear();
    const evicted = await page('evicted-next', 0, first.next); assert.deepEqual(evicted, second);
    const other = await page('other-account', 1); assert.deepEqual(other.items.map(item => item.id), rows.slice(20, 70).map(row => row.id));
    assert(phases.at(-1).privateBlockReadUnits > 0);
    feedRuntimeBlockCache.clear(); feedPrivateReadCache.clear(); await page('cold-new-refresh', 0);
    return { history, dayOffset, relevantShouts: rows.length, confirmedRelevant: [70, 20], historyBlocks, phases };
  } finally {
    feedRuntimeBlockCache.clear(); feedPrivateReadCache.clear();
    for (const ref of roots) await db.recursiveDelete(ref);
  }
}
export async function main(argv = []) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('measurement-requires-local-firestore-emulator');
  if (argv.length && (argv.length !== 2 || argv[0] !== '--output')) throw new Error('invalid-measurement-options');
  const output = resolve(root, argv[1] ?? 'build/b3-operator/measurements.json'), inside = relative(root, output);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('measurement-output-must-stay-in-workspace');
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp, deleteApp } = require('firebase-admin/app'), { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: 'shoutout-rules-test' }, 'b3-component-measurement'), db = getFirestore(app);
  const modules = ['functions/get_feed_page.js', 'functions/feed_read_snapshot.js', 'functions/feed_runtime.js', 'functions/feed_serving_options.js',
    'functions/feed_block_index_store.js', 'tools/measure_feed_b3.mjs'];
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), sourceBase: 'e066f970bac0659ba38b3406a372e4ea408f71ff',
    sourceHashes: Object.fromEntries(modules.map(name => [name, createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex')])),
    environment: { project: 'shoutout-rules-test', emulator: '127.0.0.1:8080', authAccountsCreated: 0 },
    limitations: ['Component SDK document reads, including empty queries, not billable index entries or the complete Firebase bill.',
      'SDK read calls are not total wire RPCs; transaction begin/commit, credentials, HTTP callable and App Check overhead are excluded.',
      'Cold process is simulated by clearing both caches; emulator timing is not cloud throughput or latency.',
      'Fixture setup, marker synchronization, observation and cleanup are excluded. No 5000-user load is measured.'], cases: [] };
  try {
    for (const spec of [{ history: 0, dayOffset: 0 }, { history: 100, dayOffset: 0 }, { history: 1000, dayOffset: 0 },
      { history: 10000, dayOffset: 0 }, { history: 10000, dayOffset: 1 }]) {
      const value = await scenario(db, spec); report.cases.push(value);
      console.log(JSON.stringify({ history: spec.history, dayOffset: spec.dayOffset,
        phases: value.phases.map(p => ({ name: p.name, total: p.sdkDocumentReadUnits, private: p.privateBlockReadUnits, source: p.sourceReadUnits })) }));
    }
    mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    return { output, cases: report.cases.length, liveWrites: 0 };
  } finally { await db.terminate(); await deleteApp(app); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(error); process.exitCode = 1; });
}
