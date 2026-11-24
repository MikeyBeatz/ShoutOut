import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, where, query, limit, orderBy } from 'firebase/firestore';
import { moderationAuthorityCandidate } from './moderation_authority_candidate.mjs';
import { legacyModerationRules } from './business_authority_candidate.mjs';
import { sanctionContentOperation, revokeSanctionOperation, managedModerationAuthorityEnabled } from '../../functions/moderation_sanctions.js';
import { decideContentReportsOperation } from '../../functions/decide_content_reports.js';
import { removeReportedPublicContentOperation } from '../../functions/remove_reported_public_content.js';
import { removeReportedPrivateReplyOperation } from '../../functions/remove_reported_private_reply.js';
import { deleteShoutOperation } from '../../functions/delete_shout.js';
import { deleteCommentOperation } from '../../functions/delete_comment.js';
import { operationTestKey } from '../../functions/test_helpers.js';
const sdk = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = sdk('firebase-admin/app'), { getFirestore } = sdk('firebase-admin/firestore');
const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const token = { email: 'fixture@example.test', email_verified: true }, roles = { author: 1, reporter: 1, other: 1, business: 2, mod: 3, senior: 4, admin: 5, owner: 6 };
let env, baseline, app, db;
const client = (uid, environment = env) => environment.authenticatedContext(uid, token).firestore();
const future = days => new Date(Date.now() + days * 86400000);
async function seed(environment) {
  await environment.withSecurityRulesDisabled(async c => {
    const f = c.firestore();
    for (const [uid, level] of Object.entries({ ...roles, legacy: 3 })) {
      await setDoc(doc(f, `users/${uid}`), { nickname: uid });
      await setDoc(doc(f, `users/${uid}/legal/acceptance_2026_07_25`), {});
      await setDoc(doc(f, `${uid === 'legacy' ? 'moderators' : 'accountRoles'}/${uid}`), { level, moderationScope: { global: true, countries: [], subdivisions: [] } });
    }
    await setDoc(doc(f, 'feedIndexControl/current'), { schemaVersion: 1, revision: 1, mode: 'active', readGenerationId: 'feed-test', writeGenerationIds: ['feed-test'] });
    await setDoc(doc(f, 'shouts/parent'), { authorId: 'author', title: 'Synthetic authority', text: 'Public body', status: 'active', createdAt: new Date(), expiresAt: future(1),
      likesCount: 1, dislikesCount: 0, savesCount: 0, commentsCount: 1, geography: { schemaVersion: 1, countryCode: 'CZ' } });
    await setDoc(doc(f, 'shouts/parent/comments/child'), { authorId: 'author', text: 'Public child', createdAt: new Date() });
    await setDoc(doc(f, 'shouts/parent/privateReplies/private'), { authorId: 'author', recipientId: 'reporter', participants: ['author', 'reporter'], text: 'Private child', createdAt: new Date() });
    for (const [cname, child] of [['reports', null], ['commentReports', 'child'], ['privateReplyReports', 'private']]) {
      await setDoc(doc(f, `${cname}/reporter_parent${child ? `_${child}` : ''}`), { reporterId: 'reporter', shoutId: 'parent', status: 'open', reason: 'Synthetic report', createdAt: new Date(),
        ...(cname === 'commentReports' ? { commentId: child } : cname === 'privateReplyReports' ? { privateReplyId: child, authorId: 'author', text: 'Private child' } : {}) });
    }
  });
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  baseline = await initializeTestEnvironment({ projectId: 'shoutout-rules-test-before', firestore: { host: '127.0.0.1', port: 8080, rules: legacyModerationRules(source) } });
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: { host: '127.0.0.1', port: 8080, rules: moderationAuthorityCandidate(source) } });
  app = initializeApp({ projectId: 'shoutout-rules-test' }, 'moderation-authority-rules'); db = getFirestore(app);
});
beforeEach(async () => { await env.clearFirestore(); await seed(env); });
after(async () => { if (db) await db.terminate(); if (app) await deleteApp(app); if (env) await env.cleanup(); if (baseline) await baseline.cleanup(); });

function warningBatch(f, uid, key = 'warning', type = 'warning') {
  const batch = writeBatch(f);
  const expiresAt = type === 'warning' ? null : future(1);
  batch.set(doc(f, `sanctions/${key}`), { userId: 'author', type, reason: 'Synthetic observation', createdAt: serverTimestamp(), expiresAt,
    permanent: false, moderatorId: uid, status: 'active', sourceReportId: '', previousSanctionsCount: 0, purgeAt: future(type === 'warning' ? 180 : type === 'accountBan' ? 731 : 366),
    sourceType: 'moderatorObservation', sourceContentType: 'shout', sourceContentId: 'parent', contentSnapshot: { shoutId: 'parent', text: 'Public body' } });
  batch.set(doc(f, type === 'warning' ? `warnings/${key}` : `${type === 'accountBan' ? 'bans' : 'contentRestrictions'}/author`), {
    userId: 'author', reason: 'Synthetic observation', createdAt: serverTimestamp(), moderatorId: uid, sanctionId: key, ...(type === 'warning' ? {} : { expiresAt }) });
  return batch;
}
function approvalBatch(f, uid) {
  const batch = writeBatch(f);
  batch.set(doc(f, 'moderationClearances/shout_parent'), { targetType: 'shout', shoutId: 'parent', contentId: 'parent', moderatorId: uid,
    createdAt: serverTimestamp(), reason: 'Synthetic checked approval', sourceReportIds: ['reporter_parent'] });
  batch.update(doc(f, 'reports/reporter_parent'), { status: 'resolved', resolution: 'contentApproved', resolvedAt: serverTimestamp() });
  return batch;
}
async function seedRevocation(environment) {
  const purgeAt = future(10);
  await environment.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'sanctions/temporary'), { userId: 'author', type: 'accountBan', permanent: false, moderatorId: 'mod', purgeAt });
    await setDoc(doc(c.firestore(), 'bans/author'), { userId: 'author', moderatorId: 'mod', reason: 'Temporary ban', createdAt: new Date(), expiresAt: future(1), sanctionId: 'temporary' });
  });
  return purgeAt;
}
function revocationBatch(f, uid, purgeAt) {
  const batch = writeBatch(f);
  batch.set(doc(f, 'sanctionRevocations/temporary'), { userId: 'author', sanctionId: 'temporary', originalType: 'accountBan', reason: 'Synthetic correction',
    createdAt: serverTimestamp(), revokedBy: uid, purgeAt });
  batch.delete(doc(f, 'bans/author')); return batch;
}
const request = (uid, data, label) => ({ auth: { uid, token }, app: { appId: 'test' }, data: { expectedUserId: uid, idempotencyKey: operationTestKey(label, new Date()), ...data } });

test('static prototype is off, compiles in both modes, is idempotent and rejects source drift', async () => {
  assert.equal(managedModerationAuthorityEnabled, true); assert(source.includes('return true; // moderation-authority-gate'));
  assert.equal(moderationAuthorityCandidate(moderationAuthorityCandidate(source)), moderationAuthorityCandidate(source));
  assert.throws(() => moderationAuthorityCandidate('unrelated'), /source-drift/); assert.throws(() => moderationAuthorityCandidate(source + source), /source-drift/);
  await baseline.clearFirestore(); await seed(baseline);
  for (const type of ['warning', 'accountBan', 'contentRestriction']) await assertSucceeds(warningBatch(client('mod', baseline), 'mod', `baseline-${type}`, type).commit());
  await assertSucceeds(approvalBatch(client('mod', baseline), 'mod').commit());
  await assertSucceeds(updateDoc(doc(client('mod', baseline), 'commentReports/reporter_parent_child'), { status: 'resolved', resolution: 'noAction', resolvedAt: serverTimestamp() }));
  const purgeAt = await seedRevocation(baseline); await assertSucceeds(revocationBatch(client('mod', baseline), 'mod', purgeAt).commit());
  assert.equal(readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), source);
});
test('enabled gate denies direct sanction batches and every protected write for roles 1-6, legacy and anonymous', async () => {
  for (const uid of [...Object.keys(roles), 'legacy', null]) {
    const f = uid ? client(uid) : env.unauthenticatedContext().firestore();
    for (const type of ['warning', 'accountBan', 'contentRestriction']) await assertFails(warningBatch(f, uid ?? 'anonymous', `${type}-${uid}`, type).commit());
    for (const path of ['sanctions/forged', 'warnings/forged', 'sanctionRevocations/forged', 'bans/author', 'contentRestrictions/author', 'moderationClearances/shout_parent']) {
      await assertFails(setDoc(doc(f, path), { userId: 'author', reason: 'forged', moderatorId: uid }));
      await assertFails(updateDoc(doc(f, path), { reason: 'x'.repeat(10000), userId: uid, createdAt: serverTimestamp() }));
      await assertFails(deleteDoc(doc(f, path)));
      await assertFails(setDoc(doc(f, `${path}/nested/child`), { level: 6 }));
    }
  }
  assert.equal((await db.collection('sanctions').get()).size, 0); assert.equal((await db.collection('warnings').get()).size, 0);
});
test('report resolve/escalate/approve and forged audits cannot bypass the gate, even in a mixed batch', async () => {
  for (const uid of ['mod', 'senior', 'admin', 'owner', 'legacy']) {
    const f = client(uid);
    await assertFails(approvalBatch(f, uid).commit());
    for (const path of ['reports/reporter_parent', 'commentReports/reporter_parent_child', 'privateReplyReports/reporter_parent_private']) {
      for (const change of [{ status: 'resolved', resolution: 'noAction', resolvedAt: serverTimestamp() },
        { status: 'escalated', assignedRole: 'seniorModerator', escalatedBy: uid, escalatedAt: serverTimestamp() },
        { status: 'resolved', resolution: 'sanctioned', resolvedBy: uid, decisionOperationId: 'forged', resolvedAt: serverTimestamp() },
        { reporterId: uid, reason: 42, text: 'x'.repeat(10000) }]) await assertFails(updateDoc(doc(f, path), change));
      const batch = warningBatch(f, uid, `mixed-${uid}`);
      batch.update(doc(f, path), { status: 'resolved', resolution: 'sanctioned', resolvedAt: serverTimestamp() });
      await assertFails(batch.commit());
    }
  }
  for (const c of ['reports', 'commentReports', 'privateReplyReports']) assert.equal((await db.collection(c).get()).docs[0].get('status'), 'open');
});
test('valid legacy revocation batches cannot delete an active binding through the enabled gate', async () => {
  const purgeAt = await seedRevocation(env);
  for (const uid of ['mod', 'senior', 'admin', 'owner']) await assertFails(revocationBatch(client(uid), uid, purgeAt).commit());
  assert((await db.doc('bans/author').get()).exists); assert.equal((await db.doc('sanctionRevocations/temporary').get()).exists, false);
});
test('removing or pausing feed control cannot restore moderation authority', async () => {
  for (const mode of ['active', 'building', 'paused', 'off', null]) {
    if (mode) await db.doc('feedIndexControl/current').set({ mode }); else await db.doc('feedIndexControl/current').delete();
    await assertFails(warningBatch(client('owner'), 'owner', `mode-${mode}`).commit());
    await assertFails(updateDoc(doc(client('owner'), 'reports/reporter_parent'), { status: 'resolved', resolution: 'noAction', resolvedAt: serverTimestamp() }));
  }
});
test('own warnings and staff history/queues stay queryable while unrelated and anonymous users cannot read them', async () => {
  await db.doc('warnings/sample').set({ userId: 'author', reason: 'Own warning', createdAt: new Date() });
  await db.doc('sanctions/sample').set({ userId: 'author', moderatorId: 'mod', createdAt: new Date() });
  await db.doc('bans/author').set({ userId: 'author', expiresAt: future(1) });
  await assertSucceeds(getDoc(doc(client('author'), 'bans/author')));
  await assertSucceeds(getDocs(query(collection(client('author'), 'warnings'), where('userId', '==', 'author'), limit(50))));
  await assertSucceeds(getDocs(query(collection(client('mod'), 'sanctions'), orderBy('createdAt', 'desc'), limit(50))));
  for (const c of ['sanctions', 'sanctionRevocations']) await assertSucceeds(getDocs(query(collection(client('mod'), c), where('userId', '==', 'author'), limit(50))));
  for (const c of ['reports', 'commentReports', 'privateReplyReports']) await assertSucceeds(getDocs(query(collection(client('mod'), c), where('status', '==', 'open'), limit(50))));
  for (const f of [client('other'), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(f, 'warnings/sample'))); await assertFails(getDoc(doc(f, 'sanctions/sample')));
    await assertFails(getDocs(query(collection(f, 'reports'), limit(50))));
  }
  await assertFails(getDoc(doc(client('mod'), 'shouts/parent/privateReplies/private')));
  await assertFails(getDoc(doc(client('other'), 'users/author')));
});
test('trusted server sanctions and revocation still commit audit atomically; clients cannot forge receipts', async () => {
  const createdAt = (await db.doc('shouts/parent').get()).get('createdAt').toMillis();
  for (const decision of ['warning', 'ban1d', 'restrict1d']) {
    const result = await sanctionContentOperation(request('mod', { expectedTargetUserId: 'author', mode: 'observation', targetType: 'shout', shoutId: 'parent', expectedCreatedAt: createdAt, decision, note: 'Synthetic checked reason' }, decision), db);
    assert.equal((await db.doc(`sanctions/${result.sanctionId}`).get()).get('moderatorId'), 'mod');
    if (decision !== 'warning') await revokeSanctionOperation(request('mod', { sanctionId: result.sanctionId, note: 'Synthetic reviewed revocation' }, `revoke-${decision}`), db);
  }
  for (const uid of ['mod', 'owner', 'author']) {
    await assertFails(setDoc(doc(client(uid), 'serverOperations/forged'), { userId: uid }));
    await assertFails(getDoc(doc(client(uid), 'serverOperations/forged')));
  }
});
test('trusted decisions and both removal cores work while direct client report updates are closed', async () => {
  await decideContentReportsOperation(request('mod', { targetType: 'shout', shoutId: 'parent', reportIds: ['reporter_parent'], decision: 'approve' }, 'approve'), db);
  assert.equal((await db.doc('reports/reporter_parent').get()).get('resolvedBy'), 'mod');
  await removeReportedPublicContentOperation(request('mod', { targetType: 'comment', shoutId: 'parent', targetId: 'child', reportIds: ['reporter_parent_child'], decision: 'remove' }, 'remove-public'), db);
  assert.equal((await db.doc('shouts/parent').get()).get('commentsCount'), 0);
  await removeReportedPrivateReplyOperation(request('mod', { reportId: 'reporter_parent_private' }, 'remove-private'), db);
  assert.equal((await db.doc('shouts/parent/privateReplies/private').get()).exists, false);
});
test('author-only generic deletion preserves ordinary owner actions and rejects foreign moderator bypass', async () => {
  await assert.rejects(deleteShoutOperation(request('owner', { shoutId: 'parent' }, 'foreign-shout'), db, () => new Date(), { authorOnly: true }), e => e.code === 'permission-denied');
  await assert.rejects(deleteCommentOperation(request('owner', { shoutId: 'parent', commentId: 'child' }, 'foreign-comment'), db, () => new Date(), { authorOnly: true }), e => e.code === 'permission-denied');
  await deleteCommentOperation(request('author', { shoutId: 'parent', commentId: 'child' }, 'own-comment'), db, () => new Date(), { authorOnly: true });
  await deleteShoutOperation(request('author', { shoutId: 'parent' }, 'own-shout'), db, () => new Date(), { authorOnly: true });
  assert.equal((await db.doc('shouts/parent').get()).get('status'), 'deleted');
});
