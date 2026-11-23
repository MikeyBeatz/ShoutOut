import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, limit, updateDoc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { privateReportRemovalCandidate } from './private_report_removal_candidate.mjs';
import { removeReportedPrivateReplyOperation as remove } from '../../functions/remove_reported_private_reply.js';
import { operationTestKey } from '../../functions/test_helpers.js';
const sdk = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = sdk('firebase-admin/app'), { getFirestore, Timestamp } = sdk('firebase-admin/firestore');
const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const path = 'shouts/parent/privateReplies/message', reportId = 'recipient_parent_message', reportPath = `privateReplyReports/${reportId}`;
const token = { email: 'fixture@example.test', email_verified: true }; let env, app, db;
const client = uid => env.authenticatedContext(uid, token).firestore();
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: { host: '127.0.0.1', port: 8080, rules: privateReportRemovalCandidate(source) } });
  app = initializeApp({ projectId: 'shoutout-rules-test' }, 'private-report-candidate'); db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  for (const uid of ['author', 'recipient', 'mod', 'owner', 'other']) {
    await db.doc(`users/${uid}`).set({ nickname: uid }); await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
    await db.doc(`accountRoles/${uid}`).set({ level: uid === 'owner' ? 6 : uid === 'mod' ? 3 : 1, moderationScope: { countries: ['CZ'] } });
  }
  await db.doc('feedIndexControl/current').set({ schemaVersion: 2, mode: 'active' });
  await db.doc('shouts/parent').set({ authorId: 'author', status: 'expired', geography: { schemaVersion: 1, countryCode: 'CZ' } });
  await db.doc(path).set({ authorId: 'author', recipientId: 'recipient', participants: ['author', 'recipient'], text: 'Synthetic private report', createdAt: Timestamp.now() });
  await db.doc(reportPath).set({ authorId: 'author', reporterId: 'recipient', shoutId: 'parent', privateReplyId: 'message',
    text: 'Synthetic private report', reason: 'Synthetic report', status: 'open', createdAt: Timestamp.now(), priority: 'high' });
});
after(async () => { if (db) await db.terminate(); if (app) await deleteApp(app); if (env) await env.cleanup(); });

test('prototype compiles, stays idempotent and refuses source drift without changing released Rules', () => {
  const candidate = privateReportRemovalCandidate(source); assert.equal(privateReportRemovalCandidate(candidate), candidate);
  assert.throws(() => privateReportRemovalCandidate('unrelated'), /source-drift/);
  assert.throws(() => privateReportRemovalCandidate(source + source), /source-drift/);
  assert.equal(readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), source);
});
test('managed modes deny direct deletion for every role, forged removal audit and combined batches without partial writes', async () => {
  for (const mode of ['active', 'building', 'paused', 'off']) {
    await db.doc('feedIndexControl/current').set({ mode });
    for (const uid of ['author', 'recipient', 'mod', 'owner', 'other']) {
      const f = client(uid); await assertFails(deleteDoc(doc(f, path)));
      await assertFails(updateDoc(doc(f, reportPath), { status: 'resolved', resolvedAt: serverTimestamp(), resolution: 'contentRemoved' }));
      await assertFails(updateDoc(doc(f, reportPath), { status: 'resolved', resolvedAt: serverTimestamp(), resolvedBy: uid, decisionOperationId: 'forged' }));
      const batch = writeBatch(f); batch.delete(doc(f, path)); batch.update(doc(f, reportPath), { status: 'resolved', resolvedAt: serverTimestamp() }); await assertFails(batch.commit());
    }
  }
  assert((await db.doc(path).get()).exists); assert.equal((await db.doc(reportPath).get()).get('status'), 'open');
});
test('trusted callable core commits deletion and audit under prototype; clients cannot forge or read its receipt', async () => {
  await remove({ auth: { uid: 'mod', token }, app: { appId: 'test' }, data: { expectedUserId: 'mod', reportId, note: '', idempotencyKey: operationTestKey('candidate', new Date()) } }, db);
  assert.equal((await db.doc(path).get()).exists, false); assert.equal((await db.doc(reportPath).get()).get('resolvedBy'), 'mod');
  const receipt = (await db.collection('serverOperations').where('reportId', '==', reportId).get()).docs[0]; assert(receipt);
  for (const uid of ['author', 'mod', 'owner']) {
    await assertFails(getDoc(doc(client(uid), receipt.ref.path))); await assertFails(setDoc(doc(client(uid), 'serverOperations/forged'), { userId: uid }));
    await assertFails(updateDoc(doc(client(uid), reportPath), { resolvedBy: uid }));
  }
});
test('participant queries and staff report queues survive; unrelated/anonymous content access and ownership/schema hijacks fail', async () => {
  for (const [uid, field] of [['author', 'authorId'], ['recipient', 'recipientId']])
    await assertSucceeds(getDocs(query(collection(client(uid), 'shouts/parent/privateReplies'), where(field, '==', uid), limit(50))));
  await assertSucceeds(getDocs(query(collection(client('mod'), 'privateReplyReports'), where('status', '==', 'open'), limit(50))));
  for (const f of [client('other'), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(f, path))); await assertFails(getDocs(collection(f, 'privateReplyReports')));
    await assertFails(deleteDoc(doc(f, path)));
  }
  for (const change of [{ authorId: 'other' }, { text: 'x'.repeat(10000) }, { text: 42 }, { createdAt: serverTimestamp() }])
    await assertFails(updateDoc(doc(client('author'), path), change));
  await assertFails(updateDoc(doc(client('mod'), reportPath), { text: 'Changed evidence' }));
  await assertFails(setDoc(doc(client('mod'), 'privateReplyReports/forged'), { reporterId: 'recipient', status: 'open' }));
});
test('resolve and escalation stay available; unmanaged own and moderator deletion remain compatible', async () => {
  await assertSucceeds(updateDoc(doc(client('mod'), reportPath), { status: 'escalated', assignedRole: 'seniorModerator', escalatedBy: 'mod', escalatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(client('mod'), reportPath), { status: 'resolved', resolution: 'noAction', resolvedAt: serverTimestamp() }));
  await db.doc('feedIndexControl/current').delete();
  await assertSucceeds(deleteDoc(doc(client('mod'), path)));
  await db.doc(path).set({ authorId: 'author' }); await assertSucceeds(deleteDoc(doc(client('author'), path)));
});

test('approved content keeps its existing atomic clearance flow and private scope is unchanged when the parent is missing', async () => {
  const f = client('mod'), batch = writeBatch(f);
  batch.set(doc(f, 'moderationClearances/privateReply_parent_message'), { targetType: 'privateReply', shoutId: 'parent', contentId: 'message',
    moderatorId: 'mod', createdAt: serverTimestamp(), reason: 'Synthetic approval', sourceReportIds: [reportId] });
  batch.update(doc(f, reportPath), { status: 'resolved', resolution: 'contentApproved', resolvedAt: serverTimestamp() });
  await assertSucceeds(batch.commit()); assert((await db.doc(path).get()).exists);
  await db.doc('shouts/parent').delete();
  for (const uid of ['author', 'mod', 'owner']) await assertFails(deleteDoc(doc(client(uid), path)));
});
