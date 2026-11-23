import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { removeReportedPublicContentOperation as remove, validatePublicContentRemoval } from './remove_reported_public_content.js';
import { decideContentReportsOperation as decide } from './decide_content_reports.js';
import { createContentReportOperation as reportContent } from './create_content_report.js';
import { deleteCommentOperation } from './delete_comment.js';
import { deleteShoutOperation } from './delete_shout.js';
import { createFeedRuntime, createFeedGenerationStore } from './feed_runtime.js';
import { encodeGeohash } from './geohash.js';
import { operationTestKey } from './test_helpers.js';
import { operationRetryWindowMillis as week } from './operation_retention.js';
import { receiptMayBePurged, cleanupExpiredOperationReceipts } from './cleanup_operation_receipts.js';
import { archiveAccountContentPage } from './account_content_archive.js';
import { accountPurgeStages } from './account_purge_policy.js';
import { purgedShoutContext } from './shout_context.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'public-report-removal') : null;
const db = app ? getFirestore(app) : null;
const missingAuth = { async getUser() { throw Object.assign(Error('absent'), { code: 'auth/user-not-found' }); } };
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const code = expected => error => error.code === expected;
const stubWriter = { async prepare() { return { apply() {} }; } };

async function fixture(t, type = 'comment', count = 1) {
  const now = new Date(), mod = randomUUID(), other = randomUUID(), author = randomUUID();
  const reporters = Array.from({ length: Math.max(count, 2) }, () => randomUUID());
  const users = [mod, other, author, ...reporters.slice(0, 2)];
  for (const uid of users) { await db.doc(`users/${uid}`).set({ nickname: 'Synthetic removal account' }); await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({}); }
  const role = { level: 3, moderationScope: { countries: ['CZ'] } };
  for (const uid of [mod, other]) await db.doc(`accountRoles/${uid}`).set(role);
  const shout = db.doc(`shouts/${randomUUID()}`), location = { latitude: 50.53, longitude: 14.13 };
  await shout.set({ authorId: author, authorNickname: 'Fixture', title: 'Synthetic public report', text: 'Retain the Shout body',
    createdAt: Timestamp.fromDate(now), expiresAt: Timestamp.fromMillis(now.getTime() + 86400000), status: 'active',
    location, geohash: encodeGeohash(location.latitude, location.longitude), categories: ['Dotaz'],
    geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, likesCount: 2, dislikesCount: 1, savesCount: 2, commentsCount: 1 });
  const source = type === 'shout' ? shout : shout.collection('comments').doc(randomUUID());
  if (type === 'comment') await source.set({ authorId: author, text: 'Synthetic public comment', createdAt: Timestamp.fromDate(now) });
  const collection = type === 'shout' ? 'reports' : 'commentReports', reports = [];
  for (let i = 0; i < count; i++) {
    const ref = db.doc(`${collection}/${reporters[i]}_${shout.id}${type === 'comment' ? `_${source.id}` : ''}`);
    await ref.set({ reporterId: reporters[i], shoutId: shout.id, ...(type === 'comment' ? { commentId: source.id } : {}),
      status: 'open', reason: 'Synthetic removal report', createdAt: Timestamp.fromDate(now) }); reports.push(ref);
  }
  const clearance = db.doc(`moderationClearances/${type}_${shout.id}${type === 'comment' ? `_${source.id}` : ''}`);
  const request = (uid = mod, label = 'remove') => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: {
    expectedUserId: uid, idempotencyKey: operationTestKey(label, now), targetType: type, shoutId: shout.id,
    ...(type === 'comment' ? { targetId: source.id } : {}), reportIds: reports.map(r => r.id), decision: 'remove', note: 'Synthetic note',
  } });
  const f = { now, type, mod, other, author, reporters, shout, source, reports, clearance, request, role,
    clock: (delta = 0) => () => new Date(now.getTime() + delta),
    receipt: (uid = mod, label = 'remove') => db.doc(`serverOperations/${createHash('sha256').update(`${uid}\nremoveReportedPublicContent\n${operationTestKey(label, now)}`).digest('hex')}`) };
  t.after(async () => {
    await db.recursiveDelete(shout); await clearance.delete();
    for (const c of ['reports', 'commentReports']) for (const r of (await db.collection(c).where('shoutId', '==', shout.id).get()).docs) await r.ref.delete();
    for (const uid of users) {
      for (const c of ['users', 'rateLimits', 'accountRoles', 'moderators', 'accountDeletionRequests', 'publicProfiles']) await db.recursiveDelete(db.doc(`${c}/${uid}`));
      for (const r of (await db.collection('serverOperations').where('userId', '==', uid).get()).docs) await r.ref.delete();
    }
    for (const r of (await db.collection('accountContentArchive').where('retentionOwnerId', '==', author).get()).docs) await db.recursiveDelete(r.ref);
  });
  return f;
}
const run = (f, database = db, options = { indexWriter: stubWriter }) => remove(f.request(), database, f.clock(), options);
function meter(raw, { failAt = Infinity, beforeQuery = null } = {}) {
  const counts = { reads: 0, writes: 0 }; let injected = false;
  const database = new Proxy(raw, { get(target, key) {
    if (key === 'runTransaction') return callback => target.runTransaction(tx => callback(new Proxy(tx, { get(transaction, method) {
      if (method === 'getAll') return (...refs) => { counts.reads += refs.length; return transaction.getAll(...refs); };
      if (method === 'get') return async ref => {
        if (typeof ref.where === 'function' && beforeQuery && !injected) { injected = true; await beforeQuery(); }
        const value = await transaction.get(ref); counts.reads += value.docs ? Math.max(1, value.size) : 1; return value; };
      if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => {
        if (++counts.writes === failAt) throw Error('injected-write-failure'); return transaction[method](...args);
      };
      const value = transaction[method]; return typeof value === 'function' ? value.bind(transaction) : value;
    } })));
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } }); return { database, counts };
}

test('public removal validates the bounded group and cannot accept private, unknown or duplicate fields', () => {
  const input = { expectedUserId: 'mod', idempotencyKey: 'key', targetType: 'comment', shoutId: 'root', targetId: 'child', reportIds: ['b', 'a'], decision: 'remove' };
  assert.deepEqual(validatePublicContentRemoval(input).reportIds, ['a', 'b']);
  for (const patch of [{ targetType: 'privateReply' }, { decision: 'approve' }, { reportIds: [] }, { reportIds: ['a', 'a'] }, { reportIds: Array(51).fill('a') }, { force: true }, { note: 'x'.repeat(501) }]) {
    assert.throws(() => validatePublicContentRemoval({ ...input, ...patch }), code('invalid-argument'));
  }
});

for (const type of ['shout', 'comment']) test(`${type}: content, complete reports and audit commit once; replay preserves all updateTimes`, { skip: !enabled }, async t => {
  const f = await fixture(t, type, 2), source = await f.source.get(), parent = await f.shout.get(), reports = await db.getAll(...f.reports);
  const foreign = f.shout.collection('privateReplies').doc('foreign'); await foreign.set({ text: 'Keep unrelated conversation' }); const beforeForeign = await foreign.get();
  const m = meter(db); assert.deepEqual(await run(f, m.database), { removed: true, count: 2 });
  if (type === 'shout') assert.deepEqual((await f.shout.get()).data(), { ...source.data(), status: 'deleted' });
  else { assert.equal((await f.source.get()).exists, false); assert.deepEqual((await f.shout.get()).data(), { ...parent.data(), commentsCount: 0 }); }
  const receipt = await f.receipt().get(), done = await db.getAll(...f.reports), committedParent = await f.shout.get();
  done.forEach((r, i) => { assert.equal(r.get('status'), 'resolved'); assert.equal(r.get('resolution'), 'contentRemoved'); assert.equal(r.get('resolvedBy'), f.mod);
    assert.equal(r.get('decisionOperationId'), receipt.id); for (const field of ['reason', 'reporterId', 'createdAt']) assert.deepEqual(r.get(field), reports[i].get(field)); });
  assert.equal(receipt.get('expiresAt').toMillis(), f.now.getTime() + week);
  for (const key of ['text', 'reason', 'note', 'moderatorNote']) assert.equal(receipt.get(key), undefined);
  const replay = meter(db); await run(f, replay.database); assert.equal(replay.counts.writes, 0);
  assert((await f.receipt().get()).updateTime.isEqual(receipt.updateTime)); assert((await f.shout.get()).updateTime.isEqual(committedParent.updateTime));
  const repeated = await db.getAll(...f.reports); repeated.forEach((r, i) => assert(r.updateTime.isEqual(done[i].updateTime)));
  assert((await foreign.get()).updateTime.isEqual(beforeForeign.updateTime)); assert.equal((await f.clearance.get()).exists, false);
  writeFileSync(new URL(`../build/public-removal-${type}-measurement.json`, import.meta.url), JSON.stringify({ model: 'Emulator SDK operations, not cloud cost/capacity', first: m.counts, replay: replay.counts }, null, 2));
});

test('fifty reports commit together; fifty-one, stale groups and changed incarnations have no partial writes', { skip: !enabled }, async t => {
  const f = await fixture(t, 'comment', 50); assert.equal((await run(f)).count, 50);
  const large = await fixture(t, 'comment', 51), request = large.request(); request.data.reportIds.pop();
  await assert.rejects(remove(request, db, large.clock()), code('failed-precondition')); assert((await large.source.get()).exists);
  const stale = await fixture(t, 'shout', 2), short = stale.request(); short.data.reportIds.pop();
  await assert.rejects(remove(short, db, stale.clock(), { indexWriter: stubWriter }), code('failed-precondition'));
  const replaced = await fixture(t), body = (await replaced.source.get()).data(); await replaced.source.delete(); await replaced.source.create(body);
  await assert.rejects(run(replaced), code('failed-precondition')); assert.equal((await replaced.reports[0].get()).get('status'), 'open');
});

test('competing moderators and identical retries preserve a single decision and one decrement', { skip: !enabled }, async t => {
  const f = await fixture(t, 'comment', 2);
  const results = await Promise.allSettled([run(f), run(f), remove(f.request(f.other), db, f.clock())]);
  assert(results.some(r => r.status === 'fulfilled')); assert.equal((await f.shout.get()).get('commentsCount'), 0);
  const receipts = await db.collection('serverOperations').where('shoutId', '==', f.shout.id).get(); assert.equal(receipts.size, 1);
  assert((await db.getAll(...f.reports)).every(r => r.get('resolvedBy') === receipts.docs[0].get('userId')));
});

test('concurrent approval and removal cannot both succeed or overwrite each other', { skip: !enabled }, async t => {
  const f = await fixture(t, 'shout'), approve = f.request(f.other, 'approve'); approve.data.decision = 'approve';
  const result = await Promise.allSettled([run(f), decide(approve, db, f.clock())]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  const report = await f.reports[0].get(), removed = report.get('resolution') === 'contentRemoved';
  assert.equal((await f.shout.get()).get('status'), removed ? 'deleted' : 'active');
  assert.equal((await f.clearance.get()).exists, !removed);
  assert.equal((await db.collection('serverOperations').where('shoutId', '==', f.shout.id).get()).size, 1);
});

test('current authority, escalation and scope apply on first call and on replay', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.reports[0].update({ status: 'escalated' });
  await assert.rejects(run(f), code('permission-denied')); await db.doc(`accountRoles/${f.mod}`).update({ level: 4 }); await run(f);
  for (const patch of [{ level: 3 }, { level: 2 }, { level: 4, moderationScope: { countries: ['US'] } }, { level: 4, accountStatus: 'deleted' }]) {
    await db.doc(`accountRoles/${f.mod}`).set({ ...f.role, ...patch }); await assert.rejects(run(f), code('permission-denied'));
  }
  await db.doc(`accountRoles/${f.mod}`).set({ level: 5 }); await run(f);
  await db.doc(`accountDeletionRequests/${f.mod}`).create({ userId: f.mod }); await assert.rejects(run(f), code('failed-precondition'));
  const fresh = await fixture(t); await db.doc(`accountRoles/${fresh.mod}`).set({ level: 3, moderationScope: { countries: ['US'] } });
  await assert.rejects(run(fresh), code('permission-denied')); assert((await fresh.source.get()).exists);
  const req = fresh.request(); delete req.app; await assert.rejects(remove(req, db, fresh.clock()), code('unauthenticated'));
});

test('approved/missing targets and an unusable writer cannot close reports or mutate content', { skip: !enabled }, async t => {
  const f = await fixture(t, 'shout'); await assert.rejects(remove(f.request(), db, f.clock()), code('failed-precondition'));
  await assert.rejects(run(f, db, { indexWriter: { async prepare() { return null; } } }), /invalid-public-removal-index-plan/);
  const req = f.request(); await decide({ ...req, data: { ...req.data, decision: 'approve', idempotencyKey: operationTestKey('approve', f.now) } }, db, f.clock());
  await assert.rejects(run(f), code('failed-precondition')); assert.equal((await f.shout.get()).get('status'), 'active');
  const missing = await fixture(t); await missing.source.delete(); await assert.rejects(run(missing), code('not-found'));
  assert.equal((await missing.reports[0].get()).get('status'), 'open');
});

test('shared comment deletion cooldown is retained, without charging replay or introducing a Shout bucket', { skip: !enabled }, async t => {
  const f = await fixture(t), rate = db.doc(`rateLimits/${f.mod}/actions/delete`);
  await rate.set({ lastAt: Timestamp.fromDate(f.now), windowStartedAt: Timestamp.fromDate(f.now), count: 1 });
  await assert.rejects(run(f), code('resource-exhausted')); assert((await f.source.get()).exists);
  await remove(f.request(), db, f.clock(1000)); const after = await rate.get(); await remove(f.request(), db, f.clock(2000));
  assert((await rate.get()).updateTime.isEqual(after.updateTime)); assert.equal(after.get('count'), 2);
  const shout = await fixture(t, 'shout'); await run(shout); assert.equal((await db.doc(`rateLimits/${shout.mod}/actions/delete`).get()).exists, false);
});

test('a failure after preparing content mutations rolls back source, counters, reports, rate and receipt', { skip: !enabled }, async t => {
  const f = await fixture(t, 'comment', 3), before = await f.shout.get();
  await assert.rejects(run(f, meter(db, { failAt: 5 }).database), /injected-write-failure/);
  assert((await f.source.get()).exists); assert((await f.shout.get()).updateTime.isEqual(before.updateTime));
  assert((await db.getAll(...f.reports)).every(r => r.get('status') === 'open')); assert.equal((await f.receipt().get()).exists, false);
  assert.equal((await db.doc(`rateLimits/${f.mod}/actions/delete`).get()).exists, false);
});

test('a concurrent new report cannot be silently omitted from a successful complete-group transaction', { skip: !enabled }, async t => {
  const f = await fixture(t, 'shout'), uid = f.reporters[1];
  const m = meter(db, { beforeQuery: () => reportContent({ auth: { uid, token: { email: 'f@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: {
    expectedUserId: uid, targetType: 'shout', shoutId: f.shout.id, reason: 'Concurrent report', idempotencyKey: operationTestKey('new-report', f.now),
  } }, db, f.clock()) });
  const result = await Promise.allSettled([run(f, m.database)]), extra = await db.doc(`reports/${uid}_${f.shout.id}`).get();
  assert(extra.exists); assert.equal(result[0].status, 'rejected'); assert.equal((await f.shout.get()).get('status'), 'active');
  assert.equal((await f.receipt().get()).exists, false);
});

test('own deletion racing moderation cannot double-decrement, recreate content or leave half an audit', { skip: !enabled }, async t => {
  for (const type of ['shout', 'comment']) {
    const f = await fixture(t, type), req = f.request(f.author, 'own');
    req.data = { expectedUserId: f.author, idempotencyKey: req.data.idempotencyKey, shoutId: f.shout.id, ...(type === 'comment' ? { commentId: f.source.id } : {}) };
    const own = type === 'shout' ? deleteShoutOperation(req, db, f.clock(), { indexWriter: stubWriter }) : deleteCommentOperation(req, db, f.clock());
    const result = await Promise.allSettled([own, run(f)]);
    assert(result.some(r => r.status === 'fulfilled'));
    if (type === 'comment') { assert.equal((await f.source.get()).exists, false); assert.equal((await f.shout.get()).get('commentsCount'), 0); }
    else assert.equal((await f.shout.get()).get('status'), 'deleted');
    const receipt = await f.receipt().get(); assert.equal((await f.reports[0].get()).get('status') === 'resolved', receipt.exists);
  }
});

test('account archival and removal race without altering an archive or resurrecting content on replay', { skip: !enabled }, async t => {
  const f = await fixture(t), request = db.doc(`accountDeletionRequests/${f.author}`); await request.create({ userId: f.author, status: 'pending' });
  const identity = { projectId: db.projectId, userId: f.author, requestCreateTime: (await request.get()).createTime };
  const result = await Promise.allSettled([
    archiveAccountContentPage(identity, db, missingAuth, { kind: 'comment', pageSize: 1, transactionGuard: async () => () => {} }), run(f),
  ]);
  assert.equal(result[0].status, 'fulfilled'); assert.equal((await f.source.get()).exists, false); assert.equal((await f.shout.get()).get('commentsCount'), 0);
  const rows = await db.collection('accountContentArchive').where('sourcePath', '==', f.source.path).get();
  if (rows.size) assert.equal(rows.docs[0].get('content.text'), 'Synthetic public comment');
  if (result[1].status === 'fulfilled') { const before = rows.docs.map(d => d.updateTime); await run(f); const after = await db.collection('accountContentArchive').where('sourcePath', '==', f.source.path).get();
    assert.deepEqual(after.docs.map(d => d.updateTime), before); }
  else assert.equal(result[1].reason.code, 'not-found');
  assert(accountPurgeStages(f.mod).some(s => s.collection === 'commentReports' && s.field === 'resolvedBy' && s.action === 'scrub'));
  assert(accountPurgeStages(f.author).some(s => s.collection === 'serverOperations' && s.field === 'authorId'));
});

test('anonymous retained parent permits existing global comment moderation without restoring a deleted identity', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.shout.set(purgedShoutContext); await db.doc(`accountRoles/${f.mod}`).set({ level: 5 });
  await run(f); assert.deepEqual((await f.shout.get()).data(), purgedShoutContext); assert.equal((await f.source.get()).exists, false);
});

test('expired retries and malformed receipts cannot acknowledge or perform another removal', { skip: !enabled }, async t => {
  const f = await fixture(t); await run(f); const receipt = await f.receipt().get(), report = await f.reports[0].get();
  assert.equal(receiptMayBePurged(receipt.data(), Timestamp.fromMillis(f.now.getTime() + week - 1)), false);
  assert.equal(receiptMayBePurged(receipt.data(), Timestamp.fromMillis(f.now.getTime() + week)), true);
  for (const patch of [{ reportIds: ['foreign'] }, { targetId: 'foreign' }, { requiredRoleLevel: 1 }, { result: { removed: true, count: 2 } }]) {
    await receipt.ref.set({ ...receipt.data(), ...patch }); await assert.rejects(run(f), code('failed-precondition'));
  }
  await receipt.ref.set(receipt.data());
  const cleanup = await cleanupExpiredOperationReceipts(db, { clock: f.clock(week), maximum: 1, pageSize: 1 });
  assert.equal(cleanup.deleted, 1); assert.equal((await receipt.ref.get()).exists, false);
  await assert.rejects(remove(f.request(), db, f.clock(week + 1)), code('failed-precondition'));
  assert((await f.reports[0].get()).updateTime.isEqual(report.updateTime)); assert.equal((await f.source.get()).exists, false);
});

test('real two-generation writer removes indexed Shouts and updates comment projections atomically, preserving old snapshots', { skip: !enabled }, async t => {
  const f = await fixture(t, 'shout'), child = await fixture(t, 'comment'), ids = ['public-' + randomUUID().slice(0, 8), 'public-' + randomUUID().slice(0, 8)];
  const bodies = await db.getAll(f.shout, child.shout); await f.shout.delete(); await child.shout.delete();
  const control = db.doc('feedIndexControl/current');
  await control.set({ schemaVersion: 2, revision: 1, mode: 'building', readGenerationId: ids[0], writeGenerationIds: ids, cardReadGenerationId: ids[0], cardWriteGenerationIds: ids });
  for (const id of ids) await db.doc(`feedIndexGenerations/${id}`).create({ schemaVersion: 1, v: 2, cardProjection: 1, cardReady: true, readIdentity: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
  t.after(async () => { await control.delete(); for (const id of ids) await db.recursiveDelete(db.doc(`feedIndexGenerations/${id}`)); });
  const runtime = createFeedRuntime(db, missingAuth, { clock: f.clock(), newsRuntimeEnabled: false });
  for (const row of bodies) await runtime.database.runTransaction(async tx => {
    const plan = await runtime.indexWriter.prepare(tx, row.id, null, row.data()); plan.apply(); tx.create(row.ref, row.data());
  });
  // These test sources were recreated during index seeding; reports must refer
  // to that new incarnation rather than bypass the real incarnation guard.
  for (const ref of f.reports) { const row = await ref.get(); await ref.delete(); await ref.create(row.data()); }
  const store = createFeedGenerationStore(runtime.database, ids[0], { contentIdentity: 'generation', cardProjection: true });
  const viewNow = Math.max(f.now.getTime(), child.now.getTime()) + 1000;
  const old = await store.open({ point: { latitude: 50.53, longitude: 14.13 }, radiusKm: 1, now: viewNow });
  await remove(child.request(), runtime.database, child.clock(), { indexWriter: runtime.indexWriter });
  for (const id of ids) assert.equal((await db.doc(`feedIndexGenerations/${id}/publicStates/${child.shout.id}`).get()).get('commentsCount'), 0);
  await remove(f.request(), runtime.database, f.clock(), { indexWriter: runtime.indexWriter });
  for (const id of ids) assert.equal((await db.doc(`feedIndexGenerations/${id}/publicStates/${f.shout.id}`).get()).get('status'), 'deleted');
  const fresh = await store.open({ point: { latitude: 50.53, longitude: 14.13 }, radiusKm: 1, now: viewNow });
  const oldRows = (await old.page(old.first)).rows, nextRows = (await fresh.page(fresh.first)).rows;
  assert(oldRows.some(r => r.id === f.shout.id)); assert(!nextRows.some(r => r.id === f.shout.id)); assert(nextRows.some(r => r.id === child.shout.id));
  const rollback = await fixture(t, 'shout'), body = (await rollback.shout.get()).data(); await rollback.shout.delete();
  await runtime.database.runTransaction(async tx => { const plan = await runtime.indexWriter.prepare(tx, rollback.shout.id, null, body); plan.apply(); tx.create(rollback.shout, body); });
  for (const ref of rollback.reports) { const row = await ref.get(); await ref.delete(); await ref.create(row.data()); }
  const badWriter = { prepare: (tx, id, before, after, options) => runtime.indexWriter.prepare(tx, id, before, after, { ...options, additionalWrites: 450 }) };
  await assert.rejects(remove(rollback.request(), runtime.database, rollback.clock(), { indexWriter: badWriter }), /lab-mutation-too-large|feed-transaction-write-budget-exceeded/);
  assert.equal((await rollback.shout.get()).get('status'), 'active'); assert.equal((await rollback.reports[0].get()).get('status'), 'open'); assert.equal((await rollback.receipt().get()).exists, false);
});
