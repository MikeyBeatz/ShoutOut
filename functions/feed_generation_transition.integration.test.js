import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createFeedRuntime, createFeedGenerationStore, feedRuntimeBlockCache } from './feed_runtime.js';
import { createFeedGenerationTransition } from './feed_generation_transition.js';
import { getFeedPageOperation } from './get_feed_page.js';
import { encodeGeohash } from './geohash.js';
import { canonical } from './feed_block_index.js';
import { planReadBlocks, readContentHash, readRetentionMillis } from './read_sync_blocks.js';
import { accountRetentionMillis, accountPurgeJobRef } from './account_purge_guard.js';
import { createShoutOperation } from './create_shout.js';
import { deleteShoutOperation } from './delete_shout.js';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';
import { prepareAccountDeletionOperation } from './prepare_account_deletion.js';
import { operationTestKey } from './test_helpers.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'b3-transition-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (db) { await db.terminate(); await deleteApp(app); } });
const absent = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
const point = { latitude: 50.08, longitude: 14.44 }, near = { point, radiusKm: 5, order: 'nearest', category: null };
async function fixture(t, count = 65, batchSize = 50) {
  assert.equal((await db.doc('feedIndexControl/current').get()).exists, false);
  const uid = randomUUID(), source = `b3old-${uid.slice(0, 8)}`, target = `b3new-${uid.slice(0, 8)}`;
  const control = db.doc('feedIndexControl/current'), from = db.doc(`feedIndexGenerations/${source}`), to = db.doc(`feedIndexGenerations/${target}`);
  const roots = [control, from, to, db.doc(`feedIndexMaintenance/transitions/jobs/${target}`), db.doc('feedIndexMaintenance/erasureQueue'),
    db.doc(`users/${uid}`), db.doc(`publicProfiles/${uid}`)];
  t.after(async () => {
    const receipts = await db.collection('serverOperations').where('userId', '==', uid).get();
    if (receipts.size) { const batch = db.batch(); receipts.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); }
    await db.recursiveDelete(db.doc(`rateLimits/${uid}`));
    for (const ref of roots) await db.recursiveDelete(ref);
  });
  let offset = 0;
  const clock = () => new Date(Date.now() + offset), key = randomBytes(32);
  const old = createFeedRuntime(db, absent), runtime = () => createFeedRuntime(db, absent, { compatibleGenerations: true, clock });
  await from.create({ schemaVersion: 1, v: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
  await control.create({ schemaVersion: 1, revision: 0, mode: 'active', readGenerationId: source, writeGenerationIds: [source] });
  await db.doc(`users/${uid}`).set({ nickname: 'Migration fixture', avatarId: 'avatar_01', avatarBackgroundStart: 1,
    avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  const row = i => {
    const location = { latitude: point.latitude + i * .0001, longitude: point.longitude };
    return { id: `${uid}-${String(i).padStart(4, '0')}`, authorId: uid, authorNickname: 'Fixture',
      title: `Title ${i}`, text: `Body ${i}`, location, geohash: encodeGeohash(location.latitude, location.longitude),
      categories: ['Dotaz'], status: 'active', createdAt: Timestamp.fromMillis(Date.now() - 1000),
      expiresAt: Timestamp.fromMillis(Date.now() + 7200000), likesCount: 0, dislikesCount: 0 };
  };
  const rows = Array.from({ length: count }, (_, i) => row(i));
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50); chunk.forEach(item => roots.push(db.doc(`shouts/${item.id}`)));
    await old.database.runTransaction(async tx => {
      const plan = await old.indexWriter.prepareBatch(tx, chunk.map(item => ({ id: item.id, before: null, after: item })));
      plan.apply(); chunk.forEach(item => tx.create(db.doc(`shouts/${item.id}`), item));
    });
  }
  const make = database => createFeedGenerationTransition(database ?? db, source, target, { clock, batchSize });
  const mutate = async (id, patch, created = null) => {
    const rt = runtime(), ref = db.doc(`shouts/${id}`); if (created) roots.push(ref);
    return rt.database.runTransaction(async tx => {
      const before = (await tx.get(ref)).data() ?? null, next = created ?? (patch === null ? null : { ...before, ...patch });
      const plan = await rt.indexWriter.prepare(tx, id, before, next); plan.apply();
      if (next) tx.set(ref, next); else tx.delete(ref);
      return plan.sourceChanged;
    });
  };
  const backfill = async () => { for (let i = 0; i < count + 10; i++) { const result = await make().step(); if (result.phase === 'audit') return result; } assert.fail('backfill did not finish'); };
  const audit = async (start = true) => {
    if (start) await make().beginAudit();
    for (let i = 0; i < count + 20; i++) { const result = await make().auditStep(); if (result.phase !== 'auditing') return result; }
    assert.fail('audit did not finish');
  };
  const page = async (data = { context: near }, options = {}) => {
    for (let work = 0; work < 32; work++) {
      const result = await getFeedPageOperation({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } },
        app: { appId: 'fixture' }, data: { expectedUserId: uid, ...data } }, db,
      { key, clock, compatibleGenerations: true, readOrdering: { maxBlockReads: 256 }, ...options });
      if (result.state === 'ready') return result;
      data = { cursor: result.next };
    }
    assert.fail('page work exhausted');
  };
  return { uid, source, target, control, from, to, roots, rows, row, make, runtime, mutate, backfill, audit, page,
    setOffset(value) { offset = value; } };
}
async function confirm(f, rows) {
  await db.runTransaction(async tx => {
    const expiry = row => row.expiresAt.toMillis();
    const records = rows.map(row => ({ shoutId: row.id, contentHash: readContentHash(row.title, row.text),
      expiresAt: expiry(row), retainUntil: expiry(row) + readRetentionMillis, confirmedAt: Date.now() - 1 }));
    const plan = await planReadBlocks(records, async id => (await tx.get(db.doc(`users/${f.uid}/readBuckets/${id}`))).data());
    for (const [id, data] of plan.writes) tx.set(db.doc(`users/${f.uid}/readBuckets/${id}`), data);
    tx.set(db.doc(`users/${f.uid}/readState/current`), { v: 1, revision: 1 });
  });
}
async function allRows(f, generation, contentIdentity) {
  const store = createFeedGenerationStore(db, generation, { contentIdentity });
  const view = await store.open({ uid: f.uid, ...near, radiusKm: 50, now: Date.now() });
  const rows = []; let cursor = view.first;
  while (cursor) { const result = await view.page(cursor); rows.push(...result.rows); cursor = result.next; }
  return rows;
}

test('nonempty transition preserves sources, old client and old cursor; B3 activates only after audited coverage', { skip: !enabled }, async t => {
  const f = await fixture(t, 130); await confirm(f, f.rows.slice(0, 15));
  const first = await f.page({ context: near }, { readOrdering: null, compatibleGenerations: false });
  await assert.rejects(f.make().begin(0, [1, 0]), /start-conflict/);
  await assert.rejects(f.page({ context: { ...near, readPolicy: 'confirmed-v1' } }), { code: 'failed-precondition' });
  const unchanged = await db.getAll(...f.rows.map(row => db.doc(`shouts/${row.id}`)));
  assert.deepEqual(await f.make().begin(0), { phase: 'backfill', changed: true });
  assert.deepEqual(await f.make().begin(0), { phase: 'backfill', changed: false });
  await assert.rejects(f.make().activate(), /stale-feed-transition/);
  await f.backfill(); const proof = await f.audit();
  assert.equal(proof.phase, 'ready'); assert.equal(proof.source.count, 130); assert.deepEqual(proof.source, proof.index);
  assert.equal((await f.make().activate()).changed, true); assert.equal((await f.make().activate()).changed, false);
  const continued = await f.page({ cursor: first.next });
  assert.equal(continued.baseline, first.baseline); assert.equal(continued.items[0].id, f.rows[50].id);
  assert(continued.items.every(item => item.read === undefined));
  const legacy = await f.page(); assert.equal(legacy.items[0].id, f.rows[0].id); assert.equal(legacy.readOrdering, undefined);
  const grouped = await f.page({ context: { ...near, readPolicy: 'confirmed-v1' } });
  assert.equal(grouped.readOrdering, 'unread-first'); assert.equal(grouped.items[0].id, f.rows[15].id);
  assert(grouped.items.every(item => item.read === false));
  await assert.rejects(f.page({ context: { ...near, readPolicy: 'confirmed-v1' } }, { readOrdering: null }), { code: 'failed-precondition' });
  assert.equal((await f.page({ context: near }, { readOrdering: null })).readOrdering, undefined);
  await f.make().rollback(); assert.equal((await f.control.get()).get('readGenerationId'), f.source);
  assert.deepEqual((await f.control.get()).get('writeGenerationIds'), [f.source, f.target]);
  assert.equal((await f.page()).items[0].id, f.rows[0].id);
  const frozen = await f.page({ cursor: grouped.next });
  assert.equal(frozen.readOrdering, 'unread-first');
  await f.make().resume(); assert.equal((await f.audit()).phase, 'ready'); await f.make().activate();
  for (const doc of unchanged) assert((await doc.ref.get()).updateTime.isEqual(doc.updateTime));
  t.diagnostic(JSON.stringify({ scenario: 'B3-nonempty-transition', sources: 130, coverage: proof.source, sourceWritesDuringTransition: 0 }));
});

test('real publication, reaction, deletion and historical replay preserve both formats while building', { skip: !enabled }, async t => {
  const f = await fixture(t, 0); await f.make().begin(0);
  const rt = f.runtime(), time = new Date(), request = data => ({
    auth: { uid: f.uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data,
  });
  const publication = request({ expectedUserId: f.uid, idempotencyKey: operationTestKey('transition-publish', time),
    title: 'Transition publication', text: 'Only emulator content', categories: ['Dotaz'], durationMinutes: 60, location: point });
  const writers = { indexWriter: rt.indexWriter }, created = await createShoutOperation(publication, rt.database, () => time, writers);
  f.roots.push(db.doc(`shouts/${created.shoutId}`));
  assert.equal((await allRows(f, f.source, false)).length, 1); assert.equal((await allRows(f, f.target, true)).length, 1);
  const reaction = request({ expectedUserId: f.uid, shoutId: created.shoutId, button: 'like', idempotencyKey: operationTestKey('transition-react', time) });
  await toggleShoutReactionOperation(reaction, rt.database, () => time, writers);
  assert.equal((await allRows(f, f.target, true))[0].likesCount, 1);
  const deletion = request({ expectedUserId: f.uid, shoutId: created.shoutId, idempotencyKey: operationTestKey('transition-delete', time) });
  await deleteShoutOperation(deletion, rt.database, () => time, writers);
  await createShoutOperation(publication, rt.database, () => time, writers);
  await toggleShoutReactionOperation(reaction, rt.database, () => time, writers);
  assert.equal((await allRows(f, f.target, true)).length, 0);
  assert.equal((await allRows(f, f.source, false)).length, 0);
  await f.backfill(); assert.equal((await f.audit()).phase, 'ready');
});

test('account preparation keeps its 50-item contract with a partly filled shadow generation', { skip: !enabled }, async t => {
  const f = await fixture(t, 55, 2); await f.make().begin(0); await f.make().step();
  const rt = f.runtime(), time = new Date();
  const request = label => ({ auth: { uid: f.uid, token: { email: 'fixture@example.test', email_verified: true } },
    app: { appId: 'fixture' }, data: { expectedUserId: f.uid, idempotencyKey: operationTestKey(label, time) } });
  const first = request('transition-prepare-1'), options = { indexWriter: rt.indexWriter };
  assert.deepEqual(await prepareAccountDeletionOperation(first, rt.database, () => time, options), { hidden: 50, hasMore: true });
  assert.deepEqual(await prepareAccountDeletionOperation(first, rt.database, () => time, options), { hidden: 50, hasMore: true });
  assert.deepEqual(await prepareAccountDeletionOperation(request('transition-prepare-2'), rt.database, () => time, options), { hidden: 5, hasMore: false });
  await f.backfill(); const proof = await f.audit(); assert.equal(proof.phase, 'ready'); assert.equal(proof.source.count, 0);
  for (const row of f.rows) assert.equal((await db.doc(`shouts/${row.id}`).get()).get('text'), row.text);
});

test('dual writer handles an unseeded update/delete, concurrent insertion and updates after the pinned audit', { skip: !enabled }, async t => {
  const f = await fixture(t, 65, 20); await f.make().begin(0); await f.make().step();
  assert.equal(await f.mutate(f.rows[45].id, { title: 'Updated before backfill' }), true);
  await f.mutate(f.rows[46].id, null);
  const inserted = f.row(1000); await f.mutate(inserted.id, null, inserted);
  await f.backfill(); await f.make().beginAudit();
  await f.mutate(f.rows[0].id, { likesCount: 7 });
  assert.equal((await f.audit(false)).phase, 'ready'); await f.make().activate();
  const rows = await allRows(f, f.target, true);
  assert.equal(rows.length, 65); assert(!rows.some(row => row.id === f.rows[46].id));
  assert(rows.some(row => row.id === inserted.id));
  assert.equal(rows.find(row => row.id === f.rows[45].id).contentHash, readContentHash('Updated before backfill', f.rows[45].text));
  assert.equal(rows.find(row => row.id === f.rows[0].id).likesCount, 7);
});

test('present wrong metadata never becomes a missing-row exemption; abort restores the old writer', { skip: !enabled }, async t => {
  const f = await fixture(t, 4); await f.make().begin(0);
  await f.mutate(f.rows[0].id, { likesCount: 1 });
  const ref = db.doc(`shouts/${f.rows[0].id}`), before = (await ref.get()).data();
  await db.runTransaction(async tx => {
    const store = createFeedGenerationStore(db, f.target, { contentIdentity: true });
    const plan = await store.prepare(tx, ref.id, before, { ...before, likesCount: 99 }); plan.apply();
  });
  const oldRoots = canonical((await f.from.collection('cells').get()).docs.map(doc => doc.data()));
  await assert.rejects(f.mutate(ref.id, { likesCount: 2 }), /incomplete-index/);
  assert.equal((await ref.get()).get('likesCount'), 1);
  assert.equal(canonical((await f.from.collection('cells').get()).docs.map(doc => doc.data())), oldRoots);
  await f.make().abort(); assert.equal((await f.control.get()).get('mode'), 'active');
  assert.deepEqual((await f.control.get()).get('writeGenerationIds'), [f.source]);
  await f.mutate(ref.id, { likesCount: 3 }); assert.equal((await ref.get()).get('likesCount'), 3);
});

test('coverage detects wrong metadata with the same count and rejects cutover', { skip: !enabled }, async t => {
  const f = await fixture(t, 5); await f.make().begin(0); await f.backfill();
  const item = f.rows[0];
  await db.runTransaction(async tx => {
    const store = createFeedGenerationStore(db, f.target, { contentIdentity: true });
    const plan = await store.prepare(tx, item.id, item, { ...item, text: 'Wrong projection only' }); plan.apply();
  });
  const result = await f.audit(); assert.equal(result.phase, 'failed');
  assert.equal(result.source.count, result.index.count); assert.notDeepEqual(result.source, result.index);
  await assert.rejects(f.make().activate(), /stale-feed-transition/);
  assert.equal((await f.control.get()).get('readGenerationId'), f.source);
});

test('repeated reader adapters share one bounded public cache instead of retaining request caches', { skip: !enabled }, async t => {
  const f = await fixture(t, 65); feedRuntimeBlockCache.clear();
  for (let i = 0; i < 12; i++) {
    assert.equal((await f.page()).items.length, 50);
    assert(feedRuntimeBlockCache.bytes <= 4194304); assert(feedRuntimeBlockCache.size <= 1024);
  }
  assert(feedRuntimeBlockCache.size > 0);
  feedRuntimeBlockCache.clear(); assert.equal(feedRuntimeBlockCache.bytes, 0);
});

test('audit restarts after R5 fence changes and expired proof cannot activate', { skip: !enabled }, async t => {
  const f = await fixture(t, 5); await f.make().begin(0); await f.backfill(); await f.make().beginAudit();
  const version = (await f.make().jobRef.get()).get('version');
  await f.to.update({ erasureRevision: 1 });
  await assert.rejects(f.make().auditStep(), /audit-fence-changed/);
  assert.equal((await f.make().jobRef.get()).get('version'), version);
  assert.equal((await f.audit()).phase, 'ready'); f.setOffset(3600001);
  await assert.rejects(f.make().activate(), /audit-expired/); f.setOffset(0);
  assert.equal((await f.audit()).phase, 'ready'); await f.make().activate();
});

test('recreated generation and changed control cannot consume an old checkpoint', { skip: !enabled }, async t => {
  const f = await fixture(t, 5); await f.make().begin(0);
  const marker = (await f.to.get()).data(); await f.to.delete(); await f.to.create(marker);
  await assert.rejects(f.make().step(), /stale-feed-transition/);
  await assert.rejects(f.mutate(f.rows[0].id, { likesCount: 1 }), /invalid-building-generation/);
  assert.equal((await f.make().jobRef.get()).get('scanned'), 0);
});

test('active missing rows and unknown generation formats still reject all partial writes', { skip: !enabled }, async t => {
  const f = await fixture(t, 2); await f.make().begin(0); await f.backfill(); await f.audit(); await f.make().activate();
  const roots = await f.to.collection('cells').get(), original = roots.docs[0];
  await original.ref.delete();
  await assert.rejects(f.mutate(f.rows[0].id, { likesCount: 1 }), /incomplete-index/);
  assert.equal((await db.doc(`shouts/${f.rows[0].id}`).get()).get('likesCount'), 0);
  await original.ref.set(original.data()); await f.to.update({ readIdentity: 2 });
  await assert.rejects(f.mutate(f.rows[0].id, { likesCount: 1 }), /invalid-index-content-identity-mode/);
  assert.equal((await db.doc(`shouts/${f.rows[0].id}`).get()).get('likesCount'), 0);
});

function observed(database, { loseOnce = false, budgetOnce = false, target } = {}) {
  const stats = { reads: 0, publicProfileReads: 0, attemptedWrites: 0, committedWrites: 0, sourceMutationAttempts: 0, attempts: 0, commits: 0, maxWrites: 0 };
  let lose = loseOnce, budget = budgetOnce;
  const count = value => {
    stats.reads += Array.isArray(value) ? value.length : value.docs ? Math.max(1, value.size) : 1;
    const docs = Array.isArray(value) ? value : value.docs ?? [value];
    stats.publicProfileReads += docs.filter(doc => doc.ref?.path.startsWith('publicProfiles/')).length;
    return value;
  };
  const wrapper = new Proxy(database, { get(real, key) {
    if (key === 'runTransaction') return async (operation, ...options) => {
      let acknowledgedWrites = 0;
      const result = await real.runTransaction(async tx => {
        stats.attempts++; let writes = 0;
        const inspected = new Proxy(tx, { get(inner, method) {
          if (method === 'get' || method === 'getAll') return async (...args) => count(await inner[method](...args));
          if (['set', 'update', 'create', 'delete'].includes(method)) return (ref, ...args) => {
            stats.attemptedWrites++; writes++;
            if (ref.path.startsWith('shouts/')) stats.sourceMutationAttempts++;
            if (budget && ref.path.startsWith(`feedIndexGenerations/${target}/cells/`)) { budget = false; throw new Error('lab-mutation-too-large'); }
            inner[method](ref, ...args); return inspected;
          };
          return typeof inner[method] === 'function' ? inner[method].bind(inner) : inner[method];
        } });
        try { const value = await operation(inspected); acknowledgedWrites = writes; return value; }
        finally { stats.maxWrites = Math.max(stats.maxWrites, writes); }
      }, ...options);
      stats.commits++; stats.committedWrites += acknowledgedWrites;
      if (lose && result.phase === 'backfill' && result.scanned > 0) { lose = false; throw Object.assign(new Error('Lost commit acknowledgement'), { code: 'unavailable' }); }
      return result;
    };
    return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
  } });
  return { database: wrapper, stats };
}

test('both writers share one current author-profile read inside the same transaction', { skip: !enabled }, async t => {
  const f = await fixture(t, 1); await f.make().begin(0);
  const measurement = observed(db), runtime = createFeedRuntime(measurement.database, absent, { compatibleGenerations: true });
  const ref = db.doc(`shouts/${f.rows[0].id}`);
  await runtime.database.runTransaction(async tx => {
    const before = (await tx.get(ref)).data(), after = { ...before, likesCount: 1 };
    const plan = await runtime.indexWriter.prepare(tx, ref.id, before, after); plan.apply(); tx.set(ref, after);
  });
  assert.equal(measurement.stats.publicProfileReads, 1);
  assert.equal((await allRows(f, f.target, true))[0].likesCount, 1);
});

test('the legacy projection ignores a source hash while the new projection derives its own identity', { skip: !enabled }, async t => {
  const f = await fixture(t, 1); await f.make().begin(0);
  await f.mutate(f.rows[0].id, { title: 'New body', contentHash: 'b'.repeat(64) });
  assert.equal((await allRows(f, f.source, false))[0].contentHash, undefined);
  assert.equal((await allRows(f, f.target, true))[0].contentHash, readContentHash('New body', f.rows[0].text));
});

test('lost acknowledgement and two audit workers preserve exactly-once progress across restart', { skip: !enabled }, async t => {
  const f = await fixture(t, 25, 10), measurement = observed(db, { loseOnce: true });
  const make = () => f.make(measurement.database);
  await make().begin(0);
  await assert.rejects(make().step(), { code: 'unavailable' });
  assert.equal((await make().jobRef.get()).get('scanned'), 10);
  for (let i = 0; i < 10; i++) { if ((await make().step()).phase === 'audit') break; }
  assert.equal((await make().jobRef.get()).get('scanned'), 25);
  await make().beginAudit();
  const raced = await Promise.allSettled([make().auditStep(), make().auditStep()]);
  assert(raced.some(result => result.status === 'fulfilled'));
  for (const result of raced) if (result.status === 'rejected') assert.match(result.reason.message, /step-changed/);
  let proof;
  for (let i = 0; i < 20; i++) { proof = await make().auditStep(); if (proof.phase === 'ready') break; }
  assert.equal(proof.phase, 'ready'); assert.equal(proof.source.count, 25); assert.deepEqual(proof.index, proof.source);
  await make().activate();
  assert.equal(measurement.stats.sourceMutationAttempts, 0); assert(measurement.stats.maxWrites <= 450);
  t.diagnostic(JSON.stringify({ scenario: 'B3-transition-25-retry', ...measurement.stats, cloudThroughputMeasured: false }));
});

test('planner budget failure rolls back nodes and shrinks the batch without advancing its cursor', { skip: !enabled }, async t => {
  const f = await fixture(t, 51), measurement = observed(db, { budgetOnce: true, target: f.target });
  await f.make().begin(0);
  const result = await f.make(measurement.database).step(); assert.equal(result.resized, true); assert.equal(result.batchSize, 25);
  const job = await f.make().jobRef.get(); assert.equal(job.get('after'), null); assert.equal(job.get('scanned'), 0);
  assert.equal((await f.to.collection('nodes').get()).size, 0); assert.equal((await f.to.collection('cells').get()).size, 0);
  await f.backfill(); assert.equal((await f.audit()).phase, 'ready'); await f.make().activate();
});

test('malformed ready proof and changed control are rejected without switching the reader', { skip: !enabled }, async t => {
  const f = await fixture(t, 3); await f.make().begin(0); await f.backfill(); await f.audit();
  const job = f.make().jobRef, original = (await job.get()).data();
  const malformed = { ...original.audit }; delete malformed.source; delete malformed.index;
  await job.update({ audit: malformed });
  await assert.rejects(f.make().activate(), /invalid-transition-audit/);
  assert.equal((await f.control.get()).get('readGenerationId'), f.source);
  await job.update({ audit: original.audit }); await f.control.update({ revision: 2 });
  await assert.rejects(f.make().activate(), /stale-feed-transition/);
});

test('deleted author is never restored into the shadow generation', { skip: !enabled }, async t => {
  const f = await fixture(t, 2), dead = `${f.uid}-deleted`, profile = db.doc(`publicProfiles/${dead}`);
  f.roots.push(profile);
  await f.mutate(f.rows[0].id, { authorId: dead });
  await f.make().begin(0); await profile.set({ schemaVersion: 1, accountStatus: 'deleted' });
  await f.backfill(); const proof = await f.audit();
  assert.equal(proof.phase, 'ready'); assert.equal(proof.source.count, 1); await f.make().activate();
  assert.deepEqual((await allRows(f, f.target, true)).map(row => row.id), [f.rows[1].id]);
});

for (const during of [true, false]) test(`R5/R6 erasure ${during ? 'during backfill' : 'after cutover'} preserves source data and the original deadline`, { skip: !enabled }, async t => {
  const f = await fixture(t, 3, during ? 1 : 50); await f.make().begin(0);
  if (during) await f.make().step(); else { await f.backfill(); await f.audit(); await f.make().activate(); }
  const request = db.doc(`accountDeletionRequests/${f.uid}`), profile = db.doc(`publicProfiles/${f.uid}`);
  f.roots.push(request);
  await request.set({ userId: f.uid, status: 'pending' }); const created = (await request.get()).createTime;
  f.setOffset(Math.ceil(created.toMillis()) - Date.now() + 1000);
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(Math.ceil(created.toMillis()) + 999) });
  await profile.set({ schemaVersion: 1, accountStatus: 'deleted' });
  const identity = { projectId: db.projectId, userId: f.uid, requestCreateTime: created };
  const sources = await db.getAll(...f.rows.map(row => db.doc(`shouts/${row.id}`)));
  await f.runtime().earlyErasureQueue.enqueue(identity);
  let result;
  for (let step = 0; step < 100; step++) {
    result = await f.runtime().earlyErasureQueue.run(identity);
    if (result.state === 'complete') break;
    f.setOffset(1000 + (step + 1) * 60001);
  }
  assert.equal(result.state, 'complete');
  const proof = await f.runtime().earlyErasureQueue.verify(identity);
  assert(proof.valid); assert.equal(proof.generations, 2);
  assert.equal(proof.retainUntil.toMillis(), created.toMillis() + accountRetentionMillis);
  for (const marker of [f.from, f.to]) assert.equal((await marker.collection('cells').get()).size, 0);
  for (const before of sources) assert((await before.ref.get()).updateTime.isEqual(before.updateTime));
  if (during) { await f.backfill(); assert.equal((await f.audit()).phase, 'ready'); await f.make().activate(); }
  f.setOffset(Math.ceil(created.toMillis() + accountRetentionMillis) - Date.now() + 1000);
  const purge = accountPurgeJobRef(db, identity); f.roots.push(purge);
  let future = Math.ceil(created.toMillis() + accountRetentionMillis) + 1000;
  await purge.set({ phase: 'purging', userId: f.uid, requestCreateTime: created, retainUntil: proof.retainUntil,
    leaseToken: 'b3-transition-test', leaseUntil: Timestamp.fromMillis(future + 120000) });
  const guard = async tx => ({ job: (await tx.get(purge)).data() });
  let cleanup;
  for (let i = 0; i < 100; i++) {
    cleanup = await f.runtime().indexErasureCoordinator.step(identity, { guard, limit: 1 });
    if (cleanup.state === 'ready') break;
    if (cleanup.state === 'waiting') await f.runtime().earlyErasureQueue.run(identity);
    future += 60001; f.setOffset(future - Date.now());
    await purge.update({ leaseUntil: Timestamp.fromMillis(future + 120000) });
  }
  assert.equal(cleanup.state, 'ready');
  const final = f.runtime();
  await final.database.runTransaction(async tx => {
    const plan = await final.indexErasureCoordinator.prepareFinish(tx, identity, { guard });
    plan.apply(); tx.delete(request); tx.delete(purge);
  });
  assert.equal((await final.earlyErasureQueue.jobFor(identity).get()).exists, false);
});
