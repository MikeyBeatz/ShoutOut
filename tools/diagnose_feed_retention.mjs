// One-off diagnostic of EXISTING emulator-only behavior; not a production test
// or an implementation of the proposed retention fix.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLabBlockIndex, blockCache } from '../functions/feed_block_index_lab.js';
import { encodeGeohash } from '../functions/geohash.js';
import { feedSessionLifetimeMillis as hour } from '../functions/feed_session_policy.js';
import { accountRetentionMillis } from '../functions/account_purge_guard.js';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('emulator-only');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8',
}).trim();
const app = initializeApp({ projectId: 'shoutout-rules-test' }, 'retention-boundary-diagnostic');
const db = getFirestore(app), bases = [];
const point = { latitude: 50.66, longitude: 14.04 }, hash = encodeGeohash(point.latitude, point.longitude), cell = hash.slice(0, 4);
const requestAt = 1700000000000, deadline = requestAt + accountRetentionMillis, day = 86400000;
function row(id, authorId = 'foreign') {
  return { id, authorId, status: 'active', location: point, geohash: hash, categories: ['help'],
    createdAt: deadline - 1000, expiresAt: deadline + day, likesCount: 0, dislikesCount: 0 };
}
async function fixture(rows) {
  const namespace = `boundary-${randomUUID().slice(0, 8)}`, cache = blockCache();
  const lab = createLabBlockIndex(db, { namespace, cache }); bases.push(lab.base); await lab.seed(rows);
  return { lab, namespace, cache };
}
async function finish(job, work = { reads: 2, deletes: 1 }) {
  let result, steps = 0;
  do { result = await job.step(work); assert(++steps < 1000); } while (result.state !== 'done');
  return { ...result, steps };
}
async function ownerCopies(lab, uid) {
  const docs = await lab.base.collection('nodes').get();
  return docs.docs.filter(doc => doc.data().rows?.some(value => value.authorId === uid));
}
const cases = [];
try {
  // A legitimately old, expired Shout can still have status=active after a
  // failed primary account/expiration worker. It is NOT visible at day 60.
  const uid = 'boundary-deleted-author', own = { ...row('own', uid), createdAt: requestAt - 1000, expiresAt: requestAt + day };
  const f = await fixture([own, ...Array.from({ length: 79 }, (_, i) => row(`foreign-${i}`))]);
  const before = await f.lab.open({ point, radiusKm: 20, now: deadline });
  const first = await before.page(before.first); assert.equal(first.rows.length, 50);
  assert(first.rows.every(value => value.authorId !== uid));
  const foreign = await f.lab.base.collection('source').doc('foreign-0').get();
  const changed = await f.lab.mutate(own.id, null); assert.equal(changed.historyWrites, 1);
  const deletedSource = await f.lab.base.collection('source').doc(own.id).get(); assert.equal(deletedSource.exists, false);
  const atDeadline = await finish(await f.lab.beginGc(cell));
  const retained = await ownerCopies(f.lab, uid); assert.equal(retained.length, 1);
  assert.equal(atDeadline.metrics.nodesDeleted, 0); assert.equal((await f.lab.audit()).activeMetadata, 79);
  assert.equal((await before.page(first.next)).rows.length, 29);
  assert((await foreign.ref.get()).updateTime.isEqual(foreign.updateTime));
  cases.push({ name: 'late-removal-at-original-deadline', simulatedRequestAt: requestAt, simulatedDeadline: deadline,
    ownerVisibleBeforeRemoval: false, sourceDeleted: true, foreignRows: 79, foreignSnapshotPages: [50, 29],
    ownerLeafCopiesAfterCompletedGc: retained.length, mutation: changed, gc: atDeadline });
  const later = await finish(await f.lab.beginGc(cell, { testTimeAdvanceMillis: hour + 60000 }));
  assert.equal((await ownerCopies(f.lab, uid)).length, 0); assert.equal((await f.lab.audit()).activeMetadata, 79);
  cases.push({ name: 'same-data-after-extra-history-grace', testTimeAdvanceMillis: hour + 60000,
    ownerLeafCopiesAfterCompletedGc: 0, foreignRows: 79, gc: later });

  // Even when DB GC succeeds, a second process-local cache has no broadcast
  // eviction. This probes cache bytes; it does NOT claim an authorized HTTP
  // endpoint can return expired tokens (there is no such endpoint yet).
  const otherUid = 'boundary-cache-author', current = row('cache-own', otherUid), g = await fixture([current, row('cache-foreign')]);
  const secondCache = blockCache(), second = createLabBlockIndex(db, { namespace: g.namespace, cache: secondCache });
  const warm = await second.open({ point, radiusKm: 20, now: deadline }); await warm.page(warm.first);
  const oldHash = (await g.lab.base.collection('cells').doc(cell).get()).get('hash');
  const key = `${db.projectId}:${g.namespace}:${oldHash}`; assert.equal(secondCache.contains(key), true);
  await g.lab.mutate(current.id, null);
  const reclaimed = await finish(await g.lab.beginGc(cell, { testTimeAdvanceMillis: hour + 60000 }));
  assert.equal((await ownerCopies(g.lab, otherUid)).length, 0);
  assert.equal((await g.lab.base.collection('nodes').doc(oldHash).get()).exists, false);
  const cached = await secondCache.load(key, () => { throw new Error('unexpected cache miss'); });
  assert.equal(cached.hit, true); assert(cached.node.rows.some(value => value.authorId === otherUid));
  cases.push({ name: 'separate-cache-after-database-reclamation', databaseOwnerCopies: 0,
    oldBlockExistsInDatabase: false, separateCacheStillContainsOwnerMetadata: true, gc: reclaimed });

  console.log(JSON.stringify({ scenariosPassed: 3, cases }, null, 2));
} finally {
  for (const base of bases) await db.recursiveDelete(base);
  await db.terminate(); await deleteApp(app);
}
await writeFile(new URL('../build/feed-retention-boundary-proof.json', import.meta.url), JSON.stringify({
  schemaVersion: 1, sourceCommit, environment: 'emulator-only',
  simulatedAccountTime: true, actual60DayWait: false, implementationChanged: false, fixturesCleaned: true,
  cases, conclusion: 'Existing root-age GC alone does not establish the account-retention deadline or cross-instance cache eviction.',
}, null, 2) + '\n');
