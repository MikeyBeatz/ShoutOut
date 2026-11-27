import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { createArchiveIdentityRuntime, observeArchiveIdentity } from './archive_identity.js';
import { createContentLifecycleDatabase, lifecycleDay } from './content_lifecycle.js';
import { legalPolicy, preparedArchiveLegalVersion } from './legal_policy.js';
import { planArchiveIdentityAdoption, applyArchiveIdentityAdoption } from './archive_identity_adoption.js';
import { planLifecyclePreflight, readLifecyclePreflightPage, validateLifecycleInventoryPlan } from './content_lifecycle_transition.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const policy = legalPolicy({ archiveDisclosureEnabled: true, version: preparedArchiveLegalVersion });
async function fixture(t) {
  const db = new Firestore({ projectId: 'shoutout-rules-test' }), uid = 'adopt_' + randomUUID().replaceAll('-', ''), roots = [];
  let now = Date.now() + 5000;
  const keep = ref => { roots.push(ref); return ref; }, clock = () => new Date(now);
  const profile = keep(db.doc(`users/${uid}`)); await profile.create({ nickname: 'Synthetic' });
  now = Math.max(now, Date.now() + 5000);
  const legal = keep(db.doc(`users/${uid}/legal/${policy.acceptanceDocument}`));
  await legal.set({ termsVersion: policy.version, privacyVersion: policy.version, ageConfirmed: true, acceptedAt: Timestamp.now() });
  await keep(db.doc(`users/${uid}/legal/acceptance_2026_07_25`)).set({});
  const control = keep(db.doc('contentLifecycleControl/current')); await control.set({ schemaVersion: 1, revision: 1, mode: 'active' });
  const root = keep(db.doc(`shouts/${uid}`)); keep(db.doc(`contentLifecycleThreads/${uid}`));
  const archived = createContentLifecycleDatabase(db, { enabled: true, clock });
  await archived.runTransaction(tx => tx.create(root, { authorId: uid, title: 'Private test body', text: 'Never in plan',
    createdAt: Timestamp.fromDate(clock()), expiresAt: Timestamp.fromMillis(now + lifecycleDay), status: 'active' }));
  const archive = keep(db.doc(`contentLifecycleArchive/${(await root.get()).get('contentArchiveKey')}`));
  const runtime = createArchiveIdentityRuntime(db, { enabled: true, key: Buffer.alloc(32, 7), clock });
  const request = { auth: { uid, token: { email: `${uid}@example.cz`, email_verified: true, auth_time: Math.floor(now / 1000) } }, app: { appId: 'synthetic' } };
  const auth = { async getUser() { return { uid, email: request.auth.token.email, emailVerified: true,
    metadata: { creationTime: new Date(now - 100000).toISOString() } }; } };
  now = Math.max(now, Date.now() + 5000);
  const observed = await observeArchiveIdentity(request, runtime, auth);
  keep(db.doc(`archiveIdentityAccounts/${observed.accountKey}`)); keep(db.doc(`archiveIdentityCurrent/${uid}`)); keep(db.doc(`accountDeletionRequests/${uid}`));
  t.after(async () => {
    for (const doc of (await db.collection('archiveIdentityBindings').where('userId', '==', uid).get()).docs) await doc.ref.delete();
    for (const doc of (await db.collection('contentLifecycleJobs').where('threadId', '==', uid).get()).docs) await db.recursiveDelete(doc.ref);
    for (const ref of roots) await db.recursiveDelete(ref);
    await db.terminate();
  });
  const plan = () => planArchiveIdentityAdoption(runtime, [archive.path], { disclosurePolicy: policy });
  const apply = (p, options = {}) => applyArchiveIdentityAdoption(runtime, p, { approvedDigest: p.digest, disclosurePolicy: policy, ...options });
  return { db, uid, runtime, observed, root, archive, profile, legal, plan, apply, clock, keep, setTime: v => { now = v; } };
}

test('old public archive binds only observed incarnation; restart/replay preserve content and deadlines', { skip: !enabled }, async t => {
  const f = await fixture(t), before = (await f.archive.get()).data(), plan = await f.plan();
  assert.equal(plan.entries[0].action, 'bind', plan.entries[0].reason);
  assert(!JSON.stringify(plan).includes('Never in plan')); assert(!JSON.stringify(plan).includes('@example.cz'));
  const result = await f.apply(JSON.parse(JSON.stringify(plan)));
  assert.equal(result.state, 'bound'); assert.equal(result.writes, 1);
  assert(result.documentReads <= 10);
  const replay = await f.apply(plan); assert.equal(replay.state, 'already-bound'); assert.equal(replay.writes, 0);
  const after = (await f.archive.get()).data();
  delete after.authorAccountKey; delete after.authorBindingDigest; delete after.authorBoundAt;
  assert.deepEqual(after, before);
  await assert.rejects(f.apply({ ...plan, projectId: 'foreign' }), /invalid-identity-adoption/);
});

for (const mode of ['legal', 'current', 'profile', 'body', 'source-birth', 'closed', 'expired']) {
  test(`old author binding blocks ${mode} without guessed provenance`, { skip: !enabled }, async t => {
    const f = await fixture(t);
    if (mode === 'legal') await f.legal.delete();
    if (mode === 'current') await f.db.doc(`archiveIdentityCurrent/${f.uid}`).delete();
    if (mode === 'profile') { await f.profile.delete(); await f.profile.create({ nickname: 'New incarnation' }); }
    if (mode === 'body') await f.archive.update({ contentHash: '0'.repeat(64) });
    if (mode === 'source-birth') await f.archive.update({ sourceCreateTime: Timestamp.fromMillis(1) });
    if (mode === 'closed') await f.db.doc(`archiveIdentityAccounts/${f.observed.accountKey}`).update({ deletionClosedAt: Timestamp.now() });
    if (mode === 'expired') f.setTime(f.clock().getTime() + 70 * lifecycleDay);
    const plan = await f.plan(); assert.equal(plan.entries[0].action, 'blocked');
    await assert.rejects(f.apply(plan), /blocked/);
    assert.equal((await f.archive.get()).get('authorAccountKey'), undefined);
  });
}
test('author adoption rolls back, rejects drift and cannot resurrect after concurrent deletion', { skip: !enabled }, async t => {
  const f = await fixture(t), plan = await f.plan();
  assert.equal(plan.entries[0].action, 'bind', plan.entries[0].reason);
  await assert.rejects(f.apply(plan, { beforeCommit: () => { throw new Error('injected'); } }), /injected/);
  assert.equal((await f.archive.get()).get('authorAccountKey'), undefined);
  const deletion = f.db.doc(`accountDeletionRequests/${f.uid}`);
  const outcomes = await Promise.allSettled([f.apply(plan), deletion.set({ userId: f.uid, status: 'pending' })]);
  assert.equal(outcomes[1].status, 'fulfilled');
  await assert.rejects(f.apply(plan), /blocked/);
  const afterDeletion = await f.archive.get();
  await assert.rejects(f.apply(plan), /blocked/);
  assert((await f.archive.get()).updateTime.isEqual(afterDeletion.updateTime));
  await f.archive.delete();
  await assert.rejects(f.apply(plan), /blocked/);
  assert.equal((await f.archive.get()).exists, false);
});
test('a missing source is supported only by the actual captured SDK proof', { skip: !enabled }, async t => {
  const f = await fixture(t), stale = await f.plan();
  assert.equal(stale.entries[0].action, 'bind', stale.entries[0].reason);
  await f.root.delete();
  await assert.rejects(f.apply(stale), /proof-drift/);
  const current = await f.plan(); assert.equal(current.entries[0].action, 'bind');
  assert.equal((await f.apply(current)).writes, 1);
});
test('adoption refuses disabled disclosure and batches over 50 before IO', { skip: !enabled }, async t => {
  const f = await fixture(t);
  await assert.rejects(planArchiveIdentityAdoption(f.runtime, [f.archive.path]), /disclosure/);
  await assert.rejects(planArchiveIdentityAdoption(f.runtime, Array(51).fill(f.archive.path), { disclosurePolicy: policy }), /paths/);
});
test('50 old public bodies share account reads and a blocked row rolls back the whole batch', { skip: !enabled }, async t => {
  const f = await fixture(t), paths = [f.archive.path];
  const legacy = createContentLifecycleDatabase(f.db, { enabled: true, clock: f.clock });
  // This is an emulator fixture representing pre-identity capture, never a
  // live bypass of the observation writer.
  const roots = Array.from({ length: 49 }, (_, n) => f.keep(f.db.doc(`shouts/${f.uid}_${n}`)));
  for (const ref of roots) f.keep(f.db.doc(`contentLifecycleThreads/${ref.id}`));
  await legacy.runTransaction(tx => {
    for (const ref of roots) tx.create(ref, { authorId: f.uid, title: 'Batch synthetic', text: 'Batch body',
      createdAt: Timestamp.fromDate(f.clock()), expiresAt: Timestamp.fromMillis(f.clock().getTime() + lifecycleDay), status: 'active' });
  });
  for (const row of await f.db.getAll(...roots)) paths.push(f.keep(f.db.doc(`contentLifecycleArchive/${row.get('contentArchiveKey')}`)).path);
  const plan = await planArchiveIdentityAdoption(f.runtime, paths, { disclosurePolicy: policy });
  assert(plan.entries.every(e => e.action === 'bind'), JSON.stringify(plan.entries.filter(e => e.reason)));
  assert(plan.documentReads <= 156, String(plan.documentReads));
  const last = f.db.doc(paths.at(-1)); await last.update({ contentHash: '0'.repeat(64) });
  await assert.rejects(f.apply(plan), /blocked/);
  assert.equal((await f.archive.get()).get('authorAccountKey'), undefined);
  const original = await f.db.doc(roots.at(-1).path).get();
  const { lifecycleBodyHash } = await import('./content_lifecycle.js');
  await last.update({ contentHash: lifecycleBodyHash(original.data()) });
  const fresh = await planArchiveIdentityAdoption(f.runtime, paths, { disclosurePolicy: policy });
  const result = await f.apply(fresh); assert.equal(result.writes, 50); assert(result.documentReads <= 156);
});
test('read-only preflight works without capture fence, resumes and never authorizes migration', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.db.doc('contentLifecycleControl/current').delete();
  const extra = Array.from({ length: 51 }, (_, n) => f.keep(f.db.doc(`shouts/${f.uid}_scan_${n}`)));
  const batch = f.db.batch(); for (const ref of extra) batch.create(ref, { text: 'Never in plan', status: 'deleted' }); await batch.commit();
  const plan = await planLifecyclePreflight(f.db); assert.equal(plan.activationAuthorized, false);
  assert.throws(() => validateLifecycleInventoryPlan(plan, f.db.projectId), /invalid/);
  let checkpoint = null; const records = [], issues = []; let fullPage = false;
  do {
    const page = await readLifecyclePreflightPage(f.db, plan, checkpoint && JSON.parse(JSON.stringify(checkpoint)));
    assert.equal(page.writes, 0); assert(page.records.length <= 50); records.push(...page.records); issues.push(...page.issues);
    fullPage ||= page.records.length === 50;
    assert(!JSON.stringify(page).includes('Never in plan'));
    checkpoint = page.checkpoint;
    if (page.complete) break;
  } while (checkpoint.phase < 9);
  assert(records.some(r => r.path === f.root.path));
  assert(fullPage); assert(issues.some(i => i.reason === 'original-removal-time-unproven'));
  assert(!(await f.db.doc('contentLifecycleControl/current').get()).exists);
  await f.keep(f.db.doc('contentLifecycleControl/current')).set({ changed: true });
  await assert.rejects(readLifecyclePreflightPage(f.db, plan), /control-drift/);
});
