// Explicitly approved, bounded DEV fixture. Never imported by deployed hosts.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { canonical } from './feed_block_index.js';
import { createFeedRuntime } from './feed_runtime.js';
import { requireEligibleActor } from './callable_security.js';
import { createShoutOperation } from './create_shout.js';
import { createPrivateReplyOperation } from './create_private_reply.js';
import { removePilotReadKeys } from './feed_news_pilot.js';

export const privateDeletionProject = 'shoutout-dev-46c81';
const names = ['Bright_Otter_182', 'TestBusiness'];
const stamp = t => t ? [t.seconds, t.nanoseconds] : null;
const hash = x => createHash('sha256').update(canonical(x)).digest('hex');
const digest = x => createHash('sha256').update(x).digest('hex');
const same = (a, b) => canonical(a) === canonical(b);
const noAuth = { getUser() { throw Error('private-pilot-auth-mutation-forbidden'); } };
const request = (uid, data) => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'internal-private-delete-pilot' }, data });
function target(db) {
  assert(db.projectId === privateDeletionProject || db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080', 'private-pilot-dev-required');
}
function slots(plan) {
  const [a, b] = plan.actors;
  const root = { idempotencyKey: plan.keys[0], title: `MVP private deletion ${plan.runId.slice(-8)}`,
    text: 'Synthetic DEV private deletion pilot. Remove after verification.', categories: ['Dotaz'], durationMinutes: 1440,
    location: { latitude: 50.53, longitude: 14.13 } };
  const shoutId = digest(`${a.uid}\n${plan.keys[0]}`);
  const firstId = digest(`${b.uid}\ncreatePrivateReply\n${plan.keys[1]}`);
  return [{ uid: a.uid, id: shoutId, data: root },
    { uid: b.uid, id: firstId, data: { expectedUserId: b.uid, idempotencyKey: plan.keys[1], shoutId, targetType: 'shout', text: 'MVP private deletion first message' } },
    { uid: a.uid, id: digest(`${a.uid}\ncreatePrivateReply\n${plan.keys[2]}`), data: { expectedUserId: a.uid, idempotencyKey: plan.keys[2], shoutId,
      targetType: 'privateReply', parentPrivateReplyId: firstId, text: 'MVP private deletion continuation' } }];
}
export function validatePrivateDeletionPilot(db, plan) {
  target(db); const { digest: approved, ...data } = plan;
  assert.equal(approved, hash(data), 'private-pilot-digest'); assert.equal(plan.projectId, db.projectId);
  assert.equal(plan.v, 1); assert(/^mvp-private-delete-[a-f0-9]{16}$/.test(plan.runId));
  assert.deepEqual(plan.actors.map(a => a.nickname), names);
  assert.equal(new Set(plan.actors.map(a => a.uid)).size, 2);
  assert(plan.actors.every(a => /^[A-Za-z0-9_-]{1,128}$/.test(a.uid)));
  assert.equal(plan.keys.length, 3); assert.equal(new Set(plan.keys).size, 3);
  assert(plan.keys.every(k => /^op1_\d+_[a-f0-9]{32}$/.test(k)));
  assert(Number.isSafeInteger(plan.plannedAt) && plan.plannedAt > 0);
  assert(Array.isArray(plan.originals) && Array.isArray(plan.requests) && plan.incarnations.length > 0);
  assert(!plan.originals.some(row => row.id === slots(plan)[0].id));
}
async function fence(reader, db, plan) {
  const current = await reader.getAll(db.doc('feedIndexControl/current'), db.doc('feedNewsControl/current'),
    ...plan.incarnations.map(g => db.doc(`feedIndexGenerations/${g.id}`)),
    ...plan.originals.map(d => db.doc(`shouts/${d.id}`)), ...plan.requests.map(d => db.doc(`accountDeletionRequests/${d.id}`)));
  assert.equal(hash(current[0].data()), plan.controlHash, 'private-pilot-control-drift');
  assert.equal(hash(current[1].data()), plan.newsHash, 'private-pilot-news-drift');
  assert(current[0].get('mode') === 'active' && current[1].get('mode') === 'active');
  let at = 2;
  for (const g of plan.incarnations) assert(same(stamp(current[at++].createTime), g.created), 'private-pilot-generation-replaced');
  for (const row of [...plan.originals, ...plan.requests]) assert(same(stamp(current[at++].updateTime), row.update), 'private-pilot-original-drift');
}
async function actorsReady(reader, db, plan) {
  for (const a of plan.actors) {
    const eligible = await requireEligibleActor({ request: request(a.uid), db, reader, requireContentPermission: true });
    assert.equal(eligible.profile.nickname, a.nickname, 'private-pilot-actor-drift');
  }
  const blocks = await reader.getAll(...plan.actors.map((a, i) => db.doc(`users/${a.uid}/blocked/${plan.actors[1 - i].uid}`)));
  assert(blocks.every(d => !d.exists), 'private-pilot-actors-blocked');
  const roles = await reader.getAll(...plan.actors.map(a => db.doc(`accountRoles/${a.uid}`)));
  assert.notEqual(roles[0].get('role'), 'business', 'private-pilot-personal-role-required');
  assert.equal(roles[1].get('role'), 'business', 'private-pilot-business-role-required');
  assert.equal(roles[1].get('level'), 2);
}
export async function planPrivateDeletionPilot(db, actors, { expectedSources = 91 } = {}) {
  target(db); if (db.projectId === privateDeletionProject) {
    assert.equal(expectedSources, 91); assert.deepEqual(actors.map(a => a.uid), ['Ja0aoV18a7alFad5wLJlnPCSBVF3', 'it_business']);
  }
  const data = await db.runTransaction(async tx => {
    const c = await tx.get(db.doc('feedIndexControl/current')), n = await tx.get(db.doc('feedNewsControl/current'));
    const ids = c.get('writeGenerationIds'); assert(Array.isArray(ids) && ids.length > 0 && ids.length <= 3);
    const generations = await tx.getAll(...ids.map(id => db.doc(`feedIndexGenerations/${id}`)));
    assert(generations.every(d => d.exists));
    const sources = await tx.get(db.collection('shouts').select().limit(expectedSources + 1)); assert.equal(sources.size, expectedSources);
    const requests = await tx.get(db.collection('accountDeletionRequests').select().limit(51)); assert(requests.size <= 50);
    return { v: 1, projectId: db.projectId, runId: `mvp-private-delete-${randomBytes(8).toString('hex')}`, plannedAt: c.readTime.toMillis(),
      actors: actors.map(({ uid, nickname }) => ({ uid, nickname })),
      keys: Array.from({ length: 3 }, () => `op1_${c.readTime.seconds}_${randomBytes(16).toString('hex')}`),
      controlHash: hash(c.data()), newsHash: hash(n.data()), incarnations: generations.map(d => ({ id: d.id, created: stamp(d.createTime) })),
      originals: sources.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })), requests: requests.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })) };
  }, { readOnly: true });
  const plan = { ...data, digest: hash(data) }; validatePrivateDeletionPilot(db, plan);
  await fence(db, db, plan); await actorsReady(db, db, plan); return plan;
}
function guarded(db, plan) {
  return new Proxy(db, { get(object, key) {
    if (key === 'runTransaction') return (callback, options) => db.runTransaction(async tx => { await fence(tx, db, plan); return callback(tx); }, options);
    const value = object[key]; return typeof value === 'function' ? value.bind(object) : value;
  } });
}
export async function seedPrivateDeletionPilot(db, plan) {
  validatePrivateDeletionPilot(db, plan); await fence(db, db, plan); await actorsReady(db, db, plan);
  const safe = guarded(db, plan), runtime = createFeedRuntime(safe, noAuth, { newsRuntimeEnabled: true });
  const rows = slots(plan);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], server = await db.doc('feedIndexControl/current').get();
    const clock = () => server.readTime.toDate();
    if (i === 0) await createShoutOperation(request(row.uid, row.data), runtime.database, clock, { indexWriter: runtime.indexWriter });
    else await createPrivateReplyOperation(request(row.uid, row.data), safe, clock);
  }
  return privateDeletionPilotStatus(db, plan);
}
function ownedRoot(doc, plan) {
  if (!doc.exists) return;
  const row = slots(plan)[0];
  for (const key of ['title', 'text']) assert.equal(doc.get(key), row.data[key], 'private-pilot-foreign-source');
  assert.equal(doc.get('authorId'), row.uid); assert.equal(doc.get('expiresAt').toMillis() - doc.get('createdAt').toMillis(), 86400000);
  assert.deepEqual(doc.get('categories'), ['Dotaz']);
  assert.equal(doc.get('location').latitude, 50.53); assert.equal(doc.get('location').longitude, 14.13);
}
function ownedReply(doc, row, plan) {
  if (!doc.exists) return;
  assert.equal(doc.id, row.id); assert.equal(doc.get('authorId'), row.uid, 'private-pilot-foreign-message');
  assert.equal(doc.get('text'), row.data.text, 'private-pilot-foreign-message'); assert.equal(doc.get('targetType'), row.data.targetType);
  const other = plan.actors.find(a => a.uid !== row.uid).uid;
  assert.equal(doc.get('recipientId'), other); assert.deepEqual(doc.get('participants'), [row.uid, other]);
}
export async function privateDeletionPilotStatus(db, plan) {
  validatePrivateDeletionPilot(db, plan); await fence(db, db, plan);
  const [root, ...replies] = slots(plan), ref = db.doc(`shouts/${root.id}`), source = await ref.get(); ownedRoot(source, plan);
  const documents = await db.getAll(...replies.map(r => ref.collection('privateReplies').doc(r.id)));
  documents.forEach((d, i) => ownedReply(d, replies[i], plan));
  const receipts = await db.collection('serverOperations').where('shoutId', '==', root.id).limit(21).get();
  assert(receipts.size <= 20);
  const deleted = replies.map(r => receipts.docs.some(d => d.get('action') === 'deletePrivateReply' && d.get('privateReplyId') === r.id && d.get('userId') === r.uid));
  return { shoutId: root.id, title: root.data.title, sourcePresent: source.exists, expiresAt: source.get('expiresAt')?.toMillis() ?? null,
    replies: replies.map((r, i) => ({ id: r.id, author: plan.actors.find(a => a.uid === r.uid).nickname, present: documents[i].exists, deletionReceipt: deleted[i] })),
    compatibilityReceiptsPresent: deleted.every(Boolean), originalsPreserved: plan.originals.length, requestsPreserved: plan.requests.length, cloudWrites: 0 };
}
export async function cleanupPrivateDeletionPilot(db, plan) {
  validatePrivateDeletionPilot(db, plan); const [root, ...replies] = slots(plan), ref = db.doc(`shouts/${root.id}`);
  const collections = await ref.listCollections(); assert(collections.every(c => ['privateReplies', 'comments', 'saves', 'reactions'].includes(c.id)), 'private-pilot-unexpected-collection');
  const runtime = createFeedRuntime(guarded(db, plan), noAuth, { newsRuntimeEnabled: true });
  const result = await runtime.database.runTransaction(async tx => {
    const source = await tx.get(ref); ownedRoot(source, plan);
    const children = await tx.get(ref.collection('privateReplies').limit(3)); assert(children.size <= 2, 'private-pilot-foreign-descendant');
    for (const d of children.docs) { const row = replies.find(r => r.id === d.id); assert(row, 'private-pilot-foreign-descendant'); ownedReply(d, row, plan); }
    for (const name of ['comments', 'saves', 'reactions']) assert((await tx.get(ref.collection(name).limit(1))).empty, 'private-pilot-foreign-descendant');
    const notifications = await tx.getAll(...plan.actors.map(a => db.doc(`users/${a.uid}/notifications/privateReply_${root.id}`)));
    for (const d of notifications.filter(d => d.exists)) {
      assert.equal(d.get('kind'), 'privateReply'); assert.equal(d.get('targetShoutId'), root.id);
      assert(replies.some(r => r.id === d.get('targetPrivateReplyId') && r.uid === d.get('actorId')), 'private-pilot-foreign-notification');
    }
    const index = await runtime.indexWriter.prepareBatch(tx, source.exists ? [{ id: root.id, before: source.data(), after: null }] : [], { additionalWrites: children.size + notifications.length });
    index.apply(); if (source.exists) tx.delete(ref);
    // Administrative fixture cleanup cannot manufacture positive callable receipts.
    for (const d of [...children.docs, ...notifications.filter(d => d.exists)]) tx.delete(d.ref);
    return { removed: Number(source.exists), messages: children.size, expiresAt: source.get('expiresAt')?.toMillis() ?? null };
  });
  // The creation receipt survives cleanup, so interrupted read cleanup is resumable.
  const receipt = await db.doc(`serverOperations/${root.id}`).get();
  const expiresAt = result.expiresAt ?? (receipt.get('createdAt')?.toMillis() ?? 0) + 86400000;
  let readKeys = 0;
  if (receipt.exists) for (const actor of plan.actors) readKeys += await removePilotReadKeys(db,
    { slots: [{ label: 'root', title: root.data.title, text: root.data.text }] }, { root: { id: root.id, expiresAt } }, actor, tx => fence(tx, db, plan));
  await fence(db, db, plan);
  return { ...result, readKeys, receiptsRemoved: 0, rateResets: 0, authMutations: 0, originalsPreserved: plan.originals.length };
}
