import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, limit, updateDoc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { privateReplyDeletionCandidate } from './private_reply_deletion_candidate.mjs';
import { privateReportRemovalCandidate } from './private_report_removal_candidate.mjs';
import { deletePrivateReplyOperation as remove } from '../../functions/delete_private_reply.js';
import { operationTestKey } from '../../functions/test_helpers.js';

const sdk = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = sdk('firebase-admin/app'), { getFirestore, Timestamp } = sdk('firebase-admin/firestore');
const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
let env, app, db;
const token = { email: 'fixture@example.test', email_verified: true }, path = 'shouts/parent/privateReplies/message';
const client = uid => env.authenticatedContext(uid, token).firestore();
async function actor(uid, level = 1) {
  await db.doc(`users/${uid}`).set({ nickname: uid });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  await db.doc(`accountRoles/${uid}`).set({ level, role: level >= 3 ? 'moderator' : 'user' });
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: privateReplyDeletionCandidate(source),
  } });
  app = initializeApp({ projectId: 'shoutout-rules-test' }, 'private-delete-candidate'); db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  for (const uid of ['writer', 'recipient', 'other']) await actor(uid);
  await actor('moderator', 3);
  await db.doc('feedIndexControl/current').set({ schemaVersion: 2, revision: 12, mode: 'active',
    readGenerationId: 'feed-v3', writeGenerationIds: ['feed-v3'], cardReadGenerationId: 'feed-v3', cardWriteGenerationIds: ['feed-v3'] });
  await db.doc('shouts/parent').set({ authorId: 'recipient', status: 'expired' });
  await db.doc(path).set({ authorId: 'writer', recipientId: 'recipient', participants: ['writer', 'recipient'],
    authorNickname: 'writer', recipientNickname: 'recipient', text: 'Synthetic candidate', createdAt: Timestamp.now(), targetType: 'shout' });
});
after(async () => { if (db) await db.terminate(); if (app) await deleteApp(app); if (env) await env.cleanup(); });

test('proposal compiles without modifying released Rules and rejects source drift', () => {
  assert.equal(readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), source);
  const candidate = privateReplyDeletionCandidate(source);
  assert.equal(privateReplyDeletionCandidate(candidate), candidate);
  assert.throws(() => privateReplyDeletionCandidate('unrelated rules'), /source-drift/);
  assert.throws(() => privateReplyDeletionCandidate(source + source), /source-drift/);
  const stricter = privateReportRemovalCandidate(candidate);
  assert.equal(privateReplyDeletionCandidate(stricter), stricter);
  assert.equal(privateReplyDeletionCandidate(stricter.replaceAll('\n', '\r\n')), stricter);
  assert.throws(() => privateReplyDeletionCandidate(stricter + stricter), /source-drift/);
  assert.throws(() => privateReplyDeletionCandidate(stricter.replace(
    "      ) && (!managedFeedProjection() ||\n        request.resource.data.get('resolution', '') != 'contentRemoved');",
    '      );')), /source-drift/);
});
test('building/active/paused/old generation close ordinary deletion even with a rate batch', async () => {
  for (const mode of ['building', 'active', 'paused', 'v1']) {
    await db.doc('feedIndexControl/current').set(mode === 'v1'
      ? { schemaVersion: 1, mode: 'active', readGenerationId: 'feed-v1', writeGenerationIds: ['feed-v1'] }
      : { schemaVersion: 2, mode });
    await assertFails(deleteDoc(doc(client('writer'), path)));
    const f = client('writer'), batch = writeBatch(f);
    batch.set(doc(f, 'rateLimits/writer/actions/delete'), { count: 1, lastAt: serverTimestamp(), windowStartedAt: serverTimestamp(), lastEventId: 'message' });
    batch.delete(doc(f, path)); await assertFails(batch.commit());
    assert((await db.doc(path).get()).exists);
    assert.equal((await db.doc('rateLimits/writer/actions/delete').get()).exists, false);
  }
});
test('server removes own target under candidate Rules; clients cannot forge or read receipts', async () => {
  const now = new Date(), key = operationTestKey('private-cutover', now);
  await remove({ auth: { uid: 'writer', token }, app: { appId: 'candidate' }, data: {
    expectedUserId: 'writer', shoutId: 'parent', privateReplyId: 'message', idempotencyKey: key,
  } }, db, () => now);
  assert.equal((await db.doc(path).get()).exists, false);
  const receipts = await db.collection('serverOperations').where('userId', '==', 'writer').get();
  assert.equal(receipts.size, 1); assert.equal((await db.doc('rateLimits/writer/actions/delete').get()).get('count'), 1);
  for (const uid of ['writer', 'moderator']) {
    await assertFails(getDoc(doc(client(uid), receipts.docs[0].ref.path)));
    await assertFails(setDoc(doc(client(uid), 'serverOperations/forged'), { userId: uid, result: { deleted: true } }));
  }
});
test('participant bounded queries survive; unrelated and anonymous reads/lists/deletes stay denied', async () => {
  for (const [uid, field] of [['writer', 'authorId'], ['recipient', 'recipientId']]) {
    const f = client(uid);
    await assertSucceeds(getDoc(doc(f, path)));
    assert.equal((await assertSucceeds(getDocs(query(collection(f, 'shouts/parent/privateReplies'), where(field, '==', uid), limit(50))))).size, 1);
    await assertFails(getDocs(collection(f, 'shouts/parent/privateReplies')));
  }
  for (const f of [client('other'), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(f, path))); await assertFails(getDocs(collection(f, 'shouts/parent/privateReplies')));
    await assertFails(deleteDoc(doc(f, path)));
  }
  await assertFails(deleteDoc(doc(client('recipient'), path)));
});
test('ownership/role/schema/timestamp tampering cannot reopen direct deletion', async () => {
  const f = client('writer');
  for (const patch of [{ authorId: 'other' }, { authorId: 1 }, { text: 'x'.repeat(1000000) },
    { createdAt: null }, { participants: ['writer', 'other'] }, { role: 'owner', level: 6 }]) {
    await assertFails(updateDoc(doc(f, path), patch));
  }
  await assertFails(updateDoc(doc(f, 'accountRoles/writer'), { level: 6, role: 'owner' }));
  await assertFails(setDoc(doc(f, 'shouts/parent/privateReplies/forged'), { authorId: 'other', text: 'fake' }));
  await assertFails(deleteDoc(doc(f, path)));
  assert.equal((await db.doc(path).get()).get('authorId'), 'writer');
});
test('moderator deletion follows the published transition stage; unmanaged own deletion stays valid', async () => {
  await assertFails(getDoc(doc(client('moderator'), path)));
  const isDecisionCutover = privateReportRemovalCandidate(privateReplyDeletionCandidate(source)) === source.replaceAll('\r\n', '\n');
  if (isDecisionCutover) await assertFails(deleteDoc(doc(client('moderator'), path)));
  else await assertSucceeds(deleteDoc(doc(client('moderator'), path)));
  await db.doc(path).set({ authorId: 'writer', recipientId: 'recipient' });
  await db.doc('feedIndexControl/current').delete();
  await assertFails(deleteDoc(doc(client('recipient'), path)));
  await assertSucceeds(deleteDoc(doc(client('writer'), path)));
});

test('older own-deletion transition preserves the stricter prototype and the trusted own callable', async () => {
  const prepared = privateReportRemovalCandidate(privateReplyDeletionCandidate(source));
  await env.cleanup();
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: privateReplyDeletionCandidate(prepared),
  } });
  for (const uid of ['writer', 'recipient', 'moderator']) await assertFails(deleteDoc(doc(client(uid), path)));
  const now = new Date();
  await remove({ auth: { uid: 'writer', token }, app: { appId: 'candidate' }, data: {
    expectedUserId: 'writer', shoutId: 'parent', privateReplyId: 'message',
    idempotencyKey: operationTestKey('stricter-own-cutover', now),
  } }, db, () => now);
  assert.equal((await db.doc(path).get()).exists, false);
  assert.equal((await db.collection('serverOperations').where('userId', '==', 'writer').get()).size, 1);
  assert.equal(readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), source);
});
