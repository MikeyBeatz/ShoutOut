import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, setDoc, deleteDoc, updateDoc, getDocFromServer, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';

test('regional signal get only: blank cells, all roles, malformed data, private control and revoked listener', { timeout: 60000 }, async t => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
  const uid = randomUUID(), generation = `news-${uid}`, root = `feedIndexGenerations/${generation}`;
  const paths = ['feedIndexControl/current', 'feedNewsControl/current', root,
    `${root}/publicationHeads/u2fk`, `users/${uid}`, `users/${uid}/legal/acceptance_2026_07_25`,
    `accountDeletionRequests/${uid}`, `bans/${uid}`, `accountRoles/${uid}`];
  const admin = fn => env.withSecurityRulesDisabled(context => fn(context.firestore()));
  let stop;
  t.after(async () => { stop?.(); await admin(async db => { for (const path of paths) await deleteDoc(doc(db, path)); }); await env.cleanup(); });
  const put = (path, data) => admin(db => setDoc(doc(db, path), data));
  await put(paths[0], { schemaVersion: 2, mode: 'active', cardReadGenerationId: generation, cardWriteGenerationIds: [generation] });
  await put(paths[1], { v: 1, revision: 1, mode: 'active', generation, incarnation: [1, 2] });
  await put(root, { schemaVersion: 1, v: 2, accountRetention: true, readIdentity: 1, cardProjection: 1, cardReady: true, newsIncarnation: [1, 2] });
  await put(paths[4], { nickname: 'fixture' }); await put(paths[5], {});
  await put(paths[3], { v: 1, token: randomUUID() });
  const db = env.authenticatedContext(uid, { email: 'fixture@example.test', email_verified: true }).firestore();
  const head = doc(db, paths[3]), empty = doc(db, `${root}/publicationHeads/u2fm`);
  const controlHead = `${root}/publicationHeads/_control`; paths.push(controlHead);
  await put(controlHead, { v: 1, token: randomUUID() });
  for (const [role, level] of [['user', 1], ['business', 2], ['moderator', 3], ['owner', 6]]) {
    await put(paths[8], { role, level }); await assertSucceeds(getDocFromServer(head));
    assert.equal((await assertSucceeds(getDocFromServer(empty))).exists(), false);
    await assertFails(setDoc(head, { v: 1, token: randomUUID() }));
    await assertFails(getDocs(collection(db, `${root}/publicationHeads`)));
    await assertFails(getDocFromServer(doc(db, paths[1])));
    await assertFails(getDocFromServer(doc(db, `${root}/nodes/secret`)));
  }
  t.diagnostic('news-rules: role and list fences verified');
  await assertFails(getDocFromServer(doc(env.unauthenticatedContext().firestore(), paths[3])));
  await assertFails(getDocFromServer(doc(env.authenticatedContext(uid, { email: 'fixture@example.test', email_verified: false }).firestore(), paths[3])));
  await put(paths[3], { v: 1, token: randomUUID(), authorId: 'must-not-leak' });
  await assertFails(getDocFromServer(head)); await put(paths[3], { v: 1, token: randomUUID() });
  await admin(db => updateDoc(doc(db, paths[1]), { mode: 'paused' })); await assertFails(getDocFromServer(head));
  await admin(db => updateDoc(doc(db, paths[1]), { mode: 'active', incarnation: [3, 4] })); await assertFails(getDocFromServer(head));
  await admin(db => updateDoc(doc(db, paths[1]), { incarnation: [1, 2] }));
  await admin(db => updateDoc(doc(db, paths[0]), { mode: 'paused' })); await assertFails(getDocFromServer(head));
  await admin(db => updateDoc(doc(db, paths[0]), { mode: 'active' }));
  await put(paths[7], {}); await assertFails(getDocFromServer(head)); await admin(db => deleteDoc(doc(db, paths[7])));
  t.diagnostic('news-rules: identity, shape, pause, incarnation and ban verified');
  let controlReady;
  const controlSubscribed = new Promise(resolve => { controlReady = resolve; });
  const controlDenied = new Promise((resolve, reject) => {
    stop = onSnapshot(doc(db, controlHead), { includeMetadataChanges: true }, snapshot => {
      if (!snapshot.metadata.fromCache) controlReady();
    }, error => error.code === 'permission-denied' ? resolve(true) : reject(error));
  });
  await controlSubscribed;
  await admin(async db => {
    const batch = writeBatch(db); batch.update(doc(db, paths[1]), { mode: 'paused', revision: 2 });
    batch.set(doc(db, controlHead), { v: 1, token: randomUUID() }); await batch.commit();
  });
  assert.equal(await controlDenied, true); stop();
  await admin(async db => {
    const batch = writeBatch(db); batch.update(doc(db, paths[1]), { mode: 'active', revision: 3 });
    batch.set(doc(db, controlHead), { v: 1, token: randomUUID() }); await batch.commit();
  });
  t.diagnostic('news-rules: atomic control-only pause revoked an open technical signal listener');
  const denied = new Promise((resolve, reject) => {
    stop = onSnapshot(head, { includeMetadataChanges: true }, snapshot => { if (!snapshot.metadata.fromCache) resolve('ready'); }, reject);
  });
  await denied; stop();
  t.diagnostic('news-rules: first server snapshot received');
  let ready;
  const subscribed = new Promise(resolve => { ready = resolve; });
  const revoked = new Promise((resolve, reject) => {
    stop = onSnapshot(head, { includeMetadataChanges: true }, snapshot => { if (!snapshot.metadata.fromCache) ready(); },
      error => error.code === 'permission-denied' ? resolve(true) : reject(error));
  });
  await subscribed;
  t.diagnostic('news-rules: revocation listener subscribed');
  await put(paths[6], {}); await put(paths[3], { v: 1, token: randomUUID() });
  assert.equal(await revoked, true); stop();
  await assertFails(getDocFromServer(empty));
});
