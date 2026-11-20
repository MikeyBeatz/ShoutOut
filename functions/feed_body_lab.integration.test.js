import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { writeFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { bodyProjectionLab } from './feed_body_lab.js';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { bodyProjection, bodySelectionCodec, bodyPageCore, canonicalBody } from './feed_body_contract.js';
import { encodeGeohash } from './create_shout.js';
import { purgedShoutContext } from './shout_context.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'b4-body-tests') : null;
const db = app ? getFirestore(app) : null, namespaces = [];
const scope = { project: 'shoutout-rules-test', uid: 'reader', generation: 'local-v3', incarnation: '1', context: 'nearest' };
const location = { latitude: 50.08, longitude: 14.44 };
const source = (i, extra = {}) => ({ authorId: `author-${i % 2}`, authorNickname: 'Writer', title: `B4 local ${i}`,
  text: 'Synthetic body. '.repeat(100), categories: ['help'], location,
  geohash: encodeGeohash(location.latitude, location.longitude), createdAt: Timestamp.fromMillis(1),
  expiresAt: Timestamp.fromMillis(4000000), status: 'active', likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0,
  businessHighlighted: true, businessSpotlight: true, businessPromotion: 'spotlight', ...extra });
after(async () => {
  if (!app) return;
  for (const ns of namespaces) await db.recursiveDelete(db.doc(`feedIndexLab/${ns}`));
  await db.terminate(); await deleteApp(app);
});
async function fixture(mode, generations = 0) {
  const namespace = `body-${randomUUID().slice(0, 8)}`; namespaces.push(namespace);
  const sourceCollection = db.collection('feedIndexLab').doc(namespace).collection('source');
  const indexes = [];
  for (let i = 0; i < generations; i++) {
    const ns = `${namespace}-g${i}`; namespaces.push(ns);
    const index = createLabBlockIndex(db, { namespace: ns, sourceCollection, contentIdentity: i % 2 === 1 });
    await index.seed([]);
    if (i % 2 === 1) await index.base.update({ readIdentity: 1 });
    indexes.push(index);
  }
  return { lab: bodyProjectionLab(db, { namespace, mode, indexes }), indexes };
}
async function selection(lab, ids) {
  const states = await lab.states(ids);
  return { ...scope, startedAt: 10, expiresAt: 2000,
    rows: ids.map(id => ({ id, bodyVersion: states.get(id).bodyVersion, state: states.get(id), read: false })) };
}
const options = lab => ({ codec: bodySelectionCodec(Buffer.alloc(32, 9)), store: lab, clock: () => 100, guard: async () => {} });

test('B4 lab refuses live targets before any read/write', () => {
  assert.throws(() => bodyProjectionLab({ projectId: 'shoutout-dev-46c81' }, { namespace: 'no-live' }), /emulator-only/);
});
test('atomic source/projection/two-generation plan: body, geography, counts, expiry, hiding, purge and rollback', { skip: !enabled }, async () => {
  const { lab, indexes } = await fixture('packed', 2);
  const original = source(1);
  await lab.mutate([{ id: 'a', after: original }]);
  assert.equal((await indexes[0].audit()).activeMetadata, 1);
  const initial = bodyProjection(original).version;
  let current = original;
  // Same projection plan can be composed by create/delete comment, save,
  // archive and purge hosts. This is not live host integration.
  for (const extra of [{ commentsCount: 1 }, { savesCount: 1 }, { commentsCount: 0 }, { savesCount: 0 }]) {
    current = { ...current, ...extra };
    const result = await lab.mutate([{ id: 'a', after: current }]);
    assert.equal(result.indexWrites, 0); assert.equal(result.projectionWrites, 1);
    assert.equal((await lab.states(['a'])).get('a').bodyVersion, initial);
  }
  current = { ...current, geography: { localityName: 'Town', countryCode: 'CZ' } };
  await lab.mutate([{ id: 'a', after: current }]);
  const enriched = (await lab.states(['a'])).get('a').bodyVersion;
  assert.notEqual(enriched, initial);
  assert.equal((await lab.mutate([{ id: 'a', after: current }])).writes, 0);
  const moved = { latitude: 50.12, longitude: 14.48 };
  current = { ...current, location: moved, geohash: encodeGeohash(moved.latitude, moved.longitude) };
  assert.ok((await lab.mutate([{ id: 'a', after: current }])).indexWrites > 0);
  assert.equal((await indexes[0].audit()).activeMetadata, 1);
  await assert.rejects(lab.mutate([{ id: 'a', after: { ...current, likesCount: 1 } }], {
    beforeApply: () => { throw new Error('rollback'); },
  }), /rollback/);
  assert.equal((await lab.source.doc('a').get()).get('likesCount'), 0);
  await assert.rejects(lab.mutate([{ id: 'a', after: { ...current, likesCount: 1 } }], {
    beforeApply(tx) {
      for (let i = 0; i < 451; i++) {
        try { tx.set(lab.base.collection('budget').doc(`item-${i}`), { v: 1 }); } catch { /* sticky budget must still abort */ }
      }
    },
  }), /budget/);
  assert.equal((await lab.base.collection('budget').get()).size, 0);
  assert.equal((await lab.states(['a'])).get('a').likesCount, 0);
  await assert.rejects(lab.mutate([{ id: 'a', after: { ...current, likesCount: 1 } }], { additionalWrites: 450 }), /budget/);
  assert.equal((await lab.source.doc('a').get()).get('likesCount'), 0);
  // Lost response replay does not create a new body version/index history.
  current = { ...current, likesCount: 1 }; await lab.mutate([{ id: 'a', after: current }]);
  assert.equal((await lab.mutate([{ id: 'a', after: current }])).writes, 0);
  for (const status of ['expired', 'deleted']) {
    current = { ...current, status }; await lab.mutate([{ id: 'a', after: current }]);
    assert.equal((await lab.states(['a'])).get('a').status, status);
    assert.equal((await indexes[1].audit()).activeMetadata, 0);
  }
  await lab.mutate([{ id: 'a', after: purgedShoutContext }]);
  assert.equal((await lab.states(['a'])).size, 0);
  assert.deepEqual((await lab.source.doc('a').get()).data(), purgedShoutContext);
  await lab.mutate([{ id: 'a', after: null }]);
  assert.equal((await lab.source.doc('a').get()).exists, false);
  assert.equal((await lab.mutate([{ id: 'a', after: null }])).writes, 0);
});
test('shared pack concurrent writers, more than fifty cards, cold restart and preservation of foreign rows', { skip: !enabled }, async () => {
  const { lab } = await fixture('packed');
  const changes = Array.from({ length: 200 }, (_, i) => ({ id: `row-${i}`, after: source(i) }));
  for (let i = 0; i < changes.length; i += 50) await lab.mutate(changes.slice(i, i + 50));
  await Promise.all(changes.slice(0, 8).map(change => lab.mutate([{ ...change, after: { ...change.after, commentsCount: 2 } }])));
  for (const change of changes.slice(0, 8)) assert.equal((await lab.states([change.id])).get(change.id).commentsCount, 2);
  await lab.mutate(changes.slice(0, 50).map(change => ({ ...change, after: null })));
  const restarted = bodyProjectionLab(db, { namespace: lab.base.id });
  const foreign = await restarted.states(changes.slice(50, 100).map(change => change.id));
  assert.equal(foreign.size, 50);
  for (const row of foreign.values()) assert.equal(row.commentsCount, 0);
  await assert.rejects(lab.mutate(changes.slice(0, 51)), /ids/);
});
test('transactional guard rejects generation/R5 changes and corrupt projection without source writes', { skip: !enabled }, async () => {
  const { lab } = await fixture('packed');
  await lab.mutate([{ id: 'a', after: source(0) }]);
  await lab.base.set({ incarnation: 'first', erasureRevision: 0 });
  const guard = async tx => {
    const state = await tx.get(lab.base);
    if (state.get('incarnation') !== 'first' || state.get('erasureRevision') !== 0) throw new Error('r5-generation-changed');
  };
  await lab.base.update({ erasureRevision: 1 });
  await assert.rejects(lab.mutate([{ id: 'a', after: source(0, { commentsCount: 1 }) }], { guard }), /r5-generation/);
  assert.equal((await lab.source.doc('a').get()).get('commentsCount'), 0);
  const docs = await lab.base.collection('projection').get();
  await docs.docs[0].ref.set({ rows: {} });
  await assert.rejects(lab.mutate([{ id: 'a', after: source(0, { commentsCount: 1 }) }]), /inconsistent/);
  assert.equal((await lab.source.doc('a').get()).get('commentsCount'), 0);
});
test('hybrid packed selection and text-free live state commit and erase together', { skip: !enabled }, async () => {
  const { lab } = await fixture('hybrid');
  await lab.mutate([{ id: 'a', after: source(0) }]);
  const live = (await lab.liveState.doc('a').get()).data();
  assert.equal(Object.hasOwn(live, 'text'), false); assert.equal(Object.hasOwn(live, 'title'), false);
  assert.equal(live.bodyVersion, (await lab.states(['a'])).get('a').bodyVersion);
  const result = await lab.mutate([{ id: 'a', after: source(0, { savesCount: 1 }) }]);
  assert.equal(result.projectionWrites, 2); assert.equal((await lab.liveState.doc('a').get()).get('savesCount'), 1);
  await lab.mutate([{ id: 'a', after: purgedShoutContext }]);
  assert.equal((await lab.liveState.doc('a').get()).exists, false);
  assert.equal((await lab.states(['a'])).size, 0);
});
test('50/200 card measurement: packed versus individual, cold/warm/changed/counter-only, Home/live totals explicit', { skip: !enabled }, async () => {
  const report = { units: 'SDK fetch counts / attempted transaction reads; committed writes; JSON representation bytes, not wire/billing bytes',
    excludes: ['spatial selection', 'Auth/App Check/actor/block/R5 guard costs', 'existing own reaction/save reads', 'index entry billing', 'network framing/compression'],
    subscriptionModel: 'one assumed establishment of 50 Home + 50 parent card deliveries, NOT per-refresh billing; retained subscriptions may deliver no new documents', cases: [] };
  for (const count of [50, 200]) for (const mode of ['packed', 'individual', 'hybrid']) {
    const { lab } = await fixture(mode);
    const all = Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, after: source(i) }));
    let creationWrites = 0; lab.resetMetrics();
    for (let i = 0; i < count; i += 50) creationWrites += (await lab.mutate(all.slice(i, i + 50))).writes;
    const creationReadMetrics = { ...lab.metrics };
    const ids = all.slice(0, 50).map(row => row.id), core = bodyPageCore(options(lab));
    const measured = async (label, cold, missing = null) => {
      lab.resetMetrics();
      const selected = await selection(lab, ids);
      let result = await core.select(selected, { cold });
      if (missing) result = await core.complete(result.token, scope, missing);
      return { label, ...lab.metrics, responseJsonBytes: Buffer.byteLength(canonicalBody(result)),
        callableRoundTrips: missing ? 2 : 1 };
    };
    const cold = await measured('cold', true), warm = await measured('warm', false);
    assert.equal(cold.sourceReads, 50); assert.equal(warm.sourceReads, 0);
    lab.resetMetrics();
    const changed = await lab.mutate([{ id: 'row-0', after: source(0, { text: 'Changed body' }) }]);
    const changedReadMetrics = { ...lab.metrics };
    const refill = await measured('one-body-changed', false, ['row-0']);
    assert.equal(refill.sourceReads, 1);
    lab.resetMetrics();
    const counters = await lab.mutate([{ id: 'row-1', after: source(1, { commentsCount: 2 }) }]);
    const counterReadMetrics = { ...lab.metrics };
    const counterRefresh = await measured('counter-only', false);
    assert.equal(counterRefresh.sourceReads, 0);
    // Existing Home global query (50) and parent card snapshots (50) remain
    // active. These are a model of initial document deliveries, not measured
    // production listener transport bytes. Own reaction/save stays unchanged.
    const publicRepresentationBytes = all.slice(0, 50).reduce((sum, row) => {
      const projection = bodyProjection(row.after);
      return sum + Buffer.byteLength(canonicalBody({ ...projection.body, ...projection.state }));
    }, 0);
    const compactRepresentationBytes = all.slice(0, 50).reduce((sum, row) =>
      sum + Buffer.byteLength(canonicalBody(bodyProjection(row.after).state)), 0);
    report.cases.push({ count, mode, creationWrites, creationReadMetrics, changedReadMetrics, counterReadMetrics,
      changedWrites: changed.writes, counterWrites: counters.writes,
      cold, warm, refill, counterRefresh, unchangedLegacyInitialDocuments: { home: 50, parentCards: 50, ownPrivate: 'unchanged' },
      baselineWithAssumedSubscriptionEstablishment: 150,
      proposedColdWithAssumedSubscriptionEstablishment: cold.reads + 100,
      proposedWarmWithAssumedSubscriptionEstablishment: warm.reads + 100,
      currentHomeAndParentPublicRepresentationBytes: publicRepresentationBytes * 2,
      candidateHomeAndParentPublicRepresentationBytes: publicRepresentationBytes + (mode === 'hybrid' ? compactRepresentationBytes : publicRepresentationBytes),
      simultaneous5000WarmCoreFetches: warm.reads * 5000,
      simultaneous5000AssumedSubscriptionEstablishment: 100 * 5000 });
  }
  log(`B4_BODY_MEASUREMENT ${JSON.stringify(report)}`);
  if (process.env.B4_MEASURE_PATH) writeFileSync(process.env.B4_MEASURE_PATH, JSON.stringify(report, null, 2) + '\n');
});
