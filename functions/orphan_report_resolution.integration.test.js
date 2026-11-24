import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { decideContentReportsOperation as decide, orphanReportResolutionEnabled } from './decide_content_reports.js';
import { operationTestKey } from './test_helpers.js';
import { purgedShoutContext } from './shout_context.js';
import { receiptMayBePurged } from './cleanup_operation_receipts.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'orphan-report-core') : null, db = app ? getFirestore(app) : null;
const week = 7 * 86400000, code = expected => e => e.code === expected, option = { resolveUnavailableTargets: true };
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t, type = 'comment', count = 1) {
  const uid = randomUUID(), author = randomUUID(), reporters = Array.from({ length: count }, () => randomUUID()), now = new Date(), refs = [];
  const add = async (path, data) => { const r = db.doc(path); refs.push(r); await r.set(data); return r; };
  await add(`users/${uid}`, { nickname: 'Synthetic orphan moderator' }); await add(`users/${uid}/legal/acceptance_2026_07_25`, {});
  const role = await add(`accountRoles/${uid}`, { level: 3, moderationScope: { countries: ['CZ'] } });
  const shout = await add(`shouts/${randomUUID()}`, { authorId: author, title: 'Synthetic orphan', text: 'Body', createdAt: Timestamp.fromDate(now),
    status: 'active', geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' } });
  const source = type === 'shout' ? shout : await add(`${shout.path}/${type === 'comment' ? 'comments' : 'privateReplies'}/${randomUUID()}`, {
    authorId: author, text: 'Child body', createdAt: Timestamp.fromDate(now), ...(type === 'privateReply' ? { recipientId: reporters[0], participants: [author, reporters[0]] } : {}) });
  const reports = [];
  for (const reporter of reporters) reports.push(await add(`${{ shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' }[type]}/${reporter}_${shout.id}${type === 'shout' ? '' : `_${source.id}`}`, {
    reporterId: reporter, shoutId: shout.id, createdAt: Timestamp.fromDate(now), reason: 'Synthetic unavailable target', status: 'open',
    ...(type === 'comment' ? { commentId: source.id } : type === 'privateReply' ? { privateReplyId: source.id, authorId: author, text: 'Child body' } : {}) }));
  const input = (decision = 'resolve', label = decision) => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'emulator' },
    data: { expectedUserId: uid, targetType: type, shoutId: shout.id, ...(type === 'shout' ? {} : { targetId: source.id }),
      reportIds: reports.map(r => r.id), decision, note: 'Synthetic orphan review', idempotencyKey: operationTestKey(label, now) } });
  const receipt = (unavailable = true, label = 'resolve') => db.doc(`serverOperations/${createHash('sha256').update(`${uid}\n${unavailable ? 'resolveUnavailableContentReports' : 'decideContentReports'}\n${operationTestKey(label, now)}`).digest('hex')}`);
  t.after(async () => {
    for (const r of refs.reverse()) await db.recursiveDelete(r);
    for (const d of (await db.collection('serverOperations').where('userId', '==', uid).get()).docs) await d.ref.delete();
    await db.doc(`accountDeletionRequests/${uid}`).delete();
  });
  return { uid, author, now, role, shout, source, reports, input, receipt, clock: (delta = 0) => () => new Date(now.getTime() + delta) };
}
test('the approved DEV unavailable-target feature is enabled', () => { assert.equal(orphanReportResolutionEnabled, true); });
for (const type of ['comment', 'privateReply']) test(`${type}: unavailable child resolves atomically without claiming removal, changing evidence or recreating content`, { skip: !enabled }, async t => {
  const f = await fixture(t, type), before = await f.reports[0].get(), parent = await f.shout.get(); await f.source.delete();
  const result = await decide(f.input(), db, f.clock(), option); assert.deepEqual(result, { decision: 'resolve', count: 1 });
  const report = await f.reports[0].get(), receipt = await f.receipt().get();
  assert.equal(report.get('resolution'), 'noAction'); assert.equal(report.get('resolvedBy'), f.uid); assert.equal(report.get('decisionOperationId'), receipt.id);
  for (const field of ['text', 'authorId', 'reason', 'reporterId', 'createdAt']) assert.deepEqual(report.get(field), before.get(field));
  assert.equal(receipt.get('authorId'), undefined); assert.equal(receipt.get('targetUnavailable'), true); assert.equal(receipt.get('expiresAt').toMillis(), f.now.getTime() + week);
  assert(!(await f.source.get()).exists); assert((await f.shout.get()).updateTime.isEqual(parent.updateTime));
  const stamp = receipt.updateTime; assert.deepEqual(await decide(f.input(), db, f.clock(1000), option), result); assert((await receipt.ref.get()).updateTime.isEqual(stamp));
  assert(receiptMayBePurged(receipt.data(), Timestamp.fromMillis(f.now.getTime() + week)));
});
test('missing parent requires current global authority, never reporter-provided geography', { skip: !enabled }, async t => {
  const f = await fixture(t, 'shout'); await f.shout.delete();
  await assert.rejects(decide(f.input(), db, f.clock(), option), code('permission-denied'));
  await f.role.update({ level: 5 }); await decide(f.input(), db, f.clock(), option); assert((await f.receipt().get()).exists);
  await f.role.update({ level: 3 }); await assert.rejects(decide(f.input(), db, f.clock(1000), option), code('permission-denied'));
});
test('off, approval and escalation never silently resolve an unavailable child', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.source.delete();
  await assert.rejects(decide(f.input(), db, f.clock()), code('not-found'));
  for (const decision of ['approve', 'escalate']) await assert.rejects(decide(f.input(decision), db, f.clock(), option), code('not-found'));
  assert.equal((await f.reports[0].get()).get('status'), 'open'); assert(!(await f.receipt().get()).exists);
});
test('available content keeps the old receipt format and cannot be mislabeled unavailable', { skip: !enabled }, async t => {
  const f = await fixture(t); await decide(f.input(), db, f.clock(), option);
  const receipt = await f.receipt(false).get(); assert(receipt.exists); assert.equal(receipt.get('authorId'), f.author);
  assert.equal(receipt.get('targetUnavailable'), undefined); assert(!(await f.receipt().get()).exists);
  assert.deepEqual(await decide(f.input(), db, f.clock(1000)), { decision: 'resolve', count: 1 });
});
test('anonymous parent context preserves a foreign child and resolves as existing content, while a purged root resolves as unavailable', { skip: !enabled }, async t => {
  const f = await fixture(t), original = await f.source.get(); await f.shout.set(purgedShoutContext);
  await f.role.update({ level: 5 }); await decide(f.input(), db, f.clock(), option);
  assert((await f.source.get()).updateTime.isEqual(original.updateTime)); assert((await f.receipt(false).get()).exists);
  const root = await fixture(t, 'shout'); await root.shout.set(purgedShoutContext); await root.role.update({ level: 5 });
  await decide(root.input(), db, root.clock(), option); assert((await root.receipt().get()).exists);
  assert.deepEqual((await root.shout.get()).data(), purgedShoutContext);
});
test('escalated groups require senior permission and malformed private evidence remains open', { skip: !enabled }, async t => {
  const f = await fixture(t, 'privateReply'); await f.source.delete(); await f.reports[0].update({ status: 'escalated' });
  await assert.rejects(decide(f.input(), db, f.clock(), option), code('permission-denied'));
  await f.role.update({ level: 4 }); await f.reports[0].update({ authorId: 'bad/path' });
  await assert.rejects(decide(f.input(), db, f.clock(), option), code('failed-precondition'));
  assert.equal((await f.reports[0].get()).get('status'), 'escalated');
});
test('all 50 unavailable reports close together, while overflow and stale groups leave no writes', { skip: !enabled }, async t => {
  const f = await fixture(t, 'comment', 50); await f.source.delete(); await decide(f.input(), db, f.clock(), option);
  assert((await Promise.all(f.reports.map(r => r.get()))).every(r => r.get('resolution') === 'noAction'));
  const over = await fixture(t, 'comment', 51); await over.source.delete(); const request = over.input(); request.data.reportIds = request.data.reportIds.slice(0, 50);
  await assert.rejects(decide(request, db, over.clock(), option), code('failed-precondition'));
  assert((await Promise.all(over.reports.map(r => r.get()))).every(r => r.get('status') === 'open'));
});
test('a recreated parent cannot manufacture regional authority for an older missing child', { skip: !enabled }, async t => {
  const f = await fixture(t), parent = (await f.shout.get()).data(); await f.source.delete(); await f.shout.delete(); await f.shout.create(parent);
  await assert.rejects(decide(f.input(), db, f.clock(), option), code('permission-denied'));
  await f.role.update({ level: 5 }); await decide(f.input(), db, f.clock(), option);
});
test('expired orphan keys cannot execute again after physical receipt deletion', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.source.delete(); await decide(f.input(), db, f.clock(), option);
  await assert.rejects(decide(f.input(), db, f.clock(week), option), /operation-expired/); await f.receipt().delete();
  await assert.rejects(decide(f.input(), db, f.clock(week), option), /operation-expired/);
});
