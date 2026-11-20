import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocFromServer, deleteDoc, runTransaction } from 'firebase/firestore';

test('unchanged Rules deny direct runtime control, index and erasure-proof access to every client role', async t => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
  const id = randomUUID(), paths = [`feedIndexGenerations/access-${id}`, `feedIndexGenerations/access-${id}/nodes/hash`,
    'feedIndexControl/current', 'feedIndexMaintenance/erasureQueue', `feedIndexMaintenance/erasureQueue/jobs/${id}`,
    `feedIndexMaintenance/erasureQueue/jobs/${id}/targets/generation`,
    `feedIndexMaintenance/transitions/jobs/${id}`], fixtures = [...paths];
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

test('interaction fallback atomically reads parent and own state under closed write Rules, without mutations', async t => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
  const id = randomUUID(), paths = ['feedIndexControl/current'];
  t.after(async () => {
    await env.withSecurityRulesDisabled(async context => {
      for (const path of paths) await deleteDoc(doc(context.firestore(), path));
    });
    await env.cleanup();
  });
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), paths[0]), { mode: 'active' }));
  for (const role of ['user', 'business']) {
    const uid = `${id}-${role}`, root = `shouts/${id}-${role}`;
    const profile = `users/${uid}`, legal = `${profile}/legal/acceptance_2026_07_25`, request = `accountDeletionRequests/${uid}`;
    const rolePath = `accountRoles/${uid}`;
    const reaction = `${root}/reactions/${uid}`, save = `${root}/saves/${uid}`;
    paths.push(root, reaction, save, profile, legal, request, rolePath);
    await env.withSecurityRulesDisabled(async context => {
      const admin = context.firestore();
      await setDoc(doc(admin, profile), { nickname: 'Fixture' });
      await setDoc(doc(admin, rolePath), { role, level: role === 'business' ? 2 : 1 });
      await setDoc(doc(admin, legal), {});
      await setDoc(doc(admin, root), { authorId: 'other', status: 'active', likesCount: 7, savesCount: 5 });
      await setDoc(doc(admin, reaction), { userId: uid, type: 'like' });
      await setDoc(doc(admin, save), { userId: uid });
    });
    const client = env.authenticatedContext(uid, { email: 'fixture@example.test', email_verified: true }).firestore();
    const read = (path, db = client) => runTransaction(db, async tx => {
      const parent = await tx.get(doc(db, root));
      const own = await tx.get(doc(db, path));
      return [parent.data(), own.exists() ? own.data() : null];
    }, { maxAttempts: 1 });
    assert.equal((await read(reaction))[1].type, 'like');
    assert.equal((await read(save))[0].savesCount, 5);
    await assertFails(setDoc(doc(client, reaction), { userId: uid, type: 'dislike' }));
    await assertFails(deleteDoc(doc(client, root)));
    await assertFails(read(`${root}/reactions/another-user`));
    await assertFails(read(reaction, env.unauthenticatedContext().firestore()));
    // Absence is also an authoritative result, not a failed or partial read.
    await env.withSecurityRulesDisabled(async context => {
      await deleteDoc(doc(context.firestore(), reaction));
      await deleteDoc(doc(context.firestore(), save));
    });
    assert.equal((await read(reaction))[1], null);
    assert.equal((await read(save))[1], null);
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), request), { userId: uid, status: 'pending' }));
    await assertFails(read(reaction));
    await env.withSecurityRulesDisabled(async context => {
      assert.deepEqual((await getDocFromServer(doc(context.firestore(), root))).data(), {
        authorId: 'other', status: 'active', likesCount: 7, savesCount: 5,
      });
    });
  }
});
