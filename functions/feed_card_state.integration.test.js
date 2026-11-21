import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createFeedRuntime, createFeedGenerationStore } from './feed_runtime.js';
import { publicCardState, prepareCardMutation } from './feed_card_state.js';
import { metadataOf, nodeHash, treeBuilder, verifyNode } from './feed_block_index.js';
import { encodeGeohash } from './geohash.js';
import { createCommentOperation } from './create_comment.js';
import { deleteCommentOperation } from './delete_comment.js';
import { toggleShoutSaveOperation } from './toggle_shout_save.js';
import { finishShoutGeography } from './shout_geography_update.js';
import { operationTestKey } from './test_helpers.js';
import { createCardBackfill } from './feed_card_backfill.js';
import { cellGrid } from './feed_block_index_store.js';
import { log } from 'node:console';
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { accountRetentionMillis } from './account_purge_guard.js';
import { prepareAccountDeletionOperation } from './prepare_account_deletion.js';
import { createShoutOperation } from './create_shout.js';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';
import { deleteShoutOperation } from './delete_shout.js';
import { expireDueShouts } from './shout_expiration.js';
import { archiveAccountContentPage } from './account_content_archive.js';
import { purgeActivity } from './account_purge_activity.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'b4-card-state') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const auth = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
const now = new Date('2026-11-21T12:00:00Z'), clock = () => now;
function source(id, uid, i = 0) {
  const location = { latitude: 50.08 + i / 100000, longitude: 14.44 };
  return { id, authorId: uid, authorNickname: 'Fixture', title: 'Fixture title', text: 'Fixture body',
    location, geohash: encodeGeohash(location.latitude, location.longitude), categories: ['Dotaz'], status: 'active',
    createdAt: Timestamp.fromMillis(now.getTime() - 1000), expiresAt: Timestamp.fromMillis(now.getTime() + 86400000),
    likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0 };
}
async function fixture(t, generations = 2) {
  const uid = randomUUID(), ids = Array.from({ length: generations }, () => 'card-' + randomUUID().slice(0, 8));
  const roots = [db.doc('feedIndexControl/current'), ...ids.map(id => db.doc(`feedIndexGenerations/${id}`)),
    db.doc(`users/${uid}`), db.doc(`publicProfiles/${uid}`), db.doc(`rateLimits/${uid}`)];
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  await db.doc(`users/${uid}`).set({ nickname: 'Fixture', avatarId: 'avatar_1', avatarBackgroundStart: 1, avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  const batch = db.batch();
  ids.forEach(id => batch.create(db.doc(`feedIndexGenerations/${id}`), { schemaVersion: 1, v: 2, cardProjection: 1,
    readIdentity: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1, cardReady: true }));
  batch.set(roots[0], { schemaVersion: 2, revision: 1, mode: ids.length > 1 ? 'building' : 'active',
    readGenerationId: ids[0], writeGenerationIds: ids, cardWriteGenerationIds: ids, cardReadGenerationId: ids[0] });
  await batch.commit();
  const runtime = createFeedRuntime(db, auth, { cardStateEnabled: true, clock });
  const mutate = async (id, update, hook = async () => {}) => runtime.database.runTransaction(async tx => {
    const ref = db.doc(`shouts/${id}`), before = (await tx.get(ref)).data() ?? null;
    const after = typeof update === 'function' ? update(before) : update;
    const plan = await runtime.indexWriter.prepare(tx, id, before, after);
    await hook(tx, plan); plan.apply();
    if (after) tx.set(ref, after); else tx.delete(ref);
    return plan;
  });
  const add = async (i = 0) => { const id = randomUUID(); roots.push(db.doc(`shouts/${id}`)); await mutate(id, source(id, uid, i)); return id; };
  const states = async id => Promise.all(ids.map(async generation => (await db.doc(`feedIndexGenerations/${generation}/publicStates/${id}`).get()).data()));
  return { uid, ids, roots, runtime, mutate, add, states };
}

test('card nodes are explicitly versioned, bounded and rejected by the old verifier', () => {
  const rows = Array.from({ length: 2000 }, (_, i) => metadataOf(source('row' + i, 'fixture', i), { contentIdentity: true, cardProjection: true }));
  const builder = treeBuilder({ cardProjection: true }); for (const cell of new Set(rows.map(row => row.geohash.slice(0, 4)))) builder.build(rows.filter(row => row.geohash.startsWith(cell)), cell);
  for (const [hash, node] of builder.writes) {
    assert.equal(nodeHash(node), hash); assert.throws(() => verifyNode(hash, node), /integrity/);
    verifyNode(hash, node, { cardProjection: true });
    assert(!node.rows || node.rows.length <= 64);
    assert(!node.rows || node.rows.every(row => !Object.hasOwn(row, 'text')));
  }
});

test('card control rejects unmaintained, duplicate and foreign reader generations', () => {
  const control = { schemaVersion: 2, revision: 1, mode: 'active', readGenerationId: 'a', writeGenerationIds: ['a', 'b'],
    cardWriteGenerationIds: ['a'], cardReadGenerationId: 'a' };
  validateFeedIndexControl(control);
  for (const patch of [{ cardWriteGenerationIds: ['c'] }, { cardWriteGenerationIds: ['a', 'a'] },
    { cardReadGenerationId: 'b' }, { schemaVersion: 1 }, { cardReadGenerationId: 'c' }]) {
    assert.throws(() => validateFeedIndexControl({ ...control, ...patch }), /invalid-feed-index-control/);
  }
});

test('atomic source and two generations; no-op, lost reply and rollback keep revisions coherent', { skip: !enabled }, async t => {
  const f = await fixture(t), id = await f.add();
  assert.equal((await db.doc(`shouts/${id}`).get()).get('cardRevision'), 1);
  const initial = await f.states(id); assert.deepEqual(initial[0], initial[1]);
  const noop = await f.runtime.database.runTransaction(async tx => {
    const data = (await tx.get(db.doc(`shouts/${id}`))).data();
    const plan = await f.runtime.indexWriter.prepare(tx, id, data, data); plan.apply(); return plan;
  });
  assert.equal(noop.cardWrites + noop.nodeWrites + noop.directoryWrites, 0);
  await assert.rejects(f.mutate(id, value => ({ ...value, title: 'rollback' }), () => { throw new Error('injected'); }), /injected/);
  assert.deepEqual(await f.states(id), initial);
  const historicalStore = createFeedGenerationStore(db, f.ids[0], { contentIdentity: true, cardProjection: true });
  const historical = await historicalStore.open({ point: { latitude: 50.08, longitude: 14.44 }, radiusKm: 50, now: now.getTime() });
  const cell = (await db.doc(`shouts/${id}`).get()).get('geohash').slice(0, 4);
  const roots = await Promise.all(f.ids.map(gen => db.doc(`feedIndexGenerations/${gen}/cells/${cell}`).get()));
  await f.mutate(id, value => ({ ...value, commentsCount: 1 }));
  const next = await f.states(id); assert.equal(next[0].revision, 2); assert.equal(next[0].bodyVersion, initial[0].bodyVersion);
  assert.deepEqual(next[0], next[1]);
  assert.equal(next[0].commentsCount, 1); assert(!Object.hasOwn(next[0], 'location'));
  const sameRoots = await Promise.all(f.ids.map(gen => db.doc(`feedIndexGenerations/${gen}/cells/${cell}`).get()));
  sameRoots.forEach((doc, i) => assert(doc.updateTime.isEqual(roots[i].updateTime)));
  assert.deepEqual(next[0], publicCardState(id, (await db.doc(`shouts/${id}`).get()).data()));
  await assert.rejects(f.runtime.database.runTransaction(tx => { tx.update(db.doc(`shouts/${id}`), { savesCount: 8 }); return true; }), /unplanned-card/);
  await assert.rejects(f.runtime.database.runTransaction(tx => {
    try { tx.update(db.doc(`shouts/${id}`), { savesCount: 8 }); } catch { /* A swallowed guard must still abort. */ }
    return true;
  }), /unplanned-card/);
  await f.mutate(id, value => ({ ...value, title: 'New public title' }));
  const oldPage = await historical.page(historical.first);
  assert.equal(oldPage.rows[0].bodyVersion, initial[0].bodyVersion);
  assert.notEqual((await f.states(id))[0].bodyVersion, oldPage.rows[0].bodyVersion);
});

test('real comment, delete and save operations keep all projections and receipt replay without extra writes', { skip: !enabled }, async t => {
  const f = await fixture(t), id = await f.add(), database = f.runtime.database;
  const request = data => ({ auth: { uid: f.uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data });
  const input = request({ shoutId: id, text: 'A test comment', idempotencyKey: operationTestKey('card-comment', now) });
  const result = await createCommentOperation(input, database, clock);
  f.roots.push(db.doc(`serverOperations/${result.commentId}`));
  const before = await f.states(id); assert.equal(before[0].commentsCount, 1);
  await createCommentOperation(input, database, clock); assert.deepEqual(await f.states(id), before);
  await deleteCommentOperation(request({ shoutId: id, commentId: result.commentId, idempotencyKey: operationTestKey('card-delete', now) }), database, clock);
  assert.equal((await f.states(id))[0].commentsCount, 0);
  await toggleShoutSaveOperation(request({ shoutId: id, idempotencyKey: operationTestKey('card-save', now) }), database, clock);
  assert.equal((await f.states(id))[0].savesCount, 1);
});

test('geography is fenced against replacement, moved source and deleted authors', { skip: !enabled }, async t => {
  const f = await fixture(t), id = await f.add(), ref = db.doc(`shouts/${id}`), original = await ref.get();
  assert.equal(await finishShoutGeography(f.runtime.database, original, { schemaVersion: 1, countryCode: 'CZ' }, { clock }), true);
  assert.equal((await f.states(id))[0].revision, 2);
  assert.equal(await finishShoutGeography(f.runtime.database, original, { schemaVersion: 1, countryCode: 'SK' }, { clock }), false);
  const other = await f.add(1), snapshot = await db.doc(`shouts/${other}`).get();
  await db.doc(`publicProfiles/${f.uid}`).set({ schemaVersion: 1, accountStatus: 'deleted' });
  assert.equal(await finishShoutGeography(f.runtime.database, snapshot, { schemaVersion: 1 }, { clock }), false);
  const plan = await f.mutate(other, value => ({ ...value, commentsCount: 1 }));
  assert.equal(plan.nodeWrites, 0); assert.equal((await f.states(other))[0], undefined);
});

test('concurrent independent and shared sources, control changes and forgotten apply fail atomically', { skip: !enabled }, async t => {
  const f = await fixture(t, 3), a = await f.add(), b = await f.add(1);
  await Promise.all([a, b, a, b].map(id => f.mutate(id, value => ({ ...value, commentsCount: value.commentsCount + 1 }))));
  for (const id of [a, b]) {
    const states = await f.states(id); assert.equal(states[0].commentsCount, 2); assert.equal(states[0].revision, 3);
    assert.deepEqual(states[0], states[1]); assert.deepEqual(states[1], states[2]);
  }
  await assert.rejects(f.runtime.database.runTransaction(async tx => {
    const ref = db.doc(`shouts/${a}`), data = (await tx.get(ref)).data();
    await prepareCardMutation(f.runtime.database, tx, a, data, { ...data, commentsCount: 100 });
    tx.update(ref, { commentsCount: 100 });
  }), /unapplied-card/);
  assert.equal((await f.states(a))[0].commentsCount, 2);
  await assert.rejects(f.runtime.database.runTransaction(async tx => {
    const ref = db.doc(`shouts/${a}`), data = (await tx.get(ref)).data(), after = { ...data, savesCount: 1 };
    const plan = await prepareCardMutation(f.runtime.database, tx, a, data, after);
    after.savesCount = 8; plan.apply(); tx.set(ref, after);
  }), /card-source-plan-mismatch/);
  await assert.rejects(f.runtime.database.runTransaction(async tx => {
    const ref = db.doc(`shouts/${a}`), data = (await tx.get(ref)).data();
    const plan = await prepareCardMutation(f.runtime.database, tx, a, data, { ...data, savesCount: 1 }); plan.apply();
  }), /unapplied-card/);
  const old = createFeedRuntime(db, auth);
  await assert.rejects(old.database.runTransaction(async tx => {
    const data = (await tx.get(db.doc(`shouts/${a}`))).data();
    await old.indexWriter.prepare(tx, a, data, { ...data, status: 'deleted' });
  }), /publisher-required/);
});

test('real create/reaction/deletion/expiration paths publish coherent versions', { skip: !enabled }, async t => {
  const f = await fixture(t), database = f.runtime.database;
  const request = data => ({ auth: { uid: f.uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data });
  const input = request({ idempotencyKey: operationTestKey('card-create', now), title: 'Create', text: 'A full body', categories: ['Dotaz'], durationMinutes: 60, location: { latitude: 50.08, longitude: 14.44 } });
  const created = await createShoutOperation(input, database, clock, { indexWriter: f.runtime.indexWriter });
  f.roots.push(db.doc(`shouts/${created.shoutId}`));
  assert.equal((await f.states(created.shoutId))[0].revision, 1);
  await toggleShoutReactionOperation(request({ shoutId: created.shoutId, button: 'like', idempotencyKey: operationTestKey('card-like', now) }), database, clock, { indexWriter: f.runtime.indexWriter });
  assert.equal((await f.states(created.shoutId))[0].likesCount, 1);
  await deleteShoutOperation(request({ shoutId: created.shoutId, idempotencyKey: operationTestKey('card-remove', now) }), database, clock, { indexWriter: f.runtime.indexWriter });
  assert.equal((await f.states(created.shoutId))[0].status, 'deleted');
  const id = await f.add(); await f.mutate(id, value => ({ ...value, expiresAt: Timestamp.fromMillis(now.getTime()) }));
  const expired = await expireDueShouts(database, { maxCandidates: 50, clock, indexWriter: f.runtime.indexWriter });
  assert.equal(expired.expired, 1); assert.equal((await f.states(id))[0].status, 'expired');
});

test('archive and final activity cleanup update the foreign parent in the same transaction', { skip: !enabled }, async t => {
  const f = await fixture(t), id = await f.add(), uid = randomUUID(), ref = db.doc(`shouts/${id}`);
  const request = db.doc(`accountDeletionRequests/${uid}`); f.roots.push(request);
  await request.set({ userId: uid, status: 'pending' });
  const stamp = (await request.get()).createTime, time = Math.ceil(stamp.toMillis()) + 1;
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(time) });
  const identity = { projectId: db.projectId, userId: uid, requestCreateTime: stamp };
  await ref.collection('comments').doc('archive').set({ authorId: uid, text: 'Retained comment', createdAt: Timestamp.fromMillis(time) });
  await f.mutate(id, value => ({ ...value, commentsCount: 1, savesCount: 1 }));
  const archived = await archiveAccountContentPage(identity, f.runtime.database, auth, { kind: 'comment', clock: () => new Date(time), transactionGuard: async () => () => {} });
  f.roots.push(db.doc(`accountContentArchive/${archived.archiveId}`));
  assert.equal((await f.states(id))[0].commentsCount, 0);
  const save = ref.collection('saves').doc(uid); await save.set({ userId: uid });
  await f.runtime.database.runTransaction(async tx => {
    const snapshot = await tx.get(save);
    await purgeActivity(tx, snapshot, 'save', uid, { database: f.runtime.database }); tx.delete(save);
  });
  assert.equal((await f.states(id))[0].savesCount, 0);
});

test('50 sources in three distant generations resize before commit; actual 450-write guard rolls back all writes', { skip: !enabled }, async t => {
  const f = await fixture(t, 3), rows = Array.from({ length: 50 }, (_, i) => {
    const row = source('wide-' + String(i).padStart(3, '0'), f.uid);
    row.location = { latitude: -50 + i, longitude: -100 + i };
    row.geohash = encodeGeohash(row.location.latitude, row.location.longitude); return row;
  });
  const writes = rows.map(row => [db.doc(`shouts/${row.id}`), row]);
  rows.forEach(row => f.roots.push(db.doc(`shouts/${row.id}`)));
  for (const generation of f.ids) {
    const base = db.doc(`feedIndexGenerations/${generation}`), builder = treeBuilder({ cardProjection: true });
    for (const row of rows) {
      const cell = row.geohash.slice(0, 4), root = builder.build([metadataOf(row, { contentIdentity: true, cardProjection: true })], cell);
      writes.push([base.collection('cells').doc(cell), { v: 1, hash: root.hash, minExpiry: root.minExpiry, revision: 1, ...cellGrid(cell) }]);
      writes.push([base.collection('publicStates').doc(row.id), publicCardState(row.id, row)]);
    }
    writes.push(...[...builder.writes].map(([id, node]) => [base.collection('nodes').doc(id), node]));
  }
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch(); writes.slice(i, i + 450).forEach(([ref, data]) => batch.set(ref, data)); await batch.commit();
  }
  const request = { auth: { uid: f.uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: { expectedUserId: f.uid, idempotencyKey: operationTestKey('card-prepare', now) } };
  const result = await prepareAccountDeletionOperation(request, f.runtime.database, clock, { indexWriter: f.runtime.indexWriter });
  assert(result.hidden > 0 && result.hidden < 50); assert.equal(result.hasMore, true);
  assert.deepEqual(await prepareAccountDeletionOperation(request, f.runtime.database, clock, { indexWriter: f.runtime.indexWriter }), result);
  const id = rows.at(-1).id, before = await f.states(id), junk = db.doc('cardFixture/rollback'); f.roots.push(junk);
  await assert.rejects(f.runtime.database.runTransaction(async tx => {
    const ref = db.doc(`shouts/${id}`), data = (await tx.get(ref)).data();
    const plan = await f.runtime.indexWriter.prepare(tx, id, data, { ...data, savesCount: 20 });
    plan.apply(); tx.update(ref, { savesCount: 20 });
    for (let i = 0; i < 450; i++) tx.set(junk, { i });
  }), /write-budget-exceeded/);
  assert.deepEqual(await f.states(id), before); assert.equal((await junk.get()).exists, false);
});

test('cold R5 runner removes public states and private historical identity without resurrecting it', { skip: !enabled }, async t => {
  const f = await fixture(t, 1), id = await f.add(), foreign = await f.add(1);
  const foreignOwner = randomUUID();
  await f.mutate(foreign, value => ({ ...value, authorId: foreignOwner }));
  const request = db.doc(`accountDeletionRequests/${f.uid}`); f.roots.push(request);
  await request.set({ userId: f.uid, status: 'pending' });
  const stamp = (await request.get()).createTime, future = Math.ceil(stamp.toMillis()) + accountRetentionMillis;
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(Math.ceil(stamp.toMillis())) });
  await db.doc(`publicProfiles/${f.uid}`).set({ schemaVersion: 1, accountStatus: 'deleted' });
  const identity = { projectId: db.projectId, userId: f.uid, requestCreateTime: stamp };
  let result, calls = 0;
  do {
    const store = createFeedGenerationStore(db, f.ids[0], { contentIdentity: 'generation', cardProjection: 'generation' });
    result = await store.purgeAccountIndex(identity, { clock: () => new Date(future), reads: 2, deletes: 1 });
    assert(++calls < 500);
  } while (result.state !== 'complete');
  assert.equal((await f.states(id))[0], undefined); assert((await f.states(foreign))[0]);
  const remaining = await db.doc(`feedIndexGenerations/${f.ids[0]}`).collection('nodes').get();
  assert(remaining.docs.every(doc => !doc.data().rows?.some(row => row.authorId === f.uid)));
  await f.mutate(id, value => ({ ...value, commentsCount: 1 }));
  assert.equal((await f.states(id))[0], undefined);
});

function measuredDatabase(database) {
  const metrics = { reads: 0, writes: 0, jsonBytes: 0, attempts: 0 };
  const account = result => {
    const docs = Array.isArray(result) ? result : result.docs ?? [result];
    metrics.reads += Math.max(1, docs.length);
    for (const doc of docs) if (doc.exists) metrics.jsonBytes += Buffer.byteLength(JSON.stringify(doc.data()));
    return result;
  };
  const measured = new Proxy(database, { get(target, key) {
    if (key === 'getAll') return async (...args) => account(await target.getAll(...args));
    if (key === 'runTransaction') return (callback, ...options) => target.runTransaction(async real => {
      metrics.attempts++;
      const tx = new Proxy(real, { get(transaction, method) {
        if (method === 'get' || method === 'getAll') return async (...args) => account(await transaction[method](...args));
        if (['create', 'update', 'set', 'delete'].includes(method)) return (...args) => { metrics.writes++; transaction[method](...args); return tx; };
        return typeof transaction[method] === 'function' ? transaction[method].bind(transaction) : transaction[method];
      } });
      return callback(tx);
    }, ...options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  return { db: measured, metrics, reset() { Object.keys(metrics).forEach(key => { metrics[key] = 0; }); } };
}

test('50/200/2000: resumable backfill, pinned audit, current writer and measured header/body paths', { skip: !enabled }, async t => {
  const reports = [];
  for (const count of [50, 200, 2000]) {
    await t.test(String(count), async child => {
      const f = await fixture(child, 1), original = f.ids[0], target = 'card-' + randomUUID().slice(0, 8);
      const base = db.doc(`feedIndexGenerations/${original}`), builder = treeBuilder();
      const rows = Array.from({ length: count }, (_, i) => source(`measure-${count}-${String(i).padStart(4, '0')}`, f.uid, i));
      const writes = rows.map(row => [db.doc(`shouts/${row.id}`), row]);
      for (const cell of new Set(rows.map(row => row.geohash.slice(0, 4)))) {
        const root = builder.build(rows.filter(row => row.geohash.startsWith(cell)).map(row => metadataOf(row, { contentIdentity: true })), cell);
        writes.push([base.collection('cells').doc(cell), { v: 1, hash: root.hash, minExpiry: root.minExpiry, revision: 1, ...cellGrid(cell) }]);
      }
      writes.push(...[...builder.writes].map(([id, node]) => [base.collection('nodes').doc(id), node]));
      for (let start = 0; start < writes.length; start += 450) {
        const batch = db.batch(); writes.slice(start, start + 450).forEach(([ref, data]) => batch.set(ref, data)); await batch.commit();
      }
      child.after(async () => {
        for (let start = 0; start < rows.length; start += 450) {
          const batch = db.batch(); rows.slice(start, start + 450).forEach(row => batch.delete(db.doc(`shouts/${row.id}`))); await batch.commit();
        }
      });
      await base.set({ schemaVersion: 1, v: 1, accountRetention: true, readIdentity: 1, erasureRevision: 0, prunedThrough: -1 });
      await f.roots[0].set({ schemaVersion: 1, revision: 1, mode: 'active', readGenerationId: original, writeGenerationIds: [original] });
      f.roots.push(db.doc(`feedIndexGenerations/${target}`), db.doc(`feedIndexMaintenance/cardBackfills/jobs/${target}`));
      const meter = measuredDatabase(db), fresh = () => createCardBackfill(meter.db, original, target);
      await fresh().begin(1); meter.reset();
      if (count === 50) {
        await f.roots[0].update({ revision: 3 });
        await assert.rejects(fresh().step(), /stale-card-backfill/);
        await f.roots[0].update({ revision: 2 }); meter.reset();
      }
      let progress, steps = 0;
      do { progress = await fresh().step(); assert(++steps < 500); } while (progress.phase === 'backfill');
      const backfill = { ...meter.metrics, steps };
      // Simulate a response lost after commit by restarting from the persisted cursor.
      const runtime = createFeedRuntime(db, auth, { cardStateEnabled: true });
      await runtime.database.runTransaction(async tx => {
        const ref = db.doc(`shouts/${rows[0].id}`), data = (await tx.get(ref)).data();
        const plan = await runtime.indexWriter.prepare(tx, ref.id, data, { ...data, commentsCount: 1 });
        plan.apply(); tx.update(ref, { commentsCount: 1 });
      });
      if (count === 50) {
        const ref = db.doc(`feedIndexGenerations/${target}/publicStates/${rows[0].id}`), saved = (await ref.get()).data();
        await ref.update({ commentsCount: 999 }); await fresh().beginAudit();
        await assert.rejects(async () => { for (let i = 0; i < 20; i++) await fresh().auditStep(); }, /coverage-mismatch/);
        assert.equal((await fresh().markerRef.get()).get('cardReady'), false);
        await ref.set(saved);
      }
      meter.reset(); await fresh().beginAudit();
      do { progress = await fresh().auditStep(); assert(++steps < 1000); } while (progress.phase !== 'ready');
      const audit = { ...meter.metrics };
      assert.equal((await db.doc(`feedIndexGenerations/${target}`).get()).get('cardReady'), true);
      const store = createFeedGenerationStore(meter.db, target, { contentIdentity: true, cardProjection: true });
      async function select(index = store) {
        const view = await index.open({ point: { latitude: 50.08, longitude: 14.44 }, radiusKm: 50, now: now.getTime(), uid: f.uid });
        let page;
        do { page = await view.page(view.first, { nodes: 32 }); } while (page.state === 'preparing');
        return page.rows;
      }
      meter.reset(); const selected = await select(); assert.equal(selected.length, 50);
      await meter.db.getAll(...selected.map(row => db.doc(`shouts/${row.id}`)));
      const cold = { ...meter.metrics }; meter.reset();
      const warm = await select(); assert.deepEqual(warm.map(row => row.bodyVersion), selected.map(row => row.bodyVersion));
      const warmHeaders = { ...meter.metrics }; meter.reset();
      await meter.db.getAll(db.doc(`shouts/${selected[0].id}`)); const oneMissingBody = { ...meter.metrics };
      const oldStore = createFeedGenerationStore(meter.db, original, { contentIdentity: true });
      meter.reset(); const oldSelected = await select(oldStore);
      assert.deepEqual(oldSelected.map(row => row.id), selected.map(row => row.id));
      await meter.db.getAll(...oldSelected.map(row => db.doc(`shouts/${row.id}`))); const oldCold = { ...meter.metrics };
      meter.reset(); const oldWarmSelected = await select(oldStore);
      await meter.db.getAll(...oldWarmSelected.map(row => db.doc(`shouts/${row.id}`))); const oldWarm = { ...meter.metrics };
      meter.reset(); const measuredRuntime = createFeedRuntime(meter.db, auth, { cardStateEnabled: true });
      await measuredRuntime.database.runTransaction(async tx => {
        const ref = db.doc(`shouts/${rows[1].id}`), data = (await tx.get(ref)).data();
        const plan = await measuredRuntime.indexWriter.prepare(tx, ref.id, data, { ...data, savesCount: 1 });
        assert.equal(plan.nodeWrites + plan.directoryWrites + plan.historyWrites, 0);
        plan.apply(); tx.update(ref, { savesCount: 1 });
      });
      const counter = { ...meter.metrics };
      reports.push({ sources: count, backfill, audit, oldCold, oldWarm, cold, warmHeaders, oneMissingBody, counter });
    });
  }
  log('B4_CARD_REPORT ' + JSON.stringify(reports));
  if (process.env.B4_CARD_REPORT) writeFileSync(process.env.B4_CARD_REPORT, JSON.stringify({ scope: 'emulator SDK operations; header selection plus optional source bodies; excludes Auth/AppCheck, Home and live streams', reports }, null, 2) + '\n');
});
