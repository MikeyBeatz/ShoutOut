// Approved isolated DEV fixture; never imported by a deployed host.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { GeoPoint } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { privateDeletionPilotFence } from './private_reply_deletion_pilot.js';
import { createFeedRuntime } from './feed_runtime.js';
import { createShoutOperation } from './create_shout.js';
import { createCommentOperation } from './create_comment.js';
import { createPrivateReplyOperation } from './create_private_reply.js';
import { createContentReportOperation } from './create_content_report.js';
import { deleteCommentOperation } from './delete_comment.js';
import { removePilotReadKeys } from './feed_news_pilot.js';

export const moderationBusinessProject = 'shoutout-dev-46c81';
export const moderationBusinessActors = Object.freeze([
  { uid: 'Ja0aoV18a7alFad5wLJlnPCSBVF3', nickname: 'Bright_Otter_182' },
  { uid: 'it_business', nickname: 'TestBusiness' }, { uid: 'it_moderator', nickname: 'TestModerator' }, { uid: 'it_admin', nickname: 'TestAdmin' },
]);
const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
const digest = v => createHash('sha256').update(v).digest('hex');
const stamp = t => t ? [t.seconds, t.nanoseconds] : null;
const geo = { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' };
const identity = uid => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'internal-approved-mod-business-pilot' } });
function target(db) { assert(db.projectId === moderationBusinessProject || db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080', 'mod-business-pilot-dev-required'); }
export function validateModerationBusinessPilot(db, plan) {
  target(db); const { digest: seal, ...body } = plan;
  assert.equal(seal, hash(body), 'mod-business-pilot-digest'); assert.equal(plan.kind, 'moderation-business'); assert.equal(plan.v, 1);
  assert.equal(plan.base.projectId, db.projectId); assert(/^[a-f0-9]{16}$/.test(plan.nonce));
  assert.equal(plan.uid, `mvp_modbiz_${plan.nonce}`); assert.equal(plan.email, `mvp-modbiz-${plan.nonce}@example.test`);
  assert.equal(plan.nickname, `MVP Business ${plan.nonce.slice(-8)}`); assert.equal(plan.keys.length, 7);
  assert.equal(new Set(plan.keys).size, 7); assert(plan.keys.every(k => /^op1_\d+_[a-f0-9]{32}$/.test(k)));
  assert(plan.base.originals.every(r => r.id !== moderationBusinessSlots(plan).shout));
  assert.equal(plan.actors.length, 4); assert.equal(new Set([...plan.actors.map(a => a.uid), plan.uid]).size, 5);
  if (db.projectId === moderationBusinessProject) { assert.deepEqual(plan.actors.map(({ uid, nickname }) => ({ uid, nickname })), moderationBusinessActors); assert.equal(plan.base.originals.length, 38); assert.equal(plan.base.requests.length, 1); }
}
export function moderationBusinessSlots(p) {
  const shout = digest(`${p.uid}\n${p.keys[0]}`), comment = i => digest(`${p.uid}\ncreateComment\n${p.keys[i]}`);
  const privateReply = digest(`${p.actors[0].uid}\ncreatePrivateReply\n${p.keys[3]}`);
  return { shout, comments: [comment(1), comment(2)], privateReply,
    reports: [`${p.actors[1].uid}_${shout}`, `${p.actors[2].uid}_${shout}_${comment(1)}`, `${p.uid}_${shout}_${privateReply}`],
    title: `MVP moderation Business ${p.nonce.slice(-8)}`, text: 'Synthetic DEV moderation and Business pilot. Remove after verification.' };
}
export async function planModerationBusinessPilot(db, actors = moderationBusinessActors, { expectedSources = 38 } = {}) {
  target(db); if (db.projectId === moderationBusinessProject) assert.equal(expectedSources, 38);
  const nonce = randomBytes(8).toString('hex');
  const body = await db.runTransaction(async tx => {
    const [control, news] = await tx.getAll(db.doc('feedIndexControl/current'), db.doc('feedNewsControl/current'));
    const ids = control.get('writeGenerationIds'); assert(Array.isArray(ids) && ids.length > 0 && ids.length <= 3);
    const generations = await tx.getAll(...ids.map(id => db.doc(`feedIndexGenerations/${id}`))); assert(generations.every(d => d.exists));
    const sources = await tx.get(db.collection('shouts').select().limit(expectedSources + 1)); assert.equal(sources.size, expectedSources);
    const requests = await tx.get(db.collection('accountDeletionRequests').select().limit(51)); assert(requests.size <= 50);
    const staff = await tx.getAll(...actors.flatMap(a => ['users', 'accountRoles', 'moderators'].map(c => db.doc(`${c}/${a.uid}`))));
    actors.forEach((a, n) => { assert.equal(staff[n * 3].get('nickname'), a.nickname); if (n >= 2) assert.equal(staff[n * 3 + 1].get('level'), n === 2 ? 3 : 5); });
    return { v: 1, kind: 'moderation-business', nonce, uid: `mvp_modbiz_${nonce}`, email: `mvp-modbiz-${nonce}@example.test`, nickname: `MVP Business ${nonce.slice(-8)}`,
      actors: actors.map((a, n) => ({ ...a, stamps: staff.slice(n * 3, n * 3 + 3).map(d => stamp(d.updateTime)) })),
      keys: Array.from({ length: 7 }, () => `op1_${control.readTime.seconds}_${randomBytes(16).toString('hex')}`),
      base: { projectId: db.projectId, plannedAt: control.readTime.toMillis(), controlHash: hash(control.data()), newsHash: hash(news.data()),
        incarnations: generations.map(d => ({ id: d.id, created: stamp(d.createTime) })), originals: sources.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })),
        requests: requests.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })) } };
  }, { readOnly: true });
  const plan = { ...body, digest: hash(body) }; validateModerationBusinessPilot(db, plan); await moderationBusinessFence(db, db, plan); return plan;
}
export async function moderationBusinessFence(reader, db, plan) {
  validateModerationBusinessPilot(db, plan); await privateDeletionPilotFence(reader, db, plan.base);
  const rows = await reader.getAll(...plan.actors.flatMap(a => ['users', 'accountRoles', 'moderators'].map(c => db.doc(`${c}/${a.uid}`))));
  for (const [n, a] of plan.actors.entries()) for (let i = 0; i < 3; i++) assert.equal(canonical(stamp(rows[n * 3 + i].updateTime)), canonical(a.stamps[i]), 'mod-business-pilot-actor-drift');
  const ownRequest = await reader.getAll(db.doc(`accountDeletionRequests/${plan.uid}`)); assert(!ownRequest[0].exists, 'mod-business-pilot-account-request-unexpected');
}
function guarded(db, plan) { return new Proxy(db, { get(object, key) {
  if (key === 'runTransaction') return (operation, options) => db.runTransaction(async tx => { await moderationBusinessFence(tx, db, plan); return operation(tx); }, options);
  return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
} }); }
function validAuth(user, p) {
  assert.equal(user.uid, p.uid); assert.equal(user.email, p.email); assert.equal(user.displayName, p.nickname); assert.equal(user.emailVerified, true);
  assert(Date.parse(user.metadata?.creationTime) >= p.base.plannedAt - 1000, 'mod-business-pilot-preexisting-auth');
}
export async function ensureModerationBusinessAuth(db, auth, p, password) {
  await moderationBusinessFence(db, db, p); assert(typeof password === 'string' && password.length >= 20, 'mod-business-pilot-password-required');
  let user;
  try { user = await auth.getUser(p.uid); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
  if (!user) {
    assert((await db.doc('feedIndexControl/current').get()).readTime.toMillis() < p.base.plannedAt + 86400000, 'mod-business-pilot-plan-expired');
    user = await auth.createUser({ uid: p.uid, email: p.email, displayName: p.nickname, emailVerified: true, password });
  }
  validAuth(user, p); return { uid: p.uid, authCreatedAt: user.metadata.creationTime };
}
export async function seedModerationBusinessAccount(db, auth, p) {
  const user = await auth.getUser(p.uid); validAuth(user, p); const f = guarded(db, p);
  return f.runTransaction(async tx => {
    const refs = ['users', 'publicProfiles', 'businessApplications', 'businessProfiles', 'accountRoles'].map(c => db.doc(`${c}/${p.uid}`));
    const docs = await tx.getAll(...refs);
    if (docs[2].exists) { assert.equal(docs[2].get('userId'), p.uid); assert.equal(docs[2].get('pilotId'), p.nonce); return { seeded: false }; }
    assert(docs.every(d => !d.exists), 'mod-business-pilot-identity-collision');
    const now = docs[0].readTime, profile = { nickname: p.nickname, avatarId: 'fox', avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'navy', avatarGradientDirection: 'horizontal' };
    tx.create(refs[0], { ...profile, email: p.email, pilotId: p.nonce }); tx.create(refs[1], profile);
    tx.create(db.doc(`users/${p.uid}/legal/acceptance_2026_07_25`), {});
    tx.create(refs[2], { userId: p.uid, countryCode: 'CZ', registrationNumber: '12345678', submittedCompanyName: p.nickname, submittedAddress: 'Synthetic 12', submittedCity: 'Usti', submittedPostalCode: '40001',
      initialLocationName: p.nickname, initialLocationAddress: 'Synthetic 12', initialLocationCity: 'Usti', initialLocationPostalCode: '40001', initialLocationCountryCode: 'CZ',
      initialLocation: new GeoPoint(50.53, 14.13), initialLocationGeohash: 'u2fhxxx', initialLocationProviderPlaceId: `fixture-${p.nonce}`, contactEmail: p.email, status: 'checking', submittedAt: now, pilotId: p.nonce });
    return { seeded: true };
  });
}
const avatarBefore = Object.freeze({ avatarId: 'avatar_01', avatarBackgroundStart: 1, avatarBackgroundEnd: 2 });
const avatarAfter = Object.freeze({ avatarId: 'fox', avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'navy' });
function avatarFields(data) { return Object.fromEntries(Object.keys(avatarAfter).map(k => [k, data[k]])); }
function validateAvatarRepair(db, p, plan) {
  validateModerationBusinessPilot(db, p);
  const { digest: seal, ...body } = plan;
  assert.equal(seal, hash(body), 'mod-business-pilot-avatar-digest');
  assert.equal(plan.kind, 'moderation-business-avatar-repair'); assert.equal(plan.v, 1);
  assert.equal(plan.projectId, db.projectId); assert.equal(plan.uid, p.uid); assert.equal(plan.pilotDigest, p.digest);
  assert.deepEqual(plan.patch, avatarAfter);
  assert.deepEqual(plan.rows.map(r => r.path), [`users/${p.uid}`, `publicProfiles/${p.uid}`]);
  for (const row of plan.rows) { assert.deepEqual(row.fields, avatarBefore); assert.equal(row.updateTime.length, 2); assert(/^[a-f0-9]{64}$/.test(row.hash)); }
}
async function avatarRepairRows(db, p, tx) {
  const refs = [`users/${p.uid}`, `publicProfiles/${p.uid}`].map(path => db.doc(path));
  const [app, ...docs] = await tx.getAll(db.doc(`businessApplications/${p.uid}`), ...refs);
  assert.equal(app.get('pilotId'), p.nonce); assert.equal(app.get('status'), 'suspended'); assert.equal(app.get('revision'), 4);
  assert(docs.every(d => d.exists), 'mod-business-pilot-avatar-missing');
  assert.equal(docs[0].get('pilotId'), p.nonce); assert(docs.every(d => d.get('nickname') === p.nickname));
  return docs;
}
export async function planModerationBusinessAvatarRepair(db, p) {
  return guarded(db, p).runTransaction(async tx => {
    const docs = await avatarRepairRows(db, p, tx);
    const rows = docs.map(d => {
      assert.deepEqual(avatarFields(d.data()), avatarBefore, 'mod-business-pilot-avatar-unexpected');
      return { path: d.ref.path, updateTime: stamp(d.updateTime), hash: hash(d.data()), fields: avatarFields(d.data()) };
    });
    const body = { v: 1, kind: 'moderation-business-avatar-repair', projectId: db.projectId, uid: p.uid, pilotDigest: p.digest, patch: avatarAfter, rows };
    return { ...body, digest: hash(body) };
  });
}
export async function repairModerationBusinessAvatar(db, p, plan) {
  validateAvatarRepair(db, p, plan);
  return guarded(db, p).runTransaction(async tx => {
    const docs = await avatarRepairRows(db, p, tx);
    const complete = docs.every(d => canonical(avatarFields(d.data())) === canonical(avatarAfter));
    if (complete) {
      docs.forEach((d, i) => assert.equal(hash({ ...d.data(), ...avatarBefore }), plan.rows[i].hash, 'mod-business-pilot-avatar-unrelated-drift'));
      return { repaired: true, repeated: true, documentsWritten: 0 };
    }
    docs.forEach((d, i) => {
      assert.deepEqual(avatarFields(d.data()), avatarBefore, 'mod-business-pilot-avatar-unexpected');
      assert.deepEqual(stamp(d.updateTime), plan.rows[i].updateTime, 'mod-business-pilot-avatar-stale');
      assert.equal(hash(d.data()), plan.rows[i].hash, 'mod-business-pilot-avatar-unrelated-drift');
    });
    for (const d of docs) tx.update(d.ref, avatarAfter);
    return { repaired: true, repeated: false, documentsWritten: 2 };
  });
}
const request = (uid, data) => ({ ...identity(uid), data: { expectedUserId: uid, ...data } });
export async function seedModerationBusinessContent(db, p) {
  await moderationBusinessFence(db, db, p); const s = moderationBusinessSlots(p), safe = guarded(db, p), runtime = createFeedRuntime(safe, { getUser() { throw Error('mod-business-pilot-no-auth-delete'); } }, { newsRuntimeEnabled: true });
  const account = await db.doc(`businessApplications/${p.uid}`).get(); assert.equal(account.get('pilotId'), p.nonce); assert.equal(account.get('status'), 'active');
  const clock = async () => (await db.doc('feedIndexControl/current').get()).readTime.toDate();
  try {
    let date = await clock(); await createShoutOperation(request(p.uid, { idempotencyKey: p.keys[0], title: s.title, text: s.text, categories: ['Dotaz'], durationMinutes: 1440, businessLocationId: 'initial' }), runtime.database, () => date, { indexWriter: runtime.indexWriter });
    await runtime.database.runTransaction(async tx => {
      const root = await tx.get(db.doc(`shouts/${s.shout}`)); assert.equal(root.get('authorId'), p.uid); assert.equal(root.get('title'), s.title);
      if (root.get('geography')) { assert.deepEqual(root.get('geography'), geo); return; }
      const index = await runtime.indexWriter.prepare(tx, root.id, root.data(), { ...root.data(), geography: geo }); index.apply(); tx.update(root.ref, { geography: geo });
    });
    for (let i = 1; i <= 2; i++) { date = await clock(); await createCommentOperation(request(p.uid, { idempotencyKey: p.keys[i], shoutId: s.shout, text: `MVP ${p.nonce} comment ${i}` }), runtime.database, () => date); }
    date = await clock(); await createPrivateReplyOperation(request(p.actors[0].uid, { idempotencyKey: p.keys[3], shoutId: s.shout, targetType: 'shout', text: `MVP ${p.nonce} private reply` }), safe, () => date);
    for (const [i, type] of ['shout', 'comment', 'privateReply'].entries()) {
      const uid = i === 0 ? p.actors[1].uid : i === 1 ? p.actors[2].uid : p.uid;
      date = await clock(); await createContentReportOperation(request(uid, { idempotencyKey: p.keys[4 + i], targetType: type, shoutId: s.shout,
        ...(i ? { targetId: i === 1 ? s.comments[0] : s.privateReply } : {}), reason: `MVP modbiz ${p.nonce.slice(-8)} ${type}. Remove after verification.` }), safe, () => date);
    }
  } catch (e) { if (e.code === 'resource-exhausted') return { waitingForCooldown: true }; throw e; }
  return { waitingForCooldown: false, ...s };
}
const observedAdminPilot = Object.freeze({
  uid: 'mvp_modbiz_f794f930926a31d2', pilotDigest: '84f4aac021b69a9d858d668ccfe0dd4dece2b6c990092edafcb157ae23de5335',
  ids: ['a71f1dc563757c64fef5b0a91487e6ff52a89cb891c8081cb451d125e6d55b9a',
    'b94f2f575bbf760ed22f4bdbdbbf78f4df8604aedde398e67f789e354286349e',
    '109beaa0aa214fb04fd203983bfc6c48a07548c6ccc7982ceb3a41882497721a'],
});
const observedDecisions = ['warning', 'ban7d', 'ban1d'];
function assertObservedReceipt(db, p, receipt, decision) {
  const s = moderationBusinessSlots(p);
  assert(receipt.exists, 'mod-business-pilot-observed-receipt-missing');
  assert.equal(receipt.get('action'), 'sanctionContent'); assert.equal(receipt.get('userId'), p.actors[3].uid);
  assert.equal(receipt.get('authorId'), p.uid); assert.equal(receipt.get('sanctionId'), receipt.id);
  assert.equal(receipt.get('shoutId'), s.shout); assert.equal(receipt.get('targetType'), 'shout'); assert.equal(receipt.get('targetId'), undefined);
  assert.equal(receipt.get('result.decision'), decision); assert.equal(receipt.get('requiredRoleLevel'), 3);
  assert.deepEqual(receipt.get('reportIds'), decision === 'warning' ? [s.reports[0]] : []);
  assert.equal(receipt.get('result.count'), decision === 'warning' ? 1 : 0);
  assert.equal(receipt.get('expiresAt').toMillis() - receipt.get('createdAt').toMillis(), 7 * 86400000);
  if (db.projectId === moderationBusinessProject) {
    assert.equal(p.uid, observedAdminPilot.uid); assert.equal(p.digest, observedAdminPilot.pilotDigest);
    assert.equal(receipt.id, observedAdminPilot.ids[observedDecisions.indexOf(decision)]);
  }
}
function validateObservedPlan(db, p, accepted) {
  validateModerationBusinessPilot(db, p);
  const { digest: seal, ...body } = accepted;
  assert.equal(seal, hash(body), 'mod-business-pilot-observed-digest');
  assert.deepEqual(Object.keys(body).sort(), ['v', 'kind', 'projectId', 'uid', 'pilotDigest', 'shoutId', 'actorId', 'rows'].sort());
  assert.equal(accepted.v, 1); assert.equal(accepted.kind, 'observed-admin-sanctions'); assert.equal(accepted.projectId, db.projectId);
  assert.equal(accepted.uid, p.uid); assert.equal(accepted.pilotDigest, p.digest); assert.equal(accepted.actorId, p.actors[3].uid);
  assert.equal(accepted.shoutId, moderationBusinessSlots(p).shout); assert.equal(accepted.rows.length, 3);
  assert.deepEqual(accepted.rows.map(r => r.decision), observedDecisions); assert.equal(new Set(accepted.rows.map(r => r.id)).size, 3);
  for (const row of accepted.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['id', 'decision', 'receiptHash'].sort()); assert(/^[a-f0-9]{64}$/.test(row.id)); assert(/^[a-f0-9]{64}$/.test(row.receiptHash));
  }
  if (db.projectId === moderationBusinessProject) {
    assert.equal(p.uid, observedAdminPilot.uid); assert.equal(p.digest, observedAdminPilot.pilotDigest);
    assert.deepEqual(accepted.rows.map(r => r.id), observedAdminPilot.ids);
  }
}
async function observedEvidence(db, p, accepted) {
  if (!accepted) return null;
  validateObservedPlan(db, p, accepted);
  const docs = await db.getAll(...accepted.rows.map(r => db.doc(`serverOperations/${r.id}`)));
  docs.forEach((d, i) => {
    assertObservedReceipt(db, p, d, accepted.rows[i].decision);
    assert.equal(hash(d.data()), accepted.rows[i].receiptHash, 'mod-business-pilot-observed-receipt-drift');
  });
  return new Map(docs.map(d => [d.id, d]));
}
export async function planObservedAdminSanctions(db, p) {
  await moderationBusinessFence(db, db, p);
  const author = (await db.collection('serverOperations').where('authorId', '==', p.uid).limit(40).get()).docs;
  assert(author.length < 40); const receipts = author.filter(d => d.get('action') === 'sanctionContent'); assert.equal(receipts.length, 3);
  const rows = observedDecisions.map(decision => {
    const found = receipts.filter(d => d.get('result.decision') === decision); assert.equal(found.length, 1);
    assertObservedReceipt(db, p, found[0], decision); return { id: found[0].id, decision, receiptHash: hash(found[0].data()) };
  });
  const body = { v: 1, kind: 'observed-admin-sanctions', projectId: db.projectId, uid: p.uid, pilotDigest: p.digest,
    shoutId: moderationBusinessSlots(p).shout, actorId: p.actors[3].uid, rows };
  const accepted = { ...body, digest: hash(body) }; validateObservedPlan(db, p, accepted); return accepted;
}
function assertObservedSanction(p, s, d, receipt) {
  assert(receipt, 'mod-business-pilot-observed-unplanned-sanction');
  assert.equal(d.get('moderatorId'), p.actors[3].uid); assert.equal(d.get('userId'), p.uid);
  assert.equal(d.get('sourceContentType'), 'shout'); assert.equal(d.get('sourceContentId'), s.shout);
  assert.equal(d.get('sourceType'), receipt.get('result.decision') === 'warning' ? 'report' : 'moderatorObservation');
  assert.equal(d.get('createdAt').toMillis(), receipt.get('createdAt').toMillis());
  const days = receipt.get('result.decision') === 'ban7d' ? 7 : receipt.get('result.decision') === 'ban1d' ? 1 : null;
  assert.equal(d.get('type'), days === null ? 'warning' : 'accountBan');
  if (days !== null) assert.equal(d.get('expiresAt').toMillis() - d.get('createdAt').toMillis(), days * 86400000);
}
export async function moderationBusinessPilotStatus(db, p, { acceptedAdminSanctions = null } = {}) {
  await moderationBusinessFence(db, db, p); const s = moderationBusinessSlots(p);
  const accepted = await observedEvidence(db, p, acceptedAdminSanctions);
  const application = await db.doc(`businessApplications/${p.uid}`).get(), root = await db.doc(`shouts/${s.shout}`).get();
  if (application.exists) assert.equal(application.get('pilotId'), p.nonce);
  if (root.exists) { assert.equal(root.get('authorId'), p.uid); assert.equal(root.get('title'), s.title); assert.equal(root.get('text'), s.text); }
  const audits = (await db.collection('businessActivationAudits').where('applicationId', '==', p.uid).get()).docs.sort((a, b) => a.get('revision') - b.get('revision'));
  const expected = ['reject', 'resubmit', 'approve', 'suspend', 'reactivate']; assert(audits.length <= 5);
  audits.forEach(d => { const i = d.get('revision') - 1; assert(i >= 0 && i < 5); assert.equal(d.get('action'), expected[i]); assert.equal(d.get('administratorId'), i === 1 ? null : p.actors[3].uid); });
  const sanctions = (await db.collection('sanctions').where('userId', '==', p.uid).get()).docs;
  for (const d of sanctions) {
    if (accepted) assertObservedSanction(p, s, d, accepted.get(d.id));
    else assert.equal(d.get('moderatorId'), p.actors[2].uid, 'mod-business-pilot-wrong-sanction-actor');
  }
  const reports = await db.getAll(...['reports', 'commentReports', 'privateReplyReports'].map((c, i) => db.doc(`${c}/${s.reports[i]}`)));
  for (const r of reports) if (r.exists) assert.equal(r.get('shoutId'), s.shout);
  const pointer = await db.doc(`bans/${p.uid}`).get();
  return { uid: p.uid, title: s.title, shoutId: s.shout, application: application.get('status') ?? null, revision: application.get('revision') ?? 0,
    businessDecisions: audits.map(d => d.get('action')), sanctions: sanctions.map(d => ({ id: d.id, type: d.get('type'), days: d.get('expiresAt') ? (d.get('expiresAt').toMillis() - d.get('createdAt').toMillis()) / 86400000 : null })),
    activeBan: pointer.exists ? { sanctionId: pointer.get('sanctionId'), expiresAt: pointer.get('expiresAt')?.toMillis() } : null,
    reports: reports.map(d => ({ exists: d.exists, status: d.get('status') ?? null, resolution: d.get('resolution') ?? null })), comments: s.comments, originalsPreserved: p.base.originals.length, cloudWrites: 0 };
}
async function cleanupProof(db, p, acceptedAdminSanctions) {
  const accepted = await observedEvidence(db, p, acceptedAdminSanctions);
  const s = moderationBusinessSlots(p), author = (await db.collection('serverOperations').where('authorId', '==', p.uid).limit(40).get()).docs;
  if (accepted) {
    const rows = (await db.collection('sanctions').where('userId', '==', p.uid).limit(4).get()).docs;
    assert(rows.length <= 3, 'mod-business-pilot-observed-unplanned-sanction');
    for (const row of rows) assertObservedSanction(p, s, row, accepted.get(row.id));
  }
  assert(author.length < 40, 'mod-business-pilot-unbounded-proof');
  const business = author.filter(d => d.get('action') === 'reviewBusinessApplication').sort((a, b) => a.get('result.revision') - b.get('result.revision'));
  const actions = ['reject', 'resubmit', 'approve', 'suspend', 'reactivate']; assert.equal(business.length, 5, 'mod-business-pilot-business-proof-required');
  business.forEach((d, i) => { assert.equal(d.get('decision'), actions[i]); assert.equal(d.get('result.revision'), i + 1); assert.equal(d.get('userId'), i === 1 ? p.uid : p.actors[3].uid); });
  const sanctions = author.filter(d => d.get('action') === 'sanctionContent'); assert.equal(sanctions.length, 3, 'mod-business-pilot-sanction-proof-required');
  for (const d of sanctions) { assert.equal(d.get('userId'), accepted?.has(d.id) ? p.actors[3].uid : p.actors[2].uid); assert.equal(d.get('shoutId'), s.shout); }
  assert.deepEqual(sanctions.map(d => d.get('result.decision')).sort(), ['ban1d', 'ban7d', 'warning']);
  const long = sanctions.find(d => d.get('result.decision') === 'ban7d'), short = sanctions.find(d => d.get('result.decision') === 'ban1d');
  const revocations = author.filter(d => d.get('action') === 'revokeSanction'); assert.equal(revocations.length, 1);
  assert.equal(revocations[0].get('sanctionId'), long.get('sanctionId')); assert.equal(revocations[0].get('userId'), p.actors[3].uid); assert.equal(revocations[0].get('result.revoked'), true);
  assert(long.get('createdAt').toMillis() <= short.get('createdAt').toMillis() && short.get('createdAt').toMillis() <= revocations[0].get('createdAt').toMillis());
  assert(!(await db.doc(`bans/${p.uid}`).get()).exists, 'mod-business-pilot-active-ban');
  const receipts = (await db.collection('serverOperations').where('shoutId', '==', s.shout).limit(40).get()).docs; assert(receipts.length < 40);
  for (const report of s.reports) assert(receipts.some(d => ['sanctionContent', 'decideContentReports', 'resolveUnavailableContentReports'].includes(d.get('action')) && d.get('reportIds')?.includes(report)), 'mod-business-pilot-report-proof-required');
}
export async function orphanModerationBusinessComment(db, p, options = {}) {
  const status = await moderationBusinessPilotStatus(db, p, options); assert.equal(status.businessDecisions.length, 5); assert.equal(status.activeBan, null); assert(status.sanctions.length >= 3);
  const s = moderationBusinessSlots(p), safe = guarded(db, p), runtime = createFeedRuntime(safe, { getUser() { throw Error('mod-business-pilot-auth-forbidden'); } });
  const doc = await db.doc(`shouts/${s.shout}/comments/${s.comments[0]}`).get();
  if (!doc.exists) return { removed: false }; assert.equal(doc.get('authorId'), p.uid); assert.equal(doc.get('text'), `MVP ${p.nonce} comment 1`);
  const now = doc.readTime.toDate(); return deleteCommentOperation(request(p.uid, { shoutId: s.shout, commentId: doc.id, idempotencyKey: `op1_${doc.readTime.seconds}_${digest(p.nonce + ':orphan').slice(0, 32)}` }), runtime.database, () => now, { authorOnly: true });
}
export async function cleanupModerationBusinessPilot(db, auth, p, { acceptedAdminSanctions = null } = {}) {
  await moderationBusinessFence(db, db, p); await cleanupProof(db, p, acceptedAdminSanctions); const s = moderationBusinessSlots(p);
  const root = db.doc(`shouts/${s.shout}`), safe = guarded(db, p), runtime = createFeedRuntime(safe, { getUser() { throw Error('mod-business-pilot-auth-forbidden'); } });
  const current = await root.get(); if (current.exists) { assert.equal(current.get('authorId'), p.uid); assert.equal(current.get('title'), s.title); assert.equal(current.get('text'), s.text); }
  let user; try { user = await auth.getUser(p.uid); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
  if (user) validAuth(user, p);
  assert((await root.listCollections()).every(c => ['comments', 'privateReplies', 'reactions', 'saves'].includes(c.id)), 'mod-business-pilot-foreign-descendant');
  for (const c of ['reactions', 'saves']) assert((await root.collection(c).limit(1).get()).empty, 'mod-business-pilot-unplanned-interaction');
  for (const [c, ids] of [['comments', s.comments], ['privateReplies', [s.privateReply]]]) {
    for (const row of (await root.collection(c).get()).docs) { assert(ids.includes(row.id), 'mod-business-pilot-foreign-child'); assert.equal(row.get('text'), `MVP ${p.nonce} ${c === 'comments' ? `comment ${ids.indexOf(row.id) + 1}` : 'private reply'}`); assert.equal((await row.ref.listCollections()).length, 0, 'mod-business-pilot-foreign-descendant'); }
  }
  const creation = await db.doc(`serverOperations/${s.shout}`).get(); assert.equal(creation.get('action'), 'createShout'); assert.equal(creation.get('userId'), p.uid);
  const expiresAt = current.get('expiresAt')?.toMillis() ?? creation.get('createdAt').toMillis() + 86400000; assert(Number.isSafeInteger(expiresAt));
  const reports = await db.getAll(...['reports', 'commentReports', 'privateReplyReports'].map((c, i) => db.doc(`${c}/${s.reports[i]}`)));
  const notices = (await db.collectionGroup('notifications').where('targetShoutId', '==', s.shout).get()).docs;
  for (const d of notices) assert([...p.actors.map(a => a.uid), p.uid].includes(d.ref.path.split('/')[1]), 'mod-business-pilot-foreign-notification');
  // Freeze only after all positive proofs and ownership preflights. Keep the
  // approved minimal tombstone so a previously issued token cannot restore data.
  await safe.runTransaction(async tx => {
    const profile = await tx.get(db.doc(`users/${p.uid}`)); if (profile.exists) assert.equal(profile.get('pilotId'), p.nonce);
    tx.set(db.doc(`publicProfiles/${p.uid}`), { schemaVersion: 1, accountStatus: 'deleted' }); tx.delete(db.doc(`users/${p.uid}`));
  });
  if (user) await auth.deleteUser(p.uid);
  for (const actor of [...p.actors, { uid: p.uid }]) await removePilotReadKeys(db, { slots: [{ label: 'root', title: s.title, text: s.text }] }, { root: { id: s.shout, expiresAt } }, actor, tx => moderationBusinessFence(tx, db, p));
  await runtime.database.runTransaction(async tx => {
    const source = await tx.get(root), descendants = await tx.getAll(...[...s.comments.map(id => root.collection('comments').doc(id)), root.collection('privateReplies').doc(s.privateReply)]);
    assert.equal(canonical(stamp(source.updateTime)), canonical(stamp(current.updateTime)), 'mod-business-pilot-source-changed-during-cleanup');
    const deletes = [...descendants, ...reports, ...notices].filter(d => d.exists);
    const index = await runtime.indexWriter.prepareBatch(tx, source.exists ? [{ id: root.id, before: source.data(), after: null }] : [], { additionalWrites: deletes.length + Number(source.exists) }); index.apply(); deletes.forEach(d => tx.delete(d.ref)); if (source.exists) tx.delete(root);
  });
  for (const collection of ['businessActivationAudits', 'sanctions', 'warnings', 'sanctionRevocations']) {
    const rows = await db.collection(collection).where(collection === 'businessActivationAudits' ? 'applicationId' : 'userId', '==', p.uid).get();
    for (const d of rows.docs) await d.ref.delete();
  }
  for (const id of [`shout_${s.shout}`, ...s.comments.map(c => `comment_${s.shout}_${c}`), `privateReply_${s.shout}_${s.privateReply}`]) {
    const d = await db.doc(`moderationClearances/${id}`).get(); if (d.exists) { assert.equal(d.get('shoutId'), s.shout); await d.ref.delete(); }
  }
  for (const c of ['users', 'businessApplications', 'businessProfiles', 'accountRoles', 'bans', 'contentRestrictions', 'rateLimits']) await db.recursiveDelete(db.doc(`${c}/${p.uid}`));
  await moderationBusinessFence(db, db, p); return { cleaned: true, authDeleted: !!user, minimalMarkerRetained: true, receiptsRemoved: 0, existingRateResets: 0, originalsPreserved: p.base.originals.length };
}
