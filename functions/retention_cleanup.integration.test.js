// Destructive fixtures run only in the fixed local emulator project.
import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import console from 'node:console';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { runReadRetentionCleanup as reads, runContinuingReceiptCleanup as receipts, runRetentionMaintenance } from './retention_cleanup.js';
import { readContentHash, readRetentionMillis as week, planReadBlocks } from './read_sync_blocks.js';
import { syncReadBatchOperation as upload, getReadStatePageOperation as download } from './read_sync.js';
import { cleanupAccountPrivatePage } from './account_private_cleanup.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'retention-cleanup-tests') : null;
const db = app ? getFirestore(app) : null, roots = [];
const readState = () => db.doc('maintenanceState/readRetentionCleanup');
const receiptState = () => db.doc('maintenanceState/continuingReceiptCleanup');
const base = Math.floor(Date.now() / 60000) * 60000, day = Math.floor((base - week) / 86400000);
let millis;
const clock = () => new Date(millis), options = () => ({ clock, maxMillis: 10000 });
const row = (i, expiresAt = base - week - 86400000) => ({ shoutId: `fixture-${i}`, contentHash: readContentHash('Title', String(i)),
  expiresAt, retainUntil: expiresAt + week, confirmedAt: expiresAt - 1000 });
beforeEach(async () => { if (db) { millis = base; await readState().delete(); await receiptState().delete(); } });
after(async () => {
  if (!db) return;
  for (const ref of roots) await db.recursiveDelete(ref);
  await readState().delete(); await receiptState().delete(); await db.terminate(); await deleteApp(app);
});
async function fixture(t, rows = []) {
  const uid = randomUUID(), user = db.doc(`users/${uid}`); roots.push(user);
  t.after(() => db.recursiveDelete(user));
  await user.set({ nickname: 'Fixture' }); await user.collection('legal').doc('acceptance_2026_07_25').set({});
  await user.collection('readState').doc('current').set({ v: 1, revision: 7 });
  const nodes = new Map();
  // Prepare in bounded chunks exactly like uploads, without eligibility overhead.
  for (let i = 0; i < rows.length; i += 32) {
    const plan = await planReadBlocks(rows.slice(i, i + 32), async id => nodes.get(id), { revision: 7 });
    for (const [id, node] of plan.writes) nodes.set(id, node);
  }
  const batch = db.batch();
  for (const [id, node] of nodes) batch.set(user.collection('readBuckets').doc(id), node);
  await batch.commit();
  const request = data => ({ auth: { uid, token: { email_verified: true, email: 'fixture@example.test' } }, app: { appId: 'fixture' },
    data: { expectedUserId: uid, ...data } });
  return { uid, user, nodes, request, entries: async () => (await user.collection('readBuckets').get()).docs.flatMap(d => Object.values(d.get('entries') ?? {})) };
}
async function receiptFixture(t, count, { unknown = 0 } = {}) {
  const refs = [], records = [];
  for (let i = 0; i < count + unknown; i++) {
    const ref = db.collection('serverOperations').doc(`retention-${randomUUID()}`); refs.push(ref);
    records.push({ userId: 'fixture', action: i < count ? 'toggleShoutSave' : 'futureOperation',
      createdAt: Timestamp.fromMillis(base - week - 1000), keyVersion: 1, expiresAt: Timestamp.fromMillis(base - 1000) });
  }
  for (let start = 0; start < refs.length; start += 400) {
    const part = db.batch();
    for (let i = start; i < Math.min(start + 400, refs.length); i++) part.set(refs[i], records[i]);
    await part.commit();
  }
  t.after(async () => { for (let start = 0; start < refs.length; start += 400) {
    const batch = db.batch(); for (const ref of refs.slice(start, start + 400)) batch.delete(ref); await batch.commit();
  } });
  return refs;
}

test('read cleanup prunes the exact boundary, keeps valid/private data and preserves revision', { skip: !enabled }, async t => {
  const expired = row(1, base - week), live = row(2, base - week + 1), future = row(3, base + 86400000);
  const f = await fixture(t, [row(0), expired, live, future]);
  const result = await reads(db, options());
  assert.equal(result.state, 'complete'); assert.equal(result.deleted, 1); assert.equal(result.pruned, 1);
  assert.deepEqual((await f.entries()).map(r => r.shoutId).sort(), [live.shoutId, future.shoutId].sort());
  assert.equal((await f.user.collection('readState').doc('current').get()).get('revision'), 7);
  assert.equal((await f.user.get()).get('nickname'), 'Fixture');
  assert.equal((await reads(db, options())).state, 'idle');
});

test('partial-day split trees remain usable for an actual upload and full download', { skip: !enabled }, async t => {
  const records = Array.from({ length: 140 }, (_, i) => row(i, base - week + (i ? 3600000 : 0))), f = await fixture(t, records);
  const before = (await f.user.collection('readBuckets').get()).size;
  const result = await reads(db, options()); assert.equal(result.pruned, 1); assert.equal(result.deleted, 0);
  assert.equal((await f.user.collection('readBuckets').get()).size, before);
  const shoutId = `retention-source-${randomUUID()}`, source = db.doc(`shouts/${shoutId}`); roots.push(source); t.after(() => source.delete());
  const expiresAt = base - week + 3600000;
  await source.set({ authorId: f.uid, status: 'expired', title: 'new', text: 'valid', expiresAt: Timestamp.fromMillis(expiresAt) });
  const item = { shoutId, contentHash: readContentHash('new', 'valid'), expiresAt };
  assert.equal((await upload(f.request({ items: [item] }), db, { clock })).items[0].status, 'accepted');
  const page = await download(f.request({}), db, { clock, key: new Uint8Array(32).fill(1), pageSize: 32 });
  assert.equal(page.items.length, 140); assert(page.items.some(r => r.shoutId === shoutId));
  millis += 2 * 86400000;
  assert.equal((await reads(db, options())).state, 'complete');
  assert.equal((await f.user.collection('readBuckets').get()).size, 0);
});

test('cold invocations resume past malformed/foreign records and report review without deleting them', { skip: !enabled }, async t => {
  const f = await fixture(t, [row(1)]), bad = f.user.collection('readBuckets').doc('bad');
  const foreign = db.doc(`retentionForeign/${randomUUID()}/readBuckets/foreign`); roots.push(foreign.parent.parent); t.after(() => db.recursiveDelete(foreign.parent.parent));
  await bad.set({ day: day - 2 + 0.5, v: 99 }); await foreign.set({ day: day - 3 });
  let result, scanned = 0;
  for (let i = 0; i < 8; i++) {
    result = await reads(db, { ...options(), pageSize: 1, maxPages: 1 }); scanned += result.scanned;
    if (result.state === 'complete') break;
  }
  assert.equal(result.state, 'complete'); assert.equal(scanned, 3); assert.equal(result.needsReview, true);
  assert((await bad.get()).exists); assert((await foreign.get()).exists); assert.equal((await f.entries()).length, 0);
});

test('unexpected subcollections and a failed metadata probe preserve source and checkpoint', { skip: !enabled }, async t => {
  const f = await fixture(t, [row(1)]), ref = f.user.collection('readBuckets').doc([...f.nodes.keys()][0]);
  await ref.collection('unexpected').doc('child').set({ preserve: true });
  const report = await reads(db, options()); assert.equal(report.skipped, 1); assert(report.needsReview); assert((await ref.get()).exists);
  await readState().delete();
  const failed = await reads(db, { ...options(), childProbe: { async hasChildren() { throw Error('unavailable'); } } });
  assert.equal(failed.state, 'failed'); assert.equal((await readState().get()).get('cursor'), null); assert((await ref.get()).exists);
});

test('failure rolls back the page and a later invocation resumes it', { skip: !enabled }, async t => {
  const f = await fixture(t, [row(1)]);
  const result = await reads(db, { ...options(), beforeCommit() { throw Error('fixture-failure'); } });
  assert.equal(result.state, 'failed'); assert.equal((await f.entries()).length, 1);
  assert.equal((await readState().get()).get('cursor'), null);
  millis += 60000; assert.equal((await reads(db, options())).deleted, 1);
});

test('lease expiry aborts destructive work and another owner safely recovers', { skip: !enabled }, async t => {
  const f = await fixture(t, [row(1)]);
  const result = await reads(db, { ...options(), beforeCommit() { millis += 120001; } });
  assert.equal(result.state, 'lease-lost'); assert.equal((await f.entries()).length, 1);
  millis += 60000; assert.equal((await reads(db, options())).deleted, 1);
});

test('concurrent workers cannot both consume the same page', { skip: !enabled }, async t => {
  await fixture(t, [row(1)]);
  const results = await Promise.all([reads(db, options()), reads(db, options())]);
  assert.equal(results.reduce((sum, r) => sum + r.deleted, 0), 1);
  assert(results.some(r => r.state === 'complete')); assert(results.some(r => ['idle', 'busy'].includes(r.state)));
});

test('lost commit acknowledgement resumes from the atomic durable checkpoint', { skip: !enabled }, async t => {
  const f = await fixture(t, [row(1), row(2, base - week - 2 * 86400000)]); let commits = 0;
  const unreliable = new Proxy(db, { get(target, name) {
    if (name === 'runTransaction') return async (...args) => {
      const value = await target.runTransaction(...args); if (++commits === 2) throw Error('lost-ack'); return value;
    };
    return typeof target[name] === 'function' ? target[name].bind(target) : target[name];
  } });
  const result = await reads(unreliable, { ...options(), pageSize: 1, maxPages: 1 });
  assert.equal(result.state, 'failed'); assert.equal((await f.entries()).length, 1); assert((await readState().get()).get('cursor'));
  millis += 60000;
  assert.equal((await reads(db, options())).deleted, 1); assert.equal((await f.entries()).length, 0);
});

test('corrupt checkpoints fail closed and monotonic time budget yields before another page', { skip: !enabled }, async t => {
  const f = await fixture(t, [row(1)]);
  await readState().set({ v: 99 }); const failed = await reads(db, options()); assert.equal(failed.state, 'failed'); assert(failed.needsReview);
  assert.equal((await f.entries()).length, 1); await readState().delete();
  let tick = 0;
  const yielded = await reads(db, { ...options(), elapsedClock: () => (tick++ ? 10001 : 0) });
  assert.equal(yielded.state, 'yielded'); assert.equal(yielded.pages, 0); assert.equal((await f.entries()).length, 1);
  assert.equal((await reads(db, options())).deleted, 1);
});

test('receipt continuation crosses the former daily ceiling and independently attempts both phases', { skip: !enabled }, async t => {
  const refs = await receiptFixture(t, 650), f = await fixture(t, Array.from({ length: 1000 }, (_, i) => row(i)));
  const totals = { deleted: 0, reads: 0, writes: 0, metadata: 0, invocations: 0 }; let result;
  for (let i = 0; i < 8; i++) {
    result = await receipts(db, { ...options(), maxPages: 3 }); totals.invocations++;
    totals.deleted += result.deleted; totals.reads += result.metrics.readUnits; totals.writes += result.metrics.committedWrites; totals.metadata += result.metrics.metadataRequests;
    if (result.state === 'complete') break;
  }
  assert.equal(result.state, 'complete'); assert.equal(totals.deleted, refs.length); assert(totals.invocations >= 5);
  const both = await runRetentionMaintenance(db, { receipts: { ...options(), pageSize: 0 }, reads: options() });
  assert.equal(both.receipts.state, 'failed'); assert.equal(both.reads.state, 'complete'); assert.equal((await f.entries()).length, 0);
  console.log('B2_RETENTION_BENCH ' + JSON.stringify({ receipts: totals, readBlocks: both.reads, excludes: 'fixture setup/cleanup, index billing, cloud/network cost; emulator SDK counts only' }));
});

test('concurrent sync preserves a valid new marker during partial-day cleanup', { skip: !enabled }, async t => {
  const expired = row(1, base - week), live = row(2, base - week + 3600000), f = await fixture(t, [expired, live]);
  const shoutId = `retention-race-${randomUUID()}`, source = db.doc(`shouts/${shoutId}`); roots.push(source); t.after(() => source.delete());
  const expiresAt = live.expiresAt;
  await source.set({ authorId: f.uid, status: 'expired', title: 'race', text: 'valid', expiresAt: Timestamp.fromMillis(expiresAt) });
  const item = { shoutId, contentHash: readContentHash('race', 'valid'), expiresAt };
  const [cleaned, synced] = await Promise.all([reads(db, options()), upload(f.request({ items: [item] }), db, { clock })]);
  assert.equal(cleaned.state, 'complete'); assert.equal(synced.items[0].status, 'accepted');
  assert.deepEqual((await f.entries()).map(r => r.shoutId).sort(), [live.shoutId, shoutId].sort());
});

test('a frozen epoch leaves later expirations to the next epoch after a cold resume', { skip: !enabled }, async t => {
  const a = await fixture(t, [row(1, base - week + 10)]), b = await fixture(t, [row(2, base - week + 10)]);
  const first = await reads(db, { ...options(), pageSize: 1, maxPages: 1 }); assert.equal(first.state, 'yielded');
  millis += 20;
  const next = await reads(db, options()); assert.equal(next.state, 'complete');
  assert.equal((await a.entries()).length + (await b.entries()).length, 2);
  millis += 60000;
  assert.equal((await reads(db, options())).pruned, 2);
});

test('unknown receipts do not starve later pages and unchanged cooldown costs one read', { skip: !enabled }, async t => {
  const refs = await receiptFixture(t, 2, { unknown: 2 }); let report;
  for (let i = 0; i < 6; i++) {
    report = await receipts(db, { ...options(), pageSize: 1, maxPages: 1 });
    if (report.state === 'complete') break;
  }
  assert.equal(report.state, 'complete'); assert.equal(report.needsReview, true);
  assert.equal((await db.getAll(...refs)).filter(doc => doc.exists).length, 2);
  const idle = await receipts(db, options()); assert.equal(idle.state, 'idle');
  assert.equal(idle.metrics.readUnits, 1); assert.equal(idle.metrics.committedWrites, 0); assert.equal(idle.metrics.metadataRequests, 0);
});

test('account-private deletion can overlap retention without reviving data or changing another account', { skip: !enabled }, async t => {
  const f = await fixture(t, [row(1), row(2, base + 86400000)]), other = await fixture(t, [row(3, base + 86400000)]);
  const request = db.doc(`accountDeletionRequests/${f.uid}`); roots.push(request); t.after(() => request.delete());
  await request.set({ userId: f.uid, status: 'pending' });
  const identity = { projectId: db.projectId, userId: f.uid, requestCreateTime: (await request.get()).createTime };
  const auth = { async getUser() { throw Object.assign(new Error('gone'), { code: 'auth/user-not-found' }); } };
  const opts = { readSyncEnabled: true, transactionGuard: async () => () => {} };
  const [retention] = await Promise.all([reads(db, options()), cleanupAccountPrivatePage(identity, db, auth, opts)]);
  assert.equal(retention.state, 'complete');
  await cleanupAccountPrivatePage(identity, db, auth, opts);
  assert.equal((await f.user.collection('readBuckets').get()).size, 0);
  assert.equal((await f.user.collection('readState').get()).size, 0);
  assert.equal((await other.entries()).length, 1);
  assert((await f.user.get()).exists);
});

test('empty epochs and repeated idle checks have explicit bounded SDK costs', { skip: !enabled }, async () => {
  for (const run of [reads, receipts]) {
    const first = await run(db, options()); assert.equal(first.state, 'complete');
    assert.equal(first.metrics.readUnits, 3); assert.equal(first.metrics.committedWrites, 2); assert.equal(first.metrics.metadataRequests, 0);
    const again = await run(db, options()); assert.equal(again.state, 'idle');
    assert.equal(again.metrics.readUnits, 1); assert.equal(again.metrics.committedWrites, 0);
  }
});

test('a tampered cursor never widens the retention query or changes its source', { skip: !enabled }, async t => {
  const f = await fixture(t, [row(1), row(2, base - week - 2 * 86400000)]);
  await reads(db, { ...options(), maxPages: 1, pageSize: 1 });
  await readState().update({ cursor: { path: `users/${f.uid}/readBuckets/wrong`, day: day + 1 } });
  const before = (await f.user.collection('readBuckets').get()).size;
  assert.equal(before, 1);
  const result = await reads(db, options()); assert.equal(result.state, 'failed'); assert(result.needsReview);
  assert.equal((await f.user.collection('readBuckets').get()).size, before);
});
