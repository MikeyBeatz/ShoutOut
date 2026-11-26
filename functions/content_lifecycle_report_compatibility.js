// Inactive metadata-only bridge for capture-stage reports and old account
// copies. No host, implicit mutation, body reconstruction or client activation.
import { createHash } from 'node:crypto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { lifecycleBinding, lifecycleControlUsable } from './content_lifecycle.js';
import { readLifecycleReportEvidence } from './content_lifecycle_evidence.js';

const kinds = { reports: 'shout', commentReports: 'comment', privateReplyReports: 'privateReply' };
const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const stamp = v => v instanceof Timestamp ? [v.seconds, v.nanoseconds] : null;
const identity = s => s?.exists ? { createTime: stamp(s.createTime), updateTime: stamp(s.updateTime) } : null;
const same = (a, b) => canonical(a) === canonical(b);
const keys = (v, s) => v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).sort().join(',') === s;
const validStamp = s => Array.isArray(s) && s.length === 2 && s.every(Number.isSafeInteger) && s[0] >= 0 && s[0] <= 253402300799 && s[1] >= 0 && s[1] < 1e9;
const validIdentity = s => keys(s, 'createTime,updateTime') && validStamp(s.createTime) && validStamp(s.updateTime);
const fail = code => { throw new Error(code); };
function kind(path) {
  const p = typeof path === 'string' ? path.split('/') : [];
  return p.length === 2 && Object.hasOwn(kinds, p[0]) && /^[A-Za-z0-9_-]{1,386}$/.test(p[1]) ? kinds[p[0]] : null;
}
function pathsFor(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 50 || new Set(paths).size !== paths.length || !paths.every(kind)) fail('invalid-lifecycle-compatibility-paths');
  return [...paths].sort();
}
function timeAt(clock) {
  const value = typeof clock === 'function' ? clock() : null;
  if (!(value instanceof Date) || !Number.isSafeInteger(value.getTime()) || value.getTime() < 0) fail('invalid-lifecycle-compatibility-clock');
  return Timestamp.fromDate(value);
}
function validCompatibilityBinding(report) {
  const b = report.get('reportCompatibilityBinding');
  return b && keys(b, 'migrationDigest,reportCreateTime,schemaVersion') && b.schemaVersion === 1 && digest(b.migrationDigest) &&
    b.reportCreateTime instanceof Timestamp && b.reportCreateTime.isEqual(report.createTime);
}
async function inspect(tx, db, paths, now, preserveLegacyText = false) {
  const control = await tx.get(db.doc('contentLifecycleControl/current'));
  if (!lifecycleControlUsable(control, { allowPaused: true })) fail('lifecycle-compatibility-control-required');
  const reports = await tx.getAll(...paths.map(path => db.doc(path))), selected = [], cache = { documents: new Map(), subjects: new Map() };
  for (const report of reports) {
    const entry = { path: report.ref.path, report: identity(report), reportHash: report.exists ? hash(report.data()) : null,
      archivePath: null, archive: null, parent: null, thread: null, retainUntil: null, patchHash: null, action: 'blocked', reason: null };
    const item = { entry, report, patch: null }; selected.push(item);
    try {
      if (!report.exists || report.get('reportCompatibilityBinding') !== undefined && !validCompatibilityBinding(report)) fail('invalid-report-compatibility-binding');
      const evidence = await readLifecycleReportEvidence(tx, db, report, kind(report.ref.path), now, cache);
      const archive = await tx.get(evidence.archiveRef), parent = evidence.parentKey ? await tx.get(db.doc(`contentLifecycleArchive/${evidence.parentKey}`)) : null;
      const thread = cache.documents.get(`contentLifecycleThreads/${report.get('shoutId')}`);
      Object.assign(entry, { archivePath: archive.ref.path, archive: identity(archive), parent: identity(parent),
        thread: identity(thread), retainUntil: stamp(evidence.retainUntil) });
      const r = report.data();
      if (r.text !== undefined && (typeof r.text !== 'string' || r.text !== evidence.content.text)) fail('report-snapshot-version-unproven');
      if (evidence.archiveStorage === 'account' && r.accountArchiveId === undefined) {
        item.patch = { accountArchiveId: archive.id, authorId: evidence.content.authorId, shoutArchiveKey: evidence.parentKey,
          moderationGeography: evidence.geography, parentContextPurged: false };
        item.accountProof = { schemaVersion: 1, reportCreateTime: report.createTime, archiveCreateTime: archive.createTime };
        entry.action = 'bind-account';
      } else entry.action = r.text === undefined || preserveLegacyText ? 'covered' : 'scrub';
      entry.patchHash = hash({ patch: item.patch, accountProof: item.accountProof ?? null });
    } catch (error) {
      entry.action = 'blocked'; entry.reason = /^[a-z-]{1,64}$/.test(error.message ?? '') ? error.message : 'report-evidence-unavailable'; item.patch = null;
    }
  }
  return { control: identity(control), selected, entries: selected.map(s => s.entry) };
}
export async function planLifecycleReportCompatibility(db, paths, { clock = () => new Date(), preserveLegacyText = false } = {}) {
  assertFeedRuntimeTarget(db); paths = pathsFor(paths);
  if (typeof preserveLegacyText !== 'boolean') fail('invalid-lifecycle-compatibility-text-policy');
  return db.runTransaction(async tx => {
    const now = timeAt(clock), current = await inspect(tx, db, paths, now, preserveLegacyText);
    const value = { v: 2, kind: 'content-lifecycle-report-compatibility', projectId: db.projectId, preserveLegacyText, plannedAt: stamp(now), control: current.control, entries: current.entries };
    return { ...value, digest: hash(value) };
  }, { readOnly: true });
}
export function validateLifecycleReportCompatibilityPlan(plan, projectId, approvedDigest = plan?.digest) {
  const { digest: saved, ...value } = plan ?? {};
  const validEntry = e => keys(e, 'action,archive,archivePath,parent,patchHash,path,reason,report,reportHash,retainUntil,thread') &&
    ['covered', 'scrub', 'bind-account', 'blocked'].includes(e.action) && kind(e.path) &&
    [e.report, e.archive, e.parent, e.thread].every(v => v === null || validIdentity(v)) &&
    [e.patchHash, e.reportHash].every(v => v === null || digest(v)) && (e.retainUntil === null || validStamp(e.retainUntil)) &&
    (e.archivePath === null || /^(contentLifecycleArchive|accountContentArchive)\/[a-f0-9]{64}$/.test(e.archivePath)) &&
    (e.action === 'blocked' ? typeof e.reason === 'string' && /^[a-z-]{1,64}$/.test(e.reason) : e.reason === null &&
      [e.report, e.archive, e.thread].every(validIdentity) && digest(e.patchHash) && digest(e.reportHash) && validStamp(e.retainUntil));
  if (!digest(saved) || saved !== approvedDigest || hash(value) !== saved ||
      !(value.v === 1 && keys(value, 'control,entries,kind,plannedAt,projectId,v') || value.v === 2 &&
        keys(value, 'control,entries,kind,plannedAt,preserveLegacyText,projectId,v') && typeof value.preserveLegacyText === 'boolean') ||
      value.kind !== 'content-lifecycle-report-compatibility' || value.projectId !== projectId || !validStamp(value.plannedAt) ||
      !validIdentity(value.control) || !Array.isArray(value.entries) || !value.entries.every(validEntry) || !same(value.entries.map(e => e.path), pathsFor(value.entries.map(e => e.path)))) fail('invalid-lifecycle-compatibility-plan');
  return value;
}
export async function applyLifecycleReportCompatibility(db, plan, { approvedDigest, compatibleReaders = false, compatibleWriters = false, clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db);
  if (typeof approvedDigest !== 'string') fail('lifecycle-compatibility-approved-digest-required');
  const value = validateLifecycleReportCompatibilityPlan(plan, db.projectId, approvedDigest);
  if (compatibleWriters !== true || !value.preserveLegacyText && compatibleReaders !== true || db[lifecycleBinding]?.enabled) fail('lifecycle-compatible-readers-and-writers-required');
  if (value.entries.some(e => e.action === 'blocked')) fail('lifecycle-compatibility-plan-blocked');
  return db.runTransaction(async tx => {
    const now = timeAt(clock); if (now.toMillis() < new Timestamp(...value.plannedAt).toMillis()) fail('lifecycle-compatibility-clock-regressed');
    const current = await inspect(tx, db, value.entries.map(e => e.path), now, value.preserveLegacyText === true);
    if (!same(current.control, value.control)) fail('lifecycle-compatibility-control-drift');
    const pending = [];
    for (let n = 0; n < value.entries.length; n++) {
      const before = value.entries[n], item = current.selected[n], marker = [item.report.get('accountEvidenceBinding'), item.report.get('reportCompatibilityBinding')].find(b => b?.migrationDigest === plan.digest);
      // A genuinely lost reply may arrive after normal moderation or retention
      // changed the target. An exact already-committed marker is a no-op only.
      if (before.action !== 'covered' && marker?.migrationDigest === plan.digest &&
          marker.reportCreateTime?.isEqual(item.report.createTime) && same(before.report.createTime, stamp(item.report.createTime))) continue;
      if (!same(before, item.entry)) fail('lifecycle-compatibility-source-drift');
      if (['bind-account', 'scrub'].includes(before.action)) pending.push(item);
    }
    const final = timeAt(clock);
    if (final.toMillis() < now.toMillis() || pending.some(i => final.toMillis() >= new Timestamp(...i.entry.retainUntil).toMillis())) fail('lifecycle-compatibility-source-drift');
    for (const item of pending) tx.update(item.report.ref, { ...item.patch, ...(value.preserveLegacyText ? {} : { text: FieldValue.delete() }),
      ...(item.accountProof ? { accountEvidenceBinding: { ...item.accountProof, migrationDigest: plan.digest } } :
        { reportCompatibilityBinding: { schemaVersion: 1, reportCreateTime: item.report.createTime, migrationDigest: plan.digest } }) });
    return { state: pending.length ? 'applied' : 'already-applied', reports: pending.length, writes: pending.length, bodyCopies: 0 };
  });
}
