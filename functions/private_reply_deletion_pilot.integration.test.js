import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { planPrivateDeletionPilot, validatePrivateDeletionPilot, seedPrivateDeletionPilot, privateDeletionPilotStatus, cleanupPrivateDeletionPilot } from './private_reply_deletion_pilot.js';
import { deletePrivateReplyOperation } from './delete_private_reply.js';
import { operationTestKey } from './test_helpers.js';
import { syncReadBatchOperation } from './read_sync.js';
import { readContentHash } from './read_sync_blocks.js';
import { prepareNewsControlChange } from './feed_news_signals.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'private-delete-pilot') : null, db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t) {
  const nonce = randomUUID().slice(0, 8), control = db.doc('feedIndexControl/current'), marker = db.doc('feedIndexGenerations/feed-v3');
  const original = db.doc(`shouts/private-original-${nonce}`), pending = db.doc(`accountDeletionRequests/private-original-${nonce}`);
  const actors = ['Bright_Otter_182', 'TestBusiness'].map((nickname, i) => ({ nickname, uid: `private-pilot-${nonce}-${i}` }));
  const roots = [control, marker, original, pending, db.doc('feedNewsControl/current'), ...actors.flatMap(a =>
    [db.doc(`users/${a.uid}`), db.doc(`rateLimits/${a.uid}`), db.doc(`accountRoles/${a.uid}`), db.doc(`businessProfiles/${a.uid}`)])];
  t.after(async () => {
    for (const a of actors) for (const doc of (await db.collection('serverOperations').where('userId', '==', a.uid).get()).docs) await doc.ref.delete();
    for (const ref of roots) await db.recursiveDelete(ref);
  });
  await control.create({ schemaVersion: 2, revision: 12, mode: 'active', readGenerationId: 'feed-v3', writeGenerationIds: ['feed-v3'], cardReadGenerationId: 'feed-v3', cardWriteGenerationIds: ['feed-v3'] });
  await marker.create({ schemaVersion: 1, v: 2, cardReady: true, cardProjection: 1, accountRetention: true, readIdentity: 1, erasureRevision: 0, prunedThrough: -1 });
  await original.create({ untouched: true, title: 'Other', text: 'History', status: 'active', authorId: actors[0].uid, expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });
  await pending.create({ untouched: true });
  for (const a of actors) {
    await db.doc(`users/${a.uid}`).create({ nickname: a.nickname, avatarId: 'avatar_01', avatarBackgroundStart: 1, avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
    await db.doc(`users/${a.uid}/legal/acceptance_2026_07_25`).create({});
  }
  await db.doc(`accountRoles/${actors[1].uid}`).create({ role: 'business', level: 2 });
  await db.doc(`businessProfiles/${actors[1].uid}`).create({ status: 'active' });
  const generation = await marker.get();
  await db.runTransaction(async tx => { (await prepareNewsControlChange(tx, db, { v: 1, revision: 1, mode: 'active', generation: 'feed-v3', incarnation: [generation.createTime.seconds, generation.createTime.nanoseconds] })).apply(); });
  const plan = await planPrivateDeletionPilot(db, actors, { expectedSources: 1 });
  const status = await privateDeletionPilotStatus(db, plan); roots.push(db.doc(`shouts/${status.shoutId}`));
  return { plan, original, pending, actors, status, control };
}
function input(uid, shoutId, privateReplyId, label) {
  return { auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'test' },
    data: { expectedUserId: uid, shoutId, privateReplyId, idempotencyKey: operationTestKey(label, new Date()) } };
}
test('pilot creates exactly one indexed 24h source and two canonical continuing messages, resumes and preserves receipts, quotas and unrelated reads', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await seedPrivateDeletionPilot(db, f.plan), replay = await seedPrivateDeletionPilot(db, f.plan);
  assert.equal(first.shoutId, replay.shoutId); assert.equal(first.replies.length, 2); assert(first.replies.every(r => r.present));
  assert.equal(first.compatibilityReceiptsPresent, false);
  const a = f.actors[0].uid, source = await db.doc(`shouts/${first.shoutId}`).get();
  const sync = await syncReadBatchOperation({ auth: { uid: a, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'test' }, data: { expectedUserId: a, items: [
    { shoutId: first.shoutId, contentHash: readContentHash(source.get('title'), source.get('text')), expiresAt: first.expiresAt },
    { shoutId: f.original.id, contentHash: readContentHash('Other', 'History'), expiresAt: (await f.original.get()).get('expiresAt').toMillis() },
  ] } }, db);
  assert(sync.items.every(i => i.status === 'accepted'));
  const row = first.replies[0], uid = f.actors[1].uid;
  await assert.rejects(deletePrivateReplyOperation(input(a, first.shoutId, row.id, 'foreign'), db), e => e.code === 'not-found');
  const req = input(uid, first.shoutId, row.id, 'own');
  await deletePrivateReplyOperation(req, db); await deletePrivateReplyOperation(req, db);
  assert.equal((await privateDeletionPilotStatus(db, f.plan)).replies[0].deletionReceipt, true);
  const rateBefore = (await db.doc(`rateLimits/${uid}/actions/delete`).get()).updateTime;
  const cleanup = await cleanupPrivateDeletionPilot(db, f.plan);
  assert.equal(cleanup.removed, 1); assert.equal(cleanup.messages, 1); assert.equal(cleanup.readKeys, 1); assert.equal(cleanup.receiptsRemoved, 0);
  assert.equal((await cleanupPrivateDeletionPilot(db, f.plan)).removed, 0);
  assert.equal((await db.doc(`rateLimits/${uid}/actions/delete`).get()).updateTime.toMillis(), rateBefore.toMillis());
  assert.equal((await db.collection('serverOperations').where('shoutId', '==', first.shoutId).get()).size, 4);
  const remaining = (await db.collection(`users/${a}/readBuckets`).get()).docs.flatMap(d => Object.values(d.get('entries') ?? {}));
  assert.deepEqual(remaining.map(r => r.shoutId), [f.original.id]);
  const final = await privateDeletionPilotStatus(db, f.plan);
  assert.equal(final.sourcePresent, false); assert.equal(final.compatibilityReceiptsPresent, false, 'administrative cleanup cannot count as positive UI proof');
});
test('changed control, original or digest stops pilot before creating any content', { skip: !enabled }, async t => {
  const f = await fixture(t);
  assert.throws(() => validatePrivateDeletionPilot(db, { ...f.plan, runId: f.plan.runId + 'x' }), /digest/);
  await f.control.update({ revision: 13 });
  await assert.rejects(seedPrivateDeletionPilot(db, f.plan), /control-drift/);
  assert.equal((await db.doc(`shouts/${f.status.shoutId}`).get()).exists, false);
  await f.control.update({ revision: 12 }); await f.pending.update({ untouched: false });
  await assert.rejects(seedPrivateDeletionPilot(db, f.plan), /original-drift/);
});
test('cleanup rejects foreign conversation and leaves source and both owned messages intact', { skip: !enabled }, async t => {
  const f = await fixture(t), status = await seedPrivateDeletionPilot(db, f.plan);
  await db.doc(`shouts/${status.shoutId}/comments/foreign`).create({ authorId: 'someone-else' });
  await assert.rejects(cleanupPrivateDeletionPilot(db, f.plan), /foreign-descendant/);
  const after = await privateDeletionPilotStatus(db, f.plan); assert(after.sourcePresent); assert(after.replies.every(r => r.present));
});
