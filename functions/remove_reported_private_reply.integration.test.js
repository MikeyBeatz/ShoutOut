import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { removeReportedPrivateReplyOperation as remove } from './remove_reported_private_reply.js';
import { archiveAccountContentPage as archive } from './account_content_archive.js';
import { operationTestKey } from './test_helpers.js';
import { operationRetryWindowMillis as week } from './operation_retention.js';
import { receiptMayBePurged, cleanupExpiredOperationReceipts } from './cleanup_operation_receipts.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'private-moderation') : null, db = app ? getFirestore(app) : null;
const fixtures = [], code = expected => error => error.code === expected;
async function fixture() {
  const mod = randomUUID(), other = randomUUID(), author = randomUUID(), recipient = randomUUID(), now = new Date();
  const shout = db.doc(`shouts/${randomUUID()}`), source = shout.collection('privateReplies').doc(randomUUID()), continuation = shout.collection('privateReplies').doc(randomUUID());
  const report = db.doc(`privateReplyReports/${recipient}_${shout.id}_${source.id}`);
  for (const uid of [mod, other, author, recipient]) {
    await db.doc(`users/${uid}`).set({ nickname: 'Synthetic account' });
    await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  }
  const role = { role: 'moderator', level: 3, moderationScope: { global: false, countries: ['CZ'], subdivisions: [] } };
  for (const uid of [mod, other]) await db.doc(`accountRoles/${uid}`).set(role);
  await shout.set({ authorId: author, title: 'Synthetic moderation parent', status: 'active', geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' },
    commentsCount: 2, likesCount: 3, dislikesCount: 4, savesCount: 5 });
  const body = { authorId: author, recipientId: recipient, participants: [author, recipient], text: 'Synthetic private body', createdAt: Timestamp.fromDate(now), targetType: 'shout' };
  await source.set(body);
  await continuation.set({ ...body, authorId: recipient, recipientId: author, participants: [recipient, author], text: 'Other participant continuation', targetType: 'privateReply' });
  await report.set({ reporterId: recipient, authorId: author, shoutId: shout.id, privateReplyId: source.id, text: body.text,
    reason: 'Synthetic report reason', status: 'open', priority: 'high', createdAt: Timestamp.fromDate(now), preserve: 'snapshot-marker' });
  const key = label => operationTestKey(label, now);
  const request = (uid = mod, label = 'first', note = 'Synthetic moderator note') => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } },
    app: { appId: 'fixture' }, data: { expectedUserId: uid, reportId: report.id, idempotencyKey: key(label), note } });
  const f = { mod, other, author, recipient, now, shout, source, continuation, report, body, role, key, request,
    clock: (delta = 0) => () => new Date(now.getTime() + delta),
    receipt: (uid = mod, label = 'first') => db.doc(`serverOperations/${createHash('sha256').update(`${uid}\nremoveReportedPrivateReply\n${key(label)}`).digest('hex')}`) };
  fixtures.push(f); return f;
}
after(async () => {
  if (!app) return;
  for (const f of fixtures) {
    await db.recursiveDelete(f.shout); await f.report.delete();
    for (const uid of [f.mod, f.other, f.author, f.recipient]) {
      await db.recursiveDelete(db.doc(`users/${uid}`)); await db.recursiveDelete(db.doc(`rateLimits/${uid}`));
      for (const collection of ['accountRoles', 'moderators', 'bans', 'contentRestrictions', 'accountDeletionRequests']) await db.doc(`${collection}/${uid}`).delete();
      for (const d of (await db.collection('serverOperations').where('userId', '==', uid).get()).docs) await d.ref.delete();
    }
    for (const d of (await db.collection('accountContentArchive').where('retentionOwnerId', '==', f.author).get()).docs) await db.recursiveDelete(d.ref);
  }
  await db.terminate(); await deleteApp(app);
});
function meter(raw, failMethod = null) {
  const count = { reads: 0, writes: 0, paths: [] };
  const wrapped = new Proxy(raw, { get(target, key) {
    if (key === 'runTransaction') return (callback, options) => target.runTransaction(tx => {
      const proxy = new Proxy(tx, { get(transaction, method) {
        if (['get', 'getAll'].includes(method)) return (...refs) => { count.reads += refs.length; count.paths.push(...refs.map(r => r.path)); return transaction[method](...refs); };
        if (['create', 'update', 'set', 'delete'].includes(method)) return (...args) => {
          if (method === failMethod) throw Error(`injected-${method}-failure`);
          count.writes++; transaction[method](...args); return proxy;
        };
        const v = transaction[method]; return typeof v === 'function' ? v.bind(transaction) : v;
      } }); return callback(proxy);
    }, options);
    const v = target[key]; return typeof v === 'function' ? v.bind(target) : v;
  } }); return { db: wrapped, count };
}
async function untouched(f) {
  assert((await f.source.get()).exists); assert.equal((await f.report.get()).get('status'), 'open');
  assert.equal((await f.receipt().get()).exists, false);
}
test('one transaction removes only the reported root, preserves report evidence/parent/continuation and records a body-free seven-day receipt', { skip: !enabled }, async () => {
  const f = await fixture(), before = await f.report.get(), parent = await f.shout.get(), peer = await f.continuation.get();
  const rate = db.doc(`rateLimits/${f.mod}/actions/delete`); await rate.set({ unchanged: true }); const rateBefore = await rate.get();
  const first = meter(db); assert.deepEqual(await remove(f.request(), first.db, f.clock()), { removed: true });
  assert.deepEqual([first.count.reads, first.count.writes], [11, 3]); assert(!first.count.paths.some(p => /rateLimits|feedIndex|accountContentArchive/.test(p)));
  const report = await f.report.get(), receipt = (await f.receipt().get()).data();
  for (const [k, v] of Object.entries(before.data()).filter(([k]) => k !== 'status')) assert.deepEqual(report.get(k), v);
  assert.equal(report.get('status'), 'resolved'); assert.equal(report.get('resolution'), 'contentRemoved'); assert.equal(report.get('resolvedBy'), f.mod);
  assert(report.get('resolvedAt').isEqual(Timestamp.fromDate(f.now))); assert.equal(report.get('decisionOperationId'), f.receipt().id);
  assert.equal(report.get('moderatorNote'), 'Synthetic moderator note'); assert.equal((await f.source.get()).exists, false);
  assert((await f.shout.get()).updateTime.isEqual(parent.updateTime)); assert((await f.continuation.get()).updateTime.isEqual(peer.updateTime));
  assert((await rate.get()).updateTime.isEqual(rateBefore.updateTime));
  for (const k of ['text', 'note', 'moderatorNote', 'reason', 'recipientId']) assert.equal(receipt[k], undefined);
  assert.equal(receipt.expiresAt.toMillis(), f.now.getTime() + week); assert.equal(receipt.requiredRoleLevel, 3);
  const replay = meter(db); assert.deepEqual(await remove(f.request(), replay.db, f.clock(2000)), { removed: true });
  assert.deepEqual([replay.count.reads, replay.count.writes], [9, 0]); assert((await f.report.get()).updateTime.isEqual(report.updateTime));
  writeFileSync(new URL('../build/private-moderation-measurement.json', import.meta.url), JSON.stringify({ model: 'Emulator SDK operations, not cloud price/latency', first: { reads: 11, writes: 3 }, replay: { reads: 9, writes: 0 } }, null, 2) + '\n');
});
test('parallel identical retries and lost response perform one decision; changed payload is rejected', { skip: !enabled }, async () => {
  const f = await fixture(); const results = await Promise.all(Array.from({ length: 4 }, () => remove(f.request(), db, f.clock())));
  assert(results.every(r => r.removed)); assert.equal((await db.collection('serverOperations').where('reportId', '==', f.report.id).get()).size, 1);
  await assert.rejects(remove(f.request(f.mod, 'first', 'Different note'), db, f.clock(2000)), code('already-exists'));
  const report = await f.report.get(); assert.deepEqual(await remove(f.request(), db, f.clock(3000)), { removed: true }); assert((await f.report.get()).updateTime.isEqual(report.updateTime));
});
test('two moderators race: one commits, the other cannot overwrite actor or create a competing audit', { skip: !enabled }, async () => {
  const f = await fixture(); const results = await Promise.allSettled([remove(f.request(), db, f.clock()), remove(f.request(f.other, 'other'), db, f.clock())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'failed-precondition');
  const receipts = await db.collection('serverOperations').where('reportId', '==', f.report.id).get(); assert.equal(receipts.size, 1);
  assert.equal((await f.report.get()).get('resolvedBy'), receipts.docs[0].get('userId'));
});
test('missing Auth/App Check, unverified email and forged payload authority cannot access a transaction', { skip: !enabled }, async () => {
  const f = await fixture();
  for (const request of [{ ...f.request(), auth: null }, { ...f.request(), app: null }, { ...f.request(), auth: { uid: f.mod, token: { email: 'fixture@example.test' } } },
    { ...f.request(), data: { ...f.request().data, expectedUserId: f.other } }, { ...f.request(), data: { ...f.request().data, role: 'owner' } }]) {
    const tracked = meter(db); await assert.rejects(remove(request, tracked.db, f.clock())); assert.deepEqual([tracked.count.reads, tracked.count.writes], [0, 0]);
  }
  await untouched(f);
});
test('banned/pending/incomplete actor is denied, while creation restriction alone does not remove moderator authority', { skip: !enabled }, async () => {
  for (const mode of ['ban', 'pending', 'profile', 'legal', 'restriction']) {
    const f = await fixture();
    if (mode === 'ban') await db.doc(`bans/${f.mod}`).set({});
    if (mode === 'pending') await db.doc(`accountDeletionRequests/${f.mod}`).set({});
    if (mode === 'profile') await db.doc(`users/${f.mod}`).delete();
    if (mode === 'legal') await db.doc(`users/${f.mod}/legal/acceptance_2026_07_25`).delete();
    if (mode === 'restriction') { await db.doc(`contentRestrictions/${f.mod}`).set({ expiresAt: Timestamp.fromMillis(f.now.getTime() + 60000) }); await remove(f.request(), db, f.clock()); }
    else { await assert.rejects(remove(f.request(), db, f.clock())); await untouched(f); }
  }
});
test('regional moderator is denied for another country or unknown geography and cannot override it in Auth claims', { skip: !enabled }, async () => {
  for (const mode of ['country', 'missing-geography', 'missing-parent', 'missing-scope', 'malformed-scope']) {
    const f = await fixture();
    if (mode === 'country') await db.doc(`accountRoles/${f.mod}`).update({ 'moderationScope.countries': ['US'] });
    if (mode === 'missing-geography') await f.shout.set({ authorId: f.author });
    if (mode === 'missing-parent') await f.shout.delete();
    if (mode === 'missing-scope') await db.doc(`accountRoles/${f.mod}`).set({ role: 'moderator', level: 3 });
    if (mode === 'malformed-scope') await db.doc(`accountRoles/${f.mod}`).update({ moderationScope: { global: 'true' } });
    const request = f.request(); request.auth.token.role = 'owner'; request.auth.token.level = 6;
    await assert.rejects(remove(request, db, f.clock()), code('permission-denied')); await untouched(f);
  }
});
test('country/subdivision/global/admin/owner authority follows the existing hierarchy, including expired content', { skip: !enabled }, async () => {
  for (const mode of ['subdivision', 'global', 'admin', 'owner', 'legacy-scoped']) {
    const f = await fixture();
    await f.shout.update({ status: 'expired', expiresAt: Timestamp.fromMillis(f.now.getTime() - 1) });
    if (mode === 'subdivision') await db.doc(`accountRoles/${f.mod}`).update({ moderationScope: { countries: [], subdivisions: ['CZ-42'] } });
    if (mode === 'global') { await db.doc(`accountRoles/${f.mod}`).update({ moderationScope: { global: true } }); await f.shout.delete(); }
    if (['admin', 'owner'].includes(mode)) { await db.doc(`accountRoles/${f.mod}`).set({ role: mode === 'admin' ? 'administrator' : 'owner', level: mode === 'admin' ? 5 : 6 }); await f.shout.delete(); }
    if (mode === 'legacy-scoped') { await db.doc(`accountRoles/${f.mod}`).set({ moderationScope: f.role.moderationScope }); await db.doc(`moderators/${f.mod}`).set({}); }
    assert.deepEqual(await remove(f.request(), db, f.clock()), { removed: true });
  }
});
test('escalated reports require a current senior and replay cannot outlive demotion or geographic revocation', { skip: !enabled }, async () => {
  const f = await fixture(); await f.report.update({ status: 'escalated', assignedRole: 'seniorModerator' });
  await assert.rejects(remove(f.request(), db, f.clock()), code('permission-denied'));
  await db.doc(`accountRoles/${f.mod}`).update({ role: 'seniorModerator', level: 4 });
  await remove(f.request(), db, f.clock()); const before = await f.report.get();
  await db.doc(`accountRoles/${f.mod}`).update({ role: 'moderator', level: 3 }); await assert.rejects(remove(f.request(), db, f.clock(2000)), code('permission-denied'));
  await db.doc(`accountRoles/${f.mod}`).update({ role: 'seniorModerator', level: 4, 'moderationScope.countries': ['US'] });
  await assert.rejects(remove(f.request(), db, f.clock(3000)), code('permission-denied'));
  await db.doc(`accountRoles/${f.mod}`).set({ role: 'user', level: 1 }); await assert.rejects(remove(f.request(), db, f.clock(4000)), code('permission-denied'));
  assert((await f.report.get()).updateTime.isEqual(before.updateTime));
});
test('missing, resolved, forged or differently incarnated targets do not partially resolve a report', { skip: !enabled }, async () => {
  for (const mode of ['missing-source', 'missing-report', 'resolved', 'wrong-author', 'wrong-recipient', 'wrong-text', 'bad-participants', 'new-incarnation', 'bad-report-id']) {
    const f = await fixture(); let input = f.request();
    if (mode === 'missing-source') await f.source.delete();
    if (mode === 'missing-report') await f.report.delete();
    if (mode === 'resolved') await f.report.update({ status: 'resolved' });
    if (mode === 'wrong-author') await f.source.update({ authorId: f.recipient });
    if (mode === 'wrong-recipient') await f.source.update({ recipientId: f.mod });
    if (mode === 'wrong-text') await f.source.update({ text: 'Replaced private text' });
    if (mode === 'bad-participants') await f.source.update({ participants: [f.recipient, f.author] });
    if (mode === 'new-incarnation') { await f.source.delete(); await f.source.create(f.body); }
    if (mode === 'bad-report-id') {
      const forged = db.collection('privateReplyReports').doc(); await forged.set((await f.report.get()).data());
      input = { ...input, data: { ...input.data, reportId: forged.id } }; await assert.rejects(remove(input, db, f.clock()), code('failed-precondition'));
      assert.equal((await forged.get()).get('status'), 'open'); await untouched(f); await forged.delete(); continue;
    }
    const before = await f.report.get(), target = await f.source.get();
    await assert.rejects(remove(input, db, f.clock()));
    const after = await f.report.get(); assert.equal(after.exists, before.exists); if (before.exists) assert(after.updateTime.isEqual(before.updateTime));
    const source = await f.source.get(); assert.equal(source.exists, target.exists); if (target.exists) assert(source.updateTime.isEqual(target.updateTime));
    assert.equal((await f.receipt().get()).exists, false);
  }
});
test('failure while staging report audit or receipt rolls back the queued removal', { skip: !enabled }, async () => {
  for (const method of ['update', 'create']) { const f = await fixture(); await assert.rejects(remove(f.request(), meter(db, method).db, f.clock()), new RegExp(`injected-${method}-failure`)); await untouched(f); }
});
async function archiveContext(f) {
  const ref = db.doc(`accountDeletionRequests/${f.author}`); await ref.create({ userId: f.author, status: 'pending' });
  const request = await ref.get(); return { projectId: db.projectId, userId: f.author, requestCreateTime: request.createTime };
}
const noAuth = { async getUser() { throw Object.assign(Error('missing'), { code: 'auth/user-not-found' }); } };
test('archive wins: removal rejects the missing root and does not alter report evidence or retained private body', { skip: !enabled }, async () => {
  const f = await fixture(), identity = await archiveContext(f), before = await f.report.get();
  const outcome = await archive(identity, db, noAuth, { kind: 'privateReply', pageSize: 1, transactionGuard: async () => () => {} }); assert.equal(outcome.archived, 1);
  const row = (await db.collection('accountContentArchive').where('sourcePath', '==', f.source.path).get()).docs[0]; assert(row);
  await assert.rejects(remove(f.request(), db, f.clock()), code('not-found'));
  assert((await row.ref.get()).updateTime.isEqual(row.updateTime)); assert.equal(row.get('content.text'), f.body.text);
  assert((await f.report.get()).updateTime.isEqual(before.updateTime)); assert.equal((await f.receipt().get()).exists, false);
});
test('moderation wins after archive selection: archive skips the missing root without recreating it or copying the report', { skip: !enabled }, async () => {
  const f = await fixture(), identity = await archiveContext(f);
  const result = await archive(identity, db, noAuth, { kind: 'privateReply', pageSize: 1, transactionGuard: async () => () => {}, beforeTransaction: async () => { await remove(f.request(), db, f.clock()); } });
  assert.equal(result.archived, 0); assert.equal(result.skipped, 1); assert.equal((await f.source.get()).exists, false);
  assert.equal((await f.report.get()).get('resolution'), 'contentRemoved');
  assert.equal((await db.collection('accountContentArchive').where('sourcePath', '==', f.source.path).get()).empty, true);
  assert((await f.continuation.get()).exists);
});
test('simultaneous archive and moderation leave one disposition and preserve the other participant and report snapshot', { skip: !enabled }, async () => {
  const f = await fixture(), identity = await archiveContext(f), peer = await f.continuation.get(), before = await f.report.get();
  const outcomes = await Promise.allSettled([
    archive(identity, db, noAuth, { kind: 'privateReply', pageSize: 1, transactionGuard: async () => () => {} }),
    remove(f.request(), db, f.clock()),
  ]);
  assert.equal(outcomes[0].status, 'fulfilled');
  const archived = await db.collection('accountContentArchive').where('sourcePath', '==', f.source.path).get();
  const decision = await f.receipt().get(); assert.equal(archived.size + Number(decision.exists), 1);
  assert.equal((await f.source.get()).exists, false); assert((await f.continuation.get()).updateTime.isEqual(peer.updateTime));
  const report = await f.report.get(); assert.equal(report.get('text'), before.get('text')); assert.equal(report.get('reason'), before.get('reason'));
  if (decision.exists) { assert.equal(report.get('resolution'), 'contentRemoved'); assert.equal(outcomes[1].status, 'fulfilled'); }
  else { assert.equal(outcomes[1].reason.code, 'not-found'); assert(report.updateTime.isEqual(before.updateTime)); }
});

test('replay rechecks current account eligibility and geography without recreating a removed report', { skip: !enabled }, async () => {
  const f = await fixture(); await remove(f.request(), db, f.clock()); await f.report.delete();
  assert.deepEqual(await remove(f.request(), db, f.clock(1000)), { removed: true }); assert.equal((await f.report.get()).exists, false);
  for (const collection of ['bans', 'accountDeletionRequests']) {
    const ref = db.doc(`${collection}/${f.mod}`); await ref.set({});
    await assert.rejects(remove(f.request(), db, f.clock(2000))); await ref.delete();
  }
  await f.shout.delete(); await assert.rejects(remove(f.request(), db, f.clock(3000)), code('permission-denied'));
  await db.doc(`accountRoles/${f.mod}`).update({ level: 5 }); assert.deepEqual(await remove(f.request(), db, f.clock(4000)), { removed: true });
  assert.equal((await f.source.get()).exists, false); assert.equal((await f.report.get()).exists, false);
});

test('malformed receipt cannot forge a successful response or expose stored report content', { skip: !enabled }, async () => {
  const f = await fixture(); await remove(f.request(), db, f.clock()); const report = await f.report.get(), saved = (await f.receipt().get()).data();
  for (const mutation of [{ userId: f.other }, { reportId: 'other_report' }, { requiredRoleLevel: 2 }, { result: { removed: false } }]) {
    await f.receipt().set({ ...saved, ...mutation }); await assert.rejects(remove(f.request(), db, f.clock(1000)), code('failed-precondition'));
    assert((await f.report.get()).updateTime.isEqual(report.updateTime));
  }
  await f.receipt().set({ ...saved, result: { removed: true, text: 'Never return stored extra content' } });
  assert.deepEqual(await remove(f.request(), db, f.clock(2000)), { removed: true });
});

test('seven-day boundary rejects old execution after cleanup while preserving the resolved report audit', { skip: !enabled }, async () => {
  const f = await fixture(); await remove(f.request(), db, f.clock()); const report = await f.report.get(), receipt = await f.receipt().get();
  assert.equal(receiptMayBePurged(receipt.data(), Timestamp.fromMillis(f.now.getTime() + week - 1)), false);
  await assert.rejects(remove(f.request(), db, f.clock(week)), e => e.code === 'failed-precondition' && e.message === 'operation-expired');
  assert.equal(receiptMayBePurged(receipt.data(), Timestamp.fromMillis(f.now.getTime() + week)), true);
  await cleanupExpiredOperationReceipts(db, { clock: f.clock(week) }); assert.equal((await f.receipt().get()).exists, false);
  await assert.rejects(remove(f.request(), db, f.clock(week + 1000)), e => e.code === 'failed-precondition' && e.message === 'operation-expired');
  assert((await f.report.get()).updateTime.isEqual(report.updateTime));
});
