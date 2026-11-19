// Approved synthetic pilot only. No entry point, credentials or Auth mutations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { canonical, metadataOf, verifyNode } from './feed_block_index.js';
import { createFeedRuntime } from './feed_runtime.js';
import { generationStamp, sameGenerationStamp } from './feed_generation_format.js';
import { encodeGeohash } from './geohash.js';
import { requireEligibleActor } from './callable_security.js';
import { syncReadBatchOperation } from './read_sync.js';
import { readBucketId, readKey, readContentHash, validateReadBlock } from './read_sync_blocks.js';
import { getFeedPageOperation } from './get_feed_page.js';

const hash = x => createHash('sha256').update(canonical(x)).digest('hex');
const names = ['Bright_Otter_182', 'TestBusiness'];
const uid = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const noAuth = { getUser() { throw new Error('pilot-auth-access-forbidden'); } };
const request = (id, data = {}) => ({ auth: { uid: id, token: { email: 'approved-fixture@example.test', email_verified: true } },
  app: { appId: 'approved-b3-pilot-core' }, data: { expectedUserId: id, ...data } });
function target(db) {
  if (db.projectId !== 'shoutout-dev-46c81' && !(db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) {
    throw new Error('b3-pilot-dev-only');
  }
}
function check(plan, db) {
  target(db); const { digest, ...data } = plan ?? {};
  assert.equal(digest, hash(data)); assert.equal(plan.v, 1); assert.equal(plan.projectId, db.projectId);
  assert(/^mvp-b3-[a-z0-9-]{8,50}$/.test(plan.runId)); assert.equal(plan.rows.length, 120);
  assert.deepEqual(plan.actors.map(a => a.nickname).sort(), names);
  assert.equal(new Set(plan.actors.map(a => a.uid)).size, 2); assert(plan.actors.every(a => uid(a.uid)));
  assert(plan.baseline.every(original => !plan.rows.some(row => row.id === original.id)), 'pilot-baseline-overlap');
  assert.equal(plan.expiresAt - plan.createdAt, 86400000);
  assert.deepEqual(plan.point, { latitude: 50.533, longitude: 14.13 });
  for (const [i, row] of plan.rows.entries()) {
    assert.equal(row.id, `${plan.runId}-${String(i).padStart(3, '0')}`);
    assert.equal(row.data.authorId, plan.actors[i % 2].uid);
    assert.equal(row.data.createdAt, plan.createdAt); assert.equal(row.data.expiresAt, plan.expiresAt);
    assert.equal(row.data.title, `MVP B3 ${String(i).padStart(3, '0')}`);
    assert.equal(row.data.text, 'Synthetic DEV B3 pilot. Remove after approved verification.');
    assert.deepEqual(row.data.location, { latitude: plan.point.latitude + i * .00002, longitude: plan.point.longitude });
    assert.deepEqual(row.data.categories, ['Dotaz']); metadataOf({ ...row.data, id: row.id }, { contentIdentity: true });
  }
}
const body = row => ({ ...row.data, location: new GeoPoint(row.data.location.latitude, row.data.location.longitude),
  createdAt: Timestamp.fromMillis(row.data.createdAt), expiresAt: Timestamp.fromMillis(row.data.expiresAt) });
function owned(doc, row) {
  if (!doc.exists) return;
  for (const field of ['authorId', 'authorNickname', 'title', 'text', 'geohash', 'categories']) assert.equal(canonical(doc.get(field)), canonical(row.data[field]), 'pilot-source-conflict');
  assert.equal(doc.get('createdAt').toMillis(), row.data.createdAt); assert.equal(doc.get('expiresAt').toMillis(), row.data.expiresAt);
  assert.equal(doc.get('location').latitude, row.data.location.latitude); assert.equal(doc.get('location').longitude, row.data.location.longitude);
}
async function control(reader, db, expected = null) {
  const docs = await reader.getAll(db.doc('feedIndexControl/current'), db.doc('feedIndexGenerations/feed-v1'), db.doc('feedIndexGenerations/feed-v2'));
  assert.equal(docs[0].get('mode'), 'active'); assert.equal(docs[0].get('readGenerationId'), 'feed-v2');
  assert.deepEqual(docs[0].get('writeGenerationIds'), ['feed-v1', 'feed-v2']);
  assert.equal(docs[1].get('accountRetention'), true); assert.equal(docs[1].get('readIdentity'), undefined);
  assert.equal(docs[2].get('accountRetention'), true); assert.equal(docs[2].get('readIdentity'), 1);
  docs.slice(1).forEach(doc => { assert.equal(doc.get('schemaVersion'), 1); assert.equal(doc.get('v'), 1); });
  if (expected) docs.slice(1).forEach((doc, i) => assert(sameGenerationStamp(doc, expected[i]), 'pilot-generation-replaced'));
  return docs.slice(1).map(generationStamp);
}
export async function planB3Pilot(db, actors, { runId, createdAt = Date.now(), baselineCount = 38 } = {}) {
  target(db); assert.equal(actors.length, 2); assert.deepEqual(actors.map(a => a.nickname).sort(), names);
  assert(actors.every(actor => uid(actor.uid))); assert.equal(new Set(actors.map(actor => actor.uid)).size, 2);
  assert(/^mvp-b3-[a-z0-9-]{8,50}$/.test(runId)); assert(Number.isSafeInteger(createdAt) && createdAt > 0);
  if (db.projectId !== 'shoutout-rules-test') assert.equal(baselineCount, 38);
  const incarnations = await control(db, db), selected = [];
  const blocked = await db.getAll(...actors.map((actor, i) => db.doc(`users/${actor.uid}/blocked/${actors[1 - i].uid}`)));
  assert(blocked.every(doc => !doc.exists), 'pilot-actors-blocked');
  for (const actor of actors) {
    assert(uid(actor.uid)); const identity = await requireEligibleActor({ request: request(actor.uid), db });
    assert.equal(identity.profile.nickname, actor.nickname);
    const publicProfile = await db.doc(`publicProfiles/${actor.uid}`).get(); assert.notEqual(publicProfile.get('accountStatus'), 'deleted');
    const avatar = Object.fromEntries(['avatarId', 'avatarBackgroundStart', 'avatarBackgroundEnd', 'avatarGradientDirection']
      .filter(key => identity.profile[key] !== undefined).map(key => [key, identity.profile[key]]));
    selected.push({ uid: actor.uid, nickname: actor.nickname, avatar });
  }
  const before = await db.collection('shouts').select().limit(baselineCount + 1).get(); assert.equal(before.size, baselineCount);
  const baseline = before.docs.map(doc => ({ id: doc.id, updateTime: generationStamp({ createTime: doc.updateTime }) }));
  const point = { latitude: 50.533, longitude: 14.13 }, expiresAt = createdAt + 86400000;
  const rows = Array.from({ length: 120 }, (_, i) => {
    const location = { latitude: point.latitude + i * .00002, longitude: point.longitude };
    const actor = selected[i % 2];
    return { id: `${runId}-${String(i).padStart(3, '0')}`, data: { ...actor.avatar, authorId: actor.uid,
      authorNickname: actor.nickname, title: `MVP B3 ${String(i).padStart(3, '0')}`,
      text: 'Synthetic DEV B3 pilot. Remove after approved verification.', status: 'active', categories: ['Dotaz'], location,
      geohash: encodeGeohash(location.latitude, location.longitude), createdAt, expiresAt,
      likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0 } };
  });
  const data = { v: 1, projectId: db.projectId, runId, createdAt, expiresAt, point, incarnations, actors: selected, baseline, rows };
  const plan = { ...data, digest: hash(data) }; check(plan, db); return plan;
}
export async function assertB3PilotBaseline(db, plan) {
  check(plan, db);
  const docs = plan.baseline.length ? await db.getAll(...plan.baseline.map(row => db.doc(`shouts/${row.id}`)), { fieldMask: [] }) : [];
  docs.forEach((doc, i) => { assert(doc.exists); assert.deepEqual([doc.updateTime.seconds, doc.updateTime.nanoseconds], plan.baseline[i].updateTime, 'unrelated-source-changed'); });
  return docs.length;
}
export async function seedB3Pilot(db, plan) {
  check(plan, db); await assertB3PilotBaseline(db, plan); await control(db, db, plan.incarnations);
  assert(Date.now() < plan.expiresAt, 'pilot-expired');
  for (const actor of plan.actors) await requireEligibleActor({ request: request(actor.uid), db });
  const runtime = createFeedRuntime(db, noAuth, { compatibleGenerations: true }); let created = 0;
  for (let offset = 0; offset < 120; offset += 50) created += await runtime.database.runTransaction(async tx => {
    await control(tx, db, plan.incarnations);
    const chunk = plan.rows.slice(offset, offset + 50), docs = await tx.getAll(...chunk.map(row => db.doc(`shouts/${row.id}`)));
    const changes = chunk.flatMap((row, i) => { owned(docs[i], row); return docs[i].exists ? [] : [{ id: row.id, before: null, after: body(row) }]; });
    if (!changes.length) return 0;
    const index = await runtime.indexWriter.prepareBatch(tx, changes); index.apply();
    changes.forEach(change => tx.create(db.doc(`shouts/${change.id}`), change.after)); return changes.length;
  });
  return { created, expected: 120, authMutations: 0 };
}
export async function seedB3PilotReads(db, plan) {
  check(plan, db); await assertB3PilotBaseline(db, plan); await control(db, db, plan.incarnations);
  for (const actor of plan.actors) {
    const rows = plan.rows.slice(0, actor.nickname === names[0] ? 70 : 20);
    for (let i = 0; i < rows.length; i += 32) {
      const data = rows.slice(i, i + 32).map(row => ({ shoutId: row.id, contentHash: readContentHash(row.data.title, row.data.text), expiresAt: row.data.expiresAt }));
      const result = await syncReadBatchOperation(request(actor.uid, { items: data }), db);
      assert(result.items.every(item => item.status === 'accepted'));
    }
  }
  return { fixtureReadMarks: 90, unrelatedReadMarksPreserved: true, authMutations: 0 };
}
export async function removeB3PilotReadKeys(db, plan, actor) {
  check(plan, db); assert(plan.actors.some(a => a.uid === actor.uid));
  let removed = 0;
  for (let offset = 0; offset < 120; offset += 32) removed += await db.runTransaction(async tx => {
    const ref = db.doc(`users/${actor.uid}/readState/current`), meta = await tx.get(ref), nodes = new Map(), changed = new Map();
    const revision = meta.exists ? meta.get('revision') : 0; assert(Number.isSafeInteger(revision) && revision >= 0 && revision < Number.MAX_SAFE_INTEGER);
    if (meta.exists) assert.equal(meta.get('v'), 1);
    let reads = 0, count = 0;
    for (const row of plan.rows.slice(offset, offset + 32)) {
      const key = readKey(row.id, readContentHash(row.data.title, row.data.text)), bits = [...key].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
      const day = Math.floor(row.data.expiresAt / 86400000); let prefix = '', required = false;
      for (;;) {
        const id = readBucketId(day, prefix);
        if (!nodes.has(id)) { assert(++reads <= 200, 'pilot-read-work-budget'); const doc = await tx.get(db.doc(`users/${actor.uid}/readBuckets/${id}`)); nodes.set(id, doc.data() ?? null); }
        const node = nodes.get(id); if (!node) { assert(!required, 'missing-read-block-child'); break; }
        validateReadBlock(node, day, prefix);
        if (node.kind === 'branch') { prefix += bits[prefix.length]; required = true; continue; }
        const value = node.entries[key];
        if (value) {
          assert.equal(value.shoutId, row.id); assert.equal(value.contentHash, readContentHash(row.data.title, row.data.text)); assert.equal(value.expiresAt, row.data.expiresAt);
          const entries = { ...node.entries }; delete entries[key];
          const updated = { ...node, revision: revision + 1, entries }; validateReadBlock(updated, day, prefix);
          nodes.set(id, updated); changed.set(id, updated); count++;
        }
        break;
      }
    }
    // Keep routing and empty leaves: deleting a referenced child would corrupt
    // unrelated read history. Normal retention later removes expired buckets.
    for (const [id, node] of changed) tx.set(db.doc(`users/${actor.uid}/readBuckets/${id}`), node);
    if (changed.size) tx.set(ref, { v: 1, revision: revision + 1 }); return count;
  });
  return removed;
}
export async function cleanupB3Pilot(db, plan) {
  check(plan, db); await assertB3PilotBaseline(db, plan); await control(db, db, plan.incarnations);
  const runtime = createFeedRuntime(db, noAuth, { compatibleGenerations: true }), actors = new Set(plan.actors.map(a => a.uid));
  let deleted = 0;
  for (const row of plan.rows) {
    const ref = db.doc(`shouts/${row.id}`), source = await ref.get(); owned(source, row);
    const children = [];
    for (const collection of await ref.listCollections()) {
      assert(['saves', 'reactions'].includes(collection.id), 'unexpected-pilot-descendants');
      const docs = await collection.limit(3).get(); assert(docs.size <= 2);
      for (const doc of docs.docs) { assert(actors.has(doc.id), 'foreign-pilot-descendant'); assert.equal((await doc.ref.listCollections()).length, 0); children.push(doc); }
    }
    const receipts = await db.collection('serverOperations').where('shoutId', '==', row.id).limit(41).get(); assert(receipts.size <= 40);
    receipts.docs.forEach(doc => assert(actors.has(doc.get('userId')), 'foreign-pilot-receipt'));
    const notificationRefs = plan.actors.flatMap(actor => ['like', 'dislike'].map(kind => db.doc(`users/${actor.uid}/notifications/reaction_${kind}_${row.id}`)));
    await runtime.database.runTransaction(async tx => {
      await control(tx, db, plan.incarnations);
      const docs = await tx.getAll(ref, ...children.map(doc => doc.ref), ...receipts.docs.map(doc => doc.ref), ...notificationRefs);
      owned(docs[0], row);
      const known = [...children, ...receipts.docs]; known.forEach((before, i) => assert(docs[i + 1].updateTime?.isEqual(before.updateTime), 'pilot-cleanup-race'));
      const extras = docs.slice(1).filter(doc => doc.exists);
      const index = await runtime.indexWriter.prepareBatch(tx, docs[0].exists ? [{ id: row.id, before: docs[0].data(), after: null }] : [], { additionalWrites: extras.length });
      index.apply(); if (docs[0].exists) tx.delete(ref); extras.forEach(doc => tx.delete(doc.ref));
    });
    if (source.exists) deleted++;
  }
  let readKeysRemoved = 0; for (const actor of plan.actors) readKeysRemoved += await removeB3PilotReadKeys(db, plan, actor);
  await assertB3PilotBaseline(db, plan);
  assert((await db.getAll(...plan.rows.map(row => db.doc(`shouts/${row.id}`)))).every(doc => !doc.exists));
  const ids = new Set(plan.rows.map(row => row.id)), cells = [...new Set(plan.rows.map(row => row.data.geohash.slice(0, 4)))];
  let currentNodesVerified = 0;
  for (const generation of ['feed-v1', 'feed-v2']) {
    const base = db.doc(`feedIndexGenerations/${generation}`), roots = await db.getAll(...cells.map(cell => base.collection('cells').doc(cell)));
    const hashes = roots.filter(doc => doc.exists).map(doc => doc.get('hash')), seen = new Set();
    while (hashes.length) {
      const digest = hashes.pop(); assert(/^[a-f0-9]{64}$/.test(digest)); if (seen.has(digest)) continue;
      seen.add(digest); assert(seen.size <= 1000, 'pilot-verification-budget');
      const node = verifyNode(digest, (await base.collection('nodes').doc(digest).get()).data());
      for (const row of node.rows ?? []) assert(!ids.has(row.id), 'pilot-metadata-still-current');
      hashes.push(...Object.values(node.children ?? {}).map(child => child.hash));
    }
    currentNodesVerified += seen.size;
  }
  return { fixtureSourcesRemoved: deleted, fixtureReadKeysRemoved: readKeysRemoved, currentNodesVerified,
    historicalRootsUseNormalRetention: true, unrelatedSourcesUnchanged: plan.baseline.length, authMutations: 0 };
}
export async function verifyB3Pilot(db, plan, key) {
  check(plan, db); await assertB3PilotBaseline(db, plan); await control(db, db, plan.incarnations);
  const results = [];
  for (const actor of plan.actors) {
    for (const grouped of [false, true]) {
      let cursor, baseline; const items = [], counts = [];
      for (let pages = 0; pages < 5; pages++) {
        let result;
        for (let steps = 0; steps < 32; steps++) {
          const data = cursor ? { cursor } : { context: { point: plan.point, radiusKm: 5, order: 'nearest', category: null,
            ...(grouped ? { readPolicy: 'confirmed-v1' } : {}) } };
          result = await getFeedPageOperation(request(actor.uid, data), db,
            { key, compatibleGenerations: true, readOrdering: { maxBlockReads: 256 } });
          baseline ??= result.baseline; assert.equal(result.baseline, baseline); cursor = result.next;
          if (result.state === 'ready') break;
        }
        assert.equal(result.state, 'ready'); items.push(...result.items); counts.push(items.length);
        if (!cursor) break;
      }
      assert.deepEqual(counts, [50, 100, 120]);
      const readCount = actor.nickname === names[0] ? 70 : 20;
      const expected = grouped ? [...plan.rows.slice(readCount), ...plan.rows.slice(0, readCount)] : plan.rows;
      assert.deepEqual(items.map(item => item.id), expected.map(row => row.id));
      if (grouped) assert.deepEqual(items.map(item => item.read), [...Array(120 - readCount).fill(false), ...Array(readCount).fill(true)]);
      else assert(items.every(item => item.read === undefined));
      results.push({ account: actor.nickname, grouped, counts, unread: grouped ? 120 - readCount : null });
    }
  }
  return { validation: 'internal-live-core', callableAuthAppCheckTested: false, results,
    unrelatedSourcesUnchanged: plan.baseline.length, authMutations: 0 };
}
