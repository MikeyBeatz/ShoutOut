import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { writeFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { bodyProjectionLab } from './feed_body_lab.js';
import { consistentBodyReader } from './feed_body_reader.js';
import { bodySelectionCodec, canonicalBody } from './feed_body_contract.js';
import { metadataOf } from './feed_block_index.js';
import { encodeGeohash } from './create_shout.js';
import { captureFeedReadRevision } from './feed_read_snapshot.js';
import { planReadBlocks, readContentHash, readRetentionMillis } from './read_sync_blocks.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'body-reader-tests') : null;
const raw = app ? getFirestore(app) : null, roots = [];
const point = { latitude: 50.08, longitude: 14.44 };
const codec = bodySelectionCodec(Buffer.alloc(32, 21));
after(async () => {
  if (!app) return;
  for (const root of roots) await raw.recursiveDelete(root);
  await raw.terminate(); await deleteApp(app);
});
// Independent SDK observer includes the existing spatial selector and policy
// reads as well as the new reader. No text/UID/token is logged in measurements.
function observe(db) {
  const metrics = { reads: 0, queries: 0, emptyQueries: 0, requests: 0 };
  const reset = () => { for (const key of Object.keys(metrics)) metrics[key] = 0; };
  const note = value => {
    metrics.requests++;
    if (Array.isArray(value.docs)) { metrics.queries++; if (!value.docs.length) metrics.emptyQueries++; metrics.reads += Math.max(1, value.docs.length); }
    else metrics.reads += Array.isArray(value) ? value.length : 1;
    return value;
  };
  const reader = target => new Proxy(target, { get(real, key) {
    if (key === 'get' || key === 'getAll') return async (...args) => note(await real[key](...args));
    return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
  } });
  const wrapped = reader(db);
  return { metrics, reset, db: new Proxy(wrapped, { get(real, key) {
    if (key === 'runTransaction') return (operation, options) => db.runTransaction(tx => operation(reader(tx)), options);
    return real[key];
  } }) };
}
async function fixture(count = 2, { read = [], unreadFirst = true, order = 'nearest' } = {}) {
  const observed = observe(raw), db = observed.db;
  const namespace = `bread-${randomUUID().slice(0, 8)}`, uid = `${namespace}-reader`;
  const index = createLabBlockIndex(db, { namespace, contentIdentity: true, accountRetention: true });
  await index.seed([]); await index.base.update({ schemaVersion: 1, readIdentity: 1 });
  const lab = bodyProjectionLab(db, { namespace, indexes: [index], extendedState: true });
  const users = db.doc(`users/${uid}`), control = db.doc('feedIndexControl/current');
  const authorIds = [`${namespace}-a0`, `${namespace}-a1`];
  roots.push(lab.base, users, control, db.doc(`bans/${uid}`), db.doc(`accountDeletionRequests/${uid}`),
    ...authorIds.map(id => db.doc(`publicProfiles/${id}`)));
  await users.set({ nickname: 'B4 reader' }); await users.collection('legal').doc('acceptance_2026_07_25').set({});
  for (const id of authorIds) await db.doc(`publicProfiles/${id}`).set({ nickname: 'B4 author' });
  await control.set({ schemaVersion: 1, revision: 1, mode: 'active', readGenerationId: namespace, writeGenerationIds: [namespace] });
  const start = Date.now();
  const rows = Array.from({ length: count }, (_, i) => {
    const location = { latitude: point.latitude + i * .0001, longitude: point.longitude };
    return { id: `row-${i}`, authorId: authorIds[i % 2], authorNickname: 'Author', title: `Read transaction ${i}`,
      text: 'Synthetic content. '.repeat(100), status: 'active', categories: ['Dotaz'], location,
      geohash: encodeGeohash(location.latitude, location.longitude), createdAt: Timestamp.fromMillis(start - 1000),
      expiresAt: Timestamp.fromMillis(start + 7200000), likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0,
      businessHighlighted: true, businessSpotlight: true, businessPromotion: 'spotlight' };
  });
  for (let i = 0; i < count; i += 50) await lab.mutate(rows.slice(i, i + 50).map(row => ({ id: row.id, after: row })));
  if (read.length) {
    const plan = await planReadBlocks(read.map(i => ({ shoutId: rows[i].id, contentHash: readContentHash(rows[i].title, rows[i].text),
      expiresAt: rows[i].expiresAt.toMillis(), retainUntil: rows[i].expiresAt.toMillis() + readRetentionMillis,
      confirmedAt: Date.now() - 1 })), async () => undefined, { revision: 1, maxReads: 256, maxWrites: 256 });
    const batch = db.batch();
    for (const [id, value] of plan.writes) batch.set(users.collection('readBuckets').doc(id), value);
    batch.set(users.collection('readState').doc('current'), { v: 1, revision: 1 }); await batch.commit();
  }
  const snapshot = await index.capturePortable({ uid, point, radiusKm: 20, now: Date.now(), order, unreadFirst });
  if (unreadFirst) {
    snapshot.context.readPolicy = 'content-v1';
    snapshot.context.readRevision = await captureFeedReadRevision(db, uid, snapshot.readTime);
  }
  const marker = await lab.base.get();
  const startedAt = Math.floor(snapshot.readTime.seconds * 1000 + snapshot.readTime.nanoseconds / 1000000);
  const session = { startedAt, expiresAt: startedAt + 3600000, incarnation: [marker.createTime.seconds, marker.createTime.nanoseconds] };
  const f = { db, raw, observed, namespace, uid, users, control, authorIds, lab, index, rows, snapshot, session,
    now: Math.max(Date.now(), startedAt) };
  f.request = { auth: { uid, token: { email: 'reader@example.test', email_verified: true } }, app: { appId: 'local' }, data: { expectedUserId: uid } };
  f.reader = (options = {}) => consistentBodyReader(db, { binding: lab.binding, store: lab, request: f.request, snapshot,
    session, codec, clock: () => f.now, ...options });
  f.metadata = (input = rows.slice(0, 50)) => input.map(row => metadataOf(row, { contentIdentity: true }));
  f.resolve = (position = {}) => async ({ classifyRead, readIds, assertSessionAlive }) => {
    let result;
    for (let step = 0; step < 32; step++) {
      result = await index.portablePage(snapshot, position, { uid, classifyRead, readIds, assertSessionAlive, nodes: 32 });
      if (result.state !== 'preparing') { f.lastPosition = result.position; return result.rows; }
      position = result.position;
    }
    throw new Error('bounded-selector-exhausted');
  };
  return f;
}

test('cold/warm/refill use exactly one final transaction, real B3 grouping and public-only state', { skip: !enabled }, async () => {
  const f = await fixture(2, { read: [0] }), reader = f.reader();
  const cold = await reader.select(f.resolve(), { cold: true });
  assert.deepEqual(cold.rows.map(row => [row.id, row.read]), [['row-1', false], ['row-0', true]]);
  assert.equal(reader.metrics.finalTransactions, 1); assert.equal(reader.metrics.sourceReads, 2);
  const wire = JSON.stringify(cold);
  assert.equal(wire.includes('eligibility'), false); assert.equal(wire.includes('latitude'), false);
  assert.equal(wire.includes('readRevision'), false);
  assert.equal(cold.bodies[0].body.businessPromotion, 'spotlight');
  const manifest = await reader.select(f.resolve());
  assert.equal(reader.metrics.sourceReads, 0); assert.equal(reader.metrics.finalTransactions, 1);
  const old = f.rows[0]; await f.lab.mutate([{ id: old.id, after: { ...old, commentsCount: 3, savesCount: 1 } }]);
  const completed = await reader.complete(manifest.token, ['row-0']);
  assert.equal(reader.metrics.sourceReads, 1); assert.equal(reader.metrics.finalTransactions, 1);
  assert.equal(completed.rows.find(row => row.id === 'row-0').state.commentsCount, 3);
  assert.equal(completed.token, manifest.token); assert.equal(completed.expiresAt, manifest.expiresAt);
  const replay = await reader.complete(manifest.token, ['row-0']); assert.deepEqual(replay, completed);
  await assert.rejects(reader.complete(manifest.token, ['foreign']), /missing/);
  if (process.env.B4_READ_WIRE_PATH) {
    const full = await reader.complete(manifest.token, manifest.rows.map(row => row.id));
    writeFileSync(process.env.B4_READ_WIRE_PATH, JSON.stringify({ cold, manifest, completed: full }, null, 2) + '\n');
  }
});
test('mutation of body, text, exact location, category, promotion or availability between phases rejects entire page', { skip: !enabled }, async () => {
  const f = await fixture(1);
  const row = f.rows[0], near = { latitude: row.location.latitude + .00000001, longitude: row.location.longitude };
  assert.equal(encodeGeohash(near.latitude, near.longitude), row.geohash);
  for (const extra of [{ title: 'Edited' }, { avatarId: 'new' }, { location: near }, { categories: ['Tip'] },
    { businessHighlighted: false }, { status: 'deleted' }, { expiresAt: Timestamp.fromMillis(f.now - 1) }]) {
    const reader = f.reader(), page = await reader.select(f.metadata());
    await f.lab.mutate([{ id: row.id, after: { ...row, ...extra } }]);
    await assert.rejects(reader.complete(page.token, []));
    await f.lab.mutate([{ id: row.id, after: row }]);
  }
  // Text changed before initial assembly must not reuse the old B3 read group.
  await f.lab.mutate([{ id: row.id, after: { ...row, text: 'Changed before selection' } }]);
  await assert.rejects(f.reader().select(f.metadata()), /feed-session-expired/);
});
test('actual admission and final policy reject missing App Check, legal acceptance, ban, pending deletion, blocks and erased authors', { skip: !enabled }, async () => {
  const f = await fixture(1), row = f.rows[0], reader = f.reader();
  const page = await reader.select(f.metadata());
  const actions = [
    [async () => { f.request.app = null; }, async () => { f.request.app = { appId: 'local' }; }],
    [async () => f.users.collection('legal').doc('acceptance_2026_07_25').delete(), async () => f.users.collection('legal').doc('acceptance_2026_07_25').set({})],
    [async () => f.db.doc(`bans/${f.uid}`).set({}), async () => f.db.doc(`bans/${f.uid}`).delete()],
    [async () => f.db.doc(`accountDeletionRequests/${f.uid}`).set({ status: 'pending' }), async () => f.db.doc(`accountDeletionRequests/${f.uid}`).delete()],
    [async () => f.users.collection('blocked').doc(row.authorId).set({}), async () => f.users.collection('blocked').doc(row.authorId).delete()],
    [async () => f.db.doc(`publicProfiles/${row.authorId}`).set({ schemaVersion: 1, accountStatus: 'deleted' }), async () => f.db.doc(`publicProfiles/${row.authorId}`).set({ nickname: 'Restored fixture' })],
  ];
  for (const [change, restore] of actions) {
    await change(); await assert.rejects(reader.complete(page.token, [])); await restore();
  }
  let called = false; f.request.app = null;
  await assert.rejects(reader.select(async () => { called = true; return f.metadata(); }));
  assert.equal(called, false); f.request.app = { appId: 'local' };
});
test('R5 phase/version, generation pause/ABA and original deadline cannot authorize cached bodies', { skip: !enabled }, async () => {
  const f = await fixture(1), reader = f.reader(), page = await reader.select(f.metadata());
  const cell = f.snapshot.roots[0].path, fence = f.lab.base.collection('cellRetention').doc(cell);
  await fence.set({ v: 1, version: 1, phase: 'erasing', owner: 'a'.repeat(64) });
  await assert.rejects(reader.complete(page.token, []), /feed-session-expired/);
  await fence.set({ v: 1, version: 1, phase: 'ready' });
  await assert.rejects(reader.complete(page.token, []), /feed-session-expired/);
  await fence.delete();
  await f.control.update({ mode: 'paused', readGenerationId: null });
  await assert.rejects(reader.complete(page.token, []), /feed-session-expired/);
  await f.control.update({ mode: 'active', readGenerationId: f.namespace });
  const marker = (await f.lab.base.get()).data();
  await f.lab.base.delete(); await f.lab.base.create(marker);
  await assert.rejects(reader.complete(page.token, []), /feed-session-expired/);
  f.now = f.session.expiresAt; await assert.rejects(reader.complete(page.token, []), /feed-session-expired/);
});
test('final policy catches revocation after admission; response loss/offline and clock expiry remain safely repeatable', { skip: !enabled }, async () => {
  const f = await fixture(1), metadata = f.metadata(), reader = f.reader();
  await assert.rejects(reader.select(async () => {
    await f.db.doc(`bans/${f.uid}`).set({}); return metadata;
  }), error => error.code === 'permission-denied');
  await f.db.doc(`bans/${f.uid}`).delete();
  const page = await reader.select(metadata);
  const offline = f.reader({ store: { ...f.lab, readBodies: async () => { throw new Error('injected-offline'); } } });
  await assert.rejects(offline.complete(page.token, ['row-0']), /offline/);
  const first = await reader.complete(page.token, ['row-0']);
  const restarted = f.reader(); assert.deepEqual(await restarted.complete(page.token, ['row-0']), first);
  const expiry = f.reader({ store: { ...f.lab, async readBodies(...args) {
    const sources = await f.lab.readBodies(...args); f.now = f.session.expiresAt; return sources;
  } } });
  await assert.rejects(expiry.complete(page.token, ['row-0']), /feed-session-expired/);
});
test('one read-only snapshot cannot mix old projection with a newer body or lose projection write rollback', { skip: !enabled }, async () => {
  const f = await fixture(1), row = f.rows[0]; let changed = false;
  const reader = f.reader({ store: { ...f.lab, async readStates(...args) {
    const states = await f.lab.readStates(...args);
    if (!changed) { changed = true; await f.lab.mutate([{ id: row.id, after: { ...row, text: 'new after snapshot' } }]); }
    return states;
  } } });
  const page = await reader.select(f.metadata(), { cold: true });
  assert.equal(page.bodies[0].body.text, row.text); // Snapshot predates the concurrent write.
  await assert.rejects(f.reader().select(f.metadata()), /feed-session-expired/);
  await f.lab.mutate([{ id: row.id, after: row }]);
  await assert.rejects(f.lab.mutate([{ id: row.id, after: { ...row, commentsCount: 2 } }], { beforeApply: () => { throw new Error('rollback'); } }), /rollback/);
  assert.equal((await f.lab.states([row.id])).get(row.id).commentsCount, 0);
  await assert.rejects(f.lab.mutate([{ id: row.id, after: { ...row, commentsCount: 2 } }], { additionalWrites: 450 }), /budget/);
  assert.equal((await f.lab.source.doc(row.id).get()).get('commentsCount'), 0);
  await f.lab.source.doc(row.id).update({ text: 'unmanaged source corruption' });
  await assert.rejects(f.reader().select(f.metadata(), { cold: true }), /projection-inconsistent/);
});
test('real progressive selection keeps 200 cards grouped over pages and rejects an account/context proof swap', { skip: !enabled }, async () => {
  const f = await fixture(200, { read: Array.from({ length: 70 }, (_, i) => i) });
  const reader = f.reader(), all = []; let position = {};
  do {
    const page = await reader.select(f.resolve(position), { cold: false });
    all.push(...page.rows); position = f.lastPosition;
  } while (position);
  assert.equal(all.length, 200); assert.equal(new Set(all.map(row => row.id)).size, 200);
  assert.deepEqual(all.map(row => row.read), [...Array(130).fill(false), ...Array(70).fill(true)]);
  const page = await reader.select(f.metadata());
  await assert.rejects(reader.select(f.metadata(f.rows.slice(0, 51))), /invalid-body-selection/);
  const otherSnapshot = copy(f.snapshot); otherSnapshot.context.radiusKm = 50;
  const other = f.reader({ snapshot: otherSnapshot });
  await assert.rejects(other.complete(page.token, []), /scope/);
  f.request.data.expectedUserId = 'other'; await assert.rejects(reader.complete(page.token, []), /account-changed/);
});
test('ungrouped Top/ending/followed modes preserve selected order and presentation-only changes preserve B3 reading', { skip: !enabled }, async () => {
  const grouped = await fixture(1, { read: [0] });
  await grouped.lab.mutate([{ id: grouped.rows[0].id, after: { ...grouped.rows[0], avatarId: 'changed-presentation' } }]);
  const marked = await grouped.reader().select(grouped.metadata(), { cold: true });
  assert.equal(marked.rows[0].read, true); assert.equal(marked.bodies[0].body.avatarId, 'changed-presentation');
  for (const order of ['popular', 'endingSoon', 'followed']) {
    const f = await fixture(2, { unreadFirst: false, order });
    await f.lab.mutate([{ id: f.rows[0].id, after: { ...f.rows[0], text: 'new text without unread grouping' } }]);
    const selected = f.metadata().reverse();
    const page = await f.reader().select(selected, { cold: true });
    assert.deepEqual(page.rows.map(row => row.id), selected.map(row => row.id));
    assert.equal(page.unreadFirst, false);
    assert.equal(page.bodies.find(body => body.id === f.rows[0].id).body.text, 'new text without unread grouping');
  }
});
const copy = value => JSON.parse(JSON.stringify(value));

test('50/200 measurement includes actual guards and spatial reads, never estimates them away', { skip: !enabled }, async () => {
  const report = { units: 'SDK read units and JSON representation bytes, not billing or network bytes',
    scope: 'prepared signed snapshot; admission + real progressive selection/B3 classification + final policy/blocks/bodies',
    excludes: ['initial snapshot creation', 'Auth/App Check platform verification', 'existing Home/live/private subscriptions', 'network overhead and Firestore index-entry billing'], cases: [] };
  for (const count of [50, 200]) {
    const f = await fixture(count, { read: [count - 1] });
    const measured = async (kind, cold) => {
      const reader = f.reader(); f.observed.reset();
      const result = await reader.select(f.resolve(), { cold });
      return { result, value: { kind, ...reader.metrics, wholeSdk: { ...f.observed.metrics },
        responseJsonBytes: Buffer.byteLength(canonicalBody(result)), callableRoundTrips: 1 } };
    };
    const cold = await measured('cold', true), warm = await measured('warm', false);
    assert.equal(cold.value.blockReads, warm.value.blockReads);
    assert.equal(cold.value.sourceReads, 50); assert.equal(warm.value.sourceReads, 0);
    assert.equal(cold.value.finalTransactions, 1); assert.equal(warm.value.finalTransactions, 1);
    const reader = f.reader(); f.observed.reset(); const completed = await reader.complete(warm.result.token, ['row-0']);
    const refill = { ...reader.metrics, wholeSdk: { ...f.observed.metrics }, responseJsonBytes: Buffer.byteLength(canonicalBody(completed)),
      combinedBlockAndSourceReads: warm.value.blockReads + reader.metrics.blockReads + reader.metrics.sourceReads,
      combinedWholeReads: warm.value.wholeSdk.reads + f.observed.metrics.reads, callableRoundTrips: 2 };
    assert.equal(refill.sourceReads, 1);
    report.cases.push({ count, cold: cold.value, warm: warm.value, refill,
      unchangedHomeAndParentEstablishmentModel: 100, ownPrivateSubscriptions: 'unchanged; measured separately before activation',
      model5000WarmAssemblies: warm.value.wholeSdk.reads * 5000 });
  }
  log(`B4_READ_MEASUREMENT ${JSON.stringify(report)}`);
  if (process.env.B4_READ_MEASURE_PATH) writeFileSync(process.env.B4_READ_MEASURE_PATH, JSON.stringify(report, null, 2) + '\n');
});
