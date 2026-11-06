import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocFromServer, deleteDoc } from 'firebase/firestore';

test('unchanged Rules deny direct runtime control, index and erasure-proof access to every client role', async t => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
  const id = randomUUID(), paths = [`feedIndexGenerations/access-${id}`, `feedIndexGenerations/access-${id}/nodes/hash`,
    'feedIndexControl/current', 'feedIndexMaintenance/erasureQueue', `feedIndexMaintenance/erasureQueue/jobs/${id}`,
    `feedIndexMaintenance/erasureQueue/jobs/${id}/targets/generation`], fixtures = [...paths];
  t.after(async () => {
    await env.withSecurityRulesDisabled(async context => {
      for (const path of fixtures) await deleteDoc(doc(context.firestore(), path));
    });
    await env.cleanup();
  });
  await env.withSecurityRulesDisabled(async context => {
    for (const path of paths) {
      assert.equal((await getDocFromServer(doc(context.firestore(), path))).exists(), false);
      await setDoc(doc(context.firestore(), path), { privateFixture: true });
    }
  });
  const clients = [env.unauthenticatedContext().firestore()];
  for (const [role, level] of [['user', 1], ['business', 2], ['moderator', 3], ['owner', 6]]) {
    const uid = `${id}-${role}`; fixtures.push(`accountRoles/${uid}`, `users/${uid}`);
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), `accountRoles/${uid}`), { role, level });
      await setDoc(doc(context.firestore(), `users/${uid}`), { nickname: 'Fixture' });
    });
    clients.push(env.authenticatedContext(uid, { email: 'fixture@example.test', email_verified: true }).firestore());
  }
  for (const client of clients) for (const path of paths) {
    const ref = doc(client, path);
    await assertFails(getDocFromServer(ref)); await assertFails(setDoc(ref, { privateFixture: false })); await assertFails(deleteDoc(ref));
  }
});
