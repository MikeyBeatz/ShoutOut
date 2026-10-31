import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLabBlockIndex, blockCache } from './feed_block_index_lab.js';
import { encodeGeohash } from './geohash.js';
import { feedCursorCodec, InvalidFeedCursor } from './feed_cursor.js';
import { FeedSessionExpired, feedSessionLifetimeMillis as hour } from './feed_session_policy.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'portable-index-tests') : null;
const db = app ? getFirestore(app) : null, namespaces = [];
after(async () => {
  if (!app) return;
  for (const namespace of namespaces) await db.recursiveDelete(db.collection('feedIndexLab').doc(namespace));
  await db.terminate(); await deleteApp(app);
});
const point = { latitude: 50.66, longitude: 14.04 }, uid = 'reader';
const fixtureRow = i => ({ id: `r-${String(i).padStart(4, '0')}`, authorId: 'author',
  location: point, geohash: encodeGeohash(point.latitude, point.longitude), createdAt: i,
  expiresAt: 100000, likesCount: i % 11, dislikesCount: 0, status: 'active', categories: ['Dotaz'] });

test('signed preparation and completed pages survive fresh repositories and preserve their snapshot', { skip: !enabled }, async t => {
  const namespace = `portable-${randomUUID().slice(0, 8)}`; namespaces.push(namespace);
  const key = randomBytes(32), rows = Array.from({ length: 160 }, (_, i) => fixtureRow(i));
  const lab = createLabBlockIndex(db, { namespace }); await lab.seed(rows);
  const readIds = rows.slice(20).map(row => row.id);
  // Disposable test-only private state. No live read schema is selected here.
  const privateFixture = lab.base.collection('readFixture').doc(uid);
  await privateFixture.set({ ids: readIds });
  const readIdsAt = async readTime => (await db.runTransaction(tx => tx.get(privateFixture), { readOnly: true, readTime })).data().ids;
  const captured = await lab.capturePortable({ point, radiusKm: 20, now: 500, uid, unreadFirst: true }, { readIdsAt });
  const scope = { uid, project: db.projectId, now: captured.readTime.seconds * 1000 + Math.floor(captured.readTime.nanoseconds / 1000000) };
  let token = feedCursorCodec({ key }).start({ ...scope, readTime: captured.readTime, context: { snapshot: captured } });
  const expectedView = await lab.open({ point, radiusKm: 20, now: 500, uid, unreadFirst: true, readIds });
  const expected = []; let at = expectedView.first;
  while (at) { const page = await expectedView.page(at); expected.push(...page.rows.map(row => row.id)); at = page.next; }
  // Current directory changes after capture. Old cursor must still use old roots.
  await lab.mutate('new-after-capture', { ...fixtureRow(1), id: 'new-after-capture' });
  await privateFixture.update({ ids: [] });
  const actual = []; let calls = 0, nodeReads = 0, maximumCheckpointBytes = 0;
  while (token) {
    assert(++calls < 200);
    const codec = feedCursorCodec({ key }); // Simulate a new handler instance.
    const decoded = codec.decode(token, scope);
    const frozenReadIds = await readIdsAt(new Timestamp(decoded.readTime.seconds, decoded.readTime.nanoseconds));
    const fresh = createLabBlockIndex(db, { namespace, cache: blockCache() });
    const result = await fresh.portablePage(decoded.context.snapshot, decoded.position, {
      uid, readIds: frozenReadIds, nodes: 2, assertSessionAlive: () => codec.decode(token, scope),
    });
    assert(result.metrics.maxRetainedCandidates <= 50);
    nodeReads += result.metrics.nodeReads;
    maximumCheckpointBytes = Math.max(maximumCheckpointBytes, token.length);
    if (result.state !== 'preparing') actual.push(...result.rows.map(row => row.id));
    token = result.position ? codec.advance(token, result.position, scope) : null;
  }
  assert.deepEqual(actual, expected); assert.equal(new Set(actual).size, 160);
  await assert.rejects(lab.portablePage(captured, {}, { uid, readIds: [], assertSessionAlive() {} }), /incompatible/);
  const codec = feedCursorCodec({ key });
  const original = codec.start({ ...scope, readTime: captured.readTime, context: { snapshot: captured } });
  assert.throws(() => codec.decode(original, { ...scope, uid: 'another' }), InvalidFeedCursor);
  assert.throws(() => codec.decode(original, { ...scope, now: scope.now + hour }), FeedSessionExpired);
  t.diagnostic(`PORTABLE-BENCH ${JSON.stringify({ records: rows.length, emitted: actual.length, coldRepositoryEachStep: true, calls, nodeReads, maximumCheckpointBytes, privateStateFrozen: true })}`);
});
