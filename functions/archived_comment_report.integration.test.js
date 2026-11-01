import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { archiveAccountContentPage } from './account_content_archive.js';
import { getArchivedCommentReportTargetOperation as read } from './archived_comment_report.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'archived-report-tests') : null;
const db = app ? getFirestore(app) : null, roots = [], profiles = [];
after(async () => {
  if (!app) return;
  for (const ref of roots) await db.recursiveDelete(ref);
  for (const uid of profiles) {
    await db.recursiveDelete(db.doc(`users/${uid}`)); await db.doc(`accountRoles/${uid}`).delete();
    await db.doc(`moderators/${uid}`).delete(); await db.doc(`accountDeletionRequests/${uid}`).delete();
  }
  await db.terminate(); await deleteApp(app);
});
const request = (uid, reportId) => ({ auth: { uid, token: { email: 'moderator@example.test', email_verified: true } }, app: { appId: 'web' }, data: { reportId } });
async function actor(level = 3) {
  const uid = randomUUID(); profiles.push(uid);
  await db.doc(`users/${uid}`).set({ nickname: 'Actor' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  await db.doc(`accountRoles/${uid}`).set({ level }); return uid;
}
async function fixture() {
  const owner = randomUUID(), reporter = randomUUID(), moderator = await actor(); profiles.push(owner);
  const shout = db.doc(`shouts/${randomUUID()}`); roots.push(shout);
  await shout.set({ commentsCount: 1 });
  const source = shout.collection('comments').doc(randomUUID());
  await source.set({ authorId: owner, authorNickname: 'Original', text: 'Original reported text', createdAt: Timestamp.now(), privateExtra: 'do not return' });
  const report = db.doc(`commentReports/${reporter}_${shout.id}_${source.id}`); roots.push(report);
  await report.set({ reporterId: reporter, shoutId: shout.id, commentId: source.id, status: 'open', reason: 'Spam' });
  const marker = db.doc(`accountDeletionRequests/${owner}`); await marker.set({ userId: owner, status: 'pending' });
  const identity = { projectId: db.projectId, userId: owner, requestCreateTime: (await marker.get()).createTime };
  const result = await archiveAccountContentPage(identity, db, { getUser() { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); } },
    { kind: 'comment', transactionGuard: async () => () => {} });
  const archive = db.doc(`accountContentArchive/${result.archiveId}`); roots.push(archive);
  return { owner, reporter, moderator, shout, source, report, archive, request: request(moderator, report.id) };
}

test('an eligible moderator gets only the reported comment and an atomic access audit, even without its Shout', { skip: !enabled }, async () => {
  const f = await fixture(); await f.shout.delete();
  const response = await read(f.request, db);
  assert.equal(response.archived, true); assert.equal(response.targetData.text, 'Original reported text');
  assert.equal(response.targetData.authorId, f.owner); assert.equal(response.targetData.authorNickname, 'Original');
  assert.equal(typeof response.targetData.createdAtMillis, 'number'); assert(Number.isInteger(response.targetData.createdAtMillis));
  assert.equal('privateExtra' in response.targetData, false);
  const audit = await f.archive.collection('accessAudits').get(); assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].data().actorId, f.moderator); assert.equal(audit.docs[0].data().reportId, f.report.id);
  assert(!JSON.stringify(audit.docs[0].data()).includes('Original reported text'));
  assert(audit.docs[0].data().retainUntil.isEqual((await f.archive.get()).data().retainUntil));
});

test('ordinary users, deleted moderators and missing App Check cannot read retained comment text', { skip: !enabled }, async () => {
  const f = await fixture(), user = await actor(1);
  await assert.rejects(read(request(user, f.report.id), db), e => e.code === 'permission-denied');
  await assert.rejects(read({ ...f.request, app: undefined }, db), e => e.code === 'unauthenticated');
  await db.doc(`accountDeletionRequests/${f.moderator}`).set({ status: 'pending' });
  await assert.rejects(read(f.request, db), e => e.code === 'failed-precondition');
  assert.equal((await f.archive.collection('accessAudits').get()).size, 0);
});

test('lookup binds a real report, denies arbitrary selectors and respects the exact retention deadline', { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(read({ ...f.request, data: { reportId: f.report.id, archiveId: f.archive.id } }, db), e => e.code === 'invalid-argument');
  await assert.rejects(read(request(f.moderator, 'missing-report'), db), e => e.code === 'not-found');
  const deadline = (await f.archive.get()).data().retainUntil.toDate();
  await assert.rejects(read(f.request, db, () => deadline), e => e.code === 'not-found');
  assert.equal((await f.archive.collection('accessAudits').get()).size, 0);
});

test('report metadata cannot be repointed to a different comment incarnation', { skip: !enabled }, async () => {
  const f = await fixture();
  await f.report.update({ commentId: 'different' });
  await assert.rejects(read(f.request, db), e => e.code === 'failed-precondition');
  assert.equal((await f.archive.collection('accessAudits').get()).size, 0);
});

test('legacy moderator membership preserves existing report-reading authority', { skip: !enabled }, async () => {
  const f = await fixture(), legacy = await actor(1);
  await db.doc(`moderators/${legacy}`).set({ legacy: true });
  const response = await read(request(legacy, f.report.id), db); assert.equal(response.targetData.authorId, f.owner);
  assert.equal((await f.archive.collection('accessAudits').get()).docs[0].data().roleLevel, 3);
});
