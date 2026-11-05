import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { canonical } from './feed_block_index.js';
import { createShoutOperation as publish } from './create_shout.js';
import { deleteShoutOperation as remove } from './delete_shout.js';
import { operationTestKey } from './test_helpers.js';
import { expireDueShouts } from './shout_expiration.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'moderation-index-tests') : null;
const db = app ? getFirestore(app) : null, roots = [], actors = [];
const now = new Date('2026-11-05T12:00:00Z'), point = { latitude: 50.08, longitude: 14.44 };
const clock = () => now, key = label => operationTestKey(label, now);
after(async () => {
  if (!app) return;
  for (const uid of actors) for (const receipt of (await db.collection('serverOperations').where('userId', '==', uid).get()).docs) await receipt.ref.delete();
  for (const root of roots) await db.recursiveDelete(root);
  await db.terminate(); await deleteApp(app);
});

async function actor() {
  const uid = randomUUID(); actors.push(uid);
  for (const collection of ['users', 'publicProfiles', 'accountRoles', 'moderators', 'bans', 'accountDeletionRequests', 'rateLimits']) roots.push(db.doc(`${collection}/${uid}`));
  await db.doc(`users/${uid}`).set({ nickname: 'Fixture actor', avatarId: 'avatar_01', avatarBackgroundStart: 1,
    avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  await db.doc(`publicProfiles/${uid}`).set({ nickname: 'Fixture actor' }); return uid;
}
const request = (uid, data) => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } },
  app: { appId: 'web' }, data: { expectedUserId: uid, ...data } });
async function fixture(level = 3) {
  const author = await actor(), uid = await actor(), namespace = `mod-${randomUUID().slice(0, 8)}`;
  const lab = createLabBlockIndex(db, { namespace, accountRetention: true }); roots.push(lab.base); await lab.seed([]);
  const scoped = { projectId: db.projectId, runTransaction: db.runTransaction.bind(db),
    collection: name => name === 'shouts' ? lab.base.collection('source') : db.collection(name),
    doc: path => path.startsWith('shouts/') ? lab.base.collection('source').doc(path.slice(7)) : db.doc(path) };
  if (level !== null) await db.doc(`${level === 'legacy' ? 'moderators' : 'accountRoles'}/${uid}`).set(level === 'legacy' ? {} : { level });
  const created = await publish(request(author, { title: 'Moderation index fixture', text: 'Preserve the full source', categories: ['Dotaz'],
    durationMinutes: 120, location: point, idempotencyKey: key('publication') }), scoped, clock, { indexWriter: lab });
  const source = lab.base.collection('source').doc(created.shoutId);
  const deletion = label => request(uid, { shoutId: source.id, idempotencyKey: key(label) });
  const receipt = label => db.doc(`serverOperations/${createHash('sha256').update(`${uid}\ndeleteShout\n${key(label)}`).digest('hex')}`);
  return { uid, author, lab, scoped, source, deletion, receipt,
    run: (label = 'delete', writer = lab, database = scoped) => remove(deletion(label), database, clock, { indexWriter: writer }),
    open: () => lab.open({ point, radiusKm: 20, now: now.getTime() }),
  };
}
async function snapshot(f) {
  const [source, cells, nodes, history, receipts] = await Promise.all([f.source.get(),
    f.lab.base.collection('cells').get(), f.lab.base.collection('nodes').get(), f.lab.base.collection('retiredRoots').get(),
    db.collection('serverOperations').where('userId', '==', f.uid).get()]);
  const time = doc => ({ seconds: doc.updateTime.seconds, nanoseconds: doc.updateTime.nanoseconds });
  const rows = docs => docs.docs.map(doc => [doc.id, doc.data(), time(doc)]).sort(([a], [b]) => a.localeCompare(b));
  return canonical({ source: [source.data(), time(source)], cells: rows(cells), nodes: rows(nodes), history: rows(history), receipts: rows(receipts) });
}

test('official staff levels and legacy membership delete through the actual R5 writer while preserving source and descendants', { skip: !enabled }, async () => {
  for (const level of [3, 4, 5, 6, 'legacy']) {
    const f = await fixture(level), before = (await f.source.get()).data(), old = await f.open();
    const child = f.source.collection('comments').doc('foreign'); await child.set({ authorId: 'foreign', text: 'Keep child' });
    const childBefore = await child.get();
    await Promise.all([f.run(), f.run()]);
    assert.deepEqual((await f.source.get()).data(), { ...before, status: 'deleted' });
    assert.ok((await child.get()).updateTime.isEqual(childBefore.updateTime));
    assert.equal((await f.lab.audit()).activeMetadata, 0); assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 1);
    assert.equal((await old.page(old.first)).rows.length, 1);
    assert.equal((await f.lab.hydrate(old, [f.source.id], now.getTime())).items[0].available, false);
    const saved = await f.receipt('delete').get(); assert.equal(saved.get('authorId'), f.author); assert.equal(saved.get('userId'), f.uid);
    assert.equal(saved.get('expiresAt').toMillis() - saved.get('createdAt').toMillis(), 7 * 86400000);
    const committed = await snapshot(f); await f.run(); assert.equal(await snapshot(f), committed);
    assert.equal((await db.collection(`rateLimits/${f.uid}/actions`).get()).size, 0);
  }
});

test('ordinary/Business and malformed roles cannot reach the index planner even with injected profile privileges', { skip: !enabled }, async () => {
  for (const level of [null, 1, 2, '3', 2.5, true]) {
    const f = await fixture(level); await db.doc(`users/${f.uid}`).update({ role: 'administrator', level: 6 });
    let planned = 0; const before = await snapshot(f);
    await assert.rejects(f.run('denied', { prepare() { planned++; assert.fail('unauthorized index planning'); } }), error => error.code === 'permission-denied');
    assert.equal(planned, 0); assert.equal(await snapshot(f), before);
  }
});

test('role revocation, ban and deletion intent fence both receipt replay and fresh moderation requests', { skip: !enabled }, async () => {
  for (const mode of ['role', 'ban', 'deletion']) {
    const f = await fixture(); await f.run();
    if (mode === 'role') await db.doc(`accountRoles/${f.uid}`).delete();
    if (mode === 'ban') await db.doc(`bans/${f.uid}`).set({});
    if (mode === 'deletion') await db.doc(`accountDeletionRequests/${f.uid}`).set({ userId: f.uid, status: 'pending' });
    const before = await snapshot(f);
    for (const label of ['delete', 'fresh']) await assert.rejects(f.run(label), error => ['permission-denied', 'failed-precondition'].includes(error.code));
    assert.equal(await snapshot(f), before);
  }
});

test('a failure after index apply rolls back the source, immutable history and moderator receipt', { skip: !enabled }, async () => {
  const f = await fixture(), before = await snapshot(f);
  await assert.rejects(f.run('retry', { async prepare(...args) {
    const plan = await f.lab.prepare(...args); return { apply() { plan.apply(); throw new Error('injected-index-failure'); } };
  } }), /injected-index-failure/);
  assert.equal(await snapshot(f), before); await f.run('retry'); assert.equal((await f.lab.audit()).activeMetadata, 0);
});

test('concurrent moderators use separate receipts but retire the active root only once', { skip: !enabled }, async () => {
  const f = await fixture(), second = await actor(); await db.doc(`accountRoles/${second}`).set({ level: 4 });
  await Promise.all([f.run(), remove(request(second, { shoutId: f.source.id, idempotencyKey: key('second-moderator') }),
    f.scoped, clock, { indexWriter: f.lab })]);
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 1); assert.equal((await f.lab.audit()).activeMetadata, 0);
  assert.equal((await db.collection('serverOperations').where('userId', '==', f.uid).get()).size, 1);
  assert.equal((await db.collection('serverOperations').where('userId', '==', second).get()).size, 1);
});

async function startAuthorErasure(f) {
  const ref = db.doc(`accountDeletionRequests/${f.author}`); await ref.set({ userId: f.author, status: 'pending' });
  const created = (await ref.get()).createTime, clock = () => new Date(Math.ceil(created.toMillis()) + 1000);
  await ref.update({ authDeletionConfirmedAt: Timestamp.fromMillis(Math.ceil(created.toMillis())) });
  await db.doc(`publicProfiles/${f.author}`).set({ schemaVersion: 1, accountStatus: 'deleted' });
  const identity = { projectId: db.projectId, userId: f.author, requestCreateTime: created }, options = { clock };
  const step = () => f.lab.purgeAccountIndex(identity, options);
  const finish = async () => { for (let i = 0; i < 100; i++) { const result = await step(); if (result.state === 'complete') return; } assert.fail('erasure did not complete'); };
  return { identity, options, step, finish, async close() {
    await db.runTransaction(async tx => { const plan = await f.lab.prepareAccountIndexFinish(tx, identity, options); plan.apply(); });
  } };
}

test('R5 cell cleanup rejects moderation without a partial receipt or source mutation', { skip: !enabled }, async () => {
  const f = await fixture(), erasure = await startAuthorErasure(f), cell = (await f.source.get()).get('geohash').slice(0, 4);
  for (let i = 0; !(await f.lab.base.collection('cellRetention').doc(cell).get()).get('owner'); i++) {
    assert(i < 100); await erasure.step();
  }
  const before = await snapshot(f); await assert.rejects(f.run('during-cleanup'), /index-cell-retention-busy/);
  assert.equal(await snapshot(f), before); await erasure.finish(); await erasure.close();
});

test('an enabled writer must return an applicable plan before moderation can commit any source or receipt', { skip: !enabled }, async () => {
  const f = await fixture(), before = await snapshot(f);
  await assert.rejects(f.run('missing-plan', { prepare: async () => null }), /invalid-shout-deletion-index-plan/);
  assert.equal(await snapshot(f), before);
});

test('moderation can delete a retained source after R5 has already erased its author projection', { skip: !enabled }, async () => {
  const f = await fixture(), original = (await f.source.get()).data(), erasure = await startAuthorErasure(f);
  await erasure.finish(); await erasure.close(); assert.equal((await f.source.get()).get('status'), 'active');
  assert.equal((await f.lab.audit()).activeMetadata, 0);
  await f.run('after-erasure');
  assert.deepEqual((await f.source.get()).data(), { ...original, status: 'deleted' });
  assert.equal((await f.lab.audit()).activeMetadata, 0); assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 0);
});

test('expiration can update a retained source after R5 without restoring its erased projection', { skip: !enabled }, async () => {
  const f = await fixture(), before = (await f.source.get()).data(), erasure = await startAuthorErasure(f);
  await erasure.finish(); await erasure.close();
  const result = await expireDueShouts(f.scoped, { maxCandidates: 50, indexWriter: f.lab,
    clock: () => new Date(before.expiresAt.toMillis() + 1) });
  assert.equal(result.expired, 1); assert.deepEqual((await f.source.get()).data(), { ...before, status: 'expired' });
  assert.equal((await f.lab.audit()).activeMetadata, 0); assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 0);
});

test('missing ordinary-author metadata and malformed deletion markers cannot bypass index consistency', { skip: !enabled }, async () => {
  for (const malformed of [null, { accountStatus: 'deleted' }, { schemaVersion: 1, accountStatus: 'deleted', nickname: 'Unexpected' }]) {
    const f = await fixture(), source = (await f.source.get()).data();
    // Deliberate index-only corruption: canonical source remains active.
    await db.runTransaction(async tx => { const plan = await f.lab.prepare(tx, f.source.id, source, null); plan.apply(); });
    if (malformed) await db.doc(`publicProfiles/${f.author}`).set(malformed);
    const before = await snapshot(f); await assert.rejects(f.run('not-legitimately-erased'), /incomplete-index/);
    assert.equal(await snapshot(f), before);
  }
});

test('an exact deleted-author marker never permits overwriting a present mismatching index row', { skip: !enabled }, async () => {
  const f = await fixture(), source = (await f.source.get()).data();
  await db.runTransaction(async tx => { const plan = await f.lab.prepare(tx, f.source.id, source, { ...source, likesCount: 9 }); plan.apply(); });
  await db.doc(`publicProfiles/${f.author}`).set({ schemaVersion: 1, accountStatus: 'deleted' });
  const before = await snapshot(f); await assert.rejects(f.run('stale-index'), /incomplete-index/);
  assert.equal(await snapshot(f), before);
});
