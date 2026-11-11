import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, setDoc, getDocFromServer, getDocsFromServer, updateDoc, deleteDoc } from 'firebase/firestore';

test('existing Rules keep B2 private branches server-only, including account owner and privileged roles', async t => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: { host: '127.0.0.1', port: 8080,
    rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
  const uid = randomUUID(), paths = [`users/${uid}/readState/current`, `users/${uid}/readBuckets/d1_r`], fixturePaths = [...paths, `users/${uid}`];
  t.after(async () => {
    await env.withSecurityRulesDisabled(async context => { for (const path of fixturePaths) await deleteDoc(doc(context.firestore(), path)); });
    await env.cleanup();
  });
  await env.withSecurityRulesDisabled(async context => {
    for (const path of [...paths, `users/${uid}`]) await setDoc(doc(context.firestore(), path), { fixture: true });
  });
  const clients = [env.unauthenticatedContext().firestore()];
  for (const [suffix, role, level] of [['own', 'user', 1], ['outsider', 'business', 2], ['moderator', 'moderator', 3],
    ['senior', 'senior_moderator', 4], ['admin', 'admin', 5], ['owner', 'owner', 6]]) {
    const name = suffix === 'own' ? uid : `${uid}-${suffix}`;
    const records = [[`users/${name}`, { nickname: 'Fixture' }], [`accountRoles/${name}`, { role, level }],
      [`users/${name}/legal/acceptance_2026_07_25`, { accepted: true }]];
    await env.withSecurityRulesDisabled(async context => {
      for (const [path, value] of records) { fixturePaths.push(path); await setDoc(doc(context.firestore(), path), value); }
    });
    clients.push(env.authenticatedContext(name, { email_verified: true, email: 'fixture@example.test' }).firestore());
  }
  for (const db of clients) {
    for (const path of paths) {
      const ref = doc(db, path);
      await assertFails(getDocFromServer(ref)); await assertFails(setDoc(ref, { fixture: false }));
      await assertFails(updateDoc(ref, { fixture: false })); await assertFails(deleteDoc(ref));
    }
    await assertFails(getDocsFromServer(collection(db, `users/${uid}/readBuckets`)));
    await assertFails(getDocsFromServer(collection(db, `users/${uid}/readState`)));
  }
});
