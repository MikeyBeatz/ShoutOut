import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { reviewBusinessApplicationOperation as review } from './business_review.js';
import { operationTestKey } from './test_helpers.js';
import { receiptMayBePurged } from './cleanup_operation_receipts.js';
import { accountPurgeStages, purgeScrubPatch } from './account_purge_policy.js';
import { createShoutOperation } from './create_shout.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'business-review-core') : null, db = app ? getFirestore(app) : null;
const code = expected => error => error.code === expected;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const fields = () => ({ countryCode: 'CZ', registrationNumber: '12345678', submittedCompanyName: 'Synthetic Business', submittedAddress: 'Synthetic 1',
  submittedCity: 'Usti', submittedPostalCode: '40001', initialLocationName: 'Synthetic branch', initialLocationAddress: 'Synthetic 2', initialLocationCity: 'Usti',
  initialLocationPostalCode: '40001', initialLocationCountryCode: 'CZ', initialLocation: { latitude: 50.53, longitude: 14.13 }, initialLocationProviderPlaceId: 'synthetic-place' });
async function fixture(t, status = 'checking') {
  const actor = randomUUID(), owner = randomUUID(), target = randomUUID(), now = new Date(), contact = 'synthetic-business@example.test';
  const application = db.doc(`businessApplications/${target}`), profile = db.doc(`businessProfiles/${target}`), role = db.doc(`accountRoles/${target}`), branch = profile.collection('locations').doc('initial');
  const authUser = { uid: target, email: contact, emailVerified: true, disabled: false }, auth = { calls: 0, async getUser(uid) { auth.calls++; assert.equal(uid, target); return authUser; } };
  for (const [uid, level] of [[actor, 5], [owner, 6]]) {
    await db.doc(`users/${uid}`).set({ nickname: 'Synthetic admin' }); await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
    await db.doc(`accountRoles/${uid}`).set({ level });
  }
  await application.set({ ...fields(), initialLocation: new GeoPoint(50.53, 14.13), initialLocationGeohash: 'u2fhxxx', userId: target,
    contactEmail: contact, status, submittedAt: Timestamp.fromDate(now) });
  t.after(async () => {
    for (const c of ['businessActivationAudits', 'serverOperations', 'shouts']) {
      const field = c === 'businessActivationAudits' ? 'applicationId' : 'authorId';
      for (const row of (await db.collection(c).where(field, '==', target).get()).docs) await db.recursiveDelete(row.ref);
    }
    for (const row of (await db.collection('serverOperations').where('userId', '==', target).get()).docs) await row.ref.delete();
    for (const uid of [actor, owner, target]) for (const c of ['users', 'publicProfiles', 'accountRoles', 'moderators', 'bans', 'contentRestrictions', 'accountDeletionRequests', 'businessApplications', 'businessProfiles', 'rateLimits']) await db.recursiveDelete(db.doc(`${c}/${uid}`));
  });
  const request = (decision, revision = 0, uid = actor, label = `${decision}-${revision}`) => ({ auth: { uid, token: { email: uid === target ? contact : 'admin@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { expectedUserId: uid, applicationId: target, expectedRevision: revision, decision, idempotencyKey: operationTestKey(label, now),
      note: ['reject', 'suspend'].includes(decision) ? 'Concrete synthetic review reason' : '', ...(decision === 'resubmit' ? { application: fields() } : {}) } });
  return { actor, owner, target, now, contact, application, profile, role, branch, auth, authUser, request, clock: () => now };
}
test('approval verifies Auth and atomically creates the original Business identity even before ordinary profile setup', { skip: !enabled }, async t => {
  for (const status of ['pending_email', 'checking']) {
    const f = await fixture(t, status), input = f.request('approve');
    assert.deepEqual(await review(input, db, f.auth, f.clock), { status: 'active', revision: 1 });
    assert.equal((await f.role.get()).get('level'), 2); assert.equal((await f.profile.get()).get('status'), 'active');
    assert.equal((await f.branch.get()).get('geocodingStatus'), 'verified');
    assert.equal((await f.profile.get()).get('billingEmail'), f.contact);
    assert.equal((await db.doc(`users/${f.target}`).get()).exists, false);
    const audit = (await db.collection('businessActivationAudits').where('applicationId', '==', f.target).get()).docs[0];
    assert.equal(audit.get('administratorId'), f.actor); assert.equal(audit.get('before.status'), status); assert.equal(audit.get('after.status'), 'active');
    const receipt = await db.doc(`serverOperations/${audit.id}`).get(); assert.equal(receipt.get('action'), 'reviewBusinessApplication');
    assert.equal(receipt.get('reason'), undefined); assert.equal(receipt.get('before'), undefined);
    assert(receiptMayBePurged(receipt.data(), Timestamp.fromMillis(f.now.getTime() + 7 * 86400000)));
    const profileTime = (await f.profile.get()).updateTime;
    assert.deepEqual(await review(input, db, f.auth, f.clock), { status: 'active', revision: 1 });
    assert(profileTime.isEqual((await f.profile.get()).updateTime));
    await assert.rejects(review({ ...input, data: { ...input.data, note: 'Changed payload' } }, db, f.auth, f.clock), code('already-exists'));
  }
});
test('rejection preserves fields and permits the same verified account to correct and resubmit once', { skip: !enabled }, async t => {
  const f = await fixture(t), original = (await f.application.get()).data();
  await review(f.request('reject'), db, f.auth, f.clock); assert.equal(f.auth.calls, 0);
  assert.equal((await f.application.get()).get('submittedCompanyName'), original.submittedCompanyName);
  assert.equal((await f.role.get()).exists, false); assert.equal((await f.profile.get()).exists, false);
  const resubmit = f.request('resubmit', 1, f.target); resubmit.data.application.submittedCompanyName = 'Corrected Business';
  assert.deepEqual(await review(resubmit, db, f.auth, f.clock), { status: 'checking', revision: 2 });
  assert.equal((await f.application.get()).get('submittedCompanyName'), 'Corrected Business'); assert.equal((await f.role.get()).exists, false);
  const time = (await f.application.get()).updateTime; await review(resubmit, db, f.auth, f.clock); assert(time.isEqual((await f.application.get()).updateTime));
  await assert.rejects(review(f.request('approve', 0), db, f.auth, f.clock), code('failed-precondition'));
  await review(f.request('approve', 2), db, f.auth, f.clock);
  await assert.rejects(review(f.request('resubmit', 2, f.target), db, f.auth, f.clock), code('failed-precondition'));
  assert.equal((await f.profile.get()).get('status'), 'active');
});
test('suspension and reactivation retain role, profile edits, branch, and existing Shouts', { skip: !enabled }, async t => {
  const f = await fixture(t); await review(f.request('approve'), db, f.auth, f.clock);
  const source = db.doc(`shouts/${randomUUID()}`); await source.set({ authorId: f.target, status: 'active', text: 'Keep existing content', expiresAt: Timestamp.fromMillis(f.now.getTime() + 86400000) });
  const sourceTime = (await source.get()).updateTime, roleTime = (await f.role.get()).updateTime, branchTime = (await f.branch.get()).updateTime;
  await f.profile.update({ billingCity: 'Preserve edited city' });
  await review(f.request('suspend', 1), db, f.auth, f.clock);
  assert.equal((await f.profile.get()).get('status'), 'suspended'); assert.equal((await f.application.get()).get('status'), 'suspended');
  assert.equal((await f.profile.get()).get('reviewReason'), 'Concrete synthetic review reason');
  assert.equal((await f.profile.get()).get('billingCity'), 'Preserve edited city');
  assert(roleTime.isEqual((await f.role.get()).updateTime)); assert(branchTime.isEqual((await f.branch.get()).updateTime)); assert(sourceTime.isEqual((await source.get()).updateTime));
  await assert.rejects(review(f.request('reactivate', 2, f.target), db, f.auth, f.clock));
  await review(f.request('reactivate', 2, f.owner), db, f.auth, f.clock);
  assert.equal((await f.profile.get()).get('status'), 'active'); assert(sourceTime.isEqual((await source.get()).updateTime));
});
test('ordinary, Business, moderator, senior and spoofed profile roles cannot review or probe target Auth', { skip: !enabled }, async t => {
  for (const level of [1, 2, 3, 4, '5', 7]) {
    const f = await fixture(t); await db.doc(`accountRoles/${f.actor}`).set({ level }); await db.doc(`users/${f.actor}`).update({ level: 6, role: 'owner' });
    await assert.rejects(review(f.request('approve'), db, f.auth, f.clock), code('permission-denied'));
    assert.equal(f.auth.calls, 0); assert.equal((await f.role.get()).exists, false);
  }
});
test('unverified, disabled, mismatched or missing target Auth prevents activation with no partial identity', { skip: !enabled }, async t => {
  for (const state of ['unverified', 'disabled', 'email', 'uid', 'missing']) {
    const f = await fixture(t);
    if (state === 'unverified') f.authUser.emailVerified = false;
    if (state === 'disabled') f.authUser.disabled = true;
    if (state === 'email') f.authUser.email = 'different@example.test';
    if (state === 'uid') f.authUser.uid = 'different';
    if (state === 'missing') f.auth.getUser = async () => { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); };
    await assert.rejects(review(f.request('approve'), db, f.auth, f.clock));
    assert.equal((await f.role.get()).exists, false); assert.equal((await f.profile.get()).exists, false); assert.equal((await f.application.get()).get('status'), 'checking');
  }
});
test('pending deletion, deleted markers, changed target role and in-flight Auth verification cannot restore identity', { skip: !enabled }, async t => {
  for (const state of ['request', 'marker', 'role', 'during-auth']) {
    const f = await fixture(t);
    if (state === 'request') await db.doc(`accountDeletionRequests/${f.target}`).set({ userId: f.target });
    if (state === 'marker') await db.doc(`publicProfiles/${f.target}`).set({ schemaVersion: 1, accountStatus: 'deleted' });
    if (state === 'role') await f.role.set({ level: 5 });
    if (state === 'during-auth') f.auth.getUser = async () => { await db.doc(`accountDeletionRequests/${f.target}`).set({ userId: f.target }); return f.authUser; };
    await assert.rejects(review(f.request('approve'), db, f.auth, f.clock), code('failed-precondition'));
    assert.equal((await f.profile.get()).exists, false); assert.equal((await f.branch.get()).exists, false);
  }
});
test('two admins deciding the same revision cannot overwrite each other or create duplicate activation audits', { skip: !enabled }, async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled([review(f.request('approve'), db, f.auth, f.clock), review(f.request('reject', 0, f.owner), db, f.auth, f.clock)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await db.collection('businessActivationAudits').where('applicationId', '==', f.target).get()).size, 1);
  assert.equal((await f.application.get()).get('revision'), 1);
});
test('role revocation fences a lost-response retry without changing the successful original decision', { skip: !enabled }, async t => {
  const f = await fixture(t), input = f.request('approve'); await review(input, db, f.auth, f.clock);
  const time = (await f.profile.get()).updateTime; await db.doc(`accountRoles/${f.actor}`).update({ level: 4 });
  await assert.rejects(review(input, db, f.auth, f.clock), code('permission-denied'));
  assert(time.isEqual((await f.profile.get()).updateTime));
});
test('suspended Business identity cannot publish ordinary or promoted content or fall back to a personal account', { skip: !enabled }, async t => {
  const f = await fixture(t); await review(f.request('approve'), db, f.auth, f.clock);
  await db.doc(`users/${f.target}`).set({ nickname: 'Synthetic publisher', avatarId: 'avatar_01', avatarBackgroundStart: 1, avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' }); await db.doc(`users/${f.target}/legal/acceptance_2026_07_25`).set({});
  const publish = (label, extra = {}) => ({ auth: { uid: f.target, token: { email: f.contact, email_verified: true } }, app: { appId: 'fixture' }, data: {
    expectedUserId: f.target, idempotencyKey: operationTestKey(label, f.now), title: 'Synthetic original', text: 'Keep the original content', categories: ['Dotaz'], durationMinutes: 1440, businessLocationId: 'initial', ...extra } });
  const first = await createShoutOperation(publish('before-suspension'), db, f.clock), original = await db.doc(`shouts/${first.shoutId}`).get();
  await review(f.request('suspend', 1), db, f.auth, f.clock);
  for (const extra of [{}, { businessHighlighted: true }, { businessSpotlight: true }, { businessExtendedDuration: true, durationMinutes: 2880 }]) {
    await assert.rejects(createShoutOperation(publish(JSON.stringify(extra), extra), db, () => new Date(f.now.getTime() + 2000)),
      e => e.code === 'failed-precondition' && e.message === 'business-location-unavailable');
  }
  const personal = publish('personal-bypass'); delete personal.data.businessLocationId; personal.data.location = { latitude: 50.53, longitude: 14.13 };
  await assert.rejects(createShoutOperation(personal, db, () => new Date(f.now.getTime() + 2000)), code('invalid-argument'));
  assert(original.updateTime.isEqual((await original.ref.get()).updateTime)); assert.equal((await f.role.get()).get('level'), 2);
  await review(f.request('reactivate', 2), db, f.auth, f.clock);
  await createShoutOperation(publish('after-reactivation'), db, () => new Date(f.now.getTime() + 2000));
  assert(original.updateTime.isEqual((await original.ref.get()).updateTime));
});
test('publication racing suspension commits only before the profile restriction or fails without a partial publication', { skip: !enabled }, async t => {
  const f = await fixture(t); await review(f.request('approve'), db, f.auth, f.clock);
  await db.doc(`users/${f.target}`).set({ nickname: 'Synthetic concurrent publisher', avatarId: 'avatar_01', avatarBackgroundStart: 1, avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' }); await db.doc(`users/${f.target}/legal/acceptance_2026_07_25`).set({});
  const publication = { auth: { uid: f.target, token: { email: f.contact, email_verified: true } }, app: { appId: 'fixture' }, data: {
    expectedUserId: f.target, idempotencyKey: operationTestKey('concurrent-publication', f.now), title: 'Synthetic concurrent', text: 'Synthetic', categories: ['Dotaz'], durationMinutes: 1440, businessLocationId: 'initial' } };
  const [published, suspended] = await Promise.allSettled([createShoutOperation(publication, db, f.clock), review(f.request('suspend', 1), db, f.auth, f.clock)]);
  assert.equal(suspended.status, 'fulfilled'); assert.equal((await f.profile.get()).get('status'), 'suspended');
  const posts = await db.collection('shouts').where('authorId', '==', f.target).get();
  if (published.status === 'fulfilled') {
    assert.equal(posts.size, 1); const a = posts.docs[0].createTime, b = (await f.profile.get()).updateTime;
    assert(a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
  } else {
    assert.equal(published.reason.code, 'failed-precondition'); assert.equal(published.reason.message, 'business-location-unavailable'); assert.equal(posts.size, 0);
    assert.equal((await db.doc(`rateLimits/${f.target}/actions/shout`).get()).exists, false);
  }
});
test('a failed audit write rolls back every Business identity mutation and receipt', { skip: !enabled }, async t => {
  const f = await fixture(t);
  const broken = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return operation => target.runTransaction(tx => operation(new Proxy(tx, { get(real, method) {
      if (method === 'create') return (ref, ...args) => { if (ref.path.startsWith('businessActivationAudits/')) throw new Error('injected-audit-failure'); return real.create(ref, ...args); };
      return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
    } })));
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await assert.rejects(review(f.request('approve'), broken, f.auth, f.clock), /injected-audit-failure/);
  assert.equal((await f.profile.get()).exists, false); assert.equal((await f.role.get()).exists, false); assert.equal((await f.branch.get()).exists, false);
  assert.equal((await f.application.get()).get('status'), 'checking'); assert.equal((await db.collection('serverOperations').where('authorId', '==', f.target).get()).size, 0);
});
test('resubmit rejects foreign identity, missing App Check, unverified email, a ban and account deletion', { skip: !enabled }, async t => {
  const f = await fixture(t); await review(f.request('reject'), db, f.auth, f.clock);
  const source = f.request('resubmit', 1, f.target);
  for (const request of [{ ...source, app: null }, { ...source, auth: null }, { ...source, auth: { ...source.auth, uid: f.actor } },
    { ...source, auth: { ...source.auth, token: { ...source.auth.token, email_verified: false } } }]) await assert.rejects(review(request, db, f.auth, f.clock));
  await db.doc(`bans/${f.target}`).set({ expiresAt: Timestamp.fromMillis(f.now.getTime() + 60000) });
  await assert.rejects(review(source, db, f.auth, f.clock), code('permission-denied'));
  await db.doc(`bans/${f.target}`).delete(); await db.doc(`accountDeletionRequests/${f.target}`).set({ userId: f.target });
  await assert.rejects(review(source, db, f.auth, f.clock), code('failed-precondition'));
  assert.equal((await f.application.get()).get('revision'), 1); assert.equal((await f.role.get()).exists, false);
});
test('concurrent corrected submissions keep one revision and one audit without granting a role', { skip: !enabled }, async t => {
  const f = await fixture(t); await review(f.request('reject'), db, f.auth, f.clock);
  const a = f.request('resubmit', 1, f.target, 'first-correction'), b = f.request('resubmit', 1, f.target, 'second-correction');
  b.data.application.submittedCompanyName = 'Other correction';
  const results = await Promise.allSettled([review(a, db, f.auth, f.clock), review(b, db, f.auth, f.clock)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.application.get()).get('revision'), 2); assert.equal((await f.role.get()).exists, false);
  assert.equal((await db.collection('businessActivationAudits').where('applicationId', '==', f.target).get()).size, 2);
});
test('new Business audit contains only canonical actor links, and existing actor scrub removes the reference', { skip: !enabled }, async t => {
  const f = await fixture(t); await review(f.request('approve'), db, f.auth, f.clock); await review(f.request('suspend', 1), db, f.auth, f.clock);
  for (const row of (await db.collection('businessActivationAudits').where('applicationId', '==', f.target).get()).docs) {
    assert.deepEqual(Object.keys(row.get('before')).sort(), ['revision', 'status']);
    assert.deepEqual(Object.keys(row.get('after')).sort(), ['revision', 'status']);
    await row.ref.update(purgeScrubPatch(row.data(), 'scrub', 'administratorId'));
    assert.equal(JSON.stringify((await row.ref.get()).data()).includes(f.actor), false);
  }
  assert.equal((await f.profile.get()).get('reviewedBy'), undefined); assert.equal((await f.application.get()).get('reviewedBy'), undefined);
  assert(accountPurgeStages(f.actor).some(s => s.collection === 'businessApplications' && s.field === 'activatedBy' && s.action === 'scrub'));
  assert(accountPurgeStages(f.actor).some(s => s.collection === 'accountRoles' && s.field === 'assignedBy' && s.action === 'scrub'));
});
test('Business audits retain the existing owner/actor purge links rather than creating an untracked archive', () => {
  const stages = accountPurgeStages('fixture');
  assert(stages.some(s => s.collection === 'businessActivationAudits' && s.field === 'applicationId' && s.action === 'delete'));
  assert(stages.some(s => s.collection === 'businessActivationAudits' && s.field === 'administratorId' && s.action === 'scrub'));
});
