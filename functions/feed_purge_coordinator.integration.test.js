import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { FieldPath, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createEarlyErasureQueueLab, EarlyErasureIdentityChanged } from './feed_early_erasure_queue_lab.js';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { encodeGeohash } from './geohash.js';
import { runAccountPurgeJob, purgedShoutContext } from './account_purge_job.js';
import { accountPurgeJobRef, initialAccountPurgeJob, accountRetentionMillis, AccountPurgeNeedsReview } from './account_purge_guard.js';
import { accountPurgeStages } from './account_purge_policy.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'purge-coordinator-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const absent = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };

async function fixture(t) {
  const uid = randomUUID(), prefix = `pc-${uid.slice(0, 8)}-`, namespace = `co-${uid.slice(0, 8)}`, key = `mvp-${uid.slice(0, 8)}`;
  const roots = [], generations = [], control = db.doc('feedIndexControl/current');
  assert.equal((await control.get()).exists, false); assert.equal((await db.collection('feedIndexGenerations').limit(1).get()).size, 0);
  t.after(async () => { for (const ref of [...roots, ...generations.flatMap(gen => [gen.ref, gen.lab.base]), control]) await db.recursiveDelete(ref); });
  const request = db.doc(`accountDeletionRequests/${uid}`), profile = db.doc(`publicProfiles/${uid}`), user = db.doc(`users/${uid}`);
  roots.push(request, profile, user);
  await request.set({ userId: uid, status: 'pending' }); const created = (await request.get()).createTime;
  await request.update({ authDeletionConfirmedAt: Timestamp.fromMillis(Math.ceil(created.toMillis())) });
  await profile.set({ schemaVersion: 1, accountStatus: 'deleted' }); await user.set({ nicknameLower: key });
  const identity = { projectId: db.projectId, userId: uid, requestCreateTime: created }, job = accountPurgeJobRef(db, identity);
  const main = db.doc(`accountDeletionJobs/${job.id}`), nickname = db.doc(`nicknames/${key}`);
  roots.push(job, main, nickname);
  await job.set(initialAccountPurgeJob(identity, Timestamp.now()));
  await main.set({ reservationKey: key, leaseToken: null, leaseUntil: null, nextAttemptAt: null }); await nickname.set({ uid });
  const f = { uid, prefix, namespace, identity, job, main, nickname, request, profile, user, roots, generations, control,
    now: Math.ceil(created.toMillis()) + 1000, authCalls: 0, onAuth: null };
  f.auth = { async getUser(userId) { f.authCalls++; if (f.onAuth) await f.onAuth(f.authCalls); return absent.getUser(userId); } };
  const clock = () => new Date(f.now);
  f.queue = createEarlyErasureQueueLab(db, f.auth, { namespace, clock }); roots.push(f.queue.base);
  f.coordinator = f.queue.purgeCoordinator();
  f.register = async () => {
    const id = `pcgen-${randomUUID().slice(0, 8)}`, query = db.collection('shouts').where(FieldPath.documentId(), '>=', prefix)
      .where(FieldPath.documentId(), '<', prefix + '\uf8ff');
    const lab = createLabBlockIndex(db, { namespace: id, accountRetention: true,
      sourceCollection: { doc: name => db.doc(`shouts/${name}`), get: () => query.get() } });
    const ref = db.doc(`feedIndexGenerations/${id}`); generations.push({ id, lab, ref });
    const point = { latitude: 50.66, longitude: 14.04 }, row = (suffix, authorId) => ({ id: prefix + suffix, authorId, status: 'active',
      location: point, geohash: encodeGeohash(point.latitude, point.longitude), categories: ['help'],
      createdAt: f.now - 500, expiresAt: f.now + 86400000, likesCount: 0, dislikesCount: 0 });
    // Each generation has its own fixture source collection after the first;
    // physical canonical sources remain a single pair of Shouts.
    if (!generations.slice(0, -1).length) await lab.seed([row('own', uid), row('foreign', 'foreign')]);
    else {
      const isolated = createLabBlockIndex(db, { namespace: id, accountRetention: true });
      await isolated.seed([row('own', uid), row('foreign', 'foreign')]);
    }
    await db.runTransaction(async tx => {
      const previous = await tx.get(control);
      tx.create(ref, { schemaVersion: 1 });
      tx.set(control, { schemaVersion: 1, revision: (previous.get('revision') ?? 0) + 1, mode: 'paused', readGenerationId: null,
        writeGenerationIds: [...(previous.get('writeGenerationIds') ?? []), id] });
    });
    return generations.at(-1);
  };
  f.gen = await f.register();
  f.own = db.doc(`shouts/${prefix}own`); f.foreign = db.doc(`shouts/${prefix}foreign`); roots.push(f.own, f.foreign);
  await f.own.update({ title: 'Retained own source', text: 'Original source body' });
  const bucket = { name: 'shoutout-rules-test.firebasestorage.app', async getMetadata() { return [{}]; }, async getFiles() { return [[]]; } };
  f.writer = { ...f.gen.lab,
    purgeAccountIndex() { assert.fail('completed proof must not call legacy inventory'); },
    prepareAccountIndexFinish() { assert.fail('coordinator owns final cleanup'); } };
  f.run = (extra = {}, database = db, auth = f.auth) => runAccountPurgeJob(identity, database, auth, {
    pageSize: 50, leaseMillis: 120000, retryDelayMillis: 60000, clock, bucket,
    indexWriter: f.writer, indexErasureCoordinator: f.coordinator, ...extra,
  });
  f.advance = () => { f.now += 60001; };
  f.early = async () => {
    await f.queue.recover({ pageSize: 1 });
    for (let n = 0; n < 100; n++) {
      f.advance(); const result = await f.queue.run(identity, { elapsedClock: () => 0 });
      if (result.state === 'complete') return;
    }
    assert.fail('early erasure did not finish');
  };
  f.mature = () => { f.now = Math.ceil(created.toMillis() + accountRetentionMillis); };
  f.terminal = async () => {
    f.mature(); await db.recursiveDelete(user); await f.own.delete();
    await job.update({ stage: accountPurgeStages(uid).length, ingressClosedAt: Timestamp.fromMillis(f.now), reservationKey: key });
  };
  f.finish = async extra => {
    for (let n = 0; n < 100; n++) { const result = await f.run(extra);
      assert.equal(result.state === 'purged' || result.state === 'purging', true, JSON.stringify(result));
      if (result.state === 'purged') return result; f.advance();
    }
    assert.fail('coordinated purge did not finish');
  };
  return f;
}

test('malformed coordinator is rejected before accessing account data', async () => {
  await assert.rejects(runAccountPurgeJob({}, {}, {}, { pageSize: 50, leaseMillis: 120000, retryDelayMillis: 60000,
    indexErasureCoordinator: {} }), /invalid-account-purge-options/);
});

test('actual purge consumes an early proof without rescanning and preserves foreign context/data', { skip: !enabled }, async t => {
  const f = await fixture(t), child = f.own.collection('comments').doc('foreign'); await child.set({ authorId: 'foreign', text: 'Keep foreign reply' });
  const other = f.queue.base.collection('jobs').doc('unrelated'); await other.set({ keep: true });
  await f.early(); const proof = await f.queue.verify(f.identity); assert(proof.valid); const foreign = await f.foreign.get();
  assert.equal((await f.queue.base.get()).get('cursor'), f.uid);
  f.mature(); await f.finish();
  for (const ref of [f.request, f.job, f.main, f.nickname, f.queue.jobFor(f.identity)]) assert.equal((await ref.get()).exists, false);
  assert.equal((await f.queue.jobFor(f.identity).collection('targets').get()).size, 0);
  assert.equal((await f.queue.base.get()).get('cursor'), null);
  assert.deepEqual((await f.own.get()).data(), purgedShoutContext); assert.equal((await child.get()).get('text'), 'Keep foreign reply');
  assert((await f.foreign.get()).updateTime.isEqual(foreign.updateTime)); assert.deepEqual((await other.get()).data(), { keep: true });
  assert.equal((await f.gen.lab.base.get()).get('erasureRevision'), 2);
  assert.deepEqual((await f.profile.get()).data(), { schemaVersion: 1, accountStatus: 'deleted' });
});

test('the original deadline and Auth check still gate canonical and proof cleanup', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early(); const own = await f.own.get(), proof = await f.queue.jobFor(f.identity).get();
  assert.equal((await f.run()).state, 'deferred'); assert((await f.own.get()).updateTime.isEqual(own.updateTime));
  assert((await f.queue.jobFor(f.identity).get()).updateTime.isEqual(proof.updateTime));
  f.mature(); assert.equal((await f.run({}, db, { async getUser() { return { uid: f.uid }; } })).state, 'auth-still-exists');
  assert((await f.queue.jobFor(f.identity).get()).updateTime.isEqual(proof.updateTime));
});

test('missing proof runs bounded recovery before final deletion rather than bypassing index cleanup', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.terminal();
  const first = await f.run(); assert.equal(first.state, 'purging'); assert.equal((await f.request.get()).exists, true);
  assert.equal((await f.queue.jobFor(f.identity).get()).get('retainUntil').toMillis(), Timestamp.fromMillis(f.identity.requestCreateTime.toMillis() + accountRetentionMillis).toMillis());
  f.advance(); await f.finish(); assert.equal((await f.queue.jobFor(f.identity).get()).exists, false);
  for (const doc of (await f.gen.lab.base.collection('nodes').get()).docs) assert.equal(JSON.stringify(doc.data()).includes(f.uid), false);
});

test('private target cleanup follows the remaining page budget and blocks recovery while finalizing', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early(); await f.terminal();
  const queueRef = f.queue.jobFor(f.identity), target = (await queueRef.collection('targets').get()).docs[0].data();
  for (let i = 0; i < 5; i++) await queueRef.collection('targets').doc(`old-${i}`).set({ ...target, epoch: '0'.repeat(64) });
  let pages = 0;
  const actual = f.coordinator, wrapper = { ...actual, async step(identity, options) {
    const result = await actual.step(identity, options); assert(result.examined <= options.limit);
    if (result.state === 'waiting' && result.examined > 0) {
      pages++; assert.equal((await f.queue.enqueue(identity)).state, 'finalizing');
      assert.equal((await f.queue.run(identity)).state, 'finalizing');
    }
    return result;
  } };
  await f.finish({ pageSize: 2, indexErasureCoordinator: wrapper }); assert(pages >= 3);
  assert.equal((await queueRef.collection('targets').get()).size, 0);
});

test('a new generation between cleanup pages invalidates retirement and is erased before completion', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early(); await f.terminal(); let add = true;
  const actual = f.coordinator, wrapper = { ...actual, async step(identity, options) {
    const result = await actual.step(identity, options);
    if (add && result.state === 'waiting' && result.examined > 0) { add = false; await f.register(); }
    return result;
  } };
  await f.finish({ indexErasureCoordinator: wrapper }); assert.equal(add, false);
  assert.equal((await f.queue.jobFor(f.identity).get()).exists, false);
  for (const gen of f.generations) {
    for (const doc of (await gen.lab.base.collection('nodes').get()).docs) assert.equal(JSON.stringify(doc.data()).includes(f.uid), false);
  }
});

test('a final apply failure rolls back proof/header/request/checkpoint deletion together', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early(); await f.terminal(); let fail = true;
  const actual = f.coordinator, wrapper = { ...actual, async prepareFinish(...args) {
    const plan = await actual.prepareFinish(...args);
    return { apply() { plan.apply(); if (fail) { fail = false; throw new Error('injected-final-failure'); } } };
  } };
  await assert.rejects(f.finish({ indexErasureCoordinator: wrapper }), /injected-final-failure/);
  assert.equal((await f.request.get()).exists, true); assert.equal((await f.queue.jobFor(f.identity).get()).get('phase'), 'finalizing');
  assert.equal((await f.queue.base.get()).get('cursor'), f.uid);
  f.advance(); await f.finish(); assert.equal((await f.request.get()).exists, false); assert.equal((await f.queue.jobFor(f.identity).get()).exists, false);
});

test('stale recovery cannot recreate a deleted proof or restore its UID cursor', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early(); await f.terminal();
  // Reset to make the captured page contain the soon-to-be-deleted request.
  await f.queue.base.set({ v: 1, cursor: null });
  let arrived, release, pause = true;
  const began = new Promise(resolve => { arrived = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const proxy = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => {
      if (pause) { pause = false; arrived(); await gate; }
      return target.runTransaction(...args);
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  const stale = createEarlyErasureQueueLab(proxy, absent, { namespace: f.namespace, clock: () => new Date(f.now) }).recover({ pageSize: 1 });
  try {
    await began; await f.finish(); assert.equal((await f.queue.base.get()).get('purgeRevision'), 1);
    release(); const result = await stale;
    assert.equal(result.checkpointAdvanced, false); assert.equal(result.ineligible, 1);
  } finally { release(); }
  assert.equal((await f.queue.jobFor(f.identity).get()).exists, false); assert.equal((await f.queue.base.get()).get('cursor'), null);
  await assert.rejects(f.queue.enqueue(f.identity), EarlyErasureIdentityChanged);
});

test('unknown private proof descendants stop account finalization instead of leaving orphan data', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early(); await f.terminal();
  await f.queue.jobFor(f.identity).collection('unexpected').doc('item').set({ private: true });
  const result = await f.run(); assert.equal(result.state, 'needs-review'); assert.equal((await f.request.get()).exists, true);
});

test('an invalid final coordinator plan never allows deletion of the original request', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early(); await f.terminal();
  await assert.rejects(f.finish({ indexErasureCoordinator: { ...f.coordinator, async prepareFinish() { return null; } } }), /invalid-account-index-finish-plan/);
  assert.equal((await f.request.get()).exists, true); assert.equal((await f.queue.jobFor(f.identity).get()).get('phase'), 'finalizing');
});

test('coordinator rejects cleanup without the actual mature purge context', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early();
  await assert.rejects(f.coordinator.step(f.identity, { limit: 1, guard: async () => undefined }), AccountPurgeNeedsReview);
  const proof = await f.queue.jobFor(f.identity).get();
  await assert.rejects(f.coordinator.step(f.identity, { limit: 0, guard: async () => undefined }), /invalid-index-purge-limit/);
  assert((await f.queue.jobFor(f.identity).get()).updateTime.isEqual(proof.updateTime));
});

test('loss of the outer purge lease stops linked queue creation without clobbering the new owner', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.terminal();
  f.onAuth = async calls => { if (calls === 2) await f.job.update({ leaseToken: 'replacement', leaseUntil: Timestamp.fromMillis(f.now + 120000) }); };
  const result = await f.run(); assert.equal(result.state, 'lease-lost');
  assert.equal((await f.job.get()).get('leaseToken'), 'replacement');
  assert.equal((await f.request.get()).exists, true); assert.equal((await f.queue.jobFor(f.identity).get()).exists, false);
  assert.equal((await f.gen.lab.base.get()).get('activeErasure'), undefined);
});

test('a foreign recovery cursor is preserved while the completed owner job is deleted', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early(); await f.terminal();
  await f.queue.base.set({ v: 1, cursor: 'another-user' });
  await f.finish(); assert.equal((await f.queue.base.get()).get('cursor'), 'another-user');
  assert.equal((await f.request.get()).exists, false);
});

test('lost final commit acknowledgement cannot resurrect the request, proof, targets or cursor', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.early(); await f.terminal(); let lose = true;
  const proxy = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => {
      const result = await target.runTransaction(...args);
      if (lose && !(await f.request.get()).exists) { lose = false; throw new Error('lost-final-ack'); }
      return result;
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  for (let n = 0; n < 10 && lose; n++) {
    try { await f.run({}, proxy); } catch (error) { assert.match(error.message, /lost-final-ack/); }
    f.advance();
  }
  assert.equal(lose, false); assert.equal((await f.run()).state, 'purged');
  for (const ref of [f.request, f.job, f.queue.jobFor(f.identity)]) assert.equal((await ref.get()).exists, false);
  assert.equal((await f.queue.jobFor(f.identity).collection('targets').get()).size, 0);
  assert.equal((await f.queue.base.get()).get('cursor'), null);
});
