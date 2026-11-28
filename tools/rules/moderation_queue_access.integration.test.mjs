import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocFromServer, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { archiveReleaseConfiguration } from '../archive_dev_release.mjs';
let env;
const paths = ['moderationCases/case', 'moderationCases/case/members/member', 'moderationCaseDecisions/job',
  'moderationQueueControl/current', 'moderationQueueMigrations/migration'];
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const config = JSON.parse(readFileSync(new URL('../../config/dev.json', import.meta.url), 'utf8'));
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: archiveReleaseConfiguration(config, source, 'active').rules,
  } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      await setDoc(doc(c.firestore(), 'users/u' + level), { nickname: 'Synthetic staff' });
      await setDoc(doc(c.firestore(), 'users/u' + level + '/legal/acceptance_2026_11_27'), {});
      await setDoc(doc(c.firestore(), 'accountRoles/u' + level), { level, moderationScope: { countries: ['CZ'] } });
    }
    for (const path of paths) await setDoc(doc(c.firestore(), path), { private: true });
    for (const name of ['reports', 'commentReports', 'privateReplyReports']) await setDoc(doc(c.firestore(), name + '/synthetic'), {
      reporterId: 'u1', shoutId: 'outside', status: 'open', reason: 'Global metadata by Q01',
      moderationGeography: { schemaVersion: 1, countryCode: 'DE' }, createdAt: new Date(),
    });
  });
});
after(async () => { if (env) { await env.clearFirestore(); await env.cleanup(); } });
const client = level => env.authenticatedContext('u' + level, { email: 'fixture@example.test', email_verified: true }).firestore();
test('private projections, membership, controls and journals deny every client role including owner and anonymous', async () => {
  for (const db of [env.unauthenticatedContext().firestore(), ...[1, 2, 3, 4, 5, 6].map(client)]) {
    for (const path of paths) {
      await assertFails(getDocFromServer(doc(db, path)));
      await assertFails(getDocs(collection(db, path.split('/').slice(0, -1).join('/'))));
      await assertFails(setDoc(doc(db, path + '-new'), { private: false }));
      await assertFails(updateDoc(doc(db, path), { private: false }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
});
test('Q01 keeps current global reason metadata, not geographic permission to body/decision', async () => {
  for (const level of [3, 4, 5, 6]) for (const collection of ['reports', 'commentReports', 'privateReplyReports']) {
    const snapshot = await assertSucceeds(getDocFromServer(doc(client(level), collection + '/synthetic')));
    assert.equal(snapshot.get('reason'), 'Global metadata by Q01');
    assert.equal(snapshot.get('text'), undefined);
  }
});
