import { legacyModerationRules } from './business_authority_candidate.mjs';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, limit, where, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { createPrivateReplyOperation as createPrivate } from '../../functions/create_private_reply.js';
import { toggleCommentReactionOperation as toggle } from '../../functions/toggle_comment_reaction.js';
import { createContentReportOperation as report } from '../../functions/create_content_report.js';
import { operationTestKey } from '../../functions/test_helpers.js';

const sdk = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = sdk('firebase-admin/app');
const { getFirestore, Timestamp, GeoPoint } = sdk('firebase-admin/firestore');
let env, app, db, now;
const clock = () => now;
const token = { email: 'fixture@example.test', email_verified: true };
const client = uid => env.authenticatedContext(uid, token).firestore();
const request = (uid, data) => ({ auth: { uid, token }, app: { appId: 'cutover-fixture' }, data: {
  expectedUserId: uid, idempotencyKey: operationTestKey(JSON.stringify(data), now), ...data,
} });
const rate = event => ({ lastAt: serverTimestamp(), lastEventId: event, windowStartedAt: serverTimestamp(), count: 1 });
const control = mode => ({ schemaVersion: 2, revision: 12, mode, readGenerationId: 'feed-v3', cardReadGenerationId: 'feed-v3',
  cardWriteGenerationIds: ['feed-v3'], writeGenerationIds: ['feed-v1', 'feed-v2', 'feed-v3'] });

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: 8080, rules: legacyModerationRules(readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')),
  } });
  app = initializeApp({ projectId: 'shoutout-rules-test' }, 'managed-content-cutover'); db = getFirestore(app);
});
after(async () => { if (db) await db.terminate(); if (app) await deleteApp(app); if (env) await env.cleanup(); });
async function actor(uid, role = 'user', level = 1) {
  await db.doc(`users/${uid}`).set({ nickname: uid });
  await db.doc(`publicProfiles/${uid}`).set({ nickname: uid });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  await db.doc(`accountRoles/${uid}`).set({ role, level, moderationScope: { global: true, countries: [], subdivisions: [] } });
  return client(uid);
}
beforeEach(async () => {
  await env.clearFirestore(); now = new Date();
  await actor('writer'); await actor('recipient'); await actor('outsider');
  await db.doc('feedIndexControl/current').set(control('active'));
  await db.doc('feedIndexGenerations/feed-v3').set({ schemaVersion: 1, v: 2, cardProjection: 1, cardReady: true, accountRetention: true });
  await db.doc('shouts/parent').set({ authorId: 'recipient', authorNickname: 'recipient', title: 'Fixture', text: 'Body', categories: ['Dotaz'],
    location: new GeoPoint(50.53, 14.13), geohash: 'u2fkbnh', createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromMillis(now.getTime() + 3600000), status: 'active', commentsCount: 1, likesCount: 0, dislikesCount: 0, savesCount: 0 });
  await db.doc('shouts/parent/comments/comment').set({ authorId: 'recipient', authorNickname: 'recipient', text: 'Comment fixture',
    createdAt: Timestamp.fromDate(now), likesCount: 0, dislikesCount: 0 });
});
function privateData(uid, { recipientId = 'recipient', targetType = 'shout' } = {}) {
  return { authorId: uid, authorNickname: uid, recipientId, recipientNickname: recipientId,
    participants: [uid, recipientId], text: 'Private fixture', createdAt: serverTimestamp(), targetType };
}
const rawPrivate = (uid, data = privateData(uid)) => {
  const f = client(uid), batch = writeBatch(f);
  batch.set(doc(f, `rateLimits/${uid}/actions/privateReply`), rate('private-fixture'));
  batch.set(doc(f, 'shouts/parent/privateReplies/private-fixture'), data); return batch.commit();
};
async function rawReaction(uid, { body = { userId: uid, type: 'like', updatedAt: serverTimestamp() }, counts = null, remove = false } = {}) {
  const f = client(uid), batch = writeBatch(f);
  batch.set(doc(f, `rateLimits/${uid}/actions/interaction`), rate('commentReaction_parent_comment'));
  const ref = doc(f, `shouts/parent/comments/comment/reactions/${uid}`);
  if (remove) batch.delete(ref); else batch.set(ref, body);
  if (counts) batch.update(doc(f, 'shouts/parent/comments/comment'), counts);
  return batch.commit();
}
async function rawReport(uid, kind) {
  const f = client(uid), batch = writeBatch(f), privateTarget = kind === 'privateReply', comment = kind === 'comment';
  const id = `${uid}_parent${kind === 'shout' ? '' : privateTarget ? '_private-target' : '_comment'}`;
  const name = privateTarget ? 'privateReplyReports' : comment ? 'commentReports' : 'reports';
  batch.set(doc(f, `rateLimits/${uid}/actions/report`), rate(id));
  batch.set(doc(f, `${name}/${id}`), { reporterId: uid, shoutId: 'parent', reason: 'Spam', createdAt: serverTimestamp(), status: 'open',
    ...(comment ? { commentId: 'comment' } : privateTarget ? { privateReplyId: 'private-target', authorId: 'recipient', text: 'Private target', priority: 'high' } : {}) });
  return batch.commit();
}

for (const mode of ['building', 'active', 'paused', 'v1']) test(`${mode}: no direct content writer reopens during an index transition`, async () => {
  await db.doc('feedIndexControl/current').set(mode === 'v1'
    ? { schemaVersion: 1, mode: 'active', readGenerationId: 'feed-v1', writeGenerationIds: ['feed-v1'] }
    : control(mode));
  await assertFails(rawPrivate('writer'));
  await assertFails(rawReaction('writer'));
  for (const kind of ['shout', 'comment', 'privateReply']) {
    await db.doc('shouts/parent/privateReplies/private-target').set({ authorId: 'recipient', recipientId: 'writer', text: 'Private target' });
    await assertFails(rawReport('writer', kind));
  }
  assert.equal((await db.doc('rateLimits/writer/actions/privateReply').get()).exists, false);
  assert.equal((await db.doc('rateLimits/writer/actions/interaction').get()).exists, false);
  assert.equal((await db.doc('rateLimits/writer/actions/report').get()).exists, false);
});

test('all eligible client roles and anonymous clients are denied, without changing their reads', async () => {
  for (const [role, level] of [['user', 1], ['business', 2], ['moderator', 3], ['administrator', 5], ['owner', 6]]) {
    const uid = `actor-${role}`, f = await actor(uid, role, level);
    await assertSucceeds(getDoc(doc(f, 'shouts/parent/comments/comment')));
    await assertFails(rawPrivate(uid)); await assertFails(rawReaction(uid)); await assertFails(rawReport(uid, 'shout'));
  }
  const anonymous = env.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anonymous, 'shouts/parent/privateReplies/new'), privateData('writer')));
  await assertFails(getDocs(query(collection(anonymous, 'shouts/parent/privateReplies'), limit(50))));
  await assertFails(getDocs(query(collection(anonymous, 'reports'), limit(50))));
});

test('a blocked recipient, invented parent, forged ownership and oversized fields cannot use a raw private path', async () => {
  await db.doc('users/recipient/blocked/writer').set({ targetUserId: 'writer' });
  for (const data of [
    privateData('writer', { targetType: 'privateReply' }),
    { ...privateData('writer'), authorId: 'recipient' },
    { ...privateData('writer'), text: 'x'.repeat(100000) },
    { ...privateData('writer'), createdAt: new Date(0), extra: true },
    { ...privateData('writer'), text: 42, participants: [] },
  ]) await assertFails(rawPrivate('writer', data));
  assert.equal((await db.collection('shouts/parent/privateReplies').get()).empty, true);
  const attempted = request('writer', { shoutId: 'parent', text: 'Fixture', targetType: 'privateReply', parentPrivateReplyId: 'missing' });
  await assert.rejects(createPrivate(attempted, db, clock), e => e.code === 'permission-denied');
});

test('create/update/delete reactions and counter-only or combined batches fail atomically', async () => {
  await assertFails(rawReaction('writer', { counts: { likesCount: 1 } }));
  await db.doc('shouts/parent/comments/comment/reactions/writer').set({ userId: 'writer', type: 'like', updatedAt: Timestamp.fromDate(now) });
  await db.doc('shouts/parent/comments/comment').update({ likesCount: 1 });
  await assertFails(rawReaction('writer', { body: { userId: 'writer', type: 'dislike', updatedAt: serverTimestamp() }, counts: { likesCount: 0, dislikesCount: 1 } }));
  await assertFails(rawReaction('writer', { remove: true, counts: { likesCount: 0 } }));
  await assertFails(updateDoc(doc(client('writer'), 'shouts/parent/comments/comment'), { likesCount: 2 }));
  await assertFails(updateDoc(doc(client('recipient'), 'shouts/parent/comments/comment'), { authorId: 'writer', text: 123 }));
  const stored = (await db.doc('shouts/parent/comments/comment').get()).data();
  assert.equal(stored.likesCount, 1); assert.equal(stored.dislikesCount, 0); assert.equal(stored.authorId, 'recipient');
  assert.equal((await db.doc('shouts/parent/comments/comment/reactions/writer').get()).get('type'), 'like');
  assert.equal((await db.doc('rateLimits/writer/actions/interaction').get()).exists, false);
});

test('existing private callable keeps canonical participants, idempotency and participant-only queries', async () => {
  const r = request('writer', { shoutId: 'parent', text: 'Fixture', targetType: 'shout' });
  const first = await createPrivate(r, db, clock), replay = await createPrivate(r, db, clock);
  assert.equal(first.privateReplyId, replay.privateReplyId);
  const path = `shouts/parent/privateReplies/${first.privateReplyId}`, data = (await db.doc(path).get()).data();
  assert.deepEqual(data.participants, ['writer', 'recipient']); assert.equal(data.authorNickname, 'writer');
  for (const uid of ['writer', 'recipient']) await assertSucceeds(getDoc(doc(client(uid), path)));
  await assertFails(getDoc(doc(client('outsider'), path)));
  const received = await assertSucceeds(getDocs(query(collection(client('recipient'), 'shouts/parent/privateReplies'), where('recipientId', '==', 'recipient'), limit(50))));
  assert.equal(received.size, 1);
  await assertFails(updateDoc(doc(client('writer'), path), { authorId: 'outsider' }));
  // Managed own deletion now requires the confirmed server operation.
  await assertFails(deleteDoc(doc(client('writer'), path)));
});

test('comment callable maintains exact counters and one receipt for retries under managed Rules', async () => {
  const r = request('writer', { shoutId: 'parent', commentId: 'comment', button: 'like' });
  const result = await toggle(r, db, clock), replay = await toggle(r, db, clock);
  assert.deepEqual(result, replay); assert.equal(result.likes, 1);
  assert.equal((await db.doc('shouts/parent/comments/comment').get()).get('likesCount'), 1);
  await assertSucceeds(getDoc(doc(client('writer'), 'shouts/parent/comments/comment/reactions/writer')));
  const receipts = await db.collection('serverOperations').where('userId', '==', 'writer').get(); assert.equal(receipts.size, 1);
  await assert.rejects(toggle({ ...r, app: undefined }, db, clock), e => e.code === 'unauthenticated');
});

test('all three report callables stay idempotent, private and moderatable', async () => {
  const moderator = await actor('moderator', 'moderator', 3);
  for (const kind of ['shout', 'comment', 'privateReply']) {
    const uid = `reporter-${kind}`; await actor(uid);
    await db.doc('shouts/parent/privateReplies/private-target').set({ authorId: 'recipient', recipientId: uid, text: 'Private target' });
    const r = request(uid, { targetType: kind, shoutId: 'parent', reason: 'Spam', ...(kind === 'shout' ? {} : { targetId: kind === 'comment' ? 'comment' : 'private-target' }) });
    const result = await report(r, db, clock), replay = await report(r, db, clock); assert.deepEqual(result, replay);
    const name = kind === 'shout' ? 'reports' : kind === 'comment' ? 'commentReports' : 'privateReplyReports', path = `${name}/${result.reportId}`;
    await assertSucceeds(getDoc(doc(moderator, path))); await assertFails(getDoc(doc(client('outsider'), path)));
    await assertFails(updateDoc(doc(moderator, path), { reporterId: 'forged', status: 'resolved', resolvedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(moderator, path), { status: 'resolved', resolvedAt: serverTimestamp(), resolution: 'noAction' }));
    assert.equal((await db.doc(path).get()).get('status'), 'resolved');
    assert.equal((await db.collection('serverOperations').where('userId', '==', uid).get()).size, 1);
  }
});

test('legacy validation is retained only when no managed feed control exists', async () => {
  await db.doc('feedIndexControl/current').delete();
  await assertSucceeds(rawPrivate('writer'));
  await assertSucceeds(rawReaction('writer', { counts: { likesCount: 1 } }));
  for (const kind of ['shout', 'comment', 'privateReply']) {
    const uid = `legacy-${kind}`; await actor(uid);
    await db.doc('shouts/parent/privateReplies/private-target').set({ authorId: 'recipient', recipientId: uid, text: 'Private target' });
    await assertSucceeds(rawReport(uid, kind));
  }
});
