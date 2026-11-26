// Offline operator core. Bounded SDK pages and existing atomic adoption cores;
// no scheduler, public endpoint, retention override or reader activation.
import { createHash } from 'node:crypto';
import { Timestamp, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { lifecycleBinding, lifecycleBodyHash, lifecycleSource, lifecycleControlUsable, validateLifecycleArchive, validateLifecycleThread } from './content_lifecycle.js';
import { planLifecycleSourceAdoption, applyLifecycleSourceAdoption, validateLifecycleAdoptionPlan } from './content_lifecycle_adoption.js';
import { planLifecycleReportAdoption, applyLifecycleReportAdoption, validateLifecycleReportAdoptionPlan } from './content_lifecycle_report_adoption.js';
import { planLifecycleAccountAdoption, applyLifecycleAccountAdoption, validateLifecycleAccountAdoptionPlan } from './content_lifecycle_account_adoption.js';
import { planLifecycleReportCompatibility, applyLifecycleReportCompatibility, validateLifecycleReportCompatibilityPlan } from './content_lifecycle_report_compatibility.js';

export const lifecycleInventoryCollections = Object.freeze(['shouts', 'comments', 'privateReplies', 'accountContentArchive',
  'reports', 'commentReports', 'privateReplyReports', 'contentLifecycleArchive', 'contentLifecycleThreads']);
const reportKinds = { reports: 'shout', commentReports: 'comment', privateReplyReports: 'privateReply' };
const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const stamp = v => v instanceof Timestamp ? [v.seconds, v.nanoseconds] : null;
const validStamp = v => Array.isArray(v) && v.length === 2 && v.every(Number.isSafeInteger) && v[0] >= 0 && v[0] <= 253402300799 && v[1] >= 0 && v[1] < 1e9;
function fingerprint(d) {
  try { return { hash: lifecycleBodyHash({ payload: d.data() }), malformed: false }; }
  catch { return { hash: hash([d.ref.path, stamp(d.createTime), stamp(d.updateTime), 'unsupported-sdk-value']), malformed: true }; }
}
const identity = d => d.exists ? { createTime: stamp(d.createTime), updateTime: stamp(d.updateTime), hash: fingerprint(d).hash } : null;
const validIdentity = d => keys(d, 'createTime,hash,updateTime') && validStamp(d.createTime) && validStamp(d.updateTime) && digest(d.hash);
const same = (a, b) => canonical(a) === canonical(b);
const keys = (v, expected) => v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).sort().join(',') === expected;
const fail = s => { throw new Error(s); };
function checked(value, kind, project, fields) {
  const { digest: saved, ...body } = value ?? {};
  if (!digest(saved) || body.kind !== kind || body.projectId !== project || body.v !== 1 ||
      !keys(body, fields) || hash(body) !== saved) fail('invalid-lifecycle-transition-plan');
  return body;
}
function timeAt(clock) {
  const value = typeof clock === 'function' ? clock() : null;
  if (!(value instanceof Date) || !Number.isSafeInteger(value.getTime()) || value.getTime() < 0) fail('invalid-lifecycle-transition-clock');
  return Timestamp.fromDate(value);
}
async function feedFence(tx, db) {
  const doc = await tx.get(db.doc('feedIndexControl/current')), control = validateFeedIndexControl(doc.data());
  if (!['active', 'building', 'paused'].includes(control.mode) || !control.writeGenerationIds.length) fail('lifecycle-transition-feed-required');
  const generations = await tx.getAll(...control.writeGenerationIds.map(id => db.doc(`feedIndexGenerations/${id}`)));
  if (generations.some(g => !g.exists)) fail('lifecycle-transition-generation-required');
  return { control: identity(doc), generations: generations.map(g => ({ id: g.id, createTime: stamp(g.createTime),
    format: hash(Object.fromEntries(['schemaVersion', 'v', 'readIdentity', 'accountRetention', 'cardProjection', 'cardReady']
      .filter(k => g.get(k) !== undefined).map(k => [k, g.get(k)]))) })) };
}
async function inventoryFence(tx, db) {
  const control = await tx.get(db.doc('contentLifecycleControl/current'));
  if (!lifecycleControlUsable(control, { allowPaused: true }) || !(control.get('captureFenceAt') instanceof Timestamp) ||
      !beforeOrEqual(stamp(control.get('captureFenceAt')), stamp(control.updateTime)) ||
      !Number.isSafeInteger(control.get('legacyRevision')) || control.get('legacyRevision') < 0 ||
      !/^[a-f0-9]{40}$/.test(control.get('compatibleWriterCommit') ?? '')) fail('lifecycle-transition-capture-fence-required');
  return { control: { createTime: stamp(control.createTime), revision: control.get('revision'), mode: control.get('mode'),
    captureFenceAt: stamp(control.get('captureFenceAt')), legacyRevision: control.get('legacyRevision'), writerCommit: control.get('compatibleWriterCommit') },
  feed: await feedFence(tx, db) };
}
export async function planLifecycleCaptureStart(db, writerCommit) {
  assertFeedRuntimeTarget(db);
  if (!/^[a-f0-9]{40}$/.test(writerCommit ?? '')) fail('lifecycle-transition-writer-commit-required');
  return db.runTransaction(async tx => {
    const control = await tx.get(db.doc('contentLifecycleControl/current'));
    if (control.exists && (!lifecycleControlUsable(control, { allowPaused: true }) || control.get('captureFenceAt') !== undefined)) fail('lifecycle-transition-start-conflict');
    const value = { v: 1, kind: 'content-lifecycle-capture-start', projectId: db.projectId, writerCommit,
      control: identity(control), feed: await feedFence(tx, db) };
    return { ...value, digest: hash(value) };
  }, { readOnly: true });
}
export async function startLifecycleCapture(db, plan, { approvedDigest, compatibleWriters = false } = {}) {
  assertFeedRuntimeTarget(db);
  const p = validateLifecycleCaptureStartPlan(plan, db.projectId, approvedDigest);
  if (approvedDigest !== plan.digest || compatibleWriters !== true || db[lifecycleBinding]?.enabled) fail('lifecycle-transition-approved-compatible-start-required');
  return db.runTransaction(async tx => {
    const control = await tx.get(db.doc('contentLifecycleControl/current'));
    if (!same(await feedFence(tx, db), p.feed)) fail('lifecycle-transition-feed-drift');
    if (control.get('captureStartDigest') === plan.digest && control.get('compatibleWriterCommit') === p.writerCommit &&
        control.get('captureFenceAt') instanceof Timestamp && Number.isSafeInteger(control.get('legacyRevision')) && control.get('legacyRevision') >= 0) return { state: 'already-started', writes: 0 };
    if (!same(identity(control), p.control)) fail('lifecycle-transition-control-drift');
    const patch = { schemaVersion: 1, mode: 'active', revision: (control.get('revision') ?? 0) + 1,
      captureFenceAt: FieldValue.serverTimestamp(), legacyRevision: 0, compatibleWriterCommit: p.writerCommit, captureStartDigest: plan.digest };
    if (!Number.isSafeInteger(patch.revision)) fail('lifecycle-transition-revision-overflow');
    if (control.exists) tx.update(control.ref, patch); else tx.create(control.ref, patch);
    return { state: 'started', writes: 1 };
  });
}
export function validateLifecycleCaptureStartPlan(plan, project, approvedDigest = plan?.digest) {
  const p = checked(plan, 'content-lifecycle-capture-start', project, 'control,feed,kind,projectId,v,writerCommit');
  if (approvedDigest !== plan.digest || !/^[a-f0-9]{40}$/.test(p.writerCommit ?? '') || p.control !== null && !validIdentity(p.control) ||
      !keys(p.feed, 'control,generations') || !validIdentity(p.feed.control) || !Array.isArray(p.feed.generations) || !p.feed.generations.length ||
      p.feed.generations.some(g => !keys(g, 'createTime,format,id') || !/^[a-z][a-z0-9-]{0,39}$/.test(g.id ?? '') || !validStamp(g.createTime) || !digest(g.format))) fail('invalid-lifecycle-capture-start-plan');
  return p;
}
export async function planLifecycleInventory(db) {
  assertFeedRuntimeTarget(db);
  return db.runTransaction(async tx => {
    const value = { v: 1, kind: 'content-lifecycle-inventory', projectId: db.projectId, fence: await inventoryFence(tx, db), batchSize: 50 };
    return { ...value, digest: hash(value) };
  }, { readOnly: true });
}
export function validateLifecycleInventoryPlan(plan, project) {
  const p = checked(plan, 'content-lifecycle-inventory', project, 'batchSize,fence,kind,projectId,v');
  if (p.batchSize !== 50 || !keys(p.fence, 'control,feed') || !keys(p.fence.control, 'captureFenceAt,createTime,legacyRevision,mode,revision,writerCommit') || !validStamp(p.fence.control?.createTime) ||
      !validStamp(p.fence.control?.captureFenceAt) || !Number.isSafeInteger(p.fence.control?.legacyRevision) || p.fence.control.legacyRevision < 0 ||
      !Number.isSafeInteger(p.fence.control.revision) || p.fence.control.revision < 1 || !['active', 'paused'].includes(p.fence.control.mode) ||
      !/^[a-f0-9]{40}$/.test(p.fence.control.writerCommit ?? '') || !keys(p.fence.feed, 'control,generations') ||
      !validIdentity(p.fence.feed.control) || !Array.isArray(p.fence.feed.generations) || !p.fence.feed.generations.length ||
      new Set(p.fence.feed.generations.map(g => g?.id)).size !== p.fence.feed.generations.length ||
      p.fence.feed.generations.some(g => !keys(g, 'createTime,format,id') || !/^[a-z][a-z0-9-]{0,39}$/.test(g.id ?? '') || !validStamp(g.createTime) || !digest(g.format))) fail('invalid-lifecycle-inventory-plan');
  return p;
}
function sourcePathForReport(path, data) {
  const collection = path.split('/')[0], type = reportKinds[collection];
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(data.shoutId ?? '')) return null;
  const root = `shouts/${data.shoutId}`;
  if (type === 'shout') return root;
  const id = type === 'comment' ? data.commentId : data.privateReplyId;
  return /^[A-Za-z0-9_-]{1,128}$/.test(id ?? '') ? `${root}/${type === 'comment' ? 'comments' : 'privateReplies'}/${id}` : null;
}
function recordFor(doc, collection) {
  const d = doc.data(), source = lifecycleSource(doc.ref.path), target = Object.hasOwn(reportKinds, collection) ? sourcePathForReport(doc.ref.path, d) : null;
  const proof = fingerprint(doc);
  const data = { path: doc.ref.path, collection, identity: { createTime: stamp(doc.createTime), updateTime: stamp(doc.updateTime), hash: proof.hash }, malformed: proof.malformed,
    sourcePath: source ? doc.ref.path : target ?? (typeof d.sourcePath === 'string' && lifecycleSource(d.sourcePath) ? d.sourcePath : null),
    contentHash: null, archiveKey: digest(d.contentArchiveKey) ? d.contentArchiveKey : null,
    accountKey: digest(d.accountArchiveId) ? d.accountArchiveId : null, parentKey: digest(d.shoutArchiveKey) ? d.shoutArchiveKey : null,
    captureMode: ['atomic-write', 'transition'].includes(d.captureMode) ? d.captureMode : null, archivedAt: stamp(d.archivedAt), sourceCreateTime: stamp(d.sourceCreateTime),
    sourceUpdateTime: stamp(d.sourceUpdateTime), hasLegacyText: Object.hasOwn(d, 'text') && Object.hasOwn(reportKinds, collection) };
  try {
    if (source) data.contentHash = lifecycleBodyHash(d);
    if (collection === 'accountContentArchive' && d.content && Object.keys(d.content).length) data.contentHash = lifecycleBodyHash(d.content);
  } catch { data.malformed = true; }
  return data;
}
function validateCheckpoint(plan, checkpoint) {
  if (checkpoint === null) return { phase: 0, after: null, seen: 0, chain: plan.digest };
  const { digest: saved, ...c } = checkpoint;
  if (!keys(c, 'after,chain,phase,planDigest,seen') || c.planDigest !== plan.digest || hash(c) !== saved || !digest(c.chain) ||
      !Number.isSafeInteger(c.phase) || c.phase < 0 || c.phase > lifecycleInventoryCollections.length || !Number.isSafeInteger(c.seen) || c.seen < 0 ||
      c.after !== null && (typeof c.after !== 'string' || c.after.length > 2048 || c.after.split('/').some(p => !/^[A-Za-z0-9_-]{1,386}$/.test(p)))) fail('invalid-lifecycle-inventory-checkpoint');
  if (c.after !== null && (c.phase === lifecycleInventoryCollections.length || c.after.split('/').at(-2) !== lifecycleInventoryCollections[c.phase])) fail('invalid-lifecycle-inventory-checkpoint');
  return c;
}
export async function readLifecycleInventoryPage(db, plan, checkpoint = null) {
  assertFeedRuntimeTarget(db); const p = validateLifecycleInventoryPlan(plan, db.projectId), c = validateCheckpoint(plan, checkpoint);
  return db.runTransaction(async tx => {
    if (!same(await inventoryFence(tx, db), p.fence)) fail('lifecycle-inventory-fence-drift');
    if (c.phase === lifecycleInventoryCollections.length) return { complete: true, records: [], checkpoint, writes: 0 };
    const collection = lifecycleInventoryCollections[c.phase];
    let query = ['comments', 'privateReplies'].includes(collection) ? db.collectionGroup(collection) : db.collection(collection);
    query = query.orderBy(FieldPath.documentId()).limit(50);
    if (c.after) query = query.startAfter(db.doc(c.after));
    const rows = await tx.get(query), records = rows.docs.map(d => recordFor(d, collection));
    const pageDigest = hash({ planDigest: plan.digest, before: c, records });
    const next = { planDigest: plan.digest, phase: c.phase + Number(rows.size < 50), after: rows.size < 50 ? null : rows.docs.at(-1).ref.path,
      seen: c.seen + rows.size, chain: pageDigest };
    return { collection, planDigest: plan.digest, before: checkpoint, records, pageDigest,
      checkpoint: { ...next, digest: hash(next) }, complete: next.phase === lifecycleInventoryCollections.length, writes: 0 };
  }, { readOnly: true });
}

export function validateLifecycleInventoryPage(plan, page) {
  if (!keys(page, 'before,checkpoint,collection,complete,pageDigest,planDigest,records,writes') || page.planDigest !== plan.digest ||
      page.writes !== 0 || typeof page.complete !== 'boolean' || !Array.isArray(page.records) || page.records.length > 50) fail('invalid-lifecycle-inventory-page');
  const before = validateCheckpoint(plan, page.before), next = validateCheckpoint(plan, page.checkpoint);
  if (page.collection !== lifecycleInventoryCollections[before.phase] || next.seen !== before.seen + page.records.length ||
      page.pageDigest !== hash({ planDigest: plan.digest, before, records: page.records }) || next.chain !== page.pageDigest ||
      next.phase !== before.phase + Number(page.records.length < 50) || page.complete !== (next.phase === lifecycleInventoryCollections.length) ||
      next.after !== (page.records.length < 50 ? null : page.records.at(-1)?.path)) fail('invalid-lifecycle-inventory-page');
  const paths = [];
  for (const row of page.records) {
    if (!keys(row, 'accountKey,archiveKey,archivedAt,captureMode,collection,contentHash,hasLegacyText,identity,malformed,parentKey,path,sourceCreateTime,sourcePath,sourceUpdateTime') ||
        row.collection !== page.collection || typeof row.path !== 'string' || row.path.split('/').length % 2 !== 0 ||
        row.path.split('/').some(p => !/^[A-Za-z0-9_-]{1,386}$/.test(p)) || row.path.split('/').at(-2) !== page.collection ||
        !validIdentity(row.identity) || typeof row.hasLegacyText !== 'boolean' || typeof row.malformed !== 'boolean' ||
        [row.archiveKey, row.accountKey, row.parentKey, row.contentHash].some(v => v !== null && !digest(v)) ||
        [row.archivedAt, row.sourceCreateTime, row.sourceUpdateTime].some(v => v !== null && !validStamp(v)) ||
        row.sourcePath !== null && (typeof row.sourcePath !== 'string' || !lifecycleSource(row.sourcePath)) || ![null, 'atomic-write', 'transition'].includes(row.captureMode)) fail('invalid-lifecycle-inventory-record');
    paths.push(row.path);
  }
  if (new Set(paths).size !== paths.length || !same(paths, [...paths].sort()) || before.after && paths.some(p => p <= before.after)) fail('invalid-lifecycle-inventory-order');
  return page;
}

const beforeOrEqual = (a, b) => validStamp(a) && validStamp(b) && (a[0] < b[0] || a[0] === b[0] && a[1] <= b[1]);
// Metadata only narrows candidates. The atomic cores still prove the complete
// body/version, current account deadlines, SDK identities and geographic scope.
export function resolveLifecycleReportCandidates(inventory, reportPage, archivePages) {
  validateLifecycleInventoryPage(inventory, reportPage);
  if (!Object.hasOwn(reportKinds, reportPage.collection) || !Array.isArray(archivePages) || !archivePages.length) fail('invalid-lifecycle-report-inventory');
  const phase = lifecycleInventoryCollections.indexOf('contentLifecycleArchive'); let previous = null;
  for (const page of archivePages) {
    validateLifecycleInventoryPage(inventory, page);
    if (page.collection !== 'contentLifecycleArchive' || previous && !same(page.before, previous) ||
        !previous && (page.before?.phase !== phase || page.before.after !== null)) fail('incomplete-lifecycle-archive-inventory');
    previous = page.checkpoint;
  }
  if (previous.phase !== phase + 1 || previous.after !== null) fail('incomplete-lifecycle-archive-inventory');
  const archives = archivePages.flatMap(p => p.records), reports = [], compatibility = [], blocked = [];
  const choices = (path, report) => archives.filter(a => !a.malformed && a.sourcePath === path && a.captureMode === 'transition' &&
    beforeOrEqual(a.sourceCreateTime, a.sourceUpdateTime) && beforeOrEqual(a.sourceUpdateTime, report.identity.createTime) &&
    beforeOrEqual(report.identity.createTime, a.archivedAt) && beforeOrEqual(report.identity.createTime, a.identity.createTime));
  for (const r of reportPage.records) {
    if (r.malformed || !r.sourcePath) { blocked.push({ path: r.path, reason: 'invalid-report-metadata' }); continue; }
    if (r.archiveKey || r.accountKey) { compatibility.push(r.path); continue; }
    const target = choices(r.sourcePath, r), parents = choices(r.sourcePath.split('/').slice(0, 2).join('/'), r)
      .filter(p => target.length === 1 && beforeOrEqual(p.sourceCreateTime, target[0].sourceCreateTime));
    if (target.length > 1 || parents.length > 1) blocked.push({ path: r.path, reason: 'ambiguous-report-version' });
    else if (target.length === 1 && parents.length === 1) reports.push({ reportPath: r.path,
      contentArchiveKey: target[0].path.split('/')[1], shoutArchiveKey: parents[0].path.split('/')[1] });
    else compatibility.push(r.path); // Exact account-copy proof or an explicit blocked result, never a guessed source.
  }
  return { reports, compatibility, blocked };
}

export function assembleLifecycleInventory(inventory, pages) {
  validateLifecycleInventoryPlan(inventory, inventory?.projectId);
  if (!Array.isArray(pages) || !pages.length) fail('incomplete-lifecycle-inventory');
  const paths = new Set(), counts = {}; let checkpoint = null;
  for (const page of pages) {
    validateLifecycleInventoryPage(inventory, page);
    if (!same(page.before, checkpoint) || checkpoint?.phase === lifecycleInventoryCollections.length) fail('lifecycle-inventory-page-chain-broken');
    for (const row of page.records) {
      if (paths.has(row.path)) fail('lifecycle-inventory-duplicate-record'); paths.add(row.path);
      counts[row.collection] = (counts[row.collection] ?? 0) + 1;
    }
    checkpoint = page.checkpoint;
  }
  if (!pages.at(-1).complete || checkpoint.seen !== paths.size) fail('incomplete-lifecycle-inventory');
  const value = { v: 1, kind: 'content-lifecycle-inventory-manifest', projectId: inventory.projectId, inventoryDigest: inventory.digest,
    pageDigests: pages.map(p => p.pageDigest), counts, records: paths.size, complete: true, activationAuthorized: false };
  return { ...value, digest: hash(value) };
}

const cores = {
  sources: { plan: planLifecycleSourceAdoption, apply: applyLifecycleSourceAdoption, validate: validateLifecycleAdoptionPlan },
  reports: { plan: planLifecycleReportAdoption, apply: applyLifecycleReportAdoption, validate: validateLifecycleReportAdoptionPlan },
  accounts: { plan: planLifecycleAccountAdoption, apply: applyLifecycleAccountAdoption, validate: validateLifecycleAccountAdoptionPlan },
  compatibility: { plan: planLifecycleReportCompatibility, apply: applyLifecycleReportCompatibility, validate: validateLifecycleReportCompatibilityPlan },
};
function guardedDatabase(db, inventory) {
  const p = validateLifecycleInventoryPlan(inventory, db.projectId);
  return new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return (operation, ...options) => target.runTransaction(async tx => {
      if (!same(await inventoryFence(tx, db), p.fence)) fail('lifecycle-inventory-fence-drift');
      return operation(tx);
    }, ...options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}
export async function planLifecycleTransitionBatch(db, inventory, phase, candidates, { clock = () => new Date(), preserveLegacyText = true } = {}) {
  assertFeedRuntimeTarget(db);
  if (!Object.hasOwn(cores, phase) || !Array.isArray(candidates) || !candidates.length || candidates.length > 50 || typeof preserveLegacyText !== 'boolean') fail('invalid-lifecycle-transition-batch');
  const core = await cores[phase].plan(guardedDatabase(db, inventory), candidates, { clock, preserveLegacyText });
  const value = { v: 1, kind: 'content-lifecycle-migration-batch', projectId: db.projectId, inventory, phase, core };
  return { ...value, digest: hash(value) };
}
export function validateLifecycleTransitionBatch(batch, project, approvedDigest = batch?.digest) {
  const p = checked(batch, 'content-lifecycle-migration-batch', project, 'core,inventory,kind,phase,projectId,v');
  if (approvedDigest !== batch.digest || !Object.hasOwn(cores, p.phase)) fail('invalid-lifecycle-transition-batch');
  validateLifecycleInventoryPlan(p.inventory, project); cores[p.phase].validate(p.core, project);
  return p;
}
export async function applyLifecycleTransitionBatch(db, batch, { approvedDigest, compatibleWriters = false, compatibleReaders = false,
  indexWriter = null, clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db);
  const p = validateLifecycleTransitionBatch(batch, db.projectId, approvedDigest);
  if (typeof approvedDigest !== 'string' || compatibleWriters !== true ||
      ['reports', 'compatibility'].includes(p.phase) && !p.core.preserveLegacyText && compatibleReaders !== true) fail('lifecycle-transition-explicit-compatibility-required');
  timeAt(clock);
  return cores[p.phase].apply(guardedDatabase(db, p.inventory), p.core, { approvedDigest: p.core.digest,
    compatibleWriters, compatibleReaders, indexWriter, clock });
}
// Audits are scoped to a freshly checked page. A cursor/count from a local
// file is not an authorization or proof of a whole-dataset activation.
export async function auditLifecycleInventoryPage(db, inventory, page, { clock = () => new Date(), requireTextCleanup = false } = {}) {
  assertFeedRuntimeTarget(db); validateLifecycleInventoryPlan(inventory, db.projectId);
  validateLifecycleInventoryPage(inventory, page);
  if (typeof requireTextCleanup !== 'boolean') fail('invalid-lifecycle-audit-page');
  const guarded = guardedDatabase(db, inventory), result = { scope: 'page', planDigest: inventory.digest, pageDigest: page.pageDigest,
    requireTextCleanup, ready: true, checked: 0, blocked: [], legacyText: 0, writes: 0 };
  for (const record of page.records) {
    try {
      if (record.malformed) fail('unsupported-inventory-value');
      await guarded.runTransaction(async tx => {
        const current = await tx.get(db.doc(record.path));
        if (!current.exists) fail('inventory-record-disappeared');
        if (!same(stamp(current.createTime), record.identity.createTime)) fail('inventory-record-recreated');
      }, { readOnly: true });
      if (record.collection === 'shouts' || record.collection === 'comments' || record.collection === 'privateReplies') {
        const plan = await planLifecycleSourceAdoption(guarded, [record.path], { clock });
        if (plan.entries[0].action !== 'bound') fail('source-adoption-pending');
      } else if (record.collection === 'accountContentArchive') {
        const plan = await planLifecycleAccountAdoption(guarded, [record.path.split('/')[1]], { clock });
        if (plan.entries[0].action !== 'covered') fail('account-adoption-pending');
      } else if (Object.hasOwn(reportKinds, record.collection)) {
        const plan = await planLifecycleReportCompatibility(guarded, [record.path], { clock, preserveLegacyText: !requireTextCleanup });
        if (plan.entries[0].action !== 'covered') fail('report-adoption-pending');
        const current = await guarded.runTransaction(tx => tx.get(db.doc(record.path)), { readOnly: true });
        result.legacyText += Number(current.get('text') !== undefined);
      } else await guarded.runTransaction(async tx => {
        const doc = await tx.get(db.doc(record.path)); if (!doc.exists) fail('inventory-record-disappeared');
        if (record.collection === 'contentLifecycleArchive') validateLifecycleArchive(db, doc.id, doc.data());
        else if (record.collection === 'contentLifecycleThreads') validateLifecycleThread(doc.data(), doc.id);
        else fail('unexpected-inventory-collection');
      }, { readOnly: true });
      result.checked++;
    } catch (error) {
      result.ready = false; result.blocked.push({ path: record.path, reason: /^[a-z-]{1,64}$/.test(error.message ?? '') ? error.message : 'lifecycle-audit-failed' });
    }
  }
  // A legacy write after the last page/row validation invalidates the audit.
  await guarded.runTransaction(async () => {}, { readOnly: true });
  return { ...result, digest: hash(result) };
}

export async function finishLifecycleInventoryAudit(db, inventory, pages, audits, { requireTextCleanup = true } = {}) {
  assertFeedRuntimeTarget(db);
  const manifest = assembleLifecycleInventory(inventory, pages);
  if (!Array.isArray(audits) || audits.length !== pages.length || typeof requireTextCleanup !== 'boolean') fail('incomplete-lifecycle-inventory-audit');
  const blocked = []; let checked = 0, legacyText = 0;
  for (let n = 0; n < audits.length; n++) {
    const { digest: saved, ...a } = audits[n] ?? {}, page = pages[n];
    if (!keys(a, 'blocked,checked,legacyText,pageDigest,planDigest,ready,requireTextCleanup,scope,writes') || hash(a) !== saved ||
        a.scope !== 'page' || a.planDigest !== inventory.digest || a.pageDigest !== page.pageDigest || a.writes !== 0 ||
        !Number.isSafeInteger(a.checked) || a.checked < 0 || !Array.isArray(a.blocked) || a.checked + a.blocked.length !== page.records.length ||
        !Number.isSafeInteger(a.legacyText) || a.legacyText < 0 || a.legacyText > page.records.length ||
        a.ready !== (a.blocked.length === 0) || typeof a.requireTextCleanup !== 'boolean' ||
        requireTextCleanup && !a.requireTextCleanup || new Set(a.blocked.map(b => b.path)).size !== a.blocked.length ||
        a.blocked.some(b => !keys(b, 'path,reason') || !page.records.some(r => r.path === b.path) || !/^[a-z-]{1,64}$/.test(b.reason))) fail('invalid-lifecycle-inventory-audit');
    blocked.push(...a.blocked); checked += a.checked; legacyText += a.legacyText;
  }
  await guardedDatabase(db, inventory).runTransaction(async () => {}, { readOnly: true });
  return { scope: 'complete-inventory-pass', inventoryDigest: inventory.digest, manifestDigest: manifest.digest,
    checked, blocked, legacyText, ready: blocked.length === 0 && (!requireTextCleanup || legacyText === 0),
    activationAuthorized: false, writes: 0 };
}
