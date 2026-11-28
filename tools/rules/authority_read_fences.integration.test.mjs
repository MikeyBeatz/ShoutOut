import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDocFromServer, setDoc, updateDoc, deleteDoc, deleteField, collection, query, limit, getDocs,
  writeBatch, Timestamp, serverTimestamp } from 'firebase/firestore';
import { archiveReleaseConfiguration } from '../archive_dev_release.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
let env;
const foreign = ['bans/target', 'contentRestrictions/target', 'accountDeletionRequests/target',
  'businessApplications/target', 'businessProfiles/target'];
const actor = (uid = 'staff', verified = true) => env.authenticatedContext(uid,
  { email: `${uid}@example.test`, email_verified: verified }).firestore();
before(async () => {
  const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const config = JSON.parse(readFileSync(new URL('../../config/dev.json', import.meta.url), 'utf8'));
  const { rules } = archiveReleaseConfiguration(config, source, 'active');
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: { host: '127.0.0.1', port: 8080, rules } });
});
beforeEach(() => env.clearFirestore());
after(async () => { if (env) { await env.clearFirestore(); await env.cleanup(); } });
const seed = rows => env.withSecurityRulesDisabled(async c => {
  for (const [path, data] of rows) await setDoc(doc(c.firestore(), path), data);
});
async function staff(level = 5, legacy = false) {
  await seed([...foreign.map(path => [path, { privateFixture: 'retained' }]),
    ['users/staff', { nickname: 'Staff' }], ['users/staff/legal/acceptance_2026_11_27', {}],
    [legacy ? 'moderators/staff' : 'accountRoles/staff', legacy ? {} : { level }]]);
}
async function denied(db) { for (const path of foreign) await assertFails(getDocFromServer(doc(db, path))); }

test('eligible staff keep their existing foreign get rights; no roles or regional policy added', async () => {
  for (const level of [3, 4, 5, 6]) {
    await staff(level); for (const path of foreign) await assertSucceeds(getDocFromServer(doc(actor(), path)));
  }
  await env.clearFirestore(); await staff(3, true);
  for (const path of foreign) await assertSucceeds(getDocFromServer(doc(actor(), path)));
});

for (const state of ['temporary-ban', 'permanent-ban', 'malformed-ban', 'pending', 'missing-profile',
  'missing-legal', 'old-legal', 'retired-role', 'no-role', 'unverified']) {
  test(`foreign privileged gets reject ${state}`, async () => {
    await staff();
    if (state.endsWith('ban')) await seed([['bans/staff', { expiresAt: state === 'temporary-ban'
      ? Timestamp.fromMillis(Date.now() + 86400000) : state === 'permanent-ban' ? null : 'invalid' }]]);
    if (state === 'pending') await seed([['accountDeletionRequests/staff', { userId: 'staff', status: 'pending' }]]);
    if (state === 'retired-role') await seed([['accountRoles/staff', { level: 5, accountStatus: 'deleted' }]]);
    const remove = state === 'missing-profile' ? 'users/staff' : ['missing-legal', 'old-legal'].includes(state)
      ? 'users/staff/legal/acceptance_2026_11_27' : state === 'no-role' ? 'accountRoles/staff' : null;
    if (remove) await env.withSecurityRulesDisabled(c => deleteDoc(doc(c.firestore(), remove)));
    if (state === 'old-legal') await seed([['users/staff/legal/acceptance_2026_07_25', {}]]);
    await denied(actor('staff', state !== 'unverified'));
  });
}

test('expired ban restores existing rights, while own status reads survive a current ban and missing legal/profile', async () => {
  await staff(); await seed([['bans/staff', { expiresAt: Timestamp.fromMillis(0) }]]);
  for (const path of foreign) await assertSucceeds(getDocFromServer(doc(actor(), path)));
  await seed([['bans/staff', { expiresAt: null }], ...foreign.filter(p => !p.startsWith('bans/'))
    .map(p => [p.replace('/target', '/staff'), { ownFixture: true }])]);
  await env.withSecurityRulesDisabled(async c => {
    await deleteDoc(doc(c.firestore(), 'users/staff/legal/acceptance_2026_11_27'));
    await deleteDoc(doc(c.firestore(), 'users/staff'));
  });
  for (const path of foreign) await assertSucceeds(getDocFromServer(doc(actor(), path.replace('/target', '/staff'))));
});

test('anonymous listing, role self-grants and foreign Business edits remain denied', async () => {
  await staff();
  await assertFails(getDocs(query(collection(env.unauthenticatedContext().firestore(), 'businessApplications'), limit(50))));
  await assertFails(updateDoc(doc(actor('ordinary'), 'accountRoles/ordinary'), { level: 6 }));
  await assertFails(setDoc(doc(actor('ordinary'), 'accountRoles/ordinary'), { level: 6 }));
  await assertFails(updateDoc(doc(actor(), 'businessProfiles/target'), { billingEmail: 'changed@example.test' }));
});

async function notices() {
  const old = Timestamp.fromMillis(Date.now() - 7200000);
  await seed([['users/writer', { nickname: 'writer' }], ['users/writer/legal/acceptance_2026_11_27', {}],
    ['users/recipient', { nickname: 'recipient' }], ['users/recipient/legal/acceptance_2026_11_27', {}],
    ['feedIndexControl/current', { schemaVersion: 2, revision: 1, mode: 'active', readGenerationId: 'feed-v3',
      writeGenerationIds: ['feed-v3'], cardReadGenerationId: 'feed-v3', cardWriteGenerationIds: ['feed-v3'] }],
    ['shouts/audit', { authorId: 'recipient', title: 'Audit', status: 'expired', expiresAt: Timestamp.fromMillis(0), historyUntil: old, likesCount: 1 }],
    ['shouts/audit/reactions/writer', { userId: 'writer', type: 'like', updatedAt: old }],
    ['rateLimits/writer/actions/interaction', { lastAt: old, windowStartedAt: old, lastEventId: 'old', count: 1 }]]);
  return { kind: 'reaction', actorId: 'writer', actorNickname: 'writer', targetShoutId: 'audit', targetTitle: 'Audit',
    reactionType: 'like', eventCount: 1, createdAt: serverTimestamp(), readAt: null };
}
test('managed mode denies raw event creation/replay for ordinary and pending recipients', async () => {
  const notice = await notices(), db = actor('writer');
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'users/recipient/notifications/reaction_like_audit'), notice));
  await assertFails(setDoc(doc(actor('writer', false), 'users/recipient/notifications/reaction_like_audit'), notice));
  const attempt = () => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'rateLimits/writer/actions/interaction'), { lastAt: serverTimestamp(), windowStartedAt: serverTimestamp(), lastEventId: 'shoutReaction_audit', count: 1 });
    batch.set(doc(db, 'users/recipient/notifications/reaction_like_audit'), notice); return batch.commit();
  };
  await assertFails(attempt());
  for (const data of [{ ...notice, actorId: 'recipient' }, { readAt: serverTimestamp() }]) {
    await assertFails(setDoc(doc(db, 'users/recipient/notifications/reaction_like_audit'), data));
  }
  await seed([['accountDeletionRequests/recipient', { userId: 'recipient', status: 'pending' }]]);
  await assertFails(attempt());
});

test('server notifications remain readable and only their eligible recipient marks readAt', async () => {
  const notice = await notices(), path = 'users/recipient/notifications/reaction_like_audit';
  await seed([[path, { ...notice, createdAt: Timestamp.now() }]]);
  const own = doc(actor('recipient'), path);
  await assertSucceeds(getDocFromServer(own)); await assertSucceeds(updateDoc(own, { readAt: serverTimestamp() }));
  for (const changes of [{ eventCount: 2 }, { actorId: 'recipient' }, { createdAt: serverTimestamp() },
    { readAt: 'wrong-type' }, { kind: deleteField() }, { actorNickname: 'x'.repeat(100000) },
    { readAt: serverTimestamp(), text: 'x'.repeat(100000) }]) {
    await assertFails(updateDoc(own, changes));
  }
  await assertFails(updateDoc(doc(actor('writer'), path), { readAt: serverTimestamp() }));
  await assertFails(setDoc(doc(actor('writer'), path), { ...notice, eventCount: 2 }));
  await assertFails(deleteDoc(own));
});
