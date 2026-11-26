// Private, bounded source-adoption core. No callable/CLI/scheduler, activation,
// archive reconstruction from manifests, or implicit mutation on import.
import { createHash } from 'node:crypto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { canonical } from './feed_block_index.js';
import { publicFeedBody } from './feed_public_body.js';
import { lifecycleBinding, lifecycleSource, lifecycleTimes, lifecycleGeography, lifecycleBodyHash,
  lifecycleArchiveKey, lifecycleArchiveRecord, lifecycleSubjectDeadline, validateLifecycleArchive,
  validateLifecycleThread, lifecycleControlUsable } from './content_lifecycle.js';

const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const stamp = time => time instanceof Timestamp ? [time.seconds, time.nanoseconds] : null;
const same = (a, b) => canonical(a) === canonical(b);
const keys = (value, expected) => value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join(',') === expected;
const validStamp = value => Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger) &&
  value[0] >= 0 && value[0] <= 253402300799 && value[1] >= 0 && value[1] < 1e9;
const validIdentity = value => keys(value, 'createTime,updateTime') && validStamp(value.createTime) && validStamp(value.updateTime);
const validDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function validEntry(entry) {
  if (!keys(entry, 'action,archiveKey,contentHash,parent,parentHash,path,reason,source,times') ||
      !['adopt', 'bind-expired', 'bound', 'blocked'].includes(entry.action) || typeof entry.path !== 'string' || !lifecycleSource(entry.path) ||
      entry.source !== null && !validIdentity(entry.source) || entry.parent !== null && !validIdentity(entry.parent) ||
      [entry.contentHash, entry.archiveKey, entry.parentHash].some(value => value !== null && !validDigest(value)) ||
      entry.times !== null && (!keys(entry.times, 'historyUntil,publicUntil,retainUntil') || !Object.values(entry.times).every(validStamp))) return false;
  return entry.action === 'blocked' ? typeof entry.reason === 'string' && /^[a-z-]{1,64}$/.test(entry.reason) :
    entry.reason === null && entry.source !== null && entry.parent !== null && entry.times !== null &&
      [entry.contentHash, entry.archiveKey, entry.parentHash].every(validDigest);
}
function validBinding(binding) {
  return keys(binding, 'control,feed,generations') && validIdentity(binding.control) && validIdentity(binding.feed) &&
    Array.isArray(binding.generations) && binding.generations.length > 0 && new Set(binding.generations.map(g => g?.id)).size === binding.generations.length &&
    binding.generations.every(g => keys(g, 'createTime,format,id') && typeof g.id === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(g.id) && validStamp(g.createTime) && validDigest(g.format));
}
const fail = code => { throw new Error(code); };
const identity = doc => doc.exists ? { createTime: stamp(doc.createTime), updateTime: stamp(doc.updateTime) } : null;
const equalTime = (a, b) => a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b);
const earlier = (a, b) => a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds < b.nanoseconds;
const archiveIncarnation = (archive, source) => archive.get('sourceCreateTime') !== undefined
  ? equalTime(archive.get('sourceCreateTime'), source.createTime) : equalTime(archive.createTime, source.createTime);
const sorted = paths => [...paths].sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : a > b ? 1 : 0));
const blocked = code => { throw Object.assign(new Error(code), { adoptionBlocked: true }); };
function pathsFor(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 50 || new Set(paths).size !== paths.length ||
      paths.some(path => typeof path !== 'string' || !lifecycleSource(path))) fail('invalid-lifecycle-adoption-paths');
  return sorted(paths);
}
function timeAt(clock) {
  if (typeof clock !== 'function') fail('invalid-lifecycle-adoption-clock');
  const date = clock();
  if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) || date.getTime() < 0) fail('invalid-lifecycle-adoption-clock');
  return Timestamp.fromDate(date);
}
async function inspect(tx, db, paths, now) {
  const [control, feed] = await tx.getAll(db.doc('contentLifecycleControl/current'), db.doc('feedIndexControl/current'));
  if (!lifecycleControlUsable(control, { allowPaused: true })) fail('lifecycle-adoption-control-required');
  const state = validateFeedIndexControl(feed.data());
  if (!['active', 'building', 'paused'].includes(state.mode) || !state.writeGenerationIds.length) fail('lifecycle-adoption-feed-required');
  const markers = await tx.getAll(...state.writeGenerationIds.map(id => db.doc(`feedIndexGenerations/${id}`)));
  if (markers.some(doc => !doc.exists)) fail('lifecycle-adoption-generation-required');
  const binding = { control: identity(control), feed: identity(feed), generations: markers.map(doc => ({ id: doc.id,
    createTime: stamp(doc.createTime), format: digest(Object.fromEntries(['schemaVersion', 'v', 'readIdentity', 'accountRetention', 'cardProjection', 'cardReady']
      .filter(key => doc.get(key) !== undefined).map(key => [key, doc.get(key)]))) })) };
  const sources = new Map(), threads = new Map(), selected = new Map(), subjectCache = new Map();
  const parents = [...new Set(paths.map(path => path.split('/').slice(0, 2).join('/')))];
  const allPaths = [...new Set([...paths, ...parents])];
  for (const doc of await tx.getAll(...allPaths.map(path => db.doc(path)))) sources.set(doc.ref.path, doc);
  for (const doc of await tx.getAll(...parents.map(path => db.doc(`contentLifecycleThreads/${path.split('/')[1]}`)))) threads.set(doc.id, doc);
  const archiveKeys = new Map();
  for (const path of allPaths) {
    const doc = sources.get(path);
    try { if (doc.exists) archiveKeys.set(path, lifecycleArchiveKey(db.projectId, path, doc.data())); } catch { /* Classified below. */ }
  }
  const archivePaths = [...new Set([...archiveKeys.values()].map(key => `contentLifecycleArchive/${key}`))];
  const archives = new Map();
  if (archivePaths.length) for (const doc of await tx.getAll(...archivePaths.map(path => db.doc(path)))) archives.set(doc.id, doc);
  const readyThreads = new Map();
  function threadFor(path) {
    const kind = lifecycleSource(path), root = sources.get(`shouts/${kind.shoutId}`), saved = threads.get(kind.shoutId);
    if (!root?.exists || root.get('contentPurged') === true) blocked('parent-unavailable');
    if (readyThreads.has(kind.shoutId)) return readyThreads.get(kind.shoutId);
    if (!saved.exists) blocked('parent-adoption-required');
    let header;
    try { header = validateLifecycleThread(saved.data(), kind.shoutId); } catch { blocked('invalid-thread'); }
    if (!equalTime(header.sourceCreatedAt, root.get('createdAt')) || !equalTime(header.plannedExpiresAt, root.get('expiresAt')) ||
        header.sourceCreateTime && !header.sourceCreateTime.isEqual(root.createTime) ||
        !equalTime(root.get('publicUntil'), header.publicUntil) || !equalTime(root.get('historyUntil'), header.historyUntil) || header.sourceDrainedAt != null) blocked('parent-binding-changed');
    const parentKey = archiveKeys.get(root.ref.path), parentArchive = archives.get(parentKey);
    if (!parentKey || root.get('contentArchiveKey') !== parentKey || root.get('contentHash') !== lifecycleBodyHash(root.data())) blocked('parent-binding-changed');
    if (parentArchive?.exists) {
      try { validateLifecycleArchive(db, parentKey, parentArchive.data()); } catch { blocked('invalid-parent-archive'); }
      if (!equalTime(parentArchive.get('threadCreatedAt'), header.sourceCreatedAt) || !archiveIncarnation(parentArchive, root)) blocked('parent-binding-changed');
    } else if (header.retainUntil.toMillis() > now.toMillis()) blocked('parent-archive-unavailable');
    readyThreads.set(kind.shoutId, header); return header;
  }
  for (const path of paths) {
    const doc = sources.get(path), kind = lifecycleSource(path), parentPath = `shouts/${kind.shoutId}`, root = sources.get(parentPath);
    const entry = { path, source: identity(doc), contentHash: null, archiveKey: archiveKeys.get(path) ?? null,
      parent: identity(root), parentHash: archiveKeys.get(parentPath) ?? null, times: null, action: 'blocked', reason: null };
    const item = { entry, doc, root, kind, header: null, newHeader: false, capture: false };
    selected.set(path, item);
    try {
      if (!doc.exists) blocked('source-unavailable');
      const data = doc.data();
      if (data.contentPurged === true || !entry.archiveKey || !(data.createdAt instanceof Timestamp) ||
          data.createdAt.toMillis() < 0 || data.createdAt.toMillis() > now.toMillis()) blocked('invalid-source');
      entry.contentHash = lifecycleBodyHash(data);
      let header;
      if (kind.kind === 'shout') {
        try { publicFeedBody(data); } catch { blocked('invalid-source'); }
        if (!(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() < data.createdAt.toMillis() ||
            !['active', 'expired', 'deleted'].includes(data.status)) blocked('invalid-source');
        const saved = threads.get(kind.shoutId);
        if (saved.exists) header = threadFor(path);
        else {
          if (data.status === 'deleted') blocked('deleted-end-unproven');
          if (data.status === 'expired' && data.expiresAt.toMillis() > now.toMillis()) blocked('invalid-source');
          header = { schemaVersion: 1, shoutId: kind.shoutId, sourceCreatedAt: data.createdAt, plannedExpiresAt: data.expiresAt,
            archivedAt: FieldValue.serverTimestamp(), ...lifecycleTimes(data.expiresAt), geography: lifecycleGeography(data), sourceDrainedAt: null,
            maintenanceState: 'pending', maintenancePhase: 'source', nextMaintenanceAt: lifecycleTimes(data.expiresAt).historyUntil };
          item.newHeader = true;
        }
      } else {
        if (selected.get(parentPath)?.entry.action === 'blocked') blocked('parent-adoption-required');
        header = threadFor(path);
        if (earlier(doc.createTime, root.createTime)) blocked('parent-incarnation-changed');
        if (typeof data.text !== 'string' || data.createdAt.toMillis() < header.sourceCreatedAt.toMillis() ||
            data.createdAt.toMillis() > header.publicUntil.toMillis()) blocked('invalid-child');
      }
      item.header = header;
      // Also fence the root author's account before introducing child copies.
      let record;
      try { record = lifecycleArchiveRecord(path, data, header, { sourceCreateTime: doc.createTime }); } catch { blocked('invalid-source'); }
      const owners = [...new Set([...record.subjectUserIds, root.get('authorId')])];
      const deadline = await lifecycleSubjectDeadline(tx, db, owners, header.retainUntil, subjectCache);
      if (deadline.deleting) blocked('account-deletion-in-progress');
      entry.times = { publicUntil: stamp(header.publicUntil), historyUntil: stamp(header.historyUntil), retainUntil: stamp(deadline.retainUntil) };
      const archive = archives.get(entry.archiveKey);
      if (data.contentArchiveKey !== undefined || data.contentHash !== undefined) {
        if (data.contentArchiveKey !== entry.archiveKey || data.contentHash !== entry.contentHash || item.newHeader) blocked('partial-source-binding');
        if (archive?.exists) {
          try { validateLifecycleArchive(db, archive.id, archive.data()); } catch { blocked('invalid-archive'); }
          if (!equalTime(archive.get('threadCreatedAt'), header.sourceCreatedAt) || !archiveIncarnation(archive, doc)) blocked('archive-incarnation-changed');
        } else if (deadline.retainUntil.toMillis() > now.toMillis()) blocked('archive-unavailable');
        entry.action = 'bound'; item.newHeader = false;
      } else {
        if (archive?.exists || kind.kind === 'shout' && (threads.get(kind.shoutId).exists ||
            data.publicUntil !== undefined || data.historyUntil !== undefined)) blocked('partial-source-binding');
        entry.action = deadline.retainUntil.toMillis() > now.toMillis() ? 'adopt' : 'bind-expired';
        item.capture = entry.action === 'adopt'; item.record = record;
        item.patch = { contentArchiveKey: entry.archiveKey, contentHash: entry.contentHash,
          ...(kind.kind === 'shout' ? { publicUntil: header.publicUntil, historyUntil: header.historyUntil } : {}) };
      }
      if (kind.kind === 'shout') readyThreads.set(kind.shoutId, header);
    } catch (error) {
      if (!error.adoptionBlocked) throw error;
      entry.action = 'blocked'; entry.reason = error.message; item.newHeader = false; item.capture = false;
    }
  }
  return { binding, selected, entries: [...selected.values()].map(item => item.entry) };
}

export async function planLifecycleSourceAdoption(db, paths, { clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db); paths = pathsFor(paths);
  return db.runTransaction(async tx => {
    const now = timeAt(clock), current = await inspect(tx, db, paths, now);
    const value = { v: 1, kind: 'content-lifecycle-source-adoption', projectId: db.projectId, plannedAt: stamp(now),
      binding: current.binding, entries: current.entries };
    return { ...value, digest: digest(value) };
  }, { readOnly: true });
}
export function validateLifecycleAdoptionPlan(plan, projectId, approvedDigest = plan?.digest) {
  const { digest: saved, ...value } = plan ?? {};
  if (!/^[a-f0-9]{64}$/.test(saved ?? '') || saved !== approvedDigest || digest(value) !== saved || value.v !== 1 ||
      value.kind !== 'content-lifecycle-source-adoption' || value.projectId !== projectId ||
      Object.keys(value).sort().join(',') !== 'binding,entries,kind,plannedAt,projectId,v' ||
      !validStamp(value.plannedAt) || !validBinding(value.binding) ||
      !Array.isArray(value.entries) || !value.entries.every(validEntry)) {
    fail('invalid-lifecycle-adoption-plan');
  }
  const paths = value.entries.map(entry => entry.path);
  if (!same(paths, pathsFor(paths))) fail('invalid-lifecycle-adoption-plan');
  return value;
}

export async function applyLifecycleSourceAdoption(db, plan, { approvedDigest, compatibleWriters = false, indexWriter,
  clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db);
  if (typeof approvedDigest !== 'string') fail('lifecycle-adoption-approved-digest-required');
  const value = validateLifecycleAdoptionPlan(plan, db.projectId, approvedDigest);
  if (compatibleWriters !== true || typeof indexWriter?.prepareBatch !== 'function' || db[lifecycleBinding]?.enabled) fail('lifecycle-adoption-compatible-runtime-required');
  if (value.entries.some(entry => entry.action === 'blocked')) fail('lifecycle-adoption-plan-blocked');
  return db.runTransaction(async tx => {
    const now = timeAt(clock);
    if (now.seconds < value.plannedAt[0] || now.seconds === value.plannedAt[0] && now.nanoseconds < value.plannedAt[1]) fail('lifecycle-adoption-clock-regressed');
    const current = await inspect(tx, db, value.entries.map(entry => entry.path), now);
    if (!same(current.binding, value.binding)) fail('lifecycle-adoption-control-drift');
    const pending = [];
    for (const before of value.entries) {
      const item = current.selected.get(before.path), after = item.entry;
      if (after.action === 'blocked' || !same(before.source?.createTime, after.source?.createTime) || before.contentHash !== after.contentHash ||
          before.archiveKey !== after.archiveKey || !same(before.parent?.createTime, after.parent?.createTime) ||
          before.parentHash !== after.parentHash || !same(before.times, after.times)) fail('lifecycle-adoption-source-drift');
      if (after.action === 'bound') continue;
      if (!same(before, after)) fail('lifecycle-adoption-source-drift');
      pending.push(item);
    }
    if (!pending.length) return { state: 'already-applied', sources: 0, archives: 0, threads: 0, writes: 0 };
    const roots = pending.filter(item => item.kind.kind === 'shout'), threadItems = pending.filter(item => item.newHeader);
    const captures = pending.filter(item => item.capture);
    const indexPlan = await indexWriter.prepareBatch(tx, roots.map(item => ({ id: item.doc.id, before: item.doc.data(), after: { ...item.doc.data(), ...item.patch } })),
      { additionalWrites: pending.length - roots.length + threadItems.length + captures.length });
    if (typeof indexPlan?.apply !== 'function') fail('lifecycle-adoption-index-plan-required');
    const finalNow = timeAt(clock);
    if (earlier(finalNow, now)) fail('lifecycle-adoption-clock-regressed');
    if (captures.some(item => !earlier(finalNow, new Timestamp(...item.entry.times.retainUntil)))) fail('lifecycle-adoption-source-drift');
    indexPlan.apply();
    for (const item of threadItems) tx.create(db.doc(`contentLifecycleThreads/${item.doc.id}`), { ...item.header,
      captureMode: 'transition', sourceCreateTime: item.doc.createTime, sourceUpdateTime: item.doc.updateTime, migrationDigest: plan.digest });
    for (const item of captures) tx.create(db.doc(`contentLifecycleArchive/${item.entry.archiveKey}`), lifecycleArchiveRecord(item.entry.path, item.doc.data(), item.header,
      { sourceCreateTime: item.doc.createTime, sourceUpdateTime: item.doc.updateTime, migrationDigest: plan.digest }));
    for (const item of pending) tx.update(item.doc.ref, item.patch);
    return { state: 'applied', sources: pending.length, archives: captures.length, threads: threadItems.length,
      writes: pending.length + captures.length + threadItems.length };
  });
}
