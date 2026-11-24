import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { planModerationBusinessPilot as planPilot, validateModerationBusinessPilot as validate, ensureModerationBusinessAuth as ensureAuth,
  seedModerationBusinessAccount as seedAccount, seedModerationBusinessContent as seedContent, moderationBusinessSlots as slots,
  moderationBusinessPilotStatus as status, orphanModerationBusinessComment as orphan, cleanupModerationBusinessPilot as cleanup,
  planModerationBusinessAvatarRepair as planAvatar, repairModerationBusinessAvatar as repairAvatar } from './moderation_business_pilot.js';
import { prepareNewsControlChange } from './feed_news_signals.js';
import { reviewBusinessApplicationOperation as review } from './business_review.js';
import { sanctionContentOperation as sanction, revokeSanctionOperation as revoke } from './moderation_sanctions.js';
import { decideContentReportsOperation as decide } from './decide_content_reports.js';
import { operationTestKey } from './test_helpers.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'mod-business-pilot-test') : null, db = app ? getFirestore(app) : null;
after(async () => { if (db) await db.terminate(); if (app) await deleteApp(app); });
async function fixture(t) {
  const suffix = randomUUID().slice(0, 8), actors = ['Bright_Otter_182', 'TestBusiness', 'TestModerator', 'TestAdmin'].map((nickname, i) => ({ nickname, uid: `mb-${suffix}-${i}` }));
  const control = db.doc('feedIndexControl/current'), generation = db.doc('feedIndexGenerations/feed-v3'), news = db.doc('feedNewsControl/current');
  const original = db.doc(`shouts/mb-original-${suffix}`), pending = db.doc(`accountDeletionRequests/mb-original-${suffix}`);
  await control.create({ schemaVersion: 2, revision: 12, mode: 'active', readGenerationId: 'feed-v3', writeGenerationIds: ['feed-v3'], cardReadGenerationId: 'feed-v3', cardWriteGenerationIds: ['feed-v3'] });
  await generation.create({ schemaVersion: 1, v: 2, cardReady: true, cardProjection: 1, accountRetention: true, readIdentity: 1, erasureRevision: 0, prunedThrough: -1 });
  await original.create({ untouched: true }); await pending.create({ untouched: true });
  for (const [n, a] of actors.entries()) {
    await db.doc(`users/${a.uid}`).create({ nickname: a.nickname, avatarId: 'fox', avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'navy', avatarGradientDirection: 'horizontal' });
    await db.doc(`users/${a.uid}/legal/acceptance_2026_07_25`).create({});
    if (n > 0) await db.doc(`accountRoles/${a.uid}`).create({ role: n === 1 ? 'business' : n === 2 ? 'moderator' : 'administrator', level: n === 1 ? 2 : n === 2 ? 3 : 5, moderationScope: { countries: ['CZ'], global: n === 3 } });
  }
  const marker = await generation.get(); await db.runTransaction(async tx => (await prepareNewsControlChange(tx, db, { v: 1, revision: 1, mode: 'active', generation: 'feed-v3', incarnation: [marker.createTime.seconds, marker.createTime.nanoseconds] })).apply());
  const p = await planPilot(db, actors, { expectedSources: 1 }), s = slots(p); let authUser = null;
  const auth = { created: 0, deleted: 0, async getUser(uid) { assert.equal(uid, p.uid); if (!authUser) throw Object.assign(Error('missing'), { code: 'auth/user-not-found' }); return authUser; },
    async createUser(v) { this.created++; authUser = { ...v, metadata: { creationTime: new Date().toISOString() } }; return authUser; }, async deleteUser(uid) { assert.equal(uid, p.uid); this.deleted++; authUser = null; } };
  t.after(async () => {
    for (const uid of [...actors.map(a => a.uid), p.uid]) {
      for (const c of ['users', 'publicProfiles', 'accountRoles', 'moderators', 'rateLimits', 'businessProfiles', 'businessApplications', 'bans', 'contentRestrictions']) await db.recursiveDelete(db.doc(`${c}/${uid}`));
      for (const c of ['serverOperations', 'sanctions', 'warnings', 'sanctionRevocations', 'businessActivationAudits']) for (const field of ['userId', 'authorId', 'applicationId']) for (const row of (await db.collection(c).where(field, '==', uid).get()).docs) await row.ref.delete();
    }
    for (const ref of [control, generation, news, original, pending, db.doc(`shouts/${s.shout}`), db.doc(`reports/${s.reports[0]}`), db.doc(`commentReports/${s.reports[1]}`), db.doc(`privateReplyReports/${s.reports[2]}`)]) await db.recursiveDelete(ref);
  });
  const request = (uid, data) => ({ auth: { uid, token: { email: uid === p.uid ? p.email : 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' }, data: { expectedUserId: uid, idempotencyKey: operationTestKey(randomUUID(), new Date()), ...data } });
  const business = async (decision, revision) => {
    const own = decision === 'resubmit', old = (await db.doc(`businessApplications/${p.uid}`).get()).data();
    const fields = ['countryCode', 'registrationNumber', 'submittedCompanyName', 'submittedAddress', 'submittedCity', 'submittedPostalCode', 'initialLocationName', 'initialLocationAddress', 'initialLocationCity', 'initialLocationPostalCode', 'initialLocationCountryCode', 'initialLocationProviderPlaceId', 'initialLocation'];
    await review(request(own ? p.uid : actors[3].uid, { decision, expectedRevision: revision, applicationId: p.uid, note: ['reject', 'suspend'].includes(decision) ? 'Synthetic reason' : '', ...(own ? { application: Object.fromEntries(fields.map(k => [k, old[k]])) } : {}) }), db, auth);
  };
  return { p, s, actors, auth, original, pending, request, business };
}
test('pilot digest/project/original fences and Auth incarnation prevent foreign or repeated provisioning', { skip: !enabled }, async t => {
  const f = await fixture(t); validate(db, f.p); assert.throws(() => validate(db, { ...f.p, uid: 'foreign' }));
  await ensureAuth(db, f.auth, f.p, 'Synthetic-password-12345'); await ensureAuth(db, f.auth, f.p, 'Synthetic-password-12345'); assert.equal(f.auth.created, 1);
  await seedAccount(db, f.auth, f.p); assert.equal((await seedAccount(db, f.auth, f.p)).seeded, false);
  for (const c of ['users', 'publicProfiles']) {
    const profile = (await db.doc(`${c}/${f.p.uid}`).get()).data();
    assert.equal(profile.avatarId, 'fox'); assert.equal(profile.avatarBackgroundStart, 'teal'); assert.equal(profile.avatarBackgroundEnd, 'navy');
  }
  await assert.rejects(cleanup(db, f.auth, f.p), /business-proof/); assert.equal(f.auth.deleted, 0);
  await f.original.update({ untouched: false }); await assert.rejects(ensureAuth(db, f.auth, f.p, 'Synthetic-password-12345'), /original-drift/); assert.equal(f.auth.created, 1);
});
test('avatar repair is exact, atomic, fenced, restartable and does not change Business identity', { skip: !enabled }, async t => {
  const f = await fixture(t), { p, auth } = f; await ensureAuth(db, auth, p, 'Synthetic-password-12345'); await seedAccount(db, auth, p);
  await f.business('reject', 0); await f.business('resubmit', 1); await f.business('approve', 2);
  await assert.rejects(planAvatar(db, p));
  await f.business('suspend', 3);
  const refs = ['users', 'publicProfiles'].map(c => db.doc(`${c}/${p.uid}`));
  for (const ref of refs) await ref.update({ avatarId: 'avatar_01', avatarBackgroundStart: 1, avatarBackgroundEnd: 2 });
  const old = await db.getAll(...refs), plan = await planAvatar(db, p);
  await assert.rejects(repairAvatar(db, p, { ...plan, uid: 'foreign' }), /avatar-digest/);
  await refs[0].update({ unrelated: true });
  await assert.rejects(repairAvatar(db, p, plan), /avatar-stale/);
  assert(old[1].updateTime.isEqual((await refs[1].get()).updateTime));
  const fresh = await planAvatar(db, p);
  const keep = await db.getAll(db.doc(`businessApplications/${p.uid}`), db.doc(`businessProfiles/${p.uid}`), db.doc(`accountRoles/${p.uid}`));
  const receipts = (await db.collection('serverOperations').get()).docs;
  // Throw after the first staged update, before committing either document.
  const failing = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return callback => target.runTransaction(tx => callback(new Proxy(tx, { get(transaction, method) {
      if (method === 'update') return (ref, patch) => { if (ref.path === refs[1].path) throw Error('injected-avatar-failure'); return transaction.update(ref, patch); };
      const value = transaction[method]; return typeof value === 'function' ? value.bind(transaction) : value;
    } })));
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  const before = await db.getAll(...refs);
  await assert.rejects(repairAvatar(failing, p, fresh), /injected-avatar-failure/);
  (await db.getAll(...refs)).forEach((d, i) => assert(d.updateTime.isEqual(before[i].updateTime)));
  assert.deepEqual(await repairAvatar(db, p, fresh), { repaired: true, repeated: false, documentsWritten: 2 });
  const after = await db.getAll(...refs);
  for (const [i, d] of after.entries()) assert.deepEqual(d.data(), { ...before[i].data(), avatarId: 'fox', avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'navy' });
  assert.deepEqual(await repairAvatar(db, p, fresh), { repaired: true, repeated: true, documentsWritten: 0 });
  (await db.getAll(...refs)).forEach((d, i) => assert(d.updateTime.isEqual(after[i].updateTime)));
  for (const d of [...keep, ...receipts]) assert(d.updateTime.isEqual((await d.ref.get()).updateTime));
  await refs[0].update({ unrelated: false });
  await assert.rejects(repairAvatar(db, p, fresh), /avatar-unrelated-drift/);
});
test('pilot lifecycle, cooldown retry, stronger sanction proof and resumable cleanup preserve originals and 7-day receipts', { skip: !enabled }, async t => {
  const f = await fixture(t), { p, s, auth, actors } = f; await ensureAuth(db, auth, p, 'Synthetic-password-12345'); await seedAccount(db, auth, p);
  await f.business('reject', 0); await f.business('resubmit', 1); await f.business('approve', 2);
  assert.equal((await seedContent(db, p)).waitingForCooldown, true);
  // Test-only time advance; the live pilot always waits the real cooldown.
  await db.doc(`rateLimits/${p.uid}/actions/comment`).update({ lastAt: Timestamp.fromMillis(Date.now() - 11000) });
  assert.equal((await seedContent(db, p)).waitingForCooldown, false);
  await f.business('suspend', 3); await f.business('reactivate', 4);
  await sanction(f.request(actors[2].uid, { mode: 'report', expectedTargetUserId: p.uid, targetType: 'shout', shoutId: s.shout, reportIds: [s.reports[0]], sourceReportId: s.reports[0], decision: 'warning', note: 'Synthetic warning' }), db);
  const source = await db.doc(`shouts/${s.shout}/comments/${s.comments[1]}`).get();
  const observation = decision => f.request(actors[2].uid, { mode: 'observation', expectedTargetUserId: p.uid, targetType: 'comment', shoutId: s.shout, targetId: s.comments[1], expectedCreatedAt: source.get('createdAt').toMillis(), decision, note: 'Synthetic ban' });
  const long = await sanction(observation('ban7d'), db); await sanction(observation('ban1d'), db);
  assert.equal((await status(db, p)).activeBan.sanctionId, long.sanctionId);
  await revoke(f.request(actors[3].uid, { sanctionId: long.sanctionId, note: 'Synthetic revocation' }), db);
  await orphan(db, p); assert(!(await source.ref.parent.doc(s.comments[0]).get()).exists);
  await decide(f.request(actors[2].uid, { targetType: 'comment', shoutId: s.shout, targetId: s.comments[0], reportIds: [s.reports[1]], decision: 'resolve', note: '' }), db, () => new Date(), { resolveUnavailableTargets: true });
  await decide(f.request(actors[3].uid, { targetType: 'privateReply', shoutId: s.shout, targetId: s.privateReply, reportIds: [s.reports[2]], decision: 'resolve', note: '' }), db);
  const foreign = db.doc(`shouts/${s.shout}/comments/foreign`); await foreign.create({ text: 'foreign' });
  await assert.rejects(cleanup(db, auth, p), /foreign-child/); assert.equal(auth.deleted, 0); await foreign.delete();
  const receipts = (await db.collection('serverOperations').get()).docs.map(d => ({ id: d.id, update: d.updateTime }));
  const normalDelete = auth.deleteUser; auth.deleteUser = async () => { throw Error('injected-auth-response-loss'); };
  await assert.rejects(cleanup(db, auth, p), /injected-auth-response-loss/); auth.deleteUser = normalDelete;
  assert.deepEqual((await db.doc(`publicProfiles/${p.uid}`).get()).data(), { schemaVersion: 1, accountStatus: 'deleted' });
  assert.equal((await cleanup(db, auth, p)).cleaned, true); assert.equal((await cleanup(db, auth, p)).cleaned, true); assert.equal(auth.deleted, 1);
  assert(!(await db.doc(`shouts/${s.shout}`).get()).exists); assert.equal((await f.original.get()).get('untouched'), true); assert.equal((await f.pending.get()).get('untouched'), true);
  for (const r of receipts) assert(r.update.isEqual((await db.doc(`serverOperations/${r.id}`).get()).updateTime));
});
