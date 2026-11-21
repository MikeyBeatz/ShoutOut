import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, setDoc, updateDoc, deleteDoc, getDocFromServer, getDocs, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';

test('small state get/query, own private state and server-only writes across all roles', async t => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
  const id = randomUUID(), generation = `delta-${id}`, root = `feedIndexGenerations/${generation}`, control = 'feedIndexControl/current', paths = [control, root];
  const admin = fn => env.withSecurityRulesDisabled(context => fn(context.firestore()));
  t.after(async () => { await admin(async db => { for (const path of paths.reverse()) await deleteDoc(doc(db, path)); }); await env.cleanup(); });
  const put = (path, value) => admin(db => setDoc(doc(db, path), value));
  await put(control, { schemaVersion: 2, mode: 'active', cardWriteGenerationIds: [generation] });
  await put(root, { schemaVersion: 1, v: 2, accountRetention: true, readIdentity: 1, cardProjection: 1, cardReady: true });
  for (let i = 0; i < 50; i++) { const path = `${root}/publicStates/${i}`; paths.push(path); await put(path, { status: 'active', createdAt: i, revision: 0, likesCount: 1 }); }
  const statePath = `${root}/publicStates/0`;
  for (const [role, level] of [['user', 1], ['business', 2], ['moderator', 3], ['owner', 6]]) {
    const uid = `${id}-${role}`, profile = `users/${uid}`, legal = `${profile}/legal/acceptance_2026_07_25`, rolePath = `accountRoles/${uid}`;
    const parent = `shouts/${id}-${role}`, reaction = `${parent}/reactions/${uid}`, save = `${parent}/saves/${uid}`, comment = `${parent}/comments/comment`;
    paths.push(profile, legal, rolePath, parent, reaction, save, comment, `accountDeletionRequests/${uid}`);
    await put(profile, { nickname: 'Fixture' }); await put(legal, {}); await put(rolePath, { role, level });
    await put(parent, { status: 'active', authorId: uid, likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: 0 });
    await put(reaction, { type: 'like', userId: uid }); await put(save, { userId: uid }); await put(comment, { authorId: uid });
    const db = env.authenticatedContext(uid, { email: 'fixture@example.test', email_verified: true }).firestore();
    await assertSucceeds(getDocFromServer(doc(db, statePath)));
    assert.equal((await getDocs(query(collection(db, `${root}/publicStates`), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(50)))).size, 50);
    await assertSucceeds(getDocFromServer(doc(db, reaction))); await assertSucceeds(getDocFromServer(doc(db, save)));
    for (const path of [statePath, root, control, `${root}/nodes/private`]) {
      await assertFails(setDoc(doc(db, path), { status: 'active' })); await assertFails(deleteDoc(doc(db, path)));
    }
    await assertFails(getDocFromServer(doc(db, root))); await assertFails(getDocFromServer(doc(db, control)));
    await assertFails(getDocs(collection(db, `${root}/publicStates`)));
    await assertFails(getDocs(query(collection(db, `${root}/publicStates`), limit(51))));
    await assertFails(getDocFromServer(doc(db, `${parent}/saves/other`)));
    await assertFails(updateDoc(doc(db, parent), { savesCount: 1 }));
    await assertFails(updateDoc(doc(db, parent), { commentsCount: 1 }));
    await assertFails(deleteDoc(doc(db, comment))); await assertFails(deleteDoc(doc(db, save)));
    await put(`accountDeletionRequests/${uid}`, { status: 'pending' });
    await assertFails(getDocFromServer(doc(db, statePath)));
  }
  await assertFails(getDocFromServer(doc(env.unauthenticatedContext().firestore(), statePath)));
  await put(control, { schemaVersion: 2, mode: 'active', cardWriteGenerationIds: [] });
  const uid = `${id}-user`; await admin(db => deleteDoc(doc(db, `accountDeletionRequests/${uid}`)));
  const client = env.authenticatedContext(uid, { email: 'fixture@example.test', email_verified: true }).firestore();
  await assertFails(getDocFromServer(doc(client, statePath)));
});

test('real Web SDK listener sees only small state, reconnect and role revocation', async t => {
  const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: { host: '127.0.0.1', port: 8080,
    rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
  const id = randomUUID(), root = `feedIndexGenerations/listen-${id}`, state = `${root}/publicStates/one`, control = 'feedIndexControl/current', uid = id;
  const paths = [state, root, control, `users/${uid}/legal/acceptance_2026_07_25`, `users/${uid}`, `accountDeletionRequests/${uid}`];
  const admin = fn => env.withSecurityRulesDisabled(context => fn(context.firestore()));
  t.after(async () => { await admin(async db => { for (const path of paths) await deleteDoc(doc(db, path)); }); await env.cleanup(); });
  await admin(async db => {
    await setDoc(doc(db, paths[3]), {}); await setDoc(doc(db, paths[4]), { nickname: 'Fixture' });
    await setDoc(doc(db, control), { schemaVersion: 2, mode: 'active', cardWriteGenerationIds: [`listen-${id}`] });
    await setDoc(doc(db, root), { schemaVersion: 1, v: 2, accountRetention: true, readIdentity: 1, cardProjection: 1, cardReady: true });
    await setDoc(doc(db, state), { schemaVersion: 1, revision: 0, likesCount: 1 });
  });
  const db = env.authenticatedContext(uid, { email: 'fixture@example.test', email_verified: true }).firestore();
  let stop;
  const initial = new Promise((resolve, reject) => { stop = onSnapshot(doc(db, state), { includeMetadataChanges: true }, snapshot => { if (!snapshot.metadata.fromCache) resolve(snapshot.data()); }, reject); });
  assert.equal((await initial).likesCount, 1); stop();
  const updated = new Promise((resolve, reject) => { stop = onSnapshot(doc(db, state), { includeMetadataChanges: true }, snapshot => { if (!snapshot.metadata.fromCache && snapshot.data()?.revision === 1) resolve(snapshot.data()); }, reject); });
  await admin(db => updateDoc(doc(db, state), { revision: 1, likesCount: 2 }));
  assert.deepEqual(await updated, { schemaVersion: 1, revision: 1, likesCount: 2 }); stop();
  await admin(db => setDoc(doc(db, paths[5]), { status: 'pending' }));
  await assertFails(getDocFromServer(doc(db, state)));
});
