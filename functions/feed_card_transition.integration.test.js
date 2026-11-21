import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createFeedRuntime, createFeedGenerationStore } from './feed_runtime.js';
import { planCardTransition, runCardTransitionStep, cardTransitionStatus } from './feed_card_transition_operator.js';
import { getFeedDeltaOperation, getCompatibleFeedPageOperation } from './feed_delta.js';
import { getFeedPageOperation } from './get_feed_page.js';
import { encodeGeohash } from './geohash.js';
import { createCommentOperation } from './create_comment.js';
import { deleteCommentOperation } from './delete_comment.js';
import { toggleShoutSaveOperation } from './toggle_shout_save.js';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';
import { deleteShoutOperation } from './delete_shout.js';
import { prepareAccountDeletionOperation } from './prepare_account_deletion.js';
import { operationTestKey } from './test_helpers.js';
import { accountRetentionMillis } from './account_purge_guard.js';
import { expireDueShouts } from './shout_expiration.js';
import { createShoutOperation } from './create_shout.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'card-transition') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const filters = { point: { latitude: 50.08, longitude: 14.44 }, radiusKm: 50, order: 'nearest', category: null, readPolicy: 'confirmed-v1' };
function meter(raw) {
  const counts = { reads: 0, writes: 0, attempts: 0 };
  const note = result => { counts.reads += Math.max(1, (Array.isArray(result) ? result : result.docs ?? [result]).length); return result; };
  const wrapped = new Proxy(raw, { get(target, key) {
    if (key === 'doc') return path => new Proxy(target.doc(path), { get(ref, method) {
      if (method === 'get') return async (...args) => note(await ref.get(...args));
      return typeof ref[method] === 'function' ? ref[method].bind(ref) : ref[method];
    } });
    if (key === 'runTransaction') return (callback, ...options) => target.runTransaction(async real => {
      counts.attempts++;
      const tx = new Proxy(real, { get(real, key) {
        if (['get', 'getAll'].includes(key)) return async (...args) => note(await real[key](...args));
        if (['create', 'update', 'set', 'delete'].includes(key)) return (...args) => { counts.writes++; real[key](...args); return tx; };
        return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
      } }); return callback(tx);
    }, ...options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  return { db: wrapped, counts, reset() { Object.keys(counts).forEach(key => { counts[key] = 0; }); } };
}
async function fixture(t, count = 55) {
  const uid = randomUUID(), author = randomUUID(), gens = ['old-', 'read-', 'card-'].map(prefix => prefix + uid.slice(0, 8));
  const control = db.doc('feedIndexControl/current'), roots = [control, ...gens.map(id => db.doc(`feedIndexGenerations/${id}`)),
    db.doc(`feedIndexMaintenance/cardBackfills/jobs/${gens[2]}`), db.doc(`users/${uid}`), db.doc(`users/${author}`),
    db.doc(`publicProfiles/${uid}`), db.doc(`rateLimits/${uid}`), db.doc(`accountDeletionRequests/${uid}`)];
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  await db.doc(`users/${uid}`).set({ nickname: 'Fixture', avatarId: 'avatar_1', avatarBackgroundStart: 1, avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  for (let i = 0; i < 2; i++) await db.doc(`feedIndexGenerations/${gens[i]}`).set({ schemaVersion: 1, v: 1,
    accountRetention: true, erasureRevision: 0, prunedThrough: -1, ...(i ? { readIdentity: 1 } : {}) });
  await control.set({ schemaVersion: 1, revision: 6, mode: 'active', readGenerationId: gens[1], writeGenerationIds: gens.slice(0, 2) });
  const auth = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
  const runtime = createFeedRuntime(db, auth, { cardStateEnabled: true, newsRuntimeEnabled: false });
  const rows = [], now = Date.now();
  const mutate = async (id, change, extra = null) => runtime.database.runTransaction(async tx => {
    const ref = db.doc(`shouts/${id}`), before = (await tx.get(ref)).data() ?? null;
    const after = typeof change === 'function' ? change(before) : change;
    const plan = await runtime.indexWriter.prepare(tx, id, before, after); plan.apply();
    if (after) tx.set(ref, after); else tx.delete(ref);
    extra?.(tx); return plan;
  });
  for (let i = 0; i < count; i++) {
    const id = `${uid}-${i}`, location = { latitude: 50.08 + i / 100000, longitude: 14.44 };
    const row = { id, authorId: author, title: `Fixture ${i}`, text: 'Fixture body', authorNickname: 'Writer',
      location, geohash: encodeGeohash(location.latitude, location.longitude), status: 'active', categories: ['Dotaz'],
      createdAt: Timestamp.fromMillis(now - 1000), expiresAt: Timestamp.fromMillis(now + 86400000), likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: 0 };
    roots.push(db.doc(`shouts/${id}`)); await mutate(id, row); rows.push(row);
  }
  const plan = await planCardTransition(db, gens[2]);
  const step = (action, options = {}, database = db) => runCardTransitionStep(database, plan, action,
    { approvedDigest: plan.digest, compatibleWriters: true, ...options });
  const status = () => cardTransitionStatus(db, plan);
  const ready = async () => {
    if ((await status()).phase === 'not-started') await step('start');
    while ((await status()).phase === 'backfill') await step('backfill');
    await step('begin-audit');
    for (let n = 0; (await status()).phase !== 'ready'; n++) { assert(n < 200); await step('audit'); }
  };
  const key = randomBytes(32), request = data => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } },
    app: { appId: 'fixture' }, data: { expectedUserId: uid, ...data } });
  const options = { enabled: true, key, compatibleGenerations: true, readOrdering: { maxBlockReads: 256 } };
  const delta = data => getFeedDeltaOperation(request({ format: 'delta-v1', ...(!data.mode || data.mode === 'presentation' ? { cold: true } : {}), ...data }), db, options);
  const page = async (legacy = false, data = {}) => {
    let input = { context: filters, ...data };
    for (let n = 0; n < 32; n++) {
      const value = legacy ? await getCompatibleFeedPageOperation(request(input), db, options) : await delta(input);
      if (value.state !== 'preparing') return value;
      input = { cursor: value.next };
    } assert.fail('preparation did not finish');
  };
  return { uid, author, gens, roots, control, rows, runtime, mutate, plan, step, ready, status, request, delta, page, options, now };
}

test('three-generation transition: old/new cursors, pinned source, rollback and audited resume', { skip: !enabled }, async t => {
  const f = await fixture(t), measured = meter(db);
  const before = await f.page(), raw = await getFeedPageOperation(f.request({ context: filters }), db, f.options);
  assert.equal(before.version, 1); assert.equal(before.capability.mode, 'source-v1'); assert.equal(before.items.length, 50);
  const fallbackProof = JSON.parse(Buffer.from(before.next.split('.')[1], 'base64url'));
  assert(!JSON.stringify(fallbackProof.position).includes('latitude')); assert(!JSON.stringify(fallbackProof.position).includes('longitude'));
  const times = await db.getAll(...f.rows.map(row => db.doc(`shouts/${row.id}`)));
  await f.step('start'); assert.equal((await f.step('start')).changed, false);
  const building = await f.page(true); assert.equal(building.items.length, 50);
  measured.reset();
  while ((await f.status()).phase === 'backfill') await f.step('backfill', {}, measured.db);
  const backfill = { ...measured.counts };
  const after = await db.getAll(...f.rows.map(row => db.doc(`shouts/${row.id}`)));
  after.forEach((doc, i) => assert(doc.updateTime.isEqual(times[i].updateTime)));
  await f.ready(); await f.step('activate'); assert.equal((await f.step('activate')).changed, false);
  const initial = await f.page(); assert.equal(initial.version, 2); assert.equal(initial.bodyPage.bodies.length, 50);
  const legacy = await f.page(true); assert.equal(legacy.items.length, 50);
  assert.equal((await f.page(true, { context: undefined, cursor: legacy.next })).items.length, 5);
  assert.equal((await getFeedPageOperation(f.request({ cursor: raw.next }), db, f.options)).items.length, 5);
  const measuredRuntime = createFeedRuntime(measured.db, { getUser() { throw new Error('not-used'); } }, { cardStateEnabled: true });
  const changeMeasured = patch => measuredRuntime.database.runTransaction(async tx => {
    const ref = db.doc(`shouts/${f.rows[0].id}`), before = (await tx.get(ref)).data(), after = { ...before, ...patch };
    const plan = await measuredRuntime.indexWriter.prepare(tx, ref.id, before, after); plan.apply(); tx.set(ref, after);
  });
  measured.reset(); await changeMeasured({ likesCount: 1 }); const counterAcrossThree = { ...measured.counts };
  measured.reset(); await changeMeasured({ text: 'Versioned replacement body' }); const bodyAcrossThree = { ...measured.counts };
  assert(counterAcrossThree.writes > 2); assert(bodyAcrossThree.writes > 2);
  const retired = await f.delta({ cursor: before.next }); assert.equal(retired.state, 'reset'); assert.equal(retired.capability.mode, 'card-v1');
  await f.step('rollback'); assert.equal((await f.step('rollback')).changed, false);
  assert.deepEqual((await f.control.get()).get('writeGenerationIds'), f.gens);
  const reset = await f.delta({ mode: 'complete', token: initial.bodyPage.token, missing: [] });
  assert.equal(reset.state, 'reset'); assert.equal(reset.capability.mode, 'source-v1');
  assert.equal((await f.delta({ cursor: initial.next })).state, 'reset');
  assert.equal((await f.delta({ mode: 'liveContext' })).mode, 'source-v1');
  assert.equal((await f.delta({ mode: 'presentation', routes: [], point: filters.point })).capability.mode, 'source-v1');
  assert.equal((await f.page()).version, 1);
  assert.equal((await f.page(true, { context: undefined, cursor: legacy.next })).items.length, 5);
  await f.step('resume'); await assert.rejects(f.step('activate'));
  await f.ready(); await f.step('activate');
  assert.equal((await f.page()).version, 2);
  const report = { schema: 1, scope: 'Emulator, 55 sources, two maintained V1 generations plus one card generation. Complete operator backfill calls include status guard; counter/body mutations include source and all three publishers. Admin SDK reads and attempted writes including retries; excludes fixture setup, start/audit/activation, Auth/AppCheck, Rules billing and cloud latency.', backfill, counterAcrossThree, bodyAcrossThree };
  writeFileSync(new URL('../build/b4-transition-measurement.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  assert(backfill.writes > 55); assert(backfill.reads > 55);
});

test('replacement of the other preserved writer cannot reuse an approved job', { skip: !enabled }, async t => {
  const f = await fixture(t, 0); await f.step('start');
  const ref = db.doc(`feedIndexGenerations/${f.gens[0]}`), original = (await ref.get()).data();
  await ref.delete(); await ref.create(original);
  await assert.rejects(f.step('backfill'), /stale-card-backfill/);
});

test('digest, incarnation, control drift, journal corruption, expired audit and R5 fail closed', { skip: !enabled }, async t => {
  const f = await fixture(t, 2);
  await assert.rejects(f.step('start', { approvedDigest: '0'.repeat(64) }), /invalid-card-transition-plan/);
  await f.step('start');
  const job = db.doc(`feedIndexMaintenance/cardBackfills/jobs/${f.gens[2]}`), original = (await job.get()).data();
  await job.update({ unexpected: true }); await assert.rejects(f.step('backfill'), /invalid-card-job/); await job.set(original);
  await f.control.update({ revision: 100 }); await assert.rejects(f.step('backfill'), /stale-card-backfill/); await f.control.update({ revision: original.controlRevision });
  await f.ready();
  const pin = (await job.get()).get('audit.readTime');
  await assert.rejects(f.step('activate', { clock: () => new Date(Math.floor(pin.toMillis()) + 3600000) }), /card-audit-expired/);
  const target = db.doc(`feedIndexGenerations/${f.gens[2]}`);
  await target.update({ erasureRevision: 1 }); await assert.rejects(f.step('activate'), /card-audit-retention-changed/);
  await f.ready(); await f.step('activate');
  await f.step('rollback'); await f.step('resume');
  const source = db.doc(`feedIndexGenerations/${f.gens[1]}`), saved = (await source.get()).data();
  await source.delete(); await source.create(saved); await assert.rejects(f.step('begin-audit'), /stale-card-backfill/);
});

test('coverage mismatch blocks activation; abort keeps retention registry and original writers', { skip: !enabled }, async t => {
  const f = await fixture(t, 3); await f.step('start');
  while ((await f.status()).phase === 'backfill') await f.step('backfill');
  await db.doc(`feedIndexGenerations/${f.gens[2]}/publicStates/${f.rows[0].id}`).delete();
  await f.step('begin-audit');
  await assert.rejects(async () => { for (let n = 0; n < 20; n++) await f.step('audit'); }, /coverage-mismatch/);
  await assert.rejects(f.step('activate')); await f.step('abort'); assert.equal((await f.step('abort')).changed, false);
  assert.deepEqual((await f.control.get()).get('writeGenerationIds'), f.gens.slice(0, 2));
  assert((await db.doc(`feedIndexGenerations/${f.gens[2]}`).get()).exists);
  assert.equal((await f.page()).capability.mode, 'source-v1');
});

test('empty start, publication, receipt replay and expiry before activation', { skip: !enabled }, async t => {
  const f = await fixture(t, 0); await f.step('start');
  const now = new Date(), request = f.request({ title: 'Transition publication', text: 'Synthetic body', categories: ['Dotaz'], durationMinutes: 60,
    location: filters.point, idempotencyKey: operationTestKey('transition-create', now) });
  const result = await createShoutOperation(request, f.runtime.database, () => now, { indexWriter: f.runtime.indexWriter });
  const id = result.shoutId, ref = db.doc(`shouts/${id}`); f.roots.push(ref);
  assert.deepEqual(await createShoutOperation(request, f.runtime.database, () => now, { indexWriter: f.runtime.indexWriter }), result);
  await f.mutate(id, row => ({ ...row, expiresAt: Timestamp.fromMillis(now.getTime()) }));
  assert.equal((await expireDueShouts(f.runtime.database, { clock: () => now, maxCandidates: 50, indexWriter: f.runtime.indexWriter })).expired, 1);
  await f.ready(); await f.step('activate');
  assert.equal((await db.doc(`feedIndexGenerations/${f.gens[2]}/publicStates/${id}`).get()).get('status'), 'expired');
  assert.equal((await f.page()).bodyPage.rows.length, 0);
});

test('backfill covers expired/deleted states but excludes purged contexts and deleted authors', { skip: !enabled }, async t => {
  const f = await fixture(t, 4), deletedAuthor = randomUUID(), marker = db.doc(`publicProfiles/${deletedAuthor}`); f.roots.push(marker);
  await f.mutate(f.rows[0].id, row => ({ ...row, status: 'expired' }));
  await f.mutate(f.rows[1].id, row => ({ ...row, status: 'deleted' }));
  await f.mutate(f.rows[2].id, row => ({ ...row, authorId: deletedAuthor }));
  await marker.set({ schemaVersion: 1, accountStatus: 'deleted' });
  await db.doc(`shouts/${f.rows[3].id}`).set({ schemaVersion: 1, status: 'deleted', contentPurged: true });
  await f.ready(); await f.step('activate');
  const states = await db.doc(`feedIndexGenerations/${f.gens[2]}`).collection('publicStates').get();
  assert.deepEqual(states.docs.map(doc => doc.get('status')).sort(), ['deleted', 'expired']);
});

test('root integrity and a simultaneous audit step are fenced before activation', { skip: !enabled }, async t => {
  const f = await fixture(t, 3); await f.step('start');
  while ((await f.status()).phase === 'backfill') await f.step('backfill');
  const root = (await db.doc(`feedIndexGenerations/${f.gens[2]}`).collection('cells').get()).docs[0], original = root.data();
  await root.ref.update({ minExpiry: original.minExpiry + 1 });
  await f.step('begin-audit');
  await assert.rejects(async () => { for (let n = 0; n < 20; n++) await f.step('audit'); }, /card-audit-path/);
  await root.ref.set(original); await f.step('begin-audit');
  const results = await Promise.allSettled([f.step('audit'), f.step('audit')]);
  assert(results.some(result => result.status === 'fulfilled'));
  assert(results.filter(result => result.status === 'rejected').every(result => /step-changed/.test(result.reason.message)));
  await f.ready(); await f.step('activate');
});

test('live operations during backfill remain atomic across all writers; account/R5 preserves foreign content', { skip: !enabled }, async t => {
  const f = await fixture(t, 4), id = f.rows[0].id;
  await f.step('start');
  const now = new Date(), req = data => f.request({ ...data, idempotencyKey: operationTestKey(randomUUID(), now) });
  const comment = await createCommentOperation(req({ shoutId: id, text: 'Transition test' }), f.runtime.database);
  f.roots.push(db.doc(`serverOperations/${comment.commentId}`));
  await deleteCommentOperation(req({ shoutId: id, commentId: comment.commentId }), f.runtime.database);
  await toggleShoutSaveOperation(req({ shoutId: id }), f.runtime.database);
  await toggleShoutReactionOperation(req({ shoutId: id, button: 'like' }), f.runtime.database, () => new Date(now.getTime() + 2000), { indexWriter: f.runtime.indexWriter });
  await Promise.all([f.step('backfill'), f.mutate(f.rows[1].id, row => ({ ...row, text: 'Concurrent body' }))]);
  await f.mutate(id, row => ({ ...row, authorId: f.uid }));
  const junk = db.doc('transitionFixture/budget'); f.roots.push(junk);
  const before = (await db.doc(`shouts/${id}`).get()).data();
  await assert.rejects(f.mutate(id, row => ({ ...row, savesCount: 100 }), tx => { for (let n = 0; n < 450; n++) tx.set(junk, { n }); }), /write-budget-exceeded/);
  assert.deepEqual((await db.doc(`shouts/${id}`).get()).data(), before); assert.equal((await junk.get()).exists, false);
  const ownDelete = f.rows[2].id; await f.mutate(ownDelete, row => ({ ...row, authorId: f.uid }));
  await deleteShoutOperation(req({ shoutId: ownDelete }), f.runtime.database, () => now, { indexWriter: f.runtime.indexWriter });
  const prep = req({}); await prepareAccountDeletionOperation(prep, f.runtime.database, () => now, { indexWriter: f.runtime.indexWriter });
  assert.equal((await db.doc(`shouts/${id}`).get()).get('status'), 'deleted');
  assert.equal((await db.doc(`shouts/${f.rows[1].id}`).get()).get('status'), 'active');
  await f.ready(); await f.step('activate');
  const page = await f.page();
  if (page.next) { const decoded = JSON.parse(Buffer.from(page.next.split('.')[1], 'base64url')); assert(!JSON.stringify(decoded.position).includes('latitude')); }
  const request = db.doc(`accountDeletionRequests/${f.uid}`); await request.set({ userId: f.uid, status: 'pending' });
  const created = (await request.get()).createTime, confirmed = Math.ceil(created.toMillis());
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(confirmed) });
  await db.doc(`publicProfiles/${f.uid}`).set({ schemaVersion: 1, accountStatus: 'deleted' });
  for (const generation of f.gens) {
    let result, n = 0;
    do {
      const store = createFeedGenerationStore(db, generation, { contentIdentity: 'generation', cardProjection: 'generation' });
      result = await store.purgeAccountIndex({ projectId: db.projectId, userId: f.uid, requestCreateTime: created },
        { clock: () => new Date(confirmed + accountRetentionMillis), reads: 4, deletes: 2 });
      assert(++n < 300);
    } while (result.state !== 'complete');
  }
  assert.equal((await db.doc(`feedIndexGenerations/${f.gens[2]}/publicStates/${id}`).get()).exists, false);
  assert.equal((await db.doc(`feedIndexGenerations/${f.gens[2]}/publicStates/${f.rows[1].id}`).get()).exists, true);
  await assert.rejects(f.page(), error => error.code === 'failed-precondition');
});
