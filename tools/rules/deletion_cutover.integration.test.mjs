import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, limit, query, setDoc, updateDoc, deleteDoc,
  writeBatch, runTransaction, serverTimestamp, GeoPoint } from 'firebase/firestore';
import { prepareAccountDeletionOperation as prepare } from '../../functions/prepare_account_deletion.js';
import { finalizeAccountDeletionOperation as finalize } from '../../functions/finalize_account_deletion.js';
import { deleteShoutOperation as remove } from '../../functions/delete_shout.js';
import { operationTestKey } from '../../functions/test_helpers.js';

// The operations and snapshots must use the same SDK types (Timestamp instanceof).
const sdk = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = sdk('firebase-admin/app');
const { getFirestore } = sdk('firebase-admin/firestore');

let env, app, db;
const roots = [], actors = [];
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
  app = initializeApp({ projectId: 'shoutout-rules-test' }, 'deletion-cutover');
  db = getFirestore(app);
});
after(async () => {
  if (db) {
    for (const uid of actors) {
      for (const name of ['shouts', 'serverOperations']) {
        const page = await db.collection(name).where(name === 'shouts' ? 'authorId' : 'userId', '==', uid).get();
        for (const item of page.docs) await db.recursiveDelete(item.ref);
      }
    }
    for (const ref of roots) await db.recursiveDelete(ref);
    await db.terminate();
  }
  if (app) await deleteApp(app);
  if (env) await env.cleanup();
});
async function actor(level = 1) {
  const uid = randomUUID(); actors.push(uid);
  const refs = ['users', 'accountRoles', 'accountDeletionRequests', 'rateLimits'].map(name => db.doc(`${name}/${uid}`));
  roots.push(...refs);
  await refs[0].set({ nickname: 'Fixture', avatarId: 'fox', avatarBackgroundStart: 'teal',
    avatarBackgroundEnd: 'navy', avatarGradientDirection: 'diagonal' });
  await refs[0].collection('legal').doc('acceptance_2026_07_25').set({});
  await refs[1].set({ role: level >= 3 ? 'moderator' : level === 2 ? 'business' : 'user', level });
  const token = { email: 'fixture@example.test', email_verified: true };
  return { uid, request: refs[2], client: env.authenticatedContext(uid, token).firestore(),
    callable: { auth: { uid, token }, app: { appId: 'fixture' } } };
}
const requestData = uid => ({ userId: uid, email: 'fixture@example.test', status: 'pending',
  requestedAt: new Date(), retainUntil: new Date(Date.now() + 60 * 86400000) });
async function shout(uid, status = 'active') {
  const ref = db.doc(`shouts/${randomUUID()}`); roots.push(ref);
  await ref.set({ authorId: uid, status, title: 'Fixture', text: 'Preserve content',
    likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0 });
  return ref;
}

test('owners, Business, moderators and anonymous clients cannot create or replace deletion requests', async () => {
  for (const level of [1, 2, 3]) {
    const f = await actor(level);
    for (const client of [f.client, env.unauthenticatedContext().firestore()]) {
      const ref = doc(client, f.request.path);
      await assertFails(setDoc(ref, { ...requestData(f.uid), requestedAt: serverTimestamp() }));
      assert.equal((await f.request.get()).exists, false);
      await f.request.set(requestData(f.uid));
      const before = await f.request.get();
      for (const write of [
        () => deleteDoc(ref),
        () => updateDoc(ref, { status: 'completed' }),
        () => updateDoc(ref, { retainUntil: new Date(0) }),
        () => updateDoc(ref, { authDeletionConfirmedAt: new Date() }),
        () => setDoc(ref, { userId: 'another' }),
        () => setDoc(ref, { extraData: 'injected' }, { merge: true }),
        () => runTransaction(client, async tx => { await tx.get(ref); tx.delete(ref); }),
      ]) await assertFails(write());
      const after = await f.request.get();
      assert.deepEqual(after.data(), before.data());
      assert(after.createTime.isEqual(before.createTime));
      assert(after.updateTime.isEqual(before.updateTime));
      await f.request.delete(); // Privileged fixture cleanup only.
    }
  }
});

test('own pending request remains readable for recovery; foreign reads and enumeration stay denied', async () => {
  const owner = await actor(), other = await actor(), moderator = await actor(3);
  await owner.request.set(requestData(owner.uid));
  for (const client of [owner.client, moderator.client]) {
    const value = await assertSucceeds(runTransaction(client, tx => tx.get(doc(client, owner.request.path))));
    assert.equal(value.data().userId, owner.uid);
    await assertFails(getDocs(query(collection(client, 'accountDeletionRequests'), limit(50))));
  }
  for (const client of [other.client, env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(client, owner.request.path)));
    await assertFails(getDocs(query(collection(client, 'accountDeletionRequests'), limit(50))));
  }
});

test('no client role can hide, restore, replace or counter-batch a Shout status', async () => {
  const owner = await actor(), business = await actor(2), moderator = await actor(3), other = await actor();
  for (const author of [owner, business]) {
    for (const state of ['active', 'expired', 'deleted']) {
      const ref = await shout(author.uid, state), before = await ref.get();
      for (const client of [author.client, moderator.client, other.client, env.unauthenticatedContext().firestore()]) {
        const target = doc(client, ref.path);
        await assertFails(updateDoc(target, { status: state === 'deleted' ? 'active' : 'deleted' }));
        await assertFails(setDoc(target, { ...before.data(), status: 'deleted', authorId: 'another' }));
        await assertFails(deleteDoc(target));
        const batch = writeBatch(client);
        batch.update(target, { status: 'deleted', likesCount: 1 });
        await assertFails(batch.commit());
      }
      assert.deepEqual((await ref.get()).data(), before.data());
      assert((await ref.get()).updateTime.isEqual(before.updateTime));
    }
  }
});

test('server preparation, finalization and lost-ack recovery work with closed client writes', async () => {
  const f = await actor(), other = await actor(), foreign = await shout(other.uid);
  const originalForeign = await foreign.get(), own = [];
  for (let i = 0; i < 51; i++) own.push(await shout(f.uid));
  const child = own[0].collection('comments').doc('foreign');
  await child.set({ authorId: other.uid, text: 'Keep foreign conversation' });
  const now = new Date(), clock = () => now;
  const prep = key => ({ ...f.callable, data: { expectedUserId: f.uid, idempotencyKey: operationTestKey(key, now) } });
  assert.deepEqual(await prepare(prep('first'), db, clock), { hidden: 50, hasMore: true });
  const finalRequest = { ...f.callable, data: { expectedUserId: f.uid } };
  assert.equal((await finalize(finalRequest, db, clock)).ready, false);
  assert.equal((await f.request.get()).exists, false);
  assert.deepEqual(await prepare(prep('first'), db, clock), { hidden: 50, hasMore: true });
  assert.deepEqual(await prepare(prep('second'), db, clock), { hidden: 1, hasMore: false });
  await finalize(finalRequest, db, clock); // Simulate losing the acknowledgement.
  const committed = await f.request.get(), clientRef = doc(f.client, f.request.path);
  await assertFails(deleteDoc(clientRef));
  const recovered = await assertSucceeds(runTransaction(f.client, tx => tx.get(clientRef)));
  assert.equal(recovered.data().status, 'pending');
  assert.equal((await finalize(finalRequest, db, clock)).ready, true);
  const replay = await f.request.get();
  assert(replay.updateTime.isEqual(committed.updateTime));
  assert(replay.createTime.isEqual(committed.createTime));
  assert.deepEqual(replay.data(), committed.data());
  assert.deepEqual((await foreign.get()).data(), originalForeign.data());
  assert((await foreign.get()).updateTime.isEqual(originalForeign.updateTime));
  assert.equal((await child.get()).get('text'), 'Keep foreign conversation');
});

test('server deletion still authorizes personal, Business and moderator actors and denies a foreign user', async () => {
  const author = await actor(), business = await actor(2), moderator = await actor(3), other = await actor();
  const now = new Date();
  for (const f of [author, business, moderator, other]) {
    const ref = await shout(f === business ? business.uid : author.uid);
    const input = { ...f.callable, data: { expectedUserId: f.uid, shoutId: ref.id,
      idempotencyKey: operationTestKey(randomUUID(), now) } };
    const before = await ref.get();
    if (f === other) {
      await assert.rejects(remove(input, db, () => now), e => e.code === 'permission-denied');
      assert.deepEqual((await ref.get()).data(), before.data());
    } else {
      await remove(input, db, () => now);
      assert.deepEqual((await ref.get()).data(), { ...before.data(), status: 'deleted' });
    }
  }
});

test('remaining legacy publication cannot race finalization into an active Shout under a pending request', async () => {
  for (const order of ['publish-first', 'finalize-first', 'race', 'race', 'race', 'race']) {
    const f = await actor(), id = randomUUID();
    roots.push(db.doc(`shouts/${id}`));
    const publish = () => {
      const batch = writeBatch(f.client);
      batch.set(doc(f.client, `rateLimits/${f.uid}/actions/shout`), {
        lastAt: serverTimestamp(), lastEventId: id, windowStartedAt: serverTimestamp(), count: 1,
      });
      batch.set(doc(f.client, `shouts/${id}`), {
        authorId: f.uid, authorNickname: 'Fixture', title: 'Race', text: 'Preserve publication order',
        avatarId: 'fox', avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'navy', avatarGradientDirection: 'diagonal',
        categories: ['Ostatní'], location: new GeoPoint(50.54, 14.13), geohash: 'u2fkbnh',
        createdAt: serverTimestamp(), expiresAt: new Date(Date.now() + 7200000), status: 'active',
        likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0,
      });
      return batch.commit();
    };
    const finish = () => finalize({ ...f.callable, data: { expectedUserId: f.uid } }, db);
    if (order === 'publish-first') {
      await assertSucceeds(publish());
      assert.equal((await finish()).ready, false);
    } else if (order === 'finalize-first') {
      assert.equal((await finish()).ready, true);
      await assertFails(publish());
    } else {
      const [finalized, published] = await Promise.allSettled([finish(), publish()]);
      assert.equal(finalized.status, 'fulfilled');
      if (published.status === 'fulfilled') assert.equal(finalized.value.ready, false);
      else {
        assert.equal(published.reason.code, 'permission-denied');
        assert.equal(finalized.value.ready, true);
      }
    }
    const request = await f.request.get(), active = await db.collection('shouts')
      .where('authorId', '==', f.uid).where('status', '==', 'active').get();
    assert(!(request.exists && !active.empty), 'Finalized request and active owned content must not coexist');
  }
});
