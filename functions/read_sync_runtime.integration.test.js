// Isolated emulator-only B2 runtime tests, not a paid/cloud load benchmark.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createReadSyncRuntime, deriveReadSyncCursorKey } from './read_sync_runtime.js';
import { readContentHash, readKey, readBucketId } from './read_sync_blocks.js';
import { feedCursorCodec } from './feed_cursor.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'read-runtime-tests') : null;
const db = app ? getFirestore(app) : null, roots = [], key = new Uint8Array(32).fill(9);
const control = db?.doc('maintenanceState/readSyncControl');
after(async () => {
  if (!db) return;
  for (const ref of roots) await db.recursiveDelete(ref);
  await control.delete(); await db.terminate(); await deleteApp(app);
});
function measured(database) {
  const stats = { reads: 0, attemptedWrites: 0, committedWrites: 0, attempts: 0, commits: 0 };
  const count = value => { stats.reads += Array.isArray(value) ? value.length : value.docs ? Math.max(1, value.size) : 1; return value; };
  return { stats, database: new Proxy(database, { get(target, method) {
    if (method === 'runTransaction') return async (operation, ...options) => {
      let finalWrites = 0;
      const result = await target.runTransaction(async tx => {
        stats.attempts++; let writes = 0;
        const observed = new Proxy(tx, { get(real, name) {
          if (name === 'get' || name === 'getAll') return async (...args) => count(await real[name](...args));
          if (['set', 'create', 'delete', 'update'].includes(name)) return (...args) => { stats.attemptedWrites++; writes++; real[name](...args); return observed; };
          return typeof real[name] === 'function' ? real[name].bind(real) : real[name];
        } });
        const value = await operation(observed); finalWrites = writes; return value;
      }, ...options);
      stats.commits++; stats.committedWrites += finalWrites; return result;
    };
    return typeof target[method] === 'function' ? target[method].bind(target) : target[method];
  } }) };
}
const reason = expected => error => error.details?.reason === expected;
async function fixture(count = 1) {
  await control.set({ v: 1, revision: 1, mode: 'active' });
  const uid = randomUUID(), user = db.doc(`users/${uid}`), source = db.doc(`readRuntimeFixtures/${uid}`);
  roots.push(user, source, db.doc(`rateLimits/${uid}`), db.doc(`accountDeletionRequests/${uid}`), db.doc(`bans/${uid}`));
  await user.set({ nickname: 'Read fixture' });
  await user.collection('legal').doc('acceptance_2026_07_25').set({});
  let millis = Date.now(); const expiresAt = millis + 86400000, items = [];
  for (let start = 0; start < count; start += 400) {
    const batch = db.batch();
    for (let i = start; i < Math.min(count, start + 400); i++) {
      const shoutId = `row-${i}`, title = `Title ${i}`, text = 'Full content';
      batch.set(source.collection('source').doc(shoutId), { authorId: uid, title, text, status: 'active', expiresAt: Timestamp.fromMillis(expiresAt) });
      items.push({ shoutId, contentHash: readContentHash(title, text), expiresAt });
    }
    await batch.commit();
  }
  // Namespaced sources isolate 10k synthetic docs from all other emulator suites.
  const remapped = new Proxy(db, { get(target, name) {
    if (name === 'doc') return path => path.startsWith('shouts/') ? source.collection('source').doc(path.slice(7)) : db.doc(path);
    return typeof target[name] === 'function' ? target[name].bind(target) : target[name];
  } });
  const observation = measured(remapped);
  const options = { key, clock: () => new Date(millis) };
  return { uid, user, items, options, stats: observation.stats,
    runtime: extra => createReadSyncRuntime(observation.database, { ...options, ...extra }),
    advance: ms => { millis += ms; },
    request: data => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: { expectedUserId: uid, ...data } }),
    rate: direction => db.doc(`rateLimits/${uid}/actions/readSync${direction}`),
  };
}

test('identity, control and malformed requests reject before rate writes or history work', { skip: !enabled }, async () => {
  const f = await fixture(), runtime = f.runtime(), request = f.request({ items: f.items });
  for (const r of [{ ...request, auth: null }, { ...request, app: null },
    { ...request, auth: { uid: f.uid, token: { email: 'x', email_verified: false } } }, f.request({ items: [] }), f.request({ expectedUserId: 'other', items: f.items })]) {
    await assert.rejects(runtime.upload(r));
  }
  assert.equal(f.stats.reads, 0);
  for (const mode of ['off', 'paused', 'broken']) {
    await control.set({ v: 1, revision: 2, mode });
    await assert.rejects(runtime.upload(request));
    await assert.rejects(runtime.download(f.request({})));
  }
  await control.delete(); await assert.rejects(runtime.upload(request));
  assert.equal((await f.rate('Upload').get()).exists, false);
  assert.equal((await f.rate('Download').get()).exists, false);
  assert.equal((await f.user.collection('readBuckets').get()).size, 0);
});

test('shared UID token bucket is atomic across devices, independent by direction, and denies without writes', { skip: !enabled }, async () => {
  const f = await fixture(), r = f.runtime();
  for (let i = 0; i < 39; i++) await r.upload(f.request({ items: f.items }));
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => f.runtime().upload(f.request({ items: f.items }))));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  for (const x of results.filter(x => x.status === 'rejected')) assert(reason('read-sync-rate-limit')(x.reason));
  const before = await f.rate('Upload').get();
  await assert.rejects(r.upload(f.request({ items: f.items })), reason('read-sync-rate-limit'));
  assert((await f.rate('Upload').get()).updateTime.isEqual(before.updateTime));
  assert.equal((await r.download(f.request({}))).items.length, 1);
  const other = await fixture();
  await other.runtime().upload(other.request({ items: other.items }));
  await assert.rejects(r.upload(f.request({ items: f.items })), reason('read-sync-rate-limit'));
  f.advance(999); await assert.rejects(r.upload(f.request({ items: f.items })), reason('read-sync-rate-limit'));
  f.advance(1); await r.upload(f.request({ items: f.items }));
  assert.equal((await f.user.collection('readState').doc('current').get()).get('revision'), 1);
});

test('deletion beginning after admission prevents the first history write', { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(f.runtime({ afterAdmission: () => db.doc(`accountDeletionRequests/${f.uid}`).set({ status: 'pending' }) })
    .upload(f.request({ items: f.items })), { code: 'failed-precondition' });
  assert.equal((await f.user.collection('readBuckets').get()).size, 0);
  assert.equal((await f.user.collection('readState').doc('current').get()).exists, false);
});

test('a pinned historical continuation still checks current authority and control', { skip: !enabled }, async () => {
  const f = await fixture(), batch = db.batch();
  batch.set(f.user.collection('readState').doc('current'), { v: 1, revision: 1 });
  for (let i = 0; i < 33; i++) batch.set(f.user.collection('readBuckets').doc(`d${10000 + i}_r`),
    { v: 1, revision: 1, kind: 'leaf', day: 10000 + i, prefix: '', entries: {} });
  await batch.commit();
  const first = await f.runtime().download(f.request({}));
  assert.equal(first.items.length, 0); assert.equal(typeof first.next, 'string');
  assert.throws(() => feedCursorCodec({ key }).decode(first.next, { uid: f.uid, project: db.projectId, now: f.options.clock().getTime() }));
  await assert.rejects(f.runtime({ afterRead: () => control.set({ v: 1, revision: 2, mode: 'paused' }) })
    .download(f.request({ cursor: first.next })), reason('read-sync-paused'));
});

test('pause or deletion after admission fences uploads; current checks reject historical download after deletion or pause', { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(f.runtime({ afterAdmission: () => control.set({ v: 1, revision: 2, mode: 'paused' }) }).upload(f.request({ items: f.items })), reason('read-sync-paused'));
  assert.equal((await f.user.collection('readBuckets').get()).size, 0);
  await control.set({ v: 1, revision: 3, mode: 'active' });
  await f.runtime().upload(f.request({ items: f.items }));
  await assert.rejects(f.runtime({ afterRead: () => control.set({ v: 1, revision: 4, mode: 'paused' }) }).download(f.request({})), reason('read-sync-paused'));
  await control.set({ v: 1, revision: 5, mode: 'active' });
  await assert.rejects(f.runtime({ afterAdmission: async () => {
    await control.set({ v: 1, revision: 6, mode: 'paused' }); await control.set({ v: 1, revision: 7, mode: 'active' });
  } }).upload(f.request({ items: f.items })), reason('read-sync-control-changed'));
  const deletion = db.doc(`accountDeletionRequests/${f.uid}`);
  await assert.rejects(f.runtime({ afterRead: () => deletion.set({ status: 'pending' }) }).download(f.request({})), { code: 'failed-precondition' });
  const rateBefore = await f.rate('Upload').get();
  await assert.rejects(f.runtime().upload(f.request({ items: f.items })), { code: 'failed-precondition' });
  assert((await f.rate('Upload').get()).updateTime.isEqual(rateBefore.updateTime));
});

test('unchanged download uses 14 point reads plus one quota write; replay does not rewrite history', { skip: !enabled }, async () => {
  const f = await fixture(), r = f.runtime();
  const first = await r.upload(f.request({ items: f.items }));
  const buckets = await f.user.collection('readBuckets').get();
  for (const name of Object.keys(f.stats)) f.stats[name] = 0;
  const result = await r.download(f.request({ knownRevision: first.revision }));
  assert.equal(result.unchanged, true); assert.equal(f.stats.reads, 14); assert.equal(f.stats.committedWrites, 1);
  console.log('B2_RUNTIME_UNCHANGED ' + JSON.stringify(f.stats));
  await r.upload(f.request({ items: f.items }));
  assert((await buckets.docs[0].ref.get()).updateTime.isEqual(buckets.docs[0].updateTime));
});

test('work budget has a distinct typed error and rolls back all history writes', { skip: !enabled }, async () => {
  const f = await fixture(), row = f.items[0], day = Math.floor(row.expiresAt / 86400000);
  const bits = [...readKey(row.shoutId, row.contentHash)].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
  const batch = db.batch();
  for (let i = 0; i < 201; i++) batch.set(f.user.collection('readBuckets').doc(readBucketId(day, bits.slice(0, i))), { v: 1, revision: 1, kind: 'branch', day, prefix: bits.slice(0, i) });
  await batch.commit();
  await assert.rejects(f.runtime().upload(f.request({ items: f.items })), reason('read-sync-work-budget'));
  assert.equal((await f.user.collection('readState').doc('current').get()).exists, false);
  assert.equal((await f.user.collection('readBuckets').get()).size, 201);
});

test('read continuation is account/project/purpose bound and rejected cursors do not spend quota', { skip: !enabled }, async () => {
  const f = await fixture();
  const now = f.options.clock().getTime(), codec = feedCursorCodec({ key: deriveReadSyncCursorKey(key) });
  const cursor = codec.start({ uid: f.uid, project: db.projectId, now, readTime: { seconds: Math.floor(now / 1000), nanoseconds: now % 1000 * 1000000 },
    context: { kind: 'read-sync-v1', revision: 1, fromRevision: 0 }, position: { after: 'd1_r', afterRevision: 1 } });
  assert.throws(() => feedCursorCodec({ key }).decode(cursor, { uid: f.uid, project: db.projectId, now }));
  await assert.rejects(f.runtime().download(f.request({ cursor: cursor + 'x' })), reason('read-sync-snapshot-expired'));
  await assert.rejects(f.runtime().download(f.request({ cursor, expectedUserId: 'other' })));
  assert.equal((await f.rate('Download').get()).exists, false);
});

for (const count of [1000, 10000]) test(`runtime drains ${count} markers with quota/restart and paginates the complete snapshot`, { skip: !enabled }, async () => {
  const f = await fixture(count); let r = f.runtime(), calls = 0, waits = 0, replayed = false, attempts = 0;
  for (let i = 0; i < count;) {
    if (++attempts > 2 * Math.ceil(count / 32) + 2) throw new Error('runtime-test-did-not-make-progress');
    const items = f.items.slice(i, i + 32);
    try {
      const result = await r.upload(f.request({ items }));
      assert(result.items.every(x => x.status === 'accepted')); calls++;
      if (!replayed) { // Lost response: repeat the first committed batch.
        const revision = result.revision; r = f.runtime();
        assert.equal((await r.upload(f.request({ items }))).revision, revision); replayed = true; calls++;
      }
      i += items.length;
      if (count === 10000 && Math.floor(i / 1000) !== Math.floor((i - items.length) / 1000)) {
        console.log('B2_RUNTIME_PROGRESS ' + JSON.stringify({ count, completed: i }));
      }
    } catch (error) {
      if (!reason('read-sync-rate-limit')(error)) throw error;
      assert(error.details.retryAfterMs > 0); waits++; f.advance(error.details.retryAfterMs); r = f.runtime();
    }
  }
  let cursor = null, pages = 0; const seen = new Set();
  do {
    const page = await r.download(f.request(cursor ? { cursor } : {}));
    pages++; for (const row of page.items) { assert(!seen.has(row.shoutId)); seen.add(row.shoutId); }
    cursor = page.next;
  } while (cursor);
  assert.equal(seen.size, count); assert.equal(calls, Math.ceil(count / 32) + 1);
  assert.equal(waits, Math.max(0, calls - 40));
  console.log('B2_RUNTIME_QUEUE ' + JSON.stringify({ count, calls, waits, pages, ...f.stats, cloudLoadUsers: 0 }));
});
