import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocFromServer, deleteDoc, collection, query, where, limit, getDocs, Timestamp } from 'firebase/firestore';

test('inactive lifecycle preserves reads; the candidate gate denies every expired source and all direct archive access', async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const needle = 'return false; // content-lifecycle-gate: local preparation only';
  assert(source.includes(needle));
  for (const active of [false, true]) {
    const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
      host: '127.0.0.1', port: 8080, rules: active ? source.replace(needle, 'return true; // local candidate') : source,
    } });
    const nonce = randomUUID(), uid = `life-${nonce}`, root = `shouts/${nonce}`, paths = [];
    const add = async (path, data) => {
      paths.push(path); await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), path), data));
    };
    try {
      await add(`users/${uid}`, { nickname: 'Synthetic rules actor' });
      await add(`users/${uid}/legal/acceptance_2026_07_25`, {});
      await add(`accountRoles/${uid}`, { level: 6, role: 'owner' });
      await add(root, { authorId: uid, status: 'deleted', text: 'Synthetic retained source', historyUntil: Timestamp.fromMillis(Date.now() + 3600000) });
      await add(`${root}/comments/comment`, { authorId: uid, text: 'Synthetic comment' });
      await add(`${root}/privateReplies/private`, { authorId: 'foreign', recipientId: uid, text: 'Synthetic private reply' });
      const client = env.authenticatedContext(uid, { email: 'synthetic@example.test', email_verified: true }).firestore();
      const reads = [root, `${root}/comments/comment`, `${root}/privateReplies/private`];
      if (!active) assert.equal((await getDocFromServer(doc(client, `shouts/missing-${nonce}`))).exists(), false);
      for (const path of reads) await assertSucceeds(getDocFromServer(doc(client, path)));
      await assertSucceeds(getDocs(query(collection(client, `${root}/comments`), limit(50))));
      await assertSucceeds(getDocs(query(collection(client, `${root}/privateReplies`), where('recipientId', '==', uid), limit(50))));
      if (active) {
        await assertFails(getDocs(query(collection(client, 'shouts'), where('authorId', '==', uid), limit(50))));
        await assertFails(getDocs(query(collection(client, 'shouts'), where('authorId', '==', uid), where('historyUntil', '>', Timestamp.fromMillis(Date.now() + 60000)), limit(50))));
        await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), root), { authorId: 'foreign', status: 'deleted', historyUntil: Timestamp.fromMillis(Date.now() + 3600000) }));
        await assertFails(getDocFromServer(doc(client, root)));
        await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), root), { authorId: 'foreign', status: 'active', historyUntil: Timestamp.fromMillis(Date.now() + 3600000) }));
        await assertSucceeds(getDocFromServer(doc(client, root)));
      }
      await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), root), { authorId: uid, historyUntil: Timestamp.fromMillis(1) }));
      for (const path of reads) {
        const operation = getDocFromServer(doc(client, path));
        if (active) await assertFails(operation).catch(error => { throw new Error(`Expired source was readable: ${path}`, { cause: error }); });
        else await assertSucceeds(operation);
      }
      const comments = getDocs(query(collection(client, `${root}/comments`), limit(50)));
      if (active) await assertFails(comments); else await assertSucceeds(comments);
      for (const archive of [`contentLifecycleArchive/${nonce}`, `contentLifecycleThreads/${nonce}`,
        'contentLifecycleControl/current', `contentLifecycleJobs/${nonce}`, `contentLifecycleArchive/${nonce}/accessAudits/audit`]) {
        await assertFails(getDocFromServer(doc(client, archive)));
        await assertFails(setDoc(doc(client, archive), { forbidden: true }));
      }
    } finally {
      await env.withSecurityRulesDisabled(async c => { for (const path of paths.reverse()) await deleteDoc(doc(c.firestore(), path)); });
      await env.cleanup();
    }
  }
});
