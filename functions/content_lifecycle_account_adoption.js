// Inactive internal deadline migration. No body reconstruction/copy, activation,
// account-job mutation, collection inventory, callable or CLI on import.
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { accountPurgeJobRef } from './account_purge_guard.js';
import { accountDeletionJobRef } from './account_deletion_job.js';
import { accountContentArchiveId, validAccountArchiveDeadline, accountArchiveEffectiveDeadline } from './account_content_archive.js';
import { validAccountLifecycleBinding } from './account_archive_lifecycle_binding.js';
import { lifecycleBinding, lifecycleSource, lifecycleControlUsable, validateLifecycleThread, validateLifecycleArchive,
  lifecycleArchiveKey, lifecycleBodyHash, lifecycleSubjectDeadline, lifecycleArchiveMillis } from './content_lifecycle.js';

const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uid = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const stamp = v => v instanceof Timestamp ? [v.seconds, v.nanoseconds] : null;
const identity = d => d?.exists ? { createTime: stamp(d.createTime), updateTime: stamp(d.updateTime) } : null;
const same = (a, b) => canonical(a) === canonical(b);
const equal = (a, b) => a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b);
const before = (a, b) => a instanceof Timestamp && b instanceof Timestamp && (a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
const keys = (v, expected) => v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).sort().join(',') === expected;
const validStamp = v => Array.isArray(v) && v.length === 2 && v.every(Number.isSafeInteger) && v[0] >= 0 && v[0] <= 253402300799 && v[1] >= 0 && v[1] < 1e9;
const validIdentity = v => keys(v, 'createTime,updateTime') && validStamp(v.createTime) && validStamp(v.updateTime);
const fail = code => { throw new Error(code); };
const blocked = code => { throw Object.assign(new Error(code), { adoptionBlocked: true }); };
function idsFor(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || new Set(ids).size !== ids.length || !ids.every(digest)) fail('invalid-lifecycle-account-candidates');
  return [...ids].sort();
}
function timeAt(clock) {
  if (typeof clock !== 'function') fail('invalid-lifecycle-account-clock');
  const date = clock();
  if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) || date.getTime() < 0) fail('invalid-lifecycle-account-clock');
  return Timestamp.fromDate(date);
}
async function inspect(tx, db, ids, now) {
  const control = await tx.get(db.doc('contentLifecycleControl/current'));
  if (!lifecycleControlUsable(control, { allowPaused: true })) fail('lifecycle-account-control-required');
  const docs = new Map(), subjects = new Map(), retentionCache = { threads: new Map(), subjects };
  async function read(paths) {
    const missing = [...new Set(paths)].filter(path => !docs.has(path));
    if (missing.length) for (const d of await tx.getAll(...missing.map(path => db.doc(path)))) docs.set(d.ref.path, d);
  }
  await read(ids.map(id => `accountContentArchive/${id}`));
  const metadata = [];
  for (const id of ids) {
    const d = docs.get(`accountContentArchive/${id}`).data(), source = typeof d?.sourcePath === 'string' ? lifecycleSource(d.sourcePath) : null;
    if (!source || !uid(d.retentionOwnerId) || !(d.requestCreateTime instanceof Timestamp)) continue;
    const account = { projectId: db.projectId, userId: d.retentionOwnerId, requestCreateTime: d.requestCreateTime };
    metadata.push(d.sourcePath, `shouts/${source.shoutId}`, `contentLifecycleThreads/${source.shoutId}`,
      `accountDeletionRequests/${account.userId}`, accountDeletionJobRef(db, account).path, accountPurgeJobRef(db, account).path);
  }
  await read(metadata);
  await read(metadata.filter(path => /^shouts\/[A-Za-z0-9_-]+$/.test(path)).flatMap(path => {
    const key = docs.get(path)?.get('contentArchiveKey'); return digest(key) ? [`contentLifecycleArchive/${key}`] : [];
  }));
  const selected = [];
  for (const id of ids) {
    const copy = docs.get(`accountContentArchive/${id}`), d = copy.data();
    const entry = { id, copy: identity(copy), copyHash: d ? hash(d) : null, request: null, primary: null, purge: null, source: null,
      parent: null, parentArchive: null, thread: null, ordinaryUntil: null, retainUntil: null, accountUntil: null, patchHash: null,
      redact: false, action: 'blocked', reason: null };
    const item = { entry, copy, patch: null }; selected.push(item);
    try {
      const source = typeof d?.sourcePath === 'string' ? lifecycleSource(d.sourcePath) : null;
      if (!d || d.schemaVersion !== 1 || !source || !['comment', 'privateReply'].includes(source.kind) || d.kind !== source.kind ||
          d.sourceShoutId !== source.shoutId || !uid(d.retentionOwnerId) || !(d.requestCreateTime instanceof Timestamp) ||
          !before(d.sourceCreateTime, d.sourceUpdateTime) || !before(d.sourceUpdateTime, copy.createTime) ||
          accountContentArchiveId(db.projectId, d.sourcePath, d.sourceCreateTime) !== copy.id || !validAccountArchiveDeadline(d) ||
          !Array.isArray(d.subjectUserIds) || d.subjectUserIds.length !== (source.kind === 'comment' ? 1 : 2) ||
          new Set(d.subjectUserIds).size !== d.subjectUserIds.length || !d.subjectUserIds.every(uid) ||
          !d.subjectUserIds.includes(d.retentionOwnerId) || typeof d.reactionsComplete !== 'boolean') blocked('invalid-account-copy');
      const account = { projectId: db.projectId, userId: d.retentionOwnerId, requestCreateTime: d.requestCreateTime };
      const requestPath = `accountDeletionRequests/${account.userId}`, primaryPath = accountDeletionJobRef(db, account).path, purgePath = accountPurgeJobRef(db, account).path;
      await read([requestPath, primaryPath, purgePath, d.sourcePath, `shouts/${source.shoutId}`, `contentLifecycleThreads/${source.shoutId}`]);
      const request = docs.get(requestPath), primary = docs.get(primaryPath), purge = docs.get(purgePath), parent = docs.get(`shouts/${source.shoutId}`), thread = docs.get(`contentLifecycleThreads/${source.shoutId}`);
      Object.assign(entry, { request: identity(request), primary: identity(primary), purge: identity(purge), source: identity(docs.get(d.sourcePath)), parent: identity(parent), thread: identity(thread) });
      if (!request.exists || request.get('status') !== 'pending' || request.get('userId') !== account.userId || !equal(request.createTime, d.requestCreateTime)) blocked('account-request-changed');
      const accountEnd = Timestamp.fromMillis(d.requestCreateTime.toMillis() + lifecycleArchiveMillis); entry.accountUntil = stamp(accountEnd);
      if (!before(d.requestCreateTime, request.get('authDeletionConfirmedAt')) || !before(request.get('authDeletionConfirmedAt'), now)) blocked('account-auth-unconfirmed');
      if (now.toMillis() >= accountEnd.toMillis()) blocked('account-retention-ended');
      if (purge.get('ingressClosedAt') != null || primary.get('retentionPurgeStartedAt') != null) blocked('account-purge-in-progress');
      if (docs.get(d.sourcePath).exists) blocked('archive-source-coexist');
      if (primary.exists && (primary.get('userId') !== account.userId || !equal(primary.get('requestCreateTime'), d.requestCreateTime) || !equal(primary.get('retainUntil'), accountEnd))) blocked('account-job-changed');
      if (!d.reactionsComplete && (d.kind !== 'comment' || !primary.exists || primary.get('pendingArchiveId') !== copy.id || primary.get('workStage') !== 'reactions')) blocked('archive-drain-unproven');
      if (!thread.exists) blocked('parent-thread-unavailable');
      let header;
      try { header = validateLifecycleThread(thread.data(), source.shoutId); } catch { blocked('invalid-parent-thread'); }
      retentionCache.threads.set(source.shoutId, thread);
      if (d.ordinaryRetainUntil !== undefined) {
        try { entry.retainUntil = stamp(await accountArchiveEffectiveDeadline(tx, db, d, copy, retentionCache)); } catch { blocked('account-binding-changed'); }
        if (d.lifecycleAccountBinding !== undefined && !validAccountLifecycleBinding(d)) blocked('account-binding-changed');
        entry.ordinaryUntil = stamp(d.ordinaryRetainUntil); entry.action = 'covered'; continue;
      }
      if (d.lifecycleAccountBinding !== undefined || d.contentExpired !== undefined || d.contentArchiveKey !== undefined || d.content?.contentArchiveKey !== undefined) blocked('partial-account-binding');
      if (d.parentMissing !== false || !parent.exists || parent.get('contentPurged') === true || header.sourceDrainedAt != null) blocked('parent-incarnation-unproven');
      const parentBirth = header.sourceCreateTime ?? thread.createTime;
      let parentKey, parentHash;
      try { parentKey = lifecycleArchiveKey(db.projectId, parent.ref.path, parent.data()); parentHash = lifecycleBodyHash(parent.data()); }
      catch { blocked('invalid-parent-evidence'); }
      if (!equal(parent.createTime, parentBirth) || !before(parentBirth, d.sourceCreateTime) || !equal(parent.get('createdAt'), header.sourceCreatedAt) ||
          !equal(parent.get('expiresAt'), header.plannedExpiresAt) || !equal(parent.get('publicUntil'), header.publicUntil) || !equal(parent.get('historyUntil'), header.historyUntil) ||
          parent.get('contentArchiveKey') !== parentKey || parent.get('contentHash') !== parentHash) blocked('parent-incarnation-unproven');
      const parentArchivePath = `contentLifecycleArchive/${parent.get('contentArchiveKey')}`; await read([parentArchivePath]);
      const parentArchive = docs.get(parentArchivePath); entry.parentArchive = identity(parentArchive);
      try { if (!parentArchive.exists) blocked('parent-evidence-unavailable'); validateLifecycleArchive(db, parentArchive.id, parentArchive.data()); }
      catch (error) { if (error.adoptionBlocked) throw error; blocked('invalid-parent-evidence'); }
      if (parentArchive.get('sourcePath') !== parent.ref.path || !equal(parentArchive.get('threadCreatedAt'), header.sourceCreatedAt) ||
          !equal(parentArchive.get('sourceCreateTime') ?? parentArchive.createTime, parent.createTime)) blocked('parent-incarnation-unproven');
      const body = d.content, owners = source.kind === 'comment' ? [body?.authorId] : [body?.authorId, body?.recipientId];
      if (!body || typeof body.text !== 'string' || !owners.every(uid) || !same(owners, d.subjectUserIds) || !owners.includes(account.userId) ||
          source.kind === 'privateReply' && (owners[0] === owners[1] || !same(body.participants, owners)) ||
          !before(header.sourceCreatedAt, body.createdAt) || !before(body.createdAt, header.publicUntil)) blocked('invalid-account-body');
      const result = await lifecycleSubjectDeadline(tx, db, d.subjectUserIds, Timestamp.fromMillis(Math.min(accountEnd.toMillis(), header.retainUntil.toMillis())), subjects);
      // Another subject's completed purge must not be revived by metadata adoption.
      if (result.retainUntil.toMillis() === 0) blocked('account-subject-purged');
      const retainUntil = Timestamp.fromMillis(Math.min(accountEnd.toMillis(), header.retainUntil.toMillis()));
      entry.ordinaryUntil = stamp(header.retainUntil); entry.retainUntil = stamp(result.retainUntil); entry.redact = now.toMillis() >= result.retainUntil.toMillis();
      item.patch = { ordinaryRetainUntil: header.retainUntil, retainUntil, contentExpired: false };
      if (entry.redact) item.patch.content = {};
      let bodyHash; try { bodyHash = lifecycleBodyHash(body); } catch { blocked('invalid-account-body'); }
      item.binding = { schemaVersion: 2, archiveCreateTime: copy.createTime, originalArchiveUpdateTime: copy.updateTime,
        bodyHash, parentArchiveKey: parentArchive.id, parentArchiveCreateTime: parentArchive.createTime,
        parentCreateTime: parent.createTime, parentCreatedAt: header.sourceCreatedAt, threadCreateTime: thread.createTime };
      // Include provenance in the approved plan. An old deadline-only digest
      // must not silently authorize a different marker format.
      entry.patchHash = hash({ ...item.patch, lifecycleAccountBinding: item.binding }); entry.action = 'bind';
    } catch (error) {
      if (!error.adoptionBlocked) throw error;
      entry.action = 'blocked'; entry.reason = error.message; item.patch = null;
    }
  }
  return { control: identity(control), selected, entries: selected.map(item => item.entry) };
}
export async function planLifecycleAccountAdoption(db, ids, { clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db); ids = idsFor(ids);
  return db.runTransaction(async tx => {
    const now = timeAt(clock), current = await inspect(tx, db, ids, now);
    const value = { v: 1, kind: 'content-lifecycle-account-adoption', projectId: db.projectId, plannedAt: stamp(now), control: current.control, entries: current.entries };
    return { ...value, digest: hash(value) };
  }, { readOnly: true });
}
export function validateLifecycleAccountAdoptionPlan(plan, projectId, approvedDigest = plan?.digest) {
  const { digest: saved, ...value } = plan ?? {};
  const validEntry = e => keys(e, 'accountUntil,action,copy,copyHash,id,ordinaryUntil,parent,parentArchive,patchHash,primary,purge,reason,redact,request,retainUntil,source,thread') &&
    ['bind', 'covered', 'blocked'].includes(e.action) && digest(e.id) && typeof e.redact === 'boolean' &&
    [e.copy, e.parent, e.parentArchive, e.primary, e.purge, e.request, e.source, e.thread].every(v => v === null || validIdentity(v)) &&
    [e.copyHash, e.patchHash].every(v => v === null || digest(v)) && [e.ordinaryUntil, e.retainUntil, e.accountUntil].every(v => v === null || validStamp(v)) &&
    (e.action === 'blocked' ? typeof e.reason === 'string' && /^[a-z-]{1,64}$/.test(e.reason) : e.reason === null && validIdentity(e.copy) && validIdentity(e.request) && validIdentity(e.thread) &&
      digest(e.copyHash) && [e.ordinaryUntil, e.retainUntil, e.accountUntil].every(validStamp) &&
      (e.action === 'covered' || digest(e.patchHash) && validIdentity(e.parent) && validIdentity(e.parentArchive)));
  if (!digest(saved) || saved !== approvedDigest || hash(value) !== saved || !keys(value, 'control,entries,kind,plannedAt,projectId,v') ||
      value.v !== 1 || value.kind !== 'content-lifecycle-account-adoption' || value.projectId !== projectId || !validStamp(value.plannedAt) ||
      !validIdentity(value.control) || !Array.isArray(value.entries) || !value.entries.every(validEntry) || !same(value.entries.map(e => e.id), idsFor(value.entries.map(e => e.id)))) fail('invalid-lifecycle-account-plan');
  return value;
}
export async function applyLifecycleAccountAdoption(db, plan, { approvedDigest, compatibleWriters = false, clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db);
  if (typeof approvedDigest !== 'string') fail('lifecycle-account-approved-digest-required');
  const value = validateLifecycleAccountAdoptionPlan(plan, db.projectId, approvedDigest);
  if (compatibleWriters !== true || db[lifecycleBinding]?.enabled) fail('lifecycle-account-compatible-runtime-required');
  if (value.entries.some(e => e.action === 'blocked')) fail('lifecycle-account-plan-blocked');
  return db.runTransaction(async tx => {
    const now = timeAt(clock); if (now.toMillis() < new Timestamp(...value.plannedAt).toMillis()) fail('lifecycle-account-clock-regressed');
    const current = await inspect(tx, db, value.entries.map(e => e.id), now);
    if (!same(current.control, value.control)) fail('lifecycle-account-control-drift');
    const pending = [];
    for (let n = 0; n < value.entries.length; n++) {
      const before = value.entries[n], item = current.selected[n], after = item.entry;
      if (before.action === 'bind' && after.action === 'covered' && item.copy.get('lifecycleAccountBinding.migrationDigest') === plan.digest &&
          same(before.copy.createTime, after.copy.createTime) && same(before.request, after.request) && same(before.primary, after.primary) && same(before.purge, after.purge) &&
          same(before.ordinaryUntil, after.ordinaryUntil) && same(before.retainUntil, after.retainUntil) && same(before.accountUntil, after.accountUntil)) continue;
      if (!same(before, after)) fail('lifecycle-account-source-drift');
      if (after.action === 'bind') pending.push(item);
    }
    const finalNow = timeAt(clock); if (finalNow.toMillis() < now.toMillis()) fail('lifecycle-account-clock-regressed');
    if (pending.some(item => finalNow.toMillis() >= new Timestamp(...item.entry.accountUntil).toMillis() ||
        !item.entry.redact && finalNow.toMillis() >= new Timestamp(...item.entry.retainUntil).toMillis())) fail('lifecycle-account-source-drift');
    for (const item of pending) tx.update(item.copy.ref, { ...item.patch, lifecycleAccountBinding: { ...item.binding, migrationDigest: plan.digest } });
    return { state: pending.length ? 'applied' : 'already-applied', copies: pending.length, writes: pending.length, bodiesCopied: 0,
      bodiesRedacted: pending.filter(item => item.entry.redact).length };
  });
}
