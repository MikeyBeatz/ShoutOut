import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createModerationQueueDatabase, moderationReportTarget, moderationFilterToken } from './moderation_queue.js';
import { getModerationCasePageOperation } from './moderation_queue_reader.js';
import { currentLegalPolicy } from './legal_policy.js';
import { lifecycleTimes } from './content_lifecycle.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'moderation-queue-tests') : null;
const db = app ? getFirestore(app) : null;
const fixtures = [];
async function fixture() {
  const key = randomUUID().replaceAll('-', ''), shout = db.doc(`shouts/queue_${key}`), now = Timestamp.now();
  await db.doc('moderationQueueControl/current').set({ schemaVersion: 1, revision: 1, mode: 'building', incarnation: createHash('sha256').update('queue-test').digest('hex') });
  await shout.set({ authorId: `author_${key}`, createdAt: now, geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, geohash: 'u3078dx' });
  const report = n => db.doc(`reports/reporter${n}_${shout.id}`);
  const data = (n, extra = {}) => ({ reporterId: `reporter${n}`, shoutId: shout.id, reason: 'Synthetic only', status: 'open', createdAt: now, ...extra });
  const q = createModerationQueueDatabase(db, { enabled: true });
  const caseId = moderationReportTarget(report(0).path, data(0)).caseId, caseRef = db.doc(`moderationCases/${caseId}`);
  const uid = `mod_${key}`;
  const request = (extra = {}) => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: {
    expectedUserId: uid, category: 'all', order: 'mostReported', area: { kind: 'all', value: '' }, ...extra,
  } });
  const f = { shout, report, data, q, caseRef, now, uid, request }; fixtures.push(f); return f;
}
after(async () => {
  if (!db) return;
  for (const f of fixtures) {
    await db.recursiveDelete(f.shout); await db.recursiveDelete(f.caseRef);
    for (const collection of ['reports', 'commentReports', 'privateReplyReports']) for (const d of (await db.collection(collection).where('shoutId', '==', f.shout.id).get()).docs) await d.ref.delete();
    for (const d of (await db.collection('moderationCases').where('shoutId', '==', f.shout.id).get()).docs) await db.recursiveDelete(d.ref);
    await db.recursiveDelete(db.doc(`users/${f.uid}`));
    for (const c of ['accountRoles', 'moderators', 'bans', 'accountDeletionRequests']) await db.doc(`${c}/${f.uid}`).delete();
  }
  await db.doc('moderationQueueControl/current').delete(); await db.terminate(); await deleteApp(app);
});

test('off queue preserves object identity and zero database calls', () => {
  const raw = {}; assert.equal(createModerationQueueDatabase(raw), raw);
});
test('recreated target reports get a fresh case incarnation even with the same domain timestamp', { skip: !enabled }, async () => {
  const f = await fixture();
  await f.q.runTransaction(tx => tx.create(f.report(0), f.data(0)));
  const before = (await f.caseRef.get()).get('incarnation');
  await f.q.runTransaction(tx => tx.delete(f.report(0)));
  await f.q.runTransaction(tx => tx.create(f.report(0), f.data(0)));
  assert.notEqual((await f.caseRef.get()).get('incarnation'), before);
});
test('concurrent publications preserve exact counts and one source incarnation', { skip: !enabled }, async () => {
  const f = await fixture();
  await Promise.all([0, 1].map(n => f.q.runTransaction(async tx => tx.create(f.report(n), f.data(n)))));
  let d = (await f.caseRef.get()).data(); assert.equal(d.pendingCount, 2); assert.equal(d.openCount, 2);
  assert(d.filterTokens.includes(moderationFilterToken(3, 'shout', { kind: 'country', value: 'CZ' })));
  assert(d.filterTokens.includes(moderationFilterToken(4, 'all', { kind: 'geohash', value: 'u3078' })));
  assert.equal(d.reason, undefined); assert.equal(d.authorId, undefined); assert.equal(d.text, undefined);
  await f.q.runTransaction(async tx => tx.update(f.report(0), { status: 'escalated' }));
  d = (await f.caseRef.get()).data(); assert.equal(d.openCount, 1); assert.equal(d.escalatedCount, 1);
  await f.q.runTransaction(async tx => tx.update(f.report(1), { status: 'resolved' }));
  d = (await f.caseRef.get()).data(); assert.equal(d.pendingCount, 1);
  assert(!d.filterTokens.some(v => v.startsWith('3:')));
  await f.q.runTransaction(async tx => tx.delete(f.report(0)));
  assert(!(await f.caseRef.get()).exists); assert((await f.caseRef.collection('members').get()).empty);
});
test('boundary deletion and ties retain the correct earliest and newest report', { skip: !enabled }, async () => {
  const f = await fixture();
  await f.q.runTransaction(async tx => { for (let i = 0; i < 50; i++) tx.create(f.report(i), f.data(i)); });
  await f.q.runTransaction(async tx => { for (let i = 50; i < 100; i++) tx.create(f.report(i), f.data(i)); });
  const all = Array.from({ length: 100 }, (_, i) => f.report(i).path).sort();
  let d = (await f.caseRef.get()).data(); assert.equal(d.firstReportPath, all[0]); assert.equal(d.representativePath, all.at(-1));
  await f.q.runTransaction(async tx => { for (const path of all.slice(0, 50)) tx.delete(db.doc(path)); });
  d = (await f.caseRef.get()).data(); assert.equal(d.firstReportPath, all[50]); assert.equal(d.pendingCount, 50);
  await f.q.runTransaction(async tx => tx.delete(db.doc(all.at(-1))));
  d = (await f.caseRef.get()).data(); assert.equal(d.representativePath, all.at(-2));
});
test('building adoption is idempotent and active missing coverage fails closed', { skip: !enabled }, async () => {
  const f = await fixture(); await f.report(0).set(f.data(0));
  await f.q.runTransaction(async tx => tx.update(f.report(0), { queueVersion: 1 }));
  await f.q.runTransaction(async tx => tx.update(f.report(0), { queueVersion: 1 }));
  assert.equal((await f.caseRef.get()).get('pendingCount'), 1);
  await f.report(1).set(f.data(1)); await db.doc('moderationQueueControl/current').update({ mode: 'active' });
  await assert.rejects(f.q.runTransaction(async tx => tx.update(f.report(1), { status: 'resolved' })), /coverage-missing/);
  assert.equal((await f.report(1).get()).get('status'), 'open');
});
test('source, member and counters roll back on invalid control or shared budget', { skip: !enabled }, async () => {
  const f = await fixture();
  const small = createModerationQueueDatabase(db, { enabled: true, writeBudget: 2 });
  await assert.rejects(small.runTransaction(async tx => tx.create(f.report(0), f.data(0))), /write-budget/);
  assert(!(await f.report(0).get()).exists); assert(!(await f.caseRef.get()).exists);
  await db.doc('moderationQueueControl/current').update({ schemaVersion: 999 });
  await assert.rejects(f.q.runTransaction(async tx => tx.create(f.report(0), f.data(0))), /queue-unavailable/);
  assert(!(await f.report(0).get()).exists);
});

async function moderator(f, level = 3) {
  await db.doc(`users/${f.uid}`).set({ nickname: 'Synthetic staff' });
  await db.doc(`users/${f.uid}/legal/${currentLegalPolicy().acceptanceDocument}`).set({ acceptedAt: f.now });
  await db.doc(`accountRoles/${f.uid}`).set({ level, moderationScope: { countries: ['CZ'] } });
}
test('queue pages cover more than50 cases and exact grouping without content copies', { skip: !enabled }, async () => {
  const f = await fixture(); await moderator(f);
  const reports = Array.from({ length: 63 }, (_, n) => {
    const child = `child${String(n).padStart(3, '0')}`, ref = db.doc(`commentReports/reporter0_${f.shout.id}_${child}`);
    return { ref, data: { ...f.data(0), commentId: child, createdAt: Timestamp.fromMillis(f.now.toMillis() + n) } };
  });
  for (const report of reports) await f.shout.collection('comments').doc(report.data.commentId).set({ authorId: `author_${f.shout.id}`, text: 'Synthetic comment', createdAt: f.now });
  for (let n = 0; n < reports.length; n += 50) await f.q.runTransaction(async tx => { for (const r of reports.slice(n, n + 50)) tx.create(r.ref, r.data); });
  const shared = reports[62];
  await f.q.runTransaction(async tx => { for (let i = 1; i < 50; i++) tx.create(db.doc(`commentReports/reporter${i}_${f.shout.id}_${shared.data.commentId}`), { ...shared.data, reporterId: `reporter${i}` }); });
  await db.doc('moderationQueueControl/current').update({ mode: 'active' });
  const first = await getModerationCasePageOperation(f.request({ category: 'comment' }), db);
  assert.equal(first.items.length, 50); assert.equal(first.items[0].pendingCount, 50); assert.equal(first.items[0].targetId, shared.data.commentId);
  assert(first.items.every(i => i.text === undefined && i.authorId === undefined));
  const second = await getModerationCasePageOperation(f.request({ category: 'comment', cursor: first.cursor }), db);
  assert.equal(second.items.length, 13); assert.equal(second.cursor, null);
  assert.equal(new Set([...first.items, ...second.items].map(i => i.caseId)).size, 63);
  const newest = await getModerationCasePageOperation(f.request({ category: 'comment', order: 'newest' }), db);
  const oldest = await getModerationCasePageOperation(f.request({ category: 'comment', order: 'oldest' }), db);
  assert.equal(newest.items[0].targetId, 'child062');
  assert.equal(oldest.items[0].targetId, 'child000');
  const filtered = await getModerationCasePageOperation(f.request({ category: 'comment', area: { kind: 'geohash', value: 'u3078' } }), db);
  assert.equal(filtered.items.length, 50);
  await assert.rejects(getModerationCasePageOperation(f.request({ category: 'shout', cursor: first.cursor }), db), /Refresh/);
  await db.doc(`accountRoles/${f.uid}`).update({ level: 4 });
  await assert.rejects(getModerationCasePageOperation(f.request({ category: 'comment', cursor: first.cursor }), db), /Refresh/);
});
test('metadata is global by Q01, but anonymous, unverified, users and ineligible staff fail', { skip: !enabled }, async () => {
  const f = await fixture(); await moderator(f);
  await f.shout.update({ geography: { schemaVersion: 1, countryCode: 'DE' } });
  await f.q.runTransaction(async tx => tx.create(f.report(0), f.data(0)));
  await db.doc('moderationQueueControl/current').update({ mode: 'active' });
  assert.equal((await getModerationCasePageOperation(f.request({ area: { kind: 'country', value: 'DE' } }), db)).items.length, 1);
  await assert.rejects(getModerationCasePageOperation({ ...f.request(), auth: null }, db), { code: 'unauthenticated' });
  await db.doc(`accountRoles/${f.uid}`).set({ level: 1 });
  await assert.rejects(getModerationCasePageOperation(f.request(), db), { code: 'permission-denied' });
  await moderator(f); await db.doc(`bans/${f.uid}`).set({ expiresAt: null });
  await assert.rejects(getModerationCasePageOperation(f.request(), db), { code: 'permission-denied' });
  await db.doc(`bans/${f.uid}`).delete(); await db.doc(`accountDeletionRequests/${f.uid}`).set({ userId: f.uid });
  await assert.rejects(getModerationCasePageOperation(f.request(), db), { code: 'failed-precondition' });
});
test('projector never treats a selected query or field mask as a full report', { skip: !enabled }, async () => {
  const f = await fixture(); await f.q.runTransaction(async tx => tx.create(f.report(0), f.data(0)));
  await f.q.runTransaction(async tx => {
    await tx.get(db.collection('reports').where('shoutId', '==', f.shout.id).select('status'));
    await tx.getAll(f.report(0), { fieldMask: ['status'] });
    tx.delete(f.report(0));
  });
  assert(!(await f.caseRef.get()).exists);
});
test('physical GC lag never extends reason visibility beyond content or earlier account deadline', { skip: !enabled }, async () => {
  const f = await fixture(); await moderator(f);
  const key = createHash('sha256').update(f.shout.id).digest('hex'), author = `author_${f.shout.id}`;
  const expires = Timestamp.fromMillis(f.now.toMillis() + 86400000), times = lifecycleTimes(expires);
  const archive = db.doc(`contentLifecycleArchive/${key}`), thread = db.doc(`contentLifecycleThreads/${f.shout.id}`);
  await archive.set({ schemaVersion: 1, sourcePath: f.shout.path, threadId: f.shout.id, threadCreatedAt: f.now, subjectUserIds: [author] });
  await thread.set({ schemaVersion: 1, shoutId: f.shout.id, sourceCreatedAt: f.now, plannedExpiresAt: expires, archivedAt: f.now, ...times });
  await f.q.runTransaction(async tx => tx.create(f.report(0), f.data(0, { contentArchiveKey: key, shoutArchiveKey: key, authorId: author })));
  await db.doc('moderationQueueControl/current').update({ mode: 'active' });
  assert.equal((await getModerationCasePageOperation(f.request(), db, () => f.now.toDate())).items.filter(i => i.caseId === f.caseRef.id).length, 1);
  assert.equal((await getModerationCasePageOperation(f.request(), db, () => times.retainUntil.toDate())).items.filter(i => i.caseId === f.caseRef.id).length, 0);
  const deletion = db.doc(`accountDeletionRequests/${author}`); await deletion.set({ userId: author, status: 'pending' });
  const requestedAt = (await deletion.get()).createTime;
  const before = new Date(requestedAt.toMillis() + 60 * 86400000 - 1), at = new Date(before.getTime() + 1);
  assert.equal((await getModerationCasePageOperation(f.request(), db, () => before)).items.filter(i => i.caseId === f.caseRef.id).length, 1);
  assert.equal((await getModerationCasePageOperation(f.request(), db, () => at)).items.filter(i => i.caseId === f.caseRef.id).length, 0);
  await archive.delete(); await thread.delete(); await deletion.delete();
});
