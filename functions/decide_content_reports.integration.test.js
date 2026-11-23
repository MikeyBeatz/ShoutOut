import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { decideContentReportsOperation as decide } from './decide_content_reports.js';
import { createContentReportOperation as reportContent } from './create_content_report.js';
import { operationTestKey } from './test_helpers.js';
import { operationRetryWindowMillis as week } from './operation_retention.js';
import { receiptMayBePurged, cleanupExpiredOperationReceipts } from './cleanup_operation_receipts.js';
import { archiveAccountContentPage } from './account_content_archive.js';
import { accountPurgeStages, queryAccountPurgeStage, purgeScrubPatch } from './account_purge_policy.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'basic-report-decisions') : null, db = app ? getFirestore(app) : null;
const fixtures = [], code = expected => error => error.code === expected;
async function fixture(type = 'shout', count = 1, now = new Date()) {
  const mod = randomUUID(), other = randomUUID(), author = randomUUID(), reporters = Array.from({ length: Math.max(count, 2) }, () => randomUUID());
  const actorIds = [mod, other, author, ...reporters.slice(0, 2)];
  for (const uid of actorIds) {
    await db.doc(`users/${uid}`).set({ nickname: 'Synthetic decision account' }); await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  }
  const role = { level: 3, moderationScope: { countries: ['CZ'] } };
  for (const uid of [mod, other]) await db.doc(`accountRoles/${uid}`).set(role);
  const shout = db.doc(`shouts/${randomUUID()}`); await shout.set({ authorId: author, title: 'Synthetic report target', text: 'Synthetic content',
    createdAt: Timestamp.fromDate(now), status: 'active', geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' },
    likesCount: 4, dislikesCount: 1, savesCount: 2, commentsCount: 1 });
  const source = type === 'shout' ? shout : shout.collection(type === 'comment' ? 'comments' : 'privateReplies').doc(randomUUID());
  if (type !== 'shout') await source.set({ authorId: author, text: 'Synthetic content', createdAt: Timestamp.fromDate(now),
    ...(type === 'privateReply' ? { recipientId: reporters[0], participants: [author, reporters[0]] } : {}) });
  const collection = { shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' }[type];
  const reports = [];
  for (let i = 0; i < count; i++) {
    const ref = db.doc(`${collection}/${reporters[i]}_${shout.id}${type === 'shout' ? '' : `_${source.id}`}`);
    await ref.set({ reporterId: reporters[i], shoutId: shout.id, createdAt: Timestamp.fromDate(now), status: 'open', reason: 'Synthetic report',
      ...(type === 'comment' ? { commentId: source.id } : type === 'privateReply' ? { privateReplyId: source.id, authorId: author, text: 'Synthetic content' } : {}) }); reports.push(ref);
  }
  const clearance = db.doc(`moderationClearances/${type}_${shout.id}${type === 'shout' ? '' : `_${source.id}`}`);
  const request = (decision = 'approve', uid = mod, label = decision) => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: {
    expectedUserId: uid, targetType: type, shoutId: shout.id, ...(type === 'shout' ? {} : { targetId: source.id }), reportIds: reports.map(r => r.id),
    decision, note: 'Synthetic decision note', idempotencyKey: operationTestKey(label, now),
  } });
  const f = { now, mod, other, author, reporters, actorIds, shout, source, reports, clearance, role, type, request,
    receipt: (decision = 'approve', uid = mod, label = decision) => db.doc(`serverOperations/${createHash('sha256').update(`${uid}\ndecideContentReports\n${operationTestKey(label, now)}`).digest('hex')}`),
    clock: (delta = 0) => () => new Date(now.getTime() + delta) };
  fixtures.push(f); return f;
}
after(async () => {
  if (!app) return;
  for (const f of fixtures) {
    await db.recursiveDelete(f.shout); await f.clearance.delete();
    for (const collection of ['reports', 'commentReports', 'privateReplyReports']) await Promise.all((await db.collection(collection).where('shoutId', '==', f.shout.id).get()).docs.map(d => d.ref.delete()));
    for (const uid of f.actorIds) {
      await db.recursiveDelete(db.doc(`users/${uid}`)); await db.recursiveDelete(db.doc(`rateLimits/${uid}`));
      for (const c of ['accountRoles', 'moderators', 'bans', 'accountDeletionRequests']) await db.doc(`${c}/${uid}`).delete();
      for (const d of (await db.collection('serverOperations').where('userId', '==', uid).get()).docs) await d.ref.delete();
    }
    for (const d of (await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.author).get()).docs) await db.recursiveDelete(d.ref);
  }
  await db.terminate(); await deleteApp(app);
});
function meter(raw, { failAfterWrites = Infinity, afterQuery = null } = {}) {
  const counts = { reads: 0, writes: 0 }; let injected = false;
  const wrapped = new Proxy(raw, { get(target, key) {
    if (key === 'runTransaction') return callback => target.runTransaction(tx => callback(new Proxy(tx, { get(transaction, method) {
      if (method === 'getAll') return (...refs) => { counts.reads += refs.length; return transaction.getAll(...refs); };
      if (method === 'get') return async ref => {
        const result = await transaction.get(ref); counts.reads += result.docs ? Math.max(1, result.size) : 1;
        if (result.docs && afterQuery && !injected) { injected = true; await afterQuery(); } return result;
      };
      if (['create', 'update', 'set', 'delete'].includes(method)) return (...args) => { if (counts.writes >= failAfterWrites) throw Error('injected-write-failure'); counts.writes++; return transaction[method](...args); };
      const value = transaction[method]; return typeof value === 'function' ? value.bind(transaction) : value;
    } })));
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } }); return { database: wrapped, counts };
}
for (const type of ['shout', 'comment', 'privateReply']) for (const decision of ['approve', 'escalate', 'resolve']) test(`${type}: ${decision} atomically records the existing decision and preserves content/counters`, { skip: !enabled }, async () => {
  const f = await fixture(type), original = await f.source.get(), parent = await f.shout.get(), before = await f.reports[0].get(), m = meter(db);
  assert.deepEqual(await decide(f.request(decision), m.database, f.clock()), { decision, count: 1 });
  const r = await f.reports[0].get(), receipt = await f.receipt(decision).get();
  for (const field of ['reason', 'reporterId', 'text', 'authorId', 'createdAt']) assert.deepEqual(r.get(field), before.get(field));
  assert.equal(r.get('status'), decision === 'escalate' ? 'escalated' : 'resolved');
  assert.equal(r.get(decision === 'escalate' ? 'escalatedBy' : 'resolvedBy'), f.mod);
  assert.equal(r.get(decision === 'escalate' ? 'escalationOperationId' : 'decisionOperationId'), receipt.id);
  assert((await f.source.get()).updateTime.isEqual(original.updateTime)); assert((await f.shout.get()).updateTime.isEqual(parent.updateTime));
  assert.equal((await f.clearance.get()).exists, decision === 'approve');
  assert.equal(receipt.get('expiresAt').toMillis(), f.now.getTime() + week);
  for (const field of ['text', 'note', 'reason', 'moderatorNote']) assert.equal(receipt.get(field), undefined);
  assert.deepEqual([m.counts.reads, m.counts.writes], [type === 'shout' ? 11 : 12, decision === 'approve' ? 3 : 2]);
  const replay = meter(db); await decide(f.request(decision), replay.database, f.clock(2000)); assert.deepEqual([replay.counts.reads, replay.counts.writes], [9, 0]);
  if (decision === 'approve' && type === 'comment') writeFileSync(new URL('../build/report-decisions-measurement.json', import.meta.url), JSON.stringify({ model: 'Emulator SDK calls, not cloud billing or capacity',
    childFirst: m.counts, childReplay: replay.counts, rootFirst: { reads: 11, writes: 3 }, fiftyChildReports: { reads: 61, writes: 52 }, maximumRowsInspected: 51 }, null, 2) + '\n');
  if (decision === 'approve') await assert.rejects(reportContent({ ...f.request(), auth: { uid: f.reporters[1], token: { email: 'f@example.test', email_verified: true } }, data: {
    expectedUserId: f.reporters[1], idempotencyKey: operationTestKey('new-report', f.now), targetType: type, shoutId: f.shout.id, ...(type === 'shout' ? {} : { targetId: f.source.id }), reason: 'Another report',
  } }, db, f.clock()), e => ['failed-precondition', 'not-found'].includes(e.code));
});
test('complete group of fifty commits as one unit; fifty-one and stale groups write nothing', { skip: !enabled }, async () => {
  const f = await fixture('comment', 50), m = meter(db); await decide(f.request(), m.database, f.clock());
  assert.equal((await f.clearance.get()).get('sourceReportIds').length, 50); assert.deepEqual(m.counts, { reads: 61, writes: 52 });
  const large = await fixture('comment', 51), request = large.request(); request.data.reportIds.pop();
  await assert.rejects(decide(request, db, large.clock()), code('failed-precondition')); assert.equal((await large.clearance.get()).exists, false);
  assert((await large.reports[0].get()).get('status') === 'open');
  const stale = await fixture('shout', 2), partial = stale.request(); partial.data.reportIds.pop();
  await assert.rejects(decide(partial, db, stale.clock()), code('failed-precondition'));
  assert.equal((await stale.receipt().get()).exists, false);
});
test('concurrent identical retries commit once, and competing moderators cannot overwrite the audit', { skip: !enabled }, async () => {
  const f = await fixture('comment', 2);
  await Promise.all(Array.from({ length: 3 }, () => decide(f.request(), db, f.clock())));
  assert.equal((await db.collection('serverOperations').where('shoutId', '==', f.shout.id).get()).size, 1);
  await assert.rejects(decide({ ...f.request(), data: { ...f.request().data, note: 'Changed note' } }, db, f.clock()), code('already-exists'));
  const race = await fixture(); const results = await Promise.allSettled([decide(race.request('resolve'), db, race.clock()), decide(race.request('approve', race.other), db, race.clock())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal((await db.collection('serverOperations').where('shoutId', '==', race.shout.id).get()).size, 1);
});
test('current role, scope, eligibility and escalated authority are checked on first call and replay', { skip: !enabled }, async () => {
  const f = await fixture(); await db.doc(`accountRoles/${f.mod}`).update({ moderationScope: { countries: ['DE'] } });
  await assert.rejects(decide(f.request(), db, f.clock()), code('permission-denied'));
  await db.doc(`accountRoles/${f.mod}`).set(f.role); await f.reports[0].update({ status: 'escalated' });
  await assert.rejects(decide(f.request(), db, f.clock()), code('permission-denied'));
  await db.doc(`accountRoles/${f.mod}`).update({ level: 4 }); await decide(f.request(), db, f.clock());
  await db.doc(`accountRoles/${f.mod}`).update({ level: 3 }); await assert.rejects(decide(f.request(), db, f.clock()), code('permission-denied'));
  await db.doc(`accountRoles/${f.mod}`).update({ level: 4 }); await db.doc(`accountDeletionRequests/${f.mod}`).set({ userId: f.mod });
  await assert.rejects(decide(f.request(), db, f.clock()), code('failed-precondition'));
});
test('missing/recreated sources, forged report ownership and failed writes preserve the whole group', { skip: !enabled }, async () => {
  for (const type of ['shout', 'comment', 'privateReply']) {
    const f = await fixture(type); const data = (await f.source.get()).data(); await f.source.delete();
    await assert.rejects(decide(f.request(), db, f.clock()), e => ['not-found', 'permission-denied'].includes(e.code)); await f.source.set(data);
    await assert.rejects(decide(f.request(), db, f.clock()), code('failed-precondition'));
    assert.equal((await f.reports[0].get()).get('status'), 'open'); assert.equal((await f.receipt().get()).exists, false);
  }
  const f = await fixture('privateReply'); await f.reports[0].update({ authorId: f.reporters[1] });
  await assert.rejects(decide(f.request(), db, f.clock()), code('failed-precondition'));
  const rollback = await fixture('comment', 3);
  await assert.rejects(decide(rollback.request(), meter(db, { failAfterWrites: 4 }).database, rollback.clock()), /injected/);
  assert((await db.getAll(...rollback.reports)).every(r => r.get('status') === 'open'));
  assert.equal((await rollback.clearance.get()).exists, false); assert.equal((await rollback.receipt().get()).exists, false);
});
test('a new report committed during decision cannot escape an accepted complete-group decision', { skip: !enabled }, async () => {
  const f = await fixture(), newReport = { auth: { uid: f.reporters[1], token: { email: 'f@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: {
    expectedUserId: f.reporters[1], targetType: 'shout', shoutId: f.shout.id, reason: 'New concurrent report', idempotencyKey: operationTestKey('concurrent-new-report', f.now),
  } };
  const m = meter(db, { afterQuery: () => reportContent(newReport, db, f.clock()) });
  const result = await Promise.allSettled([decide(f.request(), m.database, f.clock())]);
  const extra = await db.doc(`reports/${f.reporters[1]}_${f.shout.id}`).get();
  if (extra.exists && extra.get('status') === 'open') assert.equal(result[0].status, 'rejected', 'no new pending report may be omitted by a successful decision');
  else assert((await f.clearance.get()).exists);
});
const missingAuth = { async getUser() { throw Object.assign(Error('missing'), { code: 'auth/user-not-found' }); } };
test('account archive and decision race without recreating removed content, evidence or clearances on replay', { skip: !enabled }, async () => {
  const f = await fixture('privateReply'), request = db.doc(`accountDeletionRequests/${f.author}`);
  await request.create({ userId: f.author, status: 'pending' });
  const identity = { projectId: db.projectId, userId: f.author, requestCreateTime: (await request.get()).createTime };
  const result = await Promise.allSettled([
    archiveAccountContentPage(identity, db, missingAuth, { kind: 'privateReply', pageSize: 1, transactionGuard: async () => () => {} }),
    decide(f.request(), db, f.clock()),
  ]);
  assert.equal(result[0].status, 'fulfilled'); assert.equal((await f.source.get()).exists, false);
  const rows = await db.collection('accountContentArchive').where('sourcePath', '==', f.source.path).get(); assert.equal(rows.size, 1);
  assert.equal(rows.docs[0].get('content.text'), 'Synthetic content');
  const report = await f.reports[0].get(); assert.equal(report.get('text'), 'Synthetic content');
  if (result[1].status === 'fulfilled') {
    await f.clearance.delete(); await decide(f.request(), db, f.clock(1000)); assert.equal((await f.clearance.get()).exists, false);
  } else { assert.equal(result[1].reason.code, 'not-found'); assert.equal((await f.clearance.get()).exists, false); }
  assert.equal((await f.source.get()).exists, false);
});
test('retained report actor scrubbing preserves evidence and account deletion blocks later recreation', { skip: !enabled }, async () => {
  const f = await fixture('comment'); await decide(f.request('resolve'), db, f.clock());
  const ref = f.reports[0], before = await ref.get(); await db.doc(`accountDeletionRequests/${f.mod}`).set({ userId: f.mod });
  const stage = accountPurgeStages(f.mod).find(s => s.collection === 'commentReports' && s.field === 'resolvedBy');
  const selected = await queryAccountPurgeStage(db, stage, f.mod).get(); assert.equal(selected.docs[0].id, ref.id);
  await db.runTransaction(async tx => { const row = await tx.get(ref); tx.update(ref, purgeScrubPatch(row.data(), stage.action, stage.field)); });
  const after = await ref.get(); assert.equal(after.get('resolvedBy'), undefined);
  for (const field of ['reason', 'reporterId', 'resolvedAt', 'decisionOperationId']) assert.deepEqual(after.get(field), before.get(field));
  await assert.rejects(decide(f.request('resolve'), db, f.clock(1000)), code('failed-precondition'));
  assert.equal((await ref.get()).get('resolvedBy'), undefined);
});
test('seven-day expiry, physical receipt cleanup and expired retry do not perform a second decision', { skip: !enabled }, async () => {
  const f = await fixture('shout', 1, new Date(Date.now() - 3 * 86400000));
  await decide(f.request(), db, f.clock()); const receipt = await f.receipt().get(), report = await f.reports[0].get();
  assert.equal(receiptMayBePurged(receipt.data(), Timestamp.fromMillis(f.now.getTime() + week - 1)), false);
  assert.equal(receiptMayBePurged(receipt.data(), Timestamp.fromMillis(f.now.getTime() + week)), true);
  const cleanup = await cleanupExpiredOperationReceipts(db, { clock: f.clock(week), maximum: 1, pageSize: 1 }); assert.equal(cleanup.deleted, 1);
  assert.equal((await f.receipt().get()).exists, false);
  await assert.rejects(decide(f.request(), db, f.clock(week + 1)), code('failed-precondition'));
  assert((await f.reports[0].get()).updateTime.isEqual(report.updateTime)); assert((await f.clearance.get()).exists);
});
test('malformed replay receipts cannot acknowledge another group or change the recorded decision', { skip: !enabled }, async () => {
  const f = await fixture('comment'); await decide(f.request(), db, f.clock());
  const receipt = await f.receipt().get(), report = await f.reports[0].get();
  for (const patch of [{ reportIds: ['foreign'] }, { targetId: 'foreign' }, { authorId: null }, { requiredRoleLevel: 1 }, { result: { decision: 'approve', count: 2 } }]) {
    await receipt.ref.set({ ...receipt.data(), ...patch });
    await assert.rejects(decide(f.request(), db, f.clock(1000)), code('failed-precondition'));
  }
  await receipt.ref.set(receipt.data()); assert((await f.reports[0].get()).updateTime.isEqual(report.updateTime));
});
