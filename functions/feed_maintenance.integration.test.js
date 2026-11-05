import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { FieldPath, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { encodeGeohash } from './create_shout.js';
import { runAccountMaintenanceTick as tick } from './shout_expiration.js';
import { accountPurgeJobRef, initialAccountPurgeJob, accountRetentionMillis } from './account_purge_guard.js';
import { purgedShoutContext } from './shout_context.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'feed-maintenance-tests') : null;
const db = app ? getFirestore(app) : null, roots = [];
const point = { latitude: 50.08, longitude: 14.44 };
const missing = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
after(async () => {
  if (!app) return;
  for (const root of roots) await db.recursiveDelete(root);
  await db.terminate(); await deleteApp(app);
});

async function fixture() {
  const uid = randomUUID(), prefix = `mi-${uid.slice(0, 8)}-`, key = `mvp_${uid.replaceAll('-', '').slice(0, 12)}`;
  const query = db.collection('shouts').where(FieldPath.documentId(), '>=', prefix)
    .where(FieldPath.documentId(), '<', prefix + '\uf8ff');
  const lab = createLabBlockIndex(db, { namespace: `maint-${uid.slice(0, 8)}`,
    sourceCollection: { doc: id => db.doc(`shouts/${id}`), get: () => query.get() } });
  roots.push(lab.base);
  const scoped = { projectId: db.projectId, collectionGroup: db.collectionGroup.bind(db),
    runTransaction: db.runTransaction.bind(db),
    collection(name) {
      if (name === 'shouts') return query;
      if (['accountPurgeJobs', 'accountDeletionJobs'].includes(name)) return db.collection(name).where('userId', '==', uid);
      return db.collection(name);
    },
    doc(path) { return path.startsWith('maintenanceState/') ? lab.base.collection('checkpoints').doc(path.split('/')[1]) : db.doc(path); },
  };
  let millis = Date.now() + 1000;
  const calls = [], indexWriter = { async prepare(...args) { calls.push({ id: args[1], before: args[2], after: args[3] }); return lab.prepare(...args); } };
  const options = { pageSize: 50, maxJobs: 1, leaseMillis: 120000, retryDelayMillis: 1000, authWaitMillis: 86400000,
    retentionPurgeEnabled: true, shoutExpirationEnabled: true, indexWriter, clock: () => new Date(millis),
    bucket: { name: 'shoutout-rules-test.firebasestorage.app', getMetadata: async () => [{}], getFiles: async () => [[]] } };
  const f = { uid, prefix, key, lab, scoped, options, calls, advance: ms => { millis += ms; },
    tick: (extra = {}, database = scoped) => tick(database, missing, { ...options, ...extra }),
    async seed(rows) {
      await lab.seed(rows.map(([id, extra]) => ({ id: prefix + id, authorId: 'foreign', status: 'active', location: point,
        geohash: encodeGeohash(point.latitude, point.longitude), categories: ['help'], createdAt: millis - 10000,
        expiresAt: millis + 1000000, likesCount: 0, dislikesCount: 0, ...extra })));
      for (const [id] of rows) {
        const ref = db.doc(`shouts/${prefix}${id}`), data = (await ref.get()).data(); roots.push(ref);
        await ref.update({ createdAt: Timestamp.fromMillis(data.createdAt), expiresAt: Timestamp.fromMillis(data.expiresAt),
          title: 'Preserve title', text: 'Preserve body', savesCount: 0, commentsCount: 0 });
      }
    },
    ref: id => db.doc(`shouts/${prefix}${id}`),
    async purge() {
      const request = db.doc(`accountDeletionRequests/${uid}`), profile = db.doc(`publicProfiles/${uid}`), user = db.doc(`users/${uid}`);
      await request.set({ userId: uid, status: 'pending', email: 'fixture@example.test' });
      const created = (await request.get()).createTime, identity = { projectId: db.projectId, userId: uid, requestCreateTime: created };
      const job = accountPurgeJobRef(db, identity), main = db.doc(`accountDeletionJobs/${job.id}`), nickname = db.doc(`nicknames/${key}`);
      roots.push(request, profile, user, job, main, nickname);
      await user.set({ nicknameLower: key }); await profile.set({ nickname: key }); await nickname.set({ uid, nicknameLower: key });
      await main.set({ userId: uid, reservationKey: key, leaseToken: null, leaseUntil: null, nextAttemptAt: null, phase: 'content-archived' });
      await job.set(initialAccountPurgeJob(identity, Timestamp.now()));
      millis = Math.ceil(created.toMillis()) + accountRetentionMillis;
      Object.assign(f, { request, profile, job, main, identity });
    },
    async finish(extra = {}, database = scoped) {
      for (let n = 0; n < 100; n++) {
        const result = await f.tick(extra, database);
        assert.equal(result.purgeFailed, 0, JSON.stringify(result)); assert.equal(result.purgeNeedsReview, 0, JSON.stringify(result));
        assert.ok((result.purgeExamined ?? 0) <= 50); assert.equal(result.expirationChanged, 0);
        if (!(await f.job.get()).exists) return;
        f.advance(1000);
      }
      assert.fail('purge did not finish');
    },
    open: () => lab.open({ point, radiusKm: 20, now: millis }),
  };
  return f;
}
const historySize = async f => (await f.lab.base.collection('retiredRoots').get()).size;
const page = async view => (await view.page(view.first)).rows;

test('whole maintenance tick expires source and actual index atomically, preserves children and old snapshot', { skip: !enabled }, async () => {
  const f = await fixture(); await f.seed([['due'], ['future', { expiresAt: f.options.clock().getTime() + 2000000 }]]);
  const old = await f.open(), due = f.ref('due'), child = due.collection('comments').doc('foreign');
  await child.set({ authorId: 'other', text: 'Keep comment' });
  const before = (await due.get()).data(), childBefore = await child.get(); f.advance(1000000);
  const baseline = await historySize(f);
  const result = await f.tick(); assert.equal(result.expirationChanged, 1); assert.equal(result.expirationScanned, 1);
  assert.deepEqual((await due.get()).data(), { ...before, status: 'expired' });
  assert.ok((await child.get()).updateTime.isEqual(childBefore.updateTime));
  assert.equal((await f.ref('future').get()).get('status'), 'active');
  assert.equal(f.calls.length, 1); assert.equal(await historySize(f), baseline + 1);
  assert.equal((await page(old)).length, 2); assert.equal((await f.lab.hydrate(old, [due.id], f.options.clock().getTime())).items[0].available, false);
  assert.equal((await f.lab.audit()).activeMetadata, 1);
  assert.equal((await f.tick()).expirationChanged, 0); assert.equal(await historySize(f), baseline + 1);
});

test('missing plan and failure after index apply roll back expiration; a retry changes the source once', { skip: !enabled }, async () => {
  const f = await fixture(); await f.seed([['due']]); f.advance(1000000);
  const before = await f.ref('due').get();
  await assert.rejects(f.tick({ indexWriter: { prepare: async () => null } }), /invalid-expiration-index-plan/);
  await assert.rejects(f.tick({ indexWriter: { async prepare(...args) {
    const plan = await f.lab.prepare(...args); return { apply() { plan.apply(); throw new Error('injected-index-failure'); } };
  } } }), /injected-index-failure/);
  assert.ok((await f.ref('due').get()).updateTime.isEqual(before.updateTime)); assert.equal(await historySize(f), 0);
  assert.equal((await f.tick()).expirationChanged, 1); assert.equal(await historySize(f), 1);
  assert.equal((await f.tick()).expirationChanged, 0); assert.equal((await f.lab.audit()).activeMetadata, 0);
});

async function purgeActivities() {
  const f = await fixture(); await f.purge();
  // Own Shouts have already left the live index at the earlier Auth-deletion phase.
  await f.seed([['own', { authorId: f.uid, status: 'deleted' }], ['empty', { authorId: f.uid, status: 'deleted' }], ['foreign', { likesCount: 1 }]]);
  await f.ref('own').collection('comments').doc('other').set({ authorId: 'other', text: 'Preserve foreign comment' });
  await f.ref('foreign').update({ commentsCount: 1, savesCount: 1 });
  await f.ref('foreign').collection('comments').doc('own').set({ authorId: f.uid, text: 'Remove own comment' });
  const vote = f.ref('foreign').collection('reactions').doc(f.uid), save = f.ref('foreign').collection('saves').doc(f.uid);
  await vote.set({ userId: f.uid, type: 'like' }); await save.set({ userId: f.uid });
  return Object.assign(f, { vote, save });
}

test('whole purge keeps anonymous foreign context, removes own roots and composes only the indexed counter', { skip: !enabled }, async () => {
  const f = await purgeActivities(), old = await f.open(), deadline = (await f.job.get()).get('retainUntil');
  await f.finish();
  assert.deepEqual((await f.ref('own').get()).data(), purgedShoutContext); assert.equal((await f.ref('empty').get()).exists, false);
  assert.equal((await f.ref('own').collection('comments').doc('other').get()).get('text'), 'Preserve foreign comment');
  const source = (await f.ref('foreign').get()).data();
  assert.equal(source.likesCount, 0); assert.equal(source.savesCount, 0); assert.equal(source.commentsCount, 0); assert.equal(source.text, 'Preserve body');
  assert.equal((await f.vote.get()).exists, false); assert.equal((await f.save.get()).exists, false);
  assert.equal((await page(old))[0].likesCount, 1); assert.equal((await page(await f.open()))[0].likesCount, 0);
  assert.equal(f.calls.filter(call => call.id === f.ref('foreign').id).length, 1);
  assert.equal(f.calls.filter(call => call.before.authorId === f.uid).length, 2); assert.equal(await historySize(f), 1);
  assert.equal((await f.lab.audit()).activeMetadata, 1);
  assert.equal((await f.lab.hydrate(old, [f.ref('own').id], f.options.clock().getTime())).items[0].available, false);
  for (const collection of ['nodes', 'retiredRoots']) {
    for (const doc of (await f.lab.base.collection(collection).get()).docs) assert.equal(JSON.stringify(doc.data()).includes(f.uid), false);
  }
  assert.equal(deadline.toMillis(), f.identity.requestCreateTime.toMillis() + accountRetentionMillis);
});

test('due purge has priority over expiration and shares its bounded maintenance budget', { skip: !enabled }, async () => {
  const f = await fixture(); await f.purge(); await f.seed([['due', { expiresAt: f.options.clock().getTime() - 1 }]]);
  const first = await f.tick(); assert.equal(first.purgeScanned, 1); assert.ok(first.purgeExamined <= 50);
  assert.equal(first.scanned, 0); assert.equal(first.expirationChanged, 0); assert.equal(f.calls.length, 0);
  if ((await f.job.get()).exists) { f.advance(1000); await f.finish(); }
  assert.equal((await f.tick()).expirationChanged, 1); assert.equal((await f.lab.audit()).activeMetadata, 0);
});

for (const mode of ['missing-plan', 'apply-failure']) test(`purge ${mode} leaves reaction, source and index together for a safe retry`, { skip: !enabled }, async () => {
  const f = await purgeActivities(), writer = { async prepare(...args) {
    if (args[1] !== f.ref('foreign').id) return f.lab.prepare(...args);
    if (mode === 'missing-plan') return null;
    const plan = await f.lab.prepare(...args); return { apply() { plan.apply(); throw new Error('injected-purge-failure'); } };
  } };
  let failed = false;
  for (let n = 0; n < 15; n++) { const result = await f.tick({ indexWriter: writer });
    if (result.purgeFailed) { failed = true; break; } f.advance(1000); }
  assert.equal(failed, true); assert.equal((await f.vote.get()).exists, true);
  assert.equal((await f.ref('foreign').get()).get('likesCount'), 1); assert.equal((await page(await f.open()))[0].likesCount, 1);
  assert.equal(await historySize(f), 0); f.advance(1000); await f.finish();
  assert.equal((await f.ref('foreign').get()).get('likesCount'), 0); assert.equal(await historySize(f), 1);
});

test('lost purge transaction acknowledgement resumes its journal without decrementing the counter twice', { skip: !enabled }, async () => {
  const f = await purgeActivities(); let armed = false, lost = false;
  const database = { ...f.scoped, async runTransaction(...args) {
    const result = await db.runTransaction(...args);
    if (armed && !lost && !(await f.vote.get()).exists) { lost = true; throw new Error('lost-commit-acknowledgement'); }
    return result;
  } };
  const beforeCommit = async change => { if (change.operation === 'reaction') armed = true; };
  for (let n = 0; n < 15 && !lost; n++) { await f.tick({ beforeCommit }, database); f.advance(1000); }
  assert.equal(lost, true); assert.equal((await f.vote.get()).exists, false);
  assert.equal((await f.ref('foreign').get()).get('likesCount'), 0); assert.equal(await historySize(f), 1);
  await f.finish({}, database); assert.equal((await f.ref('foreign').get()).get('likesCount'), 0); assert.equal(await historySize(f), 1);
});

test('a malformed frozen context stops for review without changing the original retention deadline', { skip: !enabled }, async () => {
  const f = await fixture(); await f.purge(); await f.seed([]);
  const ref = f.ref('malformed'); roots.push(ref); await ref.set({ ...purgedShoutContext, authorId: f.uid, text: 'Unexpected retained body' });
  const before = await ref.get(), deadline = (await f.job.get()).get('retainUntil');
  const result = await f.tick(); assert.equal(result.purgeNeedsReview, 1); assert.equal(result.purgeFailed, 0);
  assert.ok((await ref.get()).updateTime.isEqual(before.updateTime)); assert.equal(f.calls.length, 0);
  assert.ok((await f.job.get()).get('retainUntil').isEqual(deadline)); assert.equal(await historySize(f), 0);
});

test('a missing freeze plan cannot erase the canonical source or advance its journal cursor', { skip: !enabled }, async () => {
  const f = await fixture(); await f.purge(); await f.seed([['own', { authorId: f.uid, status: 'deleted' }]]);
  const before = await f.ref('own').get(), deadline = (await f.job.get()).get('retainUntil');
  const result = await f.tick({ indexWriter: { prepare: async () => null } });
  assert.equal(result.purgeFailed, 1); assert.ok((await f.ref('own').get()).updateTime.isEqual(before.updateTime));
  const job = await f.job.get(); assert.equal(job.get('stage'), 0); assert.equal(job.get('stageCursor'), null);
  assert.ok(job.get('retainUntil').isEqual(deadline)); assert.equal(await historySize(f), 0);
  f.advance(1000); await f.finish(); assert.equal((await f.ref('own').get()).exists, false);
});

test('anonymous context is unavailable to hydration but cannot conceal stale indexed metadata from audit', { skip: !enabled }, async () => {
  const f = await fixture(); await f.seed([['context']]); const old = await f.open();
  // Deliberate source/index divergence: audit must fail, rather than treating
  // the valid anonymous source marker as permission to retain an indexed row.
  await f.ref('context').set(purgedShoutContext);
  assert.equal((await f.lab.hydrate(old, [f.ref('context').id], f.options.clock().getTime())).items[0].available, false);
  await assert.rejects(f.lab.audit(), /incomplete-index/);
});
