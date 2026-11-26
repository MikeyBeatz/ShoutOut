import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Firestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { createFeedRuntime } from './feed_runtime.js';
import { createContentLifecycleDatabase, lifecycleDay } from './content_lifecycle.js';
import { encodeGeohash } from './geohash.js';
import { planLifecycleCaptureStart, startLifecycleCapture, planLifecycleInventory, readLifecycleInventoryPage,
  validateLifecycleInventoryPage, assembleLifecycleInventory, planLifecycleTransitionBatch, applyLifecycleTransitionBatch,
  auditLifecycleInventoryPage, finishLifecycleInventoryAudit, resolveLifecycleReportCandidates } from './content_lifecycle_transition.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const absent = { async getUser() { throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); } };
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
async function fixture(t, { count = 2, indexed = true } = {}) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), nonce = randomUUID().replaceAll('-', ''), roots = [], extra = [];
  const control = raw.doc('contentLifecycleControl/current'), feed = raw.doc('feedIndexControl/current'), gen = raw.doc(`feedIndexGenerations/transition-${nonce.slice(0, 20)}`);
  t.after(async () => {
    for (const root of roots) { await raw.recursiveDelete(root); await raw.recursiveDelete(raw.doc(`contentLifecycleThreads/${root.id}`)); }
    for (let n = 0; n < roots.length; n += 25) for (const collection of ['contentLifecycleArchive', 'contentLifecycleJobs']) {
      for (const doc of (await raw.collection(collection).where('threadId', 'in', roots.slice(n, n + 25).map(r => r.id)).get()).docs) await raw.recursiveDelete(doc.ref);
    }
    for (const ref of [control, feed, gen, ...extra]) await raw.recursiveDelete(ref);
    await raw.terminate();
  });
  await gen.create({ schemaVersion: 1, v: 2, readIdentity: 1, cardProjection: 1, cardReady: true, accountRetention: true, erasureRevision: 0, prunedThrough: -1 });
  await feed.create({ schemaVersion: 2, revision: 1, mode: 'active', readGenerationId: gen.id, writeGenerationIds: [gen.id],
    cardReadGenerationId: gen.id, cardWriteGenerationIds: [gen.id] });
  const rt = createFeedRuntime(raw, absent, { enabled: true, contentLifecycleEnabled: false, contentCaptureEnabled: false, contentMaintenanceEnabled: false,
    cardStateEnabled: true, newsRuntimeEnabled: false });
  const body = { authorId: `author_${nonce}`, authorNickname: 'Synthetic', title: 'Inventory must not contain this title', text: 'Inventory must not contain this text',
    status: 'active', createdAt: Timestamp.fromMillis(Date.now() - 5000), expiresAt: Timestamp.fromMillis(Date.now() + lifecycleDay),
    location: new GeoPoint(50.53, 14.13), geohash: encodeGeohash(50.53, 14.13), geography: { schemaVersion: 1, countryCode: 'CZ' }, categories: ['Dotaz'],
    likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0 };
  for (let n = 0; n < count; n++) {
    const ref = raw.doc(`shouts/transition_${nonce}_${String(n).padStart(3, '0')}`); roots.push(ref);
    if (indexed) await rt.database.runTransaction(async tx => { const p = await rt.indexWriter.prepare(tx, ref.id, null, body); p.apply(); tx.create(ref, body); });
    else await ref.create(body);
  }
  const start = await planLifecycleCaptureStart(raw, 'a'.repeat(40));
  const begin = options => startLifecycleCapture(raw, start, { approvedDigest: start.digest, compatibleWriters: true, ...options });
  const clock = () => new Date(Date.now() + 5000);
  const apply = (batch, options = {}) => applyLifecycleTransitionBatch(rt.database, batch, { approvedDigest: batch.digest, compatibleWriters: true,
    indexWriter: rt.indexWriter, clock, ...options });
  return { raw, rt, roots, extra, body, control, feed, gen, start, begin, clock, apply };
}
async function pagesFor(f, plan) {
  const pages = []; let checkpoint = null;
  do {
    const page = await readLifecycleInventoryPage(f.raw, plan, checkpoint); validateLifecycleInventoryPage(plan, page);
    pages.push(page); checkpoint = page.checkpoint;
  } while (!pages.at(-1).complete);
  return pages;
}

test('capture bootstrap is explicit, replay-safe and cannot reset an existing cohort after lost acknowledgement', { skip: !enabled }, async t => {
  const f = await fixture(t);
  await assert.rejects(f.begin({ compatibleWriters: false }), /approved-compatible/);
  assert(!(await f.control.get()).exists); assert.equal((await f.begin()).writes, 1);
  const initial = await f.control.get(); await f.control.update({ legacyRevision: 1 });
  assert.equal((await f.begin()).writes, 0); assert((await f.control.get()).get('captureFenceAt').isEqual(initial.get('captureFenceAt')));
  await assert.rejects(planLifecycleCaptureStart(f.raw, 'b'.repeat(40)), /start-conflict/);
});

test('inventory resumes across cold pages over fifty records and never serializes bodies, participants or location', { skip: !enabled }, async t => {
  const f = await fixture(t, { count: 101, indexed: false }); await f.begin();
  const plan = await planLifecycleInventory(f.raw), pages = await pagesFor(f, plan), roots = pages.filter(p => p.collection === 'shouts');
  assert.deepEqual(roots.map(p => p.records.length), [50, 50, 1]);
  const manifest = assembleLifecycleInventory(plan, pages); assert.equal(manifest.records, 101); assert.equal(manifest.activationAuthorized, false);
  const text = JSON.stringify({ plan, pages, manifest });
  for (const value of [f.body.title, f.body.text, f.body.authorNickname, 'participants', 'latitude', 'longitude']) assert(!text.includes(value));
  assert.equal((await readLifecycleInventoryPage(f.raw, plan, pages.at(-1).checkpoint)).complete, true);
  assert.throws(() => assembleLifecycleInventory(plan, pages.slice(1)), /chain-broken/);
  assert.throws(() => assembleLifecycleInventory(plan, pages.slice(0, -1)), /incomplete/);
});

test('the same approved source batch survives a lost response and commits each body/index binding once', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.begin(); const inventory = await planLifecycleInventory(f.raw);
  const batch = await planLifecycleTransitionBatch(f.rt.database, inventory, 'sources', f.roots.map(r => r.path), { clock: f.clock });
  let dropped = false;
  const lossy = new Proxy(f.rt.database, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => { const result = await target.runTransaction(...args); if (!dropped) { dropped = true; throw new Error('lost-response'); } return result; };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await assert.rejects(applyLifecycleTransitionBatch(lossy, batch, { approvedDigest: batch.digest, compatibleWriters: true, indexWriter: f.rt.indexWriter, clock: f.clock }), /lost-response/);
  assert.equal((await f.apply(batch)).writes, 0);
  for (const root of f.roots) {
    const source = await root.get(); assert(source.get('contentArchiveKey'));
    assert.equal((await f.raw.collection('contentLifecycleArchive').where('sourcePath', '==', root.path).get()).size, 1);
  }
});

test('concurrent operators use one original batch and the shared transaction budget', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.begin(); const inventory = await planLifecycleInventory(f.raw);
  const batch = await planLifecycleTransitionBatch(f.rt.database, inventory, 'sources', f.roots.map(r => r.path), { clock: f.clock });
  const results = await Promise.all([f.apply(batch), f.apply(batch)]);
  assert.equal(results.filter(r => r.writes > 0).length, 1); assert(results.every(r => r.writes <= 450));
});

test('legacy mutations invalidate the old inventory and batch in their own SDK transaction', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.begin(); const inventory = await planLifecycleInventory(f.raw), page = await readLifecycleInventoryPage(f.raw, inventory);
  const batch = await planLifecycleTransitionBatch(f.rt.database, inventory, 'sources', [f.roots[0].path], { clock: f.clock });
  const capture = createContentLifecycleDatabase(f.raw, { enabled: true, readsEnabled: false, clock: f.clock });
  await capture.runTransaction(async tx => { await tx.get(f.roots[0]); tx.update(f.roots[0], { text: 'Changed during inventory' }); });
  await assert.rejects(readLifecycleInventoryPage(f.raw, inventory, page.checkpoint), /fence-drift/);
  await assert.rejects(f.apply(batch), /fence-drift/); assert.equal((await f.roots[0].get()).get('contentArchiveKey'), undefined);
});

test('generation format changes stop inventory, while unrelated erasure progress does not require a restart', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.begin(); const inventory = await planLifecycleInventory(f.raw);
  await f.gen.update({ erasureRevision: 1 }); await readLifecycleInventoryPage(f.raw, inventory);
  await f.gen.update({ cardReady: false }); await assert.rejects(readLifecycleInventoryPage(f.raw, inventory), /fence-drift/);
});

test('audit certifies only checked pages; incomplete chains, old identities and a new dirty revision cannot close it', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.begin(); const inventory = await planLifecycleInventory(f.raw);
  const batch = await planLifecycleTransitionBatch(f.rt.database, inventory, 'sources', f.roots.map(r => r.path), { clock: f.clock }); await f.apply(batch);
  const pages = await pagesFor(f, inventory), audits = [];
  for (const page of pages) audits.push(await auditLifecycleInventoryPage(f.raw, inventory, page, { clock: f.clock, requireTextCleanup: true }));
  const result = await finishLifecycleInventoryAudit(f.raw, inventory, pages, audits); assert(result.ready); assert.equal(result.activationAuthorized, false);
  await assert.rejects(finishLifecycleInventoryAudit(f.raw, inventory, pages, audits.slice(1)), /incomplete/);
  const tampered = JSON.parse(JSON.stringify(pages[0])); tampered.records[0].identity.createTime[1]++;
  const c = { phase: 0, after: null, seen: 0, chain: inventory.digest }; tampered.pageDigest = hash({ planDigest: inventory.digest, before: c, records: tampered.records });
  tampered.checkpoint.chain = tampered.pageDigest; const state = { ...tampered.checkpoint }; delete state.digest; tampered.checkpoint.digest = hash(state);
  const rejected = await auditLifecycleInventoryPage(f.raw, inventory, tampered, { clock: f.clock }); assert(!rejected.ready); assert.equal(rejected.blocked[0].reason, 'inventory-record-recreated');
  await f.control.update({ legacyRevision: 1 }); await assert.rejects(finishLifecycleInventoryAudit(f.raw, inventory, pages, audits), /fence-drift/);
});

test('an unproven deleted source remains blocked instead of receiving a new retention date', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.raw.doc(f.roots[0].path).update({ status: 'deleted' }); await f.begin();
  const inventory = await planLifecycleInventory(f.raw), batch = await planLifecycleTransitionBatch(f.rt.database, inventory, 'sources', f.roots.map(r => r.path), { clock: f.clock });
  assert(batch.core.entries.some(e => e.action === 'blocked'));
  await assert.rejects(f.apply(batch), /plan-blocked/); assert.equal((await f.roots[1].get()).get('contentArchiveKey'), undefined);
});

test('malformed SDK values are quarantined as metadata without echoing their content or stopping continuation', { skip: !enabled }, async t => {
  const f = await fixture(t, { indexed: false }); await f.roots[0].update({ unsupported: f.raw.doc('users/private-reference') }); await f.begin();
  const inventory = await planLifecycleInventory(f.raw), page = await readLifecycleInventoryPage(f.raw, inventory);
  assert(page.records[0].malformed); assert(!JSON.stringify(page).includes('private-reference'));
  const audit = await auditLifecycleInventoryPage(f.raw, inventory, page, { clock: f.clock });
  assert(!audit.ready); assert.equal(audit.blocked[0].reason, 'unsupported-inventory-value');
  assert.throws(() => resolveLifecycleReportCandidates(inventory, { ...page, collection: 'bad' }, []));
});

test('report candidates require the complete archive family and remain independently validated by the adoption core', { skip: !enabled }, async t => {
  const f = await fixture(t), report = f.raw.doc(`reports/synthetic_reporter_${f.roots[0].id}`); f.extra.push(report);
  await report.create({ reporterId: 'synthetic_reporter', shoutId: f.roots[0].id, status: 'open', reason: 'Synthetic', createdAt: Timestamp.now() });
  await f.begin(); const inventory = await planLifecycleInventory(f.raw);
  await f.apply(await planLifecycleTransitionBatch(f.rt.database, inventory, 'sources', f.roots.map(r => r.path), { clock: f.clock }));
  const pages = await pagesFor(f, inventory), reportPage = pages.find(p => p.collection === 'reports'), archives = pages.filter(p => p.collection === 'contentLifecycleArchive');
  const resolved = resolveLifecycleReportCandidates(inventory, reportPage, archives);
  assert.equal(resolved.reports.length, 1); assert.equal(resolved.blocked.length, 0); assert.equal(resolved.compatibility.length, 0);
  assert.throws(() => resolveLifecycleReportCandidates(inventory, reportPage, []), /invalid-lifecycle-report/);
  assert.throws(() => resolveLifecycleReportCandidates(inventory, reportPage, [...archives, ...archives]), /incomplete-lifecycle-archive/);
  const batch = await planLifecycleTransitionBatch(f.rt.database, inventory, 'reports', resolved.reports, { clock: f.clock });
  assert.equal((await f.apply(batch)).writes, 1); assert((await report.get()).get('contentArchiveKey'));
});
