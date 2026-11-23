import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { planPublicRemovalPilot, seedPublicRemovalPilot, publicRemovalPilotSlots, publicRemovalPilotStatus, cleanupPublicRemovalPilot } from './public_report_removal_pilot.js';
import { removeReportedPublicContentOperation } from './remove_reported_public_content.js';
import { createFeedRuntime } from './feed_runtime.js';
import { prepareNewsControlChange } from './feed_news_signals.js';
import { operationTestKey } from './test_helpers.js';
import { syncReadBatchOperation } from './read_sync.js';
import { readContentHash } from './read_sync_blocks.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'public-removal-pilot') : null, db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const noAuth = { getUser() { throw Error('auth-must-not-run'); } };
async function fixture(t) {
  const nonce = randomUUID().slice(0, 8), actors = ['Bright_Otter_182', 'TestBusiness'].map((nickname, i) => ({ nickname, uid: `public-${nonce}-${i}` }));
  const staff = { nickname: 'TestModerator', uid: `public-${nonce}-mod` };
  const roots = ['feedIndexControl/current', 'feedNewsControl/current', 'feedIndexGenerations/feed-v3', `shouts/original-${nonce}`, `accountDeletionRequests/original-${nonce}`].map(p => db.doc(p));
  const extra = [];
  t.after(async () => {
    for (const actor of [...actors, staff, ...extra]) {
      for (const d of (await db.collection('serverOperations').where('userId', '==', actor.uid).get()).docs) await d.ref.delete();
      for (const c of ['users', 'accountRoles', 'moderators', 'rateLimits', 'businessProfiles']) await db.recursiveDelete(db.doc(`${c}/${actor.uid}`));
    }
    for (const ref of roots) await db.recursiveDelete(ref);
  });
  await roots[0].create({ schemaVersion: 2, revision: 12, mode: 'active', readGenerationId: 'feed-v3', writeGenerationIds: ['feed-v3'], cardReadGenerationId: 'feed-v3', cardWriteGenerationIds: ['feed-v3'] });
  await roots[2].create({ schemaVersion: 1, v: 2, cardReady: true, cardProjection: 1, accountRetention: true, readIdentity: 1, erasureRevision: 0, prunedThrough: -1 });
  await roots[3].create({ untouched: true, authorId: actors[0].uid, title: 'Original', text: 'Keep original read history', status: 'active',
    createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000) }); await roots[4].create({ untouched: true });
  for (const actor of [...actors, staff]) {
    await db.doc(`users/${actor.uid}`).create({ nickname: actor.nickname, avatarId: 'avatar_01', avatarBackgroundStart: 1, avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
    await db.doc(`users/${actor.uid}/legal/acceptance_2026_07_25`).create({});
  }
  await db.doc(`accountRoles/${actors[1].uid}`).create({ role: 'business', level: 2 }); await db.doc(`businessProfiles/${actors[1].uid}`).create({ status: 'active' });
  await db.doc(`accountRoles/${staff.uid}`).create({ level: 3, moderationScope: { subdivisions: ['CZ-42'] } });
  const marker = await roots[2].get();
  await db.runTransaction(async tx => { (await prepareNewsControlChange(tx, db, { v: 1, revision: 1, mode: 'active', generation: 'feed-v3', incarnation: [marker.createTime.seconds, marker.createTime.nanoseconds] })).apply(); });
  const plan = await planPublicRemovalPilot(db, actors, staff, { expectedSources: 1 });
  const rows = publicRemovalPilotSlots(plan); roots.push(db.doc(`shouts/${rows[0].id}`), db.doc(`reports/${rows[0].reportId}`), db.doc(`commentReports/${rows[1].reportId}`));
  return { plan, actors, staff, roots, extra, rows };
}
const ref = row => db.doc(`shouts/${row.shoutId}${row.type === 'shout' ? '' : `/comments/${row.id}`}`);
async function decision(f, at, uid = f.staff.uid) {
  const row = f.rows[at], now = new Date(), runtime = createFeedRuntime(db, noAuth, { newsRuntimeEnabled: true });
  return removeReportedPublicContentOperation({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'test' }, data: {
    expectedUserId: uid, targetType: row.type, shoutId: row.shoutId, ...(at === 0 ? {} : { targetId: row.id }), reportIds: [row.reportId],
    decision: 'remove', idempotencyKey: operationTestKey(`pilot-${at}-${uid}`, now),
  } }, runtime.database, () => now, { indexWriter: runtime.indexWriter });
}
async function complete(f) { await seedPublicRemovalPilot(db, f.plan); await decision(f, 1); await decision(f, 0); }

test('pilot seeds once, proves exact regional actions and cleans only fixture content while preserving receipts/rates', { skip: !enabled }, async t => {
  const f = await fixture(t), seeded = await seedPublicRemovalPilot(db, f.plan); assert.equal(seeded.waitingForCooldown, false);
  assert.deepEqual(seeded.sourcesPresent, [true, true, true]); assert.equal(seeded.commentsCount, 2); assert.equal(seeded.receipts, 5);
  const rootBefore = await ref(f.rows[0]).get(); await seedPublicRemovalPilot(db, f.plan); assert((await ref(f.rows[0]).get()).updateTime.isEqual(rootBefore.updateTime));
  await assert.rejects(cleanupPublicRemovalPilot(db, f.plan), /positive-proof-required/);
  const control = await ref(f.rows[2]).get(); await decision(f, 1);
  assert.equal((await ref(f.rows[0]).get()).get('commentsCount'), 1); assert((await ref(f.rows[2]).get()).updateTime.isEqual(control.updateTime));
  await decision(f, 0); const status = await publicRemovalPilotStatus(db, f.plan); assert(status.decisions.every(Boolean)); assert.equal(status.receipts, 7);
  const receipts = await db.collection('serverOperations').where('shoutId', '==', status.shoutId).get();
  const rates = await db.getAll(...[...f.actors, f.staff].flatMap(a => ['shout', 'comment', 'report', 'delete'].map(k => db.doc(`rateLimits/${a.uid}/actions/${k}`))));
  const result = await cleanupPublicRemovalPilot(db, f.plan); assert.equal(result.removed, 1); assert.equal(result.receiptsRemoved, 0);
  assert.equal((await cleanupPublicRemovalPilot(db, f.plan)).removed, 0);
  assert.deepEqual((await publicRemovalPilotStatus(db, f.plan)).sourcesPresent, [false, false, false]);
  for (const before of receipts.docs) assert((await before.ref.get()).updateTime.isEqual(before.updateTime));
  for (const before of rates) { const after = await before.ref.get(); assert.equal(after.exists, before.exists); if (before.exists) assert(after.updateTime.isEqual(before.updateTime)); }
  await assert.rejects(seedPublicRemovalPilot(db, f.plan), /decision-started/);
  assert((await f.roots[3].get()).exists && (await f.roots[4].get()).exists);
});

test('digest, role and source drift stop mutations; foreign descendants or reports prevent cleanup', { skip: !enabled }, async t => {
  const f = await fixture(t);
  await assert.rejects(seedPublicRemovalPilot(db, { ...f.plan, kind: 'other' }), /digest/);
  const role = db.doc(`accountRoles/${f.staff.uid}`); await role.update({ level: 4 });
  await assert.rejects(seedPublicRemovalPilot(db, f.plan), /role-drift/); assert(!(await ref(f.rows[0]).get()).exists);
  await role.update({ level: 3 }); f.plan = await planPublicRemovalPilot(db, f.actors, f.staff, { expectedSources: 1 }); f.rows = publicRemovalPilotSlots(f.plan);
  f.roots.push(ref(f.rows[0]), db.doc(`reports/${f.rows[0].reportId}`), db.doc(`commentReports/${f.rows[1].reportId}`));
  await complete(f); const root = ref(f.rows[0]), foreign = root.collection('comments').doc('foreign'); await foreign.create({ text: 'Unrelated' });
  await assert.rejects(cleanupPublicRemovalPilot(db, f.plan), /foreign-descendant/); assert((await root.get()).exists); await foreign.delete();
  const report = db.doc('commentReports/unrelated-' + randomUUID()); f.roots.push(report); await report.create({ shoutId: root.id });
  await assert.rejects(cleanupPublicRemovalPilot(db, f.plan), /foreign-report/); await report.delete();
  await ref(f.rows[2]).update({ text: 'Unexpected replacement' }); await assert.rejects(cleanupPublicRemovalPilot(db, f.plan), /foreign-source/);
  assert((await root.get()).exists);
});

test('TestAdmin substitution is rejected rather than silently accepted as the planned regional moderator', { skip: !enabled }, async t => {
  const f = await fixture(t); await seedPublicRemovalPilot(db, f.plan);
  const admin = { uid: 'admin-' + randomUUID() }; f.extra.push(admin);
  await db.doc(`users/${admin.uid}`).create({ nickname: 'Other administrator' }); await db.doc(`users/${admin.uid}/legal/acceptance_2026_07_25`).create({});
  await db.doc(`accountRoles/${admin.uid}`).create({ level: 5 }); await decision(f, 1, admin.uid);
  await assert.rejects(publicRemovalPilotStatus(db, f.plan), /wrong-decision-actor/);
  await assert.rejects(cleanupPublicRemovalPilot(db, f.plan), /wrong-decision-actor/); assert((await ref(f.rows[0]).get()).exists);
});

test('read cleanup resumes after content removal without deleting unrelated read history or rewriting receipts', { skip: !enabled }, async t => {
  const f = await fixture(t); await seedPublicRemovalPilot(db, f.plan);
  const root = await ref(f.rows[0]).get(), original = await f.roots[3].get();
  for (const actor of [f.actors[0], f.staff]) {
    const items = [root, ...(actor === f.actors[0] ? [original] : [])].map(d => ({ shoutId: d.id, contentHash: readContentHash(d.get('title'), d.get('text')), expiresAt: d.get('expiresAt').toMillis() }));
    const result = await syncReadBatchOperation({ auth: { uid: actor.uid, token: { email: 'f@example.test', email_verified: true } }, app: { appId: 'test' }, data: { expectedUserId: actor.uid, items } }, db);
    assert(result.items.every(i => i.status === 'accepted'));
  }
  await decision(f, 1); await decision(f, 0);
  let transactions = 0;
  const interrupted = new Proxy(db, { get(object, key) {
    if (key === 'runTransaction') return (...args) => { if (++transactions === 2) throw Error('injected-read-cleanup-interruption'); return object.runTransaction(...args); };
    const value = object[key]; return typeof value === 'function' ? value.bind(object) : value;
  } });
  await assert.rejects(cleanupPublicRemovalPilot(interrupted, f.plan), /injected-read-cleanup-interruption/);
  assert(!(await root.ref.get()).exists); const recovered = await cleanupPublicRemovalPilot(db, f.plan); assert.equal(recovered.removed, 0); assert.equal(recovered.readKeys, 2);
  const entries = (await db.collection(`users/${f.actors[0].uid}/readBuckets`).get()).docs.flatMap(d => Object.values(d.get('entries') ?? {}));
  assert.deepEqual(entries.map(e => e.shoutId), [original.id]);
  assert.equal((await publicRemovalPilotStatus(db, f.plan)).receipts, 7);
});

test('the prescribed comment-before-Shout order is part of the accepted pilot proof', { skip: !enabled }, async t => {
  const f = await fixture(t); await seedPublicRemovalPilot(db, f.plan); await decision(f, 0); await decision(f, 1);
  await assert.rejects(publicRemovalPilotStatus(db, f.plan), /wrong-decision-order/);
  await assert.rejects(cleanupPublicRemovalPilot(db, f.plan), /wrong-decision-order/);
  assert((await ref(f.rows[0]).get()).exists);
});
