import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocFromServer, deleteDoc, collection, query, where, limit, getDocs, Timestamp, serverTimestamp } from 'firebase/firestore';
import { archiveLegalRulesCandidate } from './archive_legal_candidate.mjs';

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

test('independent legal version candidate preserves ownership and immutable acceptance without activating archive reads', async () => {
  const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.equal(archiveLegalRulesCandidate(source, {}), source);
  assert.throws(() => archiveLegalRulesCandidate(source, { archiveDisclosureEnabled: true, version: '2099-02-31' }));
  assert.throws(() => archiveLegalRulesCandidate(source + "\n// '2026-07-25'", { archiveDisclosureEnabled: true, version: '2099-01-01' }));
  for (const prepared of [false, true]) {
    const version = prepared ? '2099-01-01' : '2026-07-25', acceptance = 'acceptance_' + version.replaceAll('-', '_');
    const rules = archiveLegalRulesCandidate(source, prepared ? { archiveDisclosureEnabled: true, version } : {});
    const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: { host: '127.0.0.1', port: 8080, rules } });
    const uid = 'legal-' + randomUUID(), userPath = `users/${uid}`, legalPath = `${userPath}/legal/${acceptance}`;
    try {
      await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), userPath), { nickname: 'Synthetic' }); });
      const client = env.authenticatedContext(uid, { email: 'synthetic@example.cz', email_verified: true }).firestore();
      const other = env.authenticatedContext('other-' + uid, { email: 'other@example.cz', email_verified: true }).firestore();
      const body = { termsVersion: version, privacyVersion: version, communityRulesVersion: version, ageConfirmed: true, acceptedAt: serverTimestamp(), acceptedLanguage: 'cs' };
      await assertFails(getDocFromServer(doc(client, `rateLimits/${uid}/actions/shout`)));
      const missing = { ...body }; delete missing.ageConfirmed;
      for (const bad of [missing, { ...body, ageConfirmed: false }, { ...body, extra: 'role escalation' }, { ...body, privacyVersion: 'invalid' },
        { ...body, acceptedAt: Timestamp.fromMillis(1) }, { ...body, acceptedLanguage: 'xx' }]) await assertFails(setDoc(doc(client, legalPath), bad));
      await assertFails(setDoc(doc(other, legalPath), body));
      await assertSucceeds(setDoc(doc(client, legalPath), body));
      await assertSucceeds(getDocFromServer(doc(client, `rateLimits/${uid}/actions/shout`)));
      await assertFails(setDoc(doc(client, legalPath), { ...body, acceptedLanguage: 'en' }));
      await assertFails(deleteDoc(doc(client, legalPath)));
      await assertFails(getDocFromServer(doc(other, legalPath)));
      await assertFails(setDoc(doc(client, `accountRoles/${uid}`), { level: 6 }));
      await assertFails(getDocFromServer(doc(client, 'archiveIdentityAccounts/private')));
      if (prepared) await assertFails(setDoc(doc(client, `${userPath}/legal/acceptance_2026_07_25`), { ...body, termsVersion: '2026-07-25', privacyVersion: '2026-07-25', communityRulesVersion: '2026-07-25' }));
    } finally {
      await env.withSecurityRulesDisabled(async c => { for (const path of [legalPath, userPath]) await deleteDoc(doc(c.firestore(), path)); });
      await env.cleanup();
    }
  }
});

test('contact bindings and archive access audits deny direct SDK reads, queries and writes for levels 1 through 6', async () => {
  const env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
  const uid = 'identity-rules-' + randomUUID(), roots = [];
  try {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      await env.withSecurityRulesDisabled(async c => {
        await setDoc(doc(c.firestore(), `users/${uid}`), { nickname: 'Synthetic' });
        await setDoc(doc(c.firestore(), `accountRoles/${uid}`), { level });
        await setDoc(doc(c.firestore(), `users/${uid}/legal/acceptance_2026_07_25`), {});
      });
      const client = env.authenticatedContext(uid, { email: 'synthetic@example.cz', email_verified: true }).firestore();
      for (const path of [`archiveIdentityAccounts/${uid}`, `archiveIdentityBindings/${uid}`, `archiveIdentityCurrent/${uid}`, `archiveIdentityAccess/${uid}/accessAudits/request`]) {
        roots.push(path);
        await assertFails(getDocFromServer(doc(client, path)));
        await assertFails(setDoc(doc(client, path), { userId: uid }));
        await assertFails(deleteDoc(doc(client, path)));
      }
      for (const name of ['archiveIdentityAccounts', 'archiveIdentityBindings']) await assertFails(getDocs(query(collection(client, name), limit(50))));
    }
  } finally {
    await env.withSecurityRulesDisabled(async c => {
      for (const path of [...new Set([...roots, `users/${uid}/legal/acceptance_2026_07_25`, `users/${uid}`, `accountRoles/${uid}`])]) await deleteDoc(doc(c.firestore(), path));
    });
    await env.cleanup();
  }
});
