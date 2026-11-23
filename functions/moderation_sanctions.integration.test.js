import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { sanctionContentOperation as sanction, revokeSanctionOperation as revoke, sanctionActions } from './moderation_sanctions.js';
import { operationTestKey } from './test_helpers.js';
import { receiptMayBePurged } from './cleanup_operation_receipts.js';
import { accountPurgeLinks, purgeScrubPatch } from './account_purge_policy.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'sanction-core') : null, db = app ? getFirestore(app) : null;
const day = 86400000, code = expected => e => e.code === expected;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t, type = 'comment', count = 1) {
  const ids = Array.from({ length: 5 }, () => randomUUID()), [mod, senior, author, reporter, peer] = ids, now = new Date();
  const refs = [];
  const add = async (path, data) => { const ref = db.doc(path); await ref.set(data); refs.push(ref); return ref; };
  t.after(async () => {
    for (const ref of refs.reverse()) await db.recursiveDelete(ref);
    for (const uid of ids) {
      for (const c of ['sanctions', 'warnings', 'sanctionRevocations', 'serverOperations']) {
        for (const field of ['userId', 'authorId']) for (const d of (await db.collection(c).where(field, '==', uid).get()).docs) await d.ref.delete();
      }
      for (const c of ['bans', 'contentRestrictions', 'publicProfiles', 'accountDeletionRequests', 'accountRoles', 'moderators']) await db.doc(`${c}/${uid}`).delete();
    }
  });
  for (const uid of ids) { await add(`users/${uid}`, { nickname: 'Synthetic sanction account' }); await add(`users/${uid}/legal/acceptance_2026_07_25`, {}); }
  for (const [uid, level] of [[mod, 3], [senior, 4], [peer, 3]]) await add(`accountRoles/${uid}`, { level, moderationScope: { countries: ['CZ'] } });
  const shout = await add(`shouts/${randomUUID()}`, { authorId: author, title: 'Synthetic sanction', text: 'Public source', status: 'active',
    createdAt: Timestamp.fromDate(now), geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, commentsCount: 1 });
  const source = type === 'shout' ? shout : await add(`${shout.path}/${type === 'comment' ? 'comments' : 'privateReplies'}/${randomUUID()}`, {
    authorId: author, text: 'Synthetic child', createdAt: Timestamp.fromDate(now),
    ...(type === 'privateReply' ? { recipientId: reporter, participants: [author, reporter] } : {}) });
  const reports = [];
  for (let i = 0; i < count; i++) {
    const who = i ? randomUUID() : reporter;
    reports.push(await add(`${{ shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' }[type]}/${who}_${shout.id}${type === 'shout' ? '' : `_${source.id}`}`, {
      shoutId: shout.id, reporterId: who, reason: 'Synthetic report', createdAt: Timestamp.fromDate(now), status: 'open',
      ...(type === 'comment' ? { commentId: source.id } : type === 'privateReply' ? { privateReplyId: source.id, authorId: author, text: 'Synthetic child' } : {}) }));
  }
  const input = (decision = 'warning', uid = mod, label = decision, mode = 'report') => ({
    auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'emulator' }, data: {
      expectedUserId: uid, expectedTargetUserId: author, mode, decision, note: 'Concrete synthetic reason', targetType: type, shoutId: shout.id,
      ...(type === 'shout' ? {} : { targetId: source.id }), ...(mode === 'report' ? { reportIds: reports.map(r => r.id), sourceReportId: reports[0].id } : { expectedCreatedAt: now.getTime() }),
      idempotencyKey: operationTestKey(label, now) } });
  const revokeInput = (sanctionId, uid = mod, label = 'revoke') => ({ auth: { uid, token: { email: 'f@example.test', email_verified: true } },
    app: { appId: 'emulator' }, data: { expectedUserId: uid, sanctionId, note: 'Synthetic reviewed revocation', idempotencyKey: operationTestKey(label, now) } });
  return { now, ids, mod, senior, peer, author, reporter, source, shout, reports, input, revokeInput, add, clock: (delta = 0) => () => new Date(now.getTime() + delta) };
}
for (const type of ['shout', 'comment', 'privateReply']) test(`${type}: warning closes the entire group with a server snapshot and immutable audit`, { skip: !enabled }, async t => {
  const f = await fixture(t, type, type === 'privateReply' ? 1 : 2), before = await f.source.get();
  const result = await sanction(f.input(), db, f.clock()), record = await db.doc(`sanctions/${result.sanctionId}`).get();
  assert.deepEqual(result, { sanctionId: result.sanctionId, decision: 'warning', count: f.reports.length });
  assert.equal(record.get('sourceType'), 'report'); assert.equal(record.get('userId'), f.author); assert.equal(record.get('moderatorId'), f.mod);
  assert.equal(record.get('sourceReportId'), f.reports[0].id);
  assert.equal(record.get('contentSnapshot.shoutId'), f.shout.id); assert.equal(record.get('contentSnapshot.text'), before.get('text'));
  assert.equal(record.get('purgeAt').toMillis(), f.now.getTime() + 180 * day); assert.equal(record.get('previousSanctionsCount'), 0);
  assert((await db.doc(`warnings/${result.sanctionId}`).get()).exists); assert((await f.source.get()).updateTime.isEqual(before.updateTime));
  for (const ref of f.reports) { const r = await ref.get(); assert.equal(r.get('resolution'), 'sanctioned'); assert.equal(r.get('resolvedBy'), f.mod); assert.equal(r.get('decisionOperationId'), result.sanctionId); }
  const receipt = await db.doc(`serverOperations/${result.sanctionId}`).get();
  assert.equal(receipt.get('expiresAt').toMillis(), f.now.getTime() + 7 * day); assert.equal(receipt.get('reason'), undefined); assert.equal(receipt.get('contentSnapshot'), undefined);
  const time = receipt.updateTime; assert.deepEqual(await sanction(f.input(), db, f.clock(1000)), result); assert((await receipt.ref.get()).updateTime.isEqual(time));
  assert(receiptMayBePurged(receipt.data(), Timestamp.fromMillis(f.now.getTime() + 7 * day)));
});
for (const [action, policy] of Object.entries(sanctionActions)) test(`${action}: observation preserves the existing durations, authority, snapshot and retention`, { skip: !enabled }, async t => {
  const f = await fixture(t), actor = policy.role === 4 ? f.senior : f.mod, request = f.input(action, actor, action, 'observation');
  const result = await sanction(request, db, f.clock()), record = await db.doc(`sanctions/${result.sanctionId}`).get();
  assert.equal(record.get('sourceType'), 'moderatorObservation'); assert.equal(record.get('sourceReportId'), ''); assert.equal(result.count, 0);
  assert.equal(record.get('expiresAt')?.toMillis() ?? null, policy.days === null ? null : f.now.getTime() + policy.days * day);
  assert.equal(record.get('purgeAt').toMillis(), action === 'banPermanent' ? Date.UTC(9999, 11, 31) : f.now.getTime() + ((policy.days ?? 0) + policy.retention) * day);
  if (policy.type !== 'warning') assert.equal((await db.doc(`${policy.type === 'accountBan' ? 'bans' : 'contentRestrictions'}/${f.author}`).get()).get('sanctionId'), result.sanctionId);
  assert.equal((await f.reports[0].get()).get('status'), 'open');
});
test('role, geography, hierarchy, identity and mandatory reason fail without partial writes', { skip: !enabled }, async t => {
  const f = await fixture(t);
  for (const request of [f.input('ban90d'), f.input('banPermanent'), { ...f.input(), app: null },
    { ...f.input(), data: { ...f.input().data, note: '  ' } }, { ...f.input(), data: { ...f.input().data, expectedTargetUserId: f.peer } }])
    await assert.rejects(sanction(request, db, f.clock()));
  await db.doc(`accountRoles/${f.mod}`).update({ moderationScope: { countries: ['DE'] } }); await assert.rejects(sanction(f.input(), db, f.clock()), code('permission-denied'));
  await db.doc(`accountRoles/${f.mod}`).update({ moderationScope: { global: true } }); await db.doc(`accountRoles/${f.author}`).set({ level: 3 });
  await assert.rejects(sanction(f.input(), db, f.clock()), code('permission-denied'));
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 0); assert.equal((await f.reports[0].get()).get('status'), 'open');
});
test('deletion request and tombstone block sanction creation and safe replay', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.add(`accountDeletionRequests/${f.author}`, { requested: true });
  await assert.rejects(sanction(f.input(), db, f.clock()), code('failed-precondition')); await db.doc(`accountDeletionRequests/${f.author}`).delete();
  await f.add(`publicProfiles/${f.author}`, { accountStatus: 'deleted' }); await assert.rejects(sanction(f.input(), db, f.clock()), code('failed-precondition'));
  await db.doc(`publicProfiles/${f.author}`).delete(); const result = await sanction(f.input(), db, f.clock());
  await db.doc(`accountDeletionRequests/${f.author}`).set({ requested: true }); await assert.rejects(sanction(f.input(), db, f.clock(1000)), code('failed-precondition'));
  assert((await db.doc(`sanctions/${result.sanctionId}`).get()).exists);
});
test('lost response reuses one decision; changed payload, stale source and expired key are rejected', { skip: !enabled }, async t => {
  const f = await fixture(t), request = f.input('warning', f.mod, 'stable', 'observation'), result = await sanction(request, db, f.clock());
  await assert.rejects(sanction({ ...request, data: { ...request.data, note: 'Changed reason' } }, db, f.clock()), code('already-exists'));
  await assert.rejects(sanction({ ...f.input('warning', f.mod, 'stale', 'observation'), data: { ...request.data, expectedCreatedAt: f.now.getTime() - 1, idempotencyKey: operationTestKey('stale', f.now) } }, db, f.clock()), code('failed-precondition'));
  await assert.rejects(sanction(request, db, f.clock(7 * day)), /operation-expired/);
  await db.doc(`serverOperations/${result.sanctionId}`).delete(); await assert.rejects(sanction(request, db, f.clock(7 * day)), /operation-expired/);
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 1);
});
test('a shorter or equal decision records history without rewriting the stronger active binding', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await sanction(f.input('ban30d', f.mod, 'long', 'observation'), db, f.clock());
  const pointer = db.doc(`bans/${f.author}`), before = await pointer.get();
  await sanction(f.input('ban1d', f.mod, 'short', 'observation'), db, f.clock());
  await sanction(f.input('ban30d', f.mod, 'equal', 'observation'), db, f.clock());
  assert((await pointer.get()).updateTime.isEqual(before.updateTime)); assert.equal((await pointer.get()).get('sanctionId'), first.sanctionId);
  assert.equal((await db.collection('warnings').where('userId', '==', f.author).get()).size, 0);
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 3);
  const forever = await sanction(f.input('banPermanent', f.senior, 'forever', 'observation'), db, f.clock());
  const fixed = await pointer.get(); await sanction(f.input('ban90d', f.senior, 'finite', 'observation'), db, f.clock(1000));
  assert((await pointer.get()).updateTime.isEqual(fixed.updateTime)); assert.equal(fixed.get('sanctionId'), forever.sanctionId);
});
test('concurrent overlapping bans preserve the longest binding and both audit records', { skip: !enabled }, async t => {
  const f = await fixture(t);
  await Promise.all([sanction(f.input('ban1d', f.mod, 'short-race', 'observation'), db, f.clock()), sanction(f.input('ban30d', f.peer, 'long-race', 'observation'), db, f.clock())]);
  assert.equal((await db.doc(`bans/${f.author}`).get()).get('expiresAt').toMillis(), f.now.getTime() + 30 * day);
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 2);
});
test('revocation preserves original audit and retention and retries without deleting a newer binding', { skip: !enabled }, async t => {
  const f = await fixture(t), result = await sanction(f.input('restrict7d'), db, f.clock()), ref = db.doc(`sanctions/${result.sanctionId}`), original = await ref.get();
  const request = f.revokeInput(result.sanctionId); assert.deepEqual(await revoke(request, db, f.clock(1000)), { revoked: true });
  assert((await ref.get()).updateTime.isEqual(original.updateTime)); assert(!(await db.doc(`contentRestrictions/${f.author}`).get()).exists);
  const audit = await db.doc(`sanctionRevocations/${result.sanctionId}`).get(); assert(audit.get('purgeAt').isEqual(original.get('purgeAt')));
  const newer = await sanction(f.input('restrict1d', f.peer, 'new', 'observation'), db, f.clock(2000));
  assert.deepEqual(await revoke(request, db, f.clock(3000)), { revoked: true });
  assert.equal((await db.doc(`contentRestrictions/${f.author}`).get()).get('sanctionId'), newer.sanctionId);
});
test('only own temporary or senior revocation is allowed; stale pointers and second revocations fail atomically', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await sanction(f.input('ban1d', f.peer), db, f.clock());
  await assert.rejects(revoke(f.revokeInput(first.sanctionId), db, f.clock(1000)), code('permission-denied'));
  const newer = await sanction(f.input('ban7d', f.peer, 'replace', 'observation'), db, f.clock(1000));
  await assert.rejects(revoke(f.revokeInput(first.sanctionId, f.senior, 'stale'), db, f.clock(2000)), code('failed-precondition'));
  await revoke(f.revokeInput(newer.sanctionId, f.senior), db, f.clock(3000));
  await assert.rejects(revoke(f.revokeInput(newer.sanctionId, f.senior, 'again'), db, f.clock(4000)), code('already-exists'));
});
test('report groups over 50 and newly added reports are never partially sanctioned', { skip: !enabled }, async t => {
  const f = await fixture(t, 'shout', 51), request = f.input(); request.data.reportIds = request.data.reportIds.slice(0, 50);
  await assert.rejects(sanction(request, db, f.clock()), code('failed-precondition'));
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 0);
  assert((await Promise.all(f.reports.map(r => r.get()))).every(r => r.get('status') === 'open'));
});
test('all 50 reports commit together, and duplicate requests create one sanction only', { skip: !enabled }, async t => {
  const f = await fixture(t, 'shout', 50), request = f.input();
  const results = await Promise.all([sanction(request, db, f.clock()), sanction(request, db, f.clock())]);
  assert.deepEqual(results[0], results[1]); assert.equal(results[0].count, 50);
  assert((await Promise.all(f.reports.map(r => r.get()))).every(d => d.get('resolution') === 'sanctioned'));
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 1);
  assert.equal((await db.collection('warnings').where('userId', '==', f.author).get()).size, 1);
});
test('two moderators deciding the same report group never create two sanctions', { skip: !enabled }, async t => {
  const f = await fixture(t);
  const result = await Promise.allSettled([sanction(f.input(), db, f.clock()), sanction(f.input('warning', f.peer), db, f.clock())]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 1);
});
test('write failure rolls back sanction, active pointer, reports and operation receipt', { skip: !enabled }, async t => {
  const f = await fixture(t), wrapped = new Proxy(db, { get(object, key) {
    if (key === 'runTransaction') return callback => db.runTransaction(tx => {
      let writes = 0;
      return callback(new Proxy(tx, { get(transaction, method) {
        if (['create', 'update', 'set', 'delete'].includes(method)) return (...args) => { if (++writes === 3) throw Error('injected-sanction-write-failure'); return transaction[method](...args); };
        const value = transaction[method]; return typeof value === 'function' ? value.bind(transaction) : value;
      } }));
    });
    const value = object[key]; return typeof value === 'function' ? value.bind(object) : value;
  } });
  await assert.rejects(sanction(f.input('ban7d'), wrapped, f.clock()), /injected-sanction-write-failure/);
  assert(!(await db.doc(`bans/${f.author}`).get()).exists); assert.equal((await f.reports[0].get()).get('status'), 'open');
  assert.equal((await db.collection('sanctions').where('userId', '==', f.author).get()).size, 0);
  assert.equal((await db.collection('serverOperations').where('userId', '==', f.mod).get()).size, 0);
});
test('role withdrawal and deletion ingress serialize with sanction creation', { skip: !enabled }, async t => {
  for (const mutation of ['role', 'deletion']) {
    const f = await fixture(t), ref = db.doc(mutation === 'role' ? `accountRoles/${f.mod}` : `accountDeletionRequests/${f.author}`);
    const results = await Promise.allSettled([sanction(f.input(), db, f.clock()), ref.set(mutation === 'role' ? { level: 1 } : { requested: true })]);
    const changed = await ref.get(); assert.equal(results[1].status, 'fulfilled');
    const history = await db.collection('sanctions').where('userId', '==', f.author).get();
    if (results[0].status === 'fulfilled') {
      assert.equal(history.size, 1); assert(history.docs[0].updateTime.toMillis() <= changed.updateTime.toMillis());
    } else { assert.equal(history.size, 0); assert(['permission-denied', 'failed-precondition'].includes(results[0].reason.code)); }
  }
});
test('restrictions preserve longer validity and an expired binding can be replaced independently of a ban', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await sanction(f.input('restrict30d', f.mod, 'restriction', 'observation'), db, f.clock());
  const ref = db.doc(`contentRestrictions/${f.author}`), before = await ref.get();
  await sanction(f.input('restrict1d', f.mod, 'shorter', 'observation'), db, f.clock()); assert((await ref.get()).updateTime.isEqual(before.updateTime));
  const ban = await sanction(f.input('banPermanent', f.senior, 'permanent', 'observation'), db, f.clock());
  await ref.update({ expiresAt: Timestamp.fromMillis(f.now.getTime() - 1) });
  const fresh = await sanction(f.input('restrict7d', f.mod, 'fresh', 'observation'), db, f.clock());
  assert.notEqual(fresh.sanctionId, first.sanctionId); assert.equal((await ref.get()).get('sanctionId'), fresh.sanctionId);
  assert.equal((await db.doc(`bans/${f.author}`).get()).get('sanctionId'), ban.sanctionId);
});
test('the representative report remains linked for the existing 60-day reporter evidence cleanup', { skip: !enabled }, async t => {
  const f = await fixture(t, 'shout', 2), request = f.input();
  request.data.sourceReportId = f.reports[1].id;
  const result = await sanction(request, db, f.clock()), ref = db.doc(`sanctions/${result.sanctionId}`), before = await ref.get();
  assert.equal(before.get('sourceReportId'), f.reports[1].id);
  const link = accountPurgeLinks({ kind: 'report', reportId: f.reports[1].id }).find(l => l.collection === 'sanctions');
  let query = db.collection(link.collection); for (const [field, value, operator] of link.filters) query = query.where(field, operator ?? '==', value);
  const copied = await query.get(); assert.equal(copied.size, 1);
  await ref.update(purgeScrubPatch(before.data(), link.action));
  const scrubbed = await ref.get(); assert.equal(scrubbed.get('contentSnapshot'), undefined); assert.equal(scrubbed.get('reason'), undefined);
  assert.equal(scrubbed.get('userId'), f.author); assert.equal(scrubbed.get('type'), 'warning');
});
test('corrupt technical receipts and revocation links cannot acknowledge a false result', { skip: !enabled }, async t => {
  const f = await fixture(t), request = f.input('restrict7d'), result = await sanction(request, db, f.clock()), receipt = db.doc(`serverOperations/${result.sanctionId}`);
  await receipt.update({ targetId: 'foreign' }); await assert.rejects(sanction(request, db, f.clock()), code('failed-precondition'));
  await receipt.update({ targetId: f.source.id });
  const undo = f.revokeInput(result.sanctionId); await revoke(undo, db, f.clock(1000));
  const audit = db.doc(`sanctionRevocations/${result.sanctionId}`); await audit.update({ userId: 'foreign' });
  await assert.rejects(revoke(undo, db, f.clock(2000)), code('failed-precondition'));
});
