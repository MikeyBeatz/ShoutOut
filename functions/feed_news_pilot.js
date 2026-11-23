// Bounded, approved three-slot DEV fixture. Never deployed as a Function.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { createFeedRuntime } from './feed_runtime.js';
import { prepareNewsControlChange } from './feed_news_signals.js';
import { encodeGeohash } from './geohash.js';
import { requireEligibleActor } from './callable_security.js';
import { readBucketId, readKey, readContentHash, validateReadBlock } from './read_sync_blocks.js';

const hash = x => createHash('sha256').update(canonical(x)).digest('hex');
const stamp = t => t ? [t.seconds, t.nanoseconds] : null;
const same = (a, b) => canonical(a) === canonical(b);
const names = ['Bright_Otter_182', 'TestBusiness'];
const noAuth = { getUser() { throw Error('news-pilot-auth-forbidden'); } };
const request = uid => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'internal-news-pilot' } });
function target(db) {
  assert(db.projectId === 'shoutout-dev-46c81' || db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080', 'news-pilot-dev-required');
}
export function validateNewsPilot(db, plan) {
  target(db); const { digest, ...data } = plan;
  assert.equal(digest, hash(data), 'news-pilot-digest'); assert.equal(plan.projectId, db.projectId);
  assert(Number.isSafeInteger(plan.plannedAt) && plan.plannedAt > 0);
  assert(/^mvp-b4b-[a-z0-9-]{8,50}$/.test(plan.runId));
  assert.deepEqual(plan.actors.map(a => a.nickname), names); assert.equal(new Set(plan.actors.map(a => a.uid)).size, 2);
  assert(plan.actors.every(a => typeof a.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(a.uid)));
  assert.deepEqual(plan.slots.map(s => s.label), ['A', 'B', 'C']);
  assert.deepEqual(plan.slots.map(s => s.duration), [86400000, 86400000, 60000]);
  for (const s of plan.slots) {
    assert.equal(s.id, s.label === 'B' ? null : `${plan.runId}-${s.label}`);
    assert.equal(s.title, `MVP B4b ${s.label} ${plan.runId.slice(-6)}`);
    assert.equal(s.text, 'Synthetic DEV news pilot. Remove after verification.');
    assert.equal(s.authorId, plan.actors[s.label === 'B' ? 1 : 0].uid);
  }
  assert.deepEqual(plan.point, { latitude: 50.53, longitude: 14.13 });
}
async function fence(reader, db, plan) {
  const read = ref => reader === db ? ref.get() : reader.get(ref);
  const c = await read(db.doc('feedIndexControl/current')), marker = await read(db.doc('feedIndexGenerations/feed-v3'));
  assert.equal(c.get('cardReadGenerationId'), 'feed-v3'); assert.equal(c.get('mode'), 'active');
  assert(same(stamp(marker.createTime), plan.incarnation), 'news-pilot-generation-replaced');
  const before = [...plan.originals.map(d => ['shouts', d]), ...plan.requests.map(d => ['accountDeletionRequests', d])];
  const docs = before.length ? await reader.getAll(...before.map(([collection, row]) => db.doc(`${collection}/${row.id}`)), { fieldMask: [] }) : [];
  assert(docs.every((d, i) => d.exists && same(stamp(d.updateTime), before[i][1].update)), 'news-pilot-original-drift');
  for (const actor of plan.actors) {
    const current = await requireEligibleActor({ request: request(actor.uid), db, reader, requireContentPermission: true });
    assert.equal(current.profile.nickname, actor.nickname);
  }
  const blocked = await reader.getAll(...plan.actors.map((a, i) => db.doc(`users/${a.uid}/blocked/${plan.actors[1 - i].uid}`)));
  assert(blocked.every(d => !d.exists), 'news-pilot-actors-blocked');
}
export async function planNewsPilot(db, actors, runId, { expectedSources = 38 } = {}) {
  target(db); assert.deepEqual(actors.map(a => a.nickname), names);
  if (db.projectId !== 'shoutout-rules-test') assert.equal(expectedSources, 38);
  const plan = await db.runTransaction(async tx => {
    const marker = await tx.get(db.doc('feedIndexGenerations/feed-v3'));
    const sources = await tx.get(db.collection('shouts').select().limit(expectedSources + 1)); assert.equal(sources.size, expectedSources);
    const requests = await tx.get(db.collection('accountDeletionRequests').select().limit(51)); assert(requests.size <= 50);
    return { v: 1, projectId: db.projectId, runId, plannedAt: Date.now(), actors: actors.map(({ uid, nickname }) => ({ uid, nickname })), incarnation: stamp(marker.createTime),
      point: { latitude: 50.53, longitude: 14.13 }, originals: sources.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })),
      requests: requests.docs.map(d => ({ id: d.id, update: stamp(d.updateTime) })), slots: ['A', 'B', 'C'].map(label => ({ label,
        id: label === 'B' ? null : `${runId}-${label}`, title: `MVP B4b ${label} ${runId.slice(-6)}`,
        text: 'Synthetic DEV news pilot. Remove after verification.', duration: label === 'C' ? 60000 : 86400000, authorId: actors[label === 'B' ? 1 : 0].uid })) };
  }, { readOnly: true });
  const result = { ...plan, digest: hash(plan) }; validateNewsPilot(db, result); await fence(db, db, result); return result;
}
function owned(doc, slot) {
  if (!doc.exists) return;
  for (const key of ['title', 'text', 'authorId']) assert.equal(doc.get(key), slot[key], 'news-pilot-foreign-content');
  assert.equal(doc.get('expiresAt').toMillis() - doc.get('createdAt').toMillis(), slot.duration, 'news-pilot-duration-conflict');
}
export async function publishNewsFixture(db, plan, label, createdAt) {
  validateNewsPilot(db, plan); assert(['A', 'C'].includes(label), 'news-pilot-B-must-use-real-client');
  assert(Number.isSafeInteger(createdAt) && createdAt > 0 && createdAt <= Date.now());
  const slot = plan.slots.find(s => s.label === label), actor = plan.actors.find(a => a.uid === slot.authorId);
  const runtime = createFeedRuntime(db, noAuth, { newsRuntimeEnabled: true });
  return runtime.database.runTransaction(async tx => {
    await fence(tx, db, plan);
    const ref = db.doc(`shouts/${slot.id}`), before = await tx.get(ref); owned(before, slot);
    if (before.exists) { assert.equal(before.get('createdAt').toMillis(), createdAt); return { created: false, id: slot.id }; }
    assert(Date.now() < createdAt + slot.duration, 'news-pilot-expired-no-recreate');
    const after = { authorId: slot.authorId, authorNickname: actor.nickname, title: slot.title, text: slot.text, status: 'active', categories: ['Dotaz'],
      location: new GeoPoint(plan.point.latitude, plan.point.longitude), geohash: encodeGeohash(plan.point.latitude, plan.point.longitude),
      createdAt: Timestamp.fromMillis(createdAt), expiresAt: Timestamp.fromMillis(createdAt + slot.duration), likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0 };
    const index = await runtime.indexWriter.prepare(tx, slot.id, null, after, { publication: true }); index.apply(); tx.create(ref, after);
    return { created: true, id: slot.id, expiresAt: createdAt + slot.duration };
  });
}
// B is created through the real UI/callable. Bind it only by exact approved
// author/title/text/duration, excluding all originals and other fixture slots.
export async function adoptNewsClientFixture(db, plan) {
  validateNewsPilot(db, plan); await fence(db, db, plan);
  const slot = plan.slots[1], sources = await db.collection('shouts').limit(plan.originals.length + 4).get();
  assert(sources.size <= plan.originals.length + 3, 'news-pilot-unexpected-source-count');
  const matches = sources.docs.filter(d => d.get('authorId') === slot.authorId && d.get('title') === slot.title && d.get('text') === slot.text);
  assert.equal(matches.length, 1, 'news-pilot-one-client-publication-required');
  const doc = matches[0]; owned(doc, slot); assert(!plan.originals.some(d => d.id === doc.id));
  assert(doc.get('createdAt').toMillis() >= plan.plannedAt, 'news-pilot-client-predates-plan');
  const point = doc.get('location'); assert(Math.abs(point.latitude - plan.point.latitude) < .4 && Math.abs(point.longitude - plan.point.longitude) < .4, 'news-pilot-client-outside-region');
  return { id: doc.id, createdAt: doc.get('createdAt').toMillis(), expiresAt: doc.get('expiresAt').toMillis() };
}
export async function removePilotReadKeys(db, plan, bindings, actor, beforeRead = async () => {}) {
  return db.runTransaction(async tx => {
    await beforeRead(tx);
    const meta = db.doc(`users/${actor.uid}/readState/current`), state = await tx.get(meta), revision = state.get('revision') ?? 0;
    assert(Number.isSafeInteger(revision) && revision >= 0 && revision < Number.MAX_SAFE_INTEGER);
    const nodes = new Map(), changed = new Map(); let removed = 0, reads = 0;
    for (const slot of plan.slots) {
      const b = bindings[slot.label]; if (!b) continue;
      const key = readKey(b.id, readContentHash(slot.title, slot.text)), day = Math.floor(b.expiresAt / 86400000);
      const bits = [...key].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join(''); let prefix = '', required = false;
      for (;;) {
        const id = readBucketId(day, prefix);
        if (!nodes.has(id)) { assert(++reads <= 100); nodes.set(id, (await tx.get(db.doc(`users/${actor.uid}/readBuckets/${id}`))).data() ?? null); }
        const node = nodes.get(id); if (!node) { assert(!required); break; } validateReadBlock(node, day, prefix);
        if (node.kind === 'branch') { prefix += bits[prefix.length]; required = true; continue; }
        const entry = node.entries[key];
        if (entry) {
          assert.equal(entry.shoutId, b.id); assert.equal(entry.contentHash, readContentHash(slot.title, slot.text)); assert.equal(entry.expiresAt, b.expiresAt);
          const entries = { ...node.entries }; delete entries[key]; const next = { ...node, revision: revision + 1, entries };
          validateReadBlock(next, day, prefix); nodes.set(id, next); changed.set(id, next); removed++;
        }
        break;
      }
    }
    for (const [id, node] of changed) tx.set(db.doc(`users/${actor.uid}/readBuckets/${id}`), node);
    if (changed.size) tx.set(meta, { v: 1, revision: revision + 1 }); return removed;
  });
}
export async function cleanupNewsPilot(db, plan, bindings) {
  validateNewsPilot(db, plan); const actors = new Set(plan.actors.map(a => a.uid));
  const runtime = createFeedRuntime(db, noAuth, { newsRuntimeEnabled: true }); let removed = 0;
  for (const slot of plan.slots) {
    const binding = bindings[slot.label]; if (!binding) continue;
    assert(typeof binding.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(binding.id));
    assert(!plan.originals.some(row => row.id === binding.id)); if (slot.id) assert.equal(binding.id, slot.id);
    const existingCollections = await db.doc(`shouts/${binding.id}`).listCollections();
    assert(existingCollections.every(c => ['comments', 'privateReplies', 'saves', 'reactions'].includes(c.id)), 'news-pilot-unexpected-descendants');
    removed += await runtime.database.runTransaction(async tx => {
      await fence(tx, db, plan); const ref = db.doc(`shouts/${binding.id}`), source = await tx.get(ref); owned(source, slot);
      const children = [];
      for (const name of ['comments', 'privateReplies', 'saves', 'reactions']) {
        const docs = await tx.get(ref.collection(name).limit(3));
        if (['comments', 'privateReplies'].includes(name)) assert(docs.empty, 'news-pilot-unexpected-conversation');
        else { assert(docs.size <= 2); for (const doc of docs.docs) { assert(actors.has(doc.id)); children.push(doc); } }
      }
      const receipts = await tx.get(db.collection('serverOperations').where('shoutId', '==', binding.id).limit(41));
      assert(receipts.size <= 40); assert(receipts.docs.every(d => actors.has(d.get('userId'))));
      // Fixture cleanup must not shorten the independent receipt retention window.
      const notifications = await tx.getAll(...plan.actors.flatMap(a => ['like', 'dislike'].map(kind => db.doc(`users/${a.uid}/notifications/reaction_${kind}_${binding.id}`))));
      children.push(...notifications.filter(d => d.exists));
      const index = await runtime.indexWriter.prepareBatch(tx, source.exists ? [{ id: binding.id, before: source.data(), after: null }] : [], { additionalWrites: children.length });
      index.apply(); if (source.exists) tx.delete(ref); for (const d of children) tx.delete(d.ref); return Number(source.exists);
    });
  }
  let readKeys = 0; for (const actor of plan.actors) readKeys += await removePilotReadKeys(db, plan, bindings, actor);
  await fence(db, db, plan); return { removed, readKeys, originalsPreserved: plan.originals.length, requestsPreserved: plan.requests.length, authMutations: 0 };
}
// Expose only the existing safe control helper for tests; never mutate private
// control alone during fixture initialization.
export { prepareNewsControlChange };
