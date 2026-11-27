import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Firestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { legacyArchiveRoots, planLegacyArchiveCleanup as plan, applyLegacyArchiveCleanup as apply } from '../tools/archive_legacy_cleanup.mjs';
import { createFeedRuntime } from './feed_runtime.js';
import { encodeGeohash } from './geohash.js';
import { receiptMayBePurged } from './cleanup_operation_receipts.js';
import { operationRetryWindowMillis } from './operation_retention.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
async function fixture(t) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), gen = raw.doc('feedIndexGenerations/legacy-cleanup-test');
  const feed = raw.doc('feedIndexControl/current'), control = raw.doc('contentLifecycleControl/current');
  assert(!(await feed.get()).exists); assert(!(await control.get()).exists);
  const extras = [];
  t.after(async () => {
    for (const id of legacyArchiveRoots) await raw.recursiveDelete(raw.doc(`shouts/${id}`));
    for (const ref of [gen, feed, control, ...extras]) await raw.recursiveDelete(ref);
    for (const doc of (await raw.collection('serverOperations').where('action', '==', 'cleanupLegacyArchiveFixtures').get()).docs) await doc.ref.delete();
    await raw.terminate();
  });
  await gen.create({ schemaVersion: 1, v: 2, readIdentity: 1, cardProjection: 1, cardReady: true, accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
  await feed.create({ schemaVersion: 2, revision: 1, mode: 'active', readGenerationId: gen.id, writeGenerationIds: [gen.id],
    cardReadGenerationId: gen.id, cardWriteGenerationIds: [gen.id] });
  const rt = createFeedRuntime(raw, { getUser() { throw Error('auth-forbidden'); } }, { newsRuntimeEnabled: false,
    contentLifecycleEnabled: false, contentCaptureEnabled: false, contentMaintenanceEnabled: false });
  const now = Date.now(), source = { authorId: 'synthetic-legacy-author', authorNickname: 'Synthetic', title: 'MVP legacy cleanup', text: 'Synthetic',
    createdAt: Timestamp.fromMillis(now - 86400000), expiresAt: Timestamp.fromMillis(now - 1), status: 'deleted',
    location: new GeoPoint(50.53, 14.13), geohash: encodeGeohash(50.53, 14.13), categories: ['Dotaz'],
    geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: 0 };
  for (const id of legacyArchiveRoots) await rt.database.runTransaction(async tx => {
    const data = { ...source, id }, index = await rt.indexWriter.prepare(tx, id, null, data);
    index.apply(); tx.create(raw.doc(`shouts/${id}`), data);
  });
  const protectedRoot = raw.doc('shouts/protected-legacy-source'), request = raw.doc('accountDeletionRequests/protected-pending');
  extras.push(protectedRoot, request); await protectedRoot.create({ ...source, id: protectedRoot.id, title: 'Protected source' });
  await request.create({ userId: 'protected-pending', status: 'pending' });
  return { raw, rt, extras, feed, gen, control, protectedRoot, request,
    apply: (p, options = {}) => apply(rt.database, p, { approvedDigest: p.digest, indexWriter: rt.indexWriter, ...options }) };
}

test('exact eleven cleanup is atomic, lost-response retry needs proof, and receipt retains seven days', { skip: !enabled }, async t => {
  const f = await fixture(t), p = await plan(f.raw), old = await f.request.get(), baseline = await f.protectedRoot.get();
  const result = await f.apply(p); assert.equal(result.removed, 11); assert.equal(result.authMutations, 0);
  assert.equal((await f.apply(p)).state, 'already-applied');
  assert((await f.request.get()).updateTime.isEqual(old.updateTime)); assert((await f.protectedRoot.get()).updateTime.isEqual(baseline.updateTime));
  const receiptRef = f.raw.doc(`serverOperations/archive_legacy_${p.digest}`), receipt = (await receiptRef.get()).data();
  assert.equal(receipt.actorKind, 'operator');
  assert(!receiptMayBePurged(receipt, Timestamp.fromMillis(receipt.createdAt.toMillis() + operationRetryWindowMillis - 1)));
  assert(receiptMayBePurged(receipt, receipt.expiresAt));
  await f.raw.doc(`shouts/${legacyArchiveRoots[0]}`).create({ status: 'deleted' });
  await assert.rejects(f.apply(p), /source-recreated/);
});

test('new child, unknown subcollection, source update and protected request changes block the whole cleanup', { skip: !enabled }, async t => {
  const f = await fixture(t), p = await plan(f.raw), ref = f.raw.doc(`shouts/${legacyArchiveRoots[0]}`);
  const child = ref.collection('comments').doc('new'); await child.create({ text: 'Keep' });
  await assert.rejects(f.apply(p), /descendants-present/); await child.delete();
  const unknown = ref.collection('unknown').doc('new'); await unknown.create({ keep: true });
  await assert.rejects(f.apply(p), /descendants-present/); await unknown.delete();
  await ref.update({ likesCount: 1 }); await assert.rejects(f.apply(p), /baseline-drift/);
  const fresh = await plan(f.raw); await f.request.update({ marker: true }); await assert.rejects(f.apply(fresh), /baseline-drift/);
  for (const id of legacyArchiveRoots) assert((await f.raw.doc(`shouts/${id}`).get()).exists);
});

test('index failure rolls back all eleven and foreign evidence or capture activation stops planning', { skip: !enabled }, async t => {
  const f = await fixture(t), p = await plan(f.raw);
  await assert.rejects(f.apply(p, { indexWriter: { prepareBatch: async () => ({ apply() { throw Error('injected-index-failure'); } }) } }), /injected-index-failure/);
  assert(!(await f.raw.doc(`serverOperations/archive_legacy_${p.digest}`).get()).exists);
  for (const id of legacyArchiveRoots) assert((await f.raw.doc(`shouts/${id}`).get()).exists);
  const report = f.raw.doc('reports/legacy-protected'); f.extras.push(report);
  await report.create({ shoutId: legacyArchiveRoots[0] }); await assert.rejects(plan(f.raw), /related-evidence-present/); await report.delete();
  await f.control.create({ schemaVersion: 1, mode: 'paused', revision: 1 }); await assert.rejects(f.apply(p), /pre-capture-only/);
});

test('concurrent operators commit one receipt; a missing unconfirmed source never becomes a successful cleanup', { skip: !enabled }, async t => {
  const f = await fixture(t), p = await plan(f.raw);
  const results = await Promise.all([f.apply(p), f.apply(p)]);
  assert.deepEqual(results.map(r => r.state).sort(), ['already-applied', 'applied']);
  await f.raw.doc(`serverOperations/archive_legacy_${p.digest}`).delete();
  await assert.rejects(f.apply(p), /source-unproven/);
});
