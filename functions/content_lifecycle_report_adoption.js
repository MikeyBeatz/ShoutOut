// Bounded, inactive internal report-binding migration. No body copy, CLI,
// collection scan, callable, activation, or implicit mutation on import.
import { createHash } from 'node:crypto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { lifecycleBinding, lifecycleGeography, lifecycleControlUsable, lifecycleSubjectDeadline,
  validateLifecycleThread, validateLifecycleArchive } from './content_lifecycle.js';
import { validLegacyReportBinding, reportArchivePairProven } from './content_lifecycle_report_provenance.js';

const collections = { reports: 'shout', commentReports: 'comment', privateReplyReports: 'privateReply' };
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const stamp = v => v instanceof Timestamp ? [v.seconds, v.nanoseconds] : null;
const identity = doc => doc.exists ? { createTime: stamp(doc.createTime), updateTime: stamp(doc.updateTime) } : null;
const same = (a, b) => canonical(a) === canonical(b);
const keys = (v, expected) => v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).sort().join(',') === expected;
const validStamp = v => Array.isArray(v) && v.length === 2 && v.every(Number.isSafeInteger) && v[0] >= 0 && v[0] <= 253402300799 && v[1] >= 0 && v[1] < 1e9;
const validIdentity = v => keys(v, 'createTime,updateTime') && validStamp(v.createTime) && validStamp(v.updateTime);
const fail = code => { throw new Error(code); };
const blocked = code => { throw Object.assign(new Error(code), { adoptionBlocked: true }); };
const boundFields = ['contentArchiveKey', 'shoutArchiveKey', 'moderationGeography', 'parentContextPurged', 'legacyEvidenceBinding', 'accountArchiveId', 'accountEvidenceBinding'];
function reportKind(path) {
  const p = typeof path === 'string' ? path.split('/') : [];
  return p.length === 2 && Object.hasOwn(collections, p[0]) && /^[A-Za-z0-9_-]{1,386}$/.test(p[1]) ? collections[p[0]] : null;
}
function candidatesFor(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 50 ||
      new Set(candidates.map(v => v?.reportPath)).size !== candidates.length || candidates.some(v =>
        !keys(v, 'contentArchiveKey,reportPath,shoutArchiveKey') || !reportKind(v.reportPath) || !digest(v.contentArchiveKey) || !digest(v.shoutArchiveKey))) {
    fail('invalid-lifecycle-report-candidates');
  }
  return [...candidates].sort((a, b) => a.reportPath < b.reportPath ? -1 : a.reportPath > b.reportPath ? 1 : 0);
}
function timeAt(clock) {
  if (typeof clock !== 'function') fail('invalid-lifecycle-report-clock');
  const date = clock();
  if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) || date.getTime() < 0) fail('invalid-lifecycle-report-clock');
  return Timestamp.fromDate(date);
}
async function inspect(tx, db, candidates, now, preserveLegacyText = false) {
  const control = await tx.get(db.doc('contentLifecycleControl/current'));
  if (!lifecycleControlUsable(control, { allowPaused: true })) fail('lifecycle-report-control-required');
  const docs = new Map(), subjects = new Map();
  async function read(paths) {
    const missing = [...new Set(paths)].filter(p => !docs.has(p));
    if (missing.length) for (const doc of await tx.getAll(...missing.map(p => db.doc(p)))) docs.set(doc.ref.path, doc);
  }
  await read(candidates.flatMap(c => [c.reportPath, `contentLifecycleArchive/${c.contentArchiveKey}`, `contentLifecycleArchive/${c.shoutArchiveKey}`]));
  await read(candidates.map(c => docs.get(c.reportPath)?.get('shoutId')).filter(id).map(shoutId => `contentLifecycleThreads/${shoutId}`));
  const selected = [];
  for (const candidate of candidates) {
    const report = docs.get(candidate.reportPath), archive = docs.get(`contentLifecycleArchive/${candidate.contentArchiveKey}`),
      parent = docs.get(`contentLifecycleArchive/${candidate.shoutArchiveKey}`), kind = reportKind(candidate.reportPath);
    const entry = { ...candidate, report: identity(report), archive: identity(archive), parent: identity(parent), thread: null,
      reportHash: report.exists ? hash(report.data()) : null, patchHash: null, retainUntil: null, action: 'blocked', reason: null };
    const item = { entry, report, patch: null }; selected.push(item);
    try {
      if (!report.exists) blocked('report-unavailable');
      const r = report.data(), childId = kind === 'comment' ? r.commentId : r.privateReplyId;
      if (!id(r.reporterId) || !id(r.shoutId) || kind !== 'shout' && !id(childId) ||
          report.id !== `${r.reporterId}_${r.shoutId}${kind === 'shout' ? '' : `_${childId}`}` ||
          !['open', 'escalated', 'resolved'].includes(r.status) || typeof r.reason !== 'string' || !r.reason || !(r.createdAt instanceof Timestamp)) blocked('invalid-report');
      const thread = docs.get(`contentLifecycleThreads/${r.shoutId}`); entry.thread = identity(thread);
      if (!archive.exists || !parent.exists || !thread?.exists) blocked('evidence-unavailable');
      let header;
      try { validateLifecycleArchive(db, archive.id, archive.data()); validateLifecycleArchive(db, parent.id, parent.data());
        header = validateLifecycleThread(thread.data(), r.shoutId); } catch { blocked('invalid-evidence'); }
      const sourcePath = `shouts/${r.shoutId}${kind === 'shout' ? '' : `/${kind === 'comment' ? 'comments' : 'privateReplies'}/${childId}`}`;
      if (archive.get('sourcePath') !== sourcePath || archive.get('kind') !== kind || parent.get('kind') !== 'shout' ||
          parent.get('sourcePath') !== `shouts/${r.shoutId}` || !archive.get('threadCreatedAt').isEqual(header.sourceCreatedAt) ||
          !parent.get('threadCreatedAt').isEqual(header.sourceCreatedAt) ||
          header.sourceCreateTime && !header.sourceCreateTime.isEqual(parent.get('sourceCreateTime') ?? parent.createTime) ||
          kind === 'shout' && archive.id !== parent.id) blocked('evidence-identity-changed');
      if (!reportArchivePairProven(archive, parent, report)) blocked('report-version-unproven');
      const body = archive.get('content');
      if (body.authorId === r.reporterId || r.authorId !== undefined && r.authorId !== body.authorId ||
          kind === 'privateReply' && (body.recipientId !== r.reporterId || !r.legacyEvidenceBinding && r.text !== body.text)) blocked('report-target-changed');
      const deadline = await lifecycleSubjectDeadline(tx, db, [...new Set([...archive.get('subjectUserIds'), ...parent.get('subjectUserIds'), r.reporterId])], header.retainUntil, subjects);
      entry.retainUntil = stamp(deadline.retainUntil);
      if (deadline.deleting || deadline.retainUntil.toMillis() <= now.toMillis()) blocked('evidence-retention-unavailable');
      const patch = { contentArchiveKey: archive.id, shoutArchiveKey: parent.id, moderationGeography: lifecycleGeography(parent.get('content')),
        parentContextPurged: false, authorId: body.authorId };
      item.patch = patch; entry.patchHash = hash(patch);
      if (boundFields.some(k => r[k] !== undefined)) {
        if (!validLegacyReportBinding(report) || Object.entries(patch).some(([k, v]) => !same(r[k], v)) ||
            r.text !== undefined && (!preserveLegacyText || kind !== 'privateReply' || r.text !== body.text)) blocked('partial-report-binding');
        entry.action = 'bound';
      } else {
        if (archive.get('redactedFromHash') !== undefined || parent.get('redactedFromHash') !== undefined) blocked('report-version-unproven');
        entry.action = 'bind';
      }
    } catch (error) {
      if (!error.adoptionBlocked) throw error;
      entry.action = 'blocked'; entry.reason = error.message; item.patch = null;
    }
  }
  return { control: identity(control), selected, entries: selected.map(v => v.entry) };
}
export async function planLifecycleReportAdoption(db, candidates, { clock = () => new Date(), preserveLegacyText = false } = {}) {
  assertFeedRuntimeTarget(db); candidates = candidatesFor(candidates);
  if (typeof preserveLegacyText !== 'boolean') fail('invalid-lifecycle-report-text-policy');
  return db.runTransaction(async tx => {
    const now = timeAt(clock), current = await inspect(tx, db, candidates, now, preserveLegacyText);
    const value = { v: 2, kind: 'content-lifecycle-report-adoption', projectId: db.projectId, preserveLegacyText, plannedAt: stamp(now), control: current.control, entries: current.entries };
    return { ...value, digest: hash(value) };
  }, { readOnly: true });
}
export function validateLifecycleReportAdoptionPlan(plan, projectId, approvedDigest = plan?.digest) {
  const { digest: saved, ...value } = plan ?? {};
  const validEntry = e => keys(e, 'action,archive,contentArchiveKey,parent,patchHash,reason,report,reportHash,reportPath,retainUntil,shoutArchiveKey,thread') &&
    ['bind', 'bound', 'blocked'].includes(e.action) && [e.report, e.archive, e.parent, e.thread].every(v => v === null || validIdentity(v)) &&
    [e.reportHash, e.patchHash].every(v => v === null || digest(v)) && (e.retainUntil === null || validStamp(e.retainUntil)) &&
    (e.action === 'blocked' ? typeof e.reason === 'string' && /^[a-z-]{1,64}$/.test(e.reason) : e.reason === null &&
      [e.report, e.archive, e.parent, e.thread].every(validIdentity) && digest(e.reportHash) && digest(e.patchHash) && validStamp(e.retainUntil));
  if (!digest(saved) || saved !== approvedDigest || hash(value) !== saved ||
      !(value.v === 1 && keys(value, 'control,entries,kind,plannedAt,projectId,v') ||
        value.v === 2 && keys(value, 'control,entries,kind,plannedAt,preserveLegacyText,projectId,v') && typeof value.preserveLegacyText === 'boolean') || value.kind !== 'content-lifecycle-report-adoption' ||
      value.projectId !== projectId || !validStamp(value.plannedAt) || !validIdentity(value.control) ||
      !Array.isArray(value.entries) || !value.entries.every(validEntry)) fail('invalid-lifecycle-report-plan');
  const candidates = value.entries.map(e => ({ reportPath: e.reportPath, contentArchiveKey: e.contentArchiveKey, shoutArchiveKey: e.shoutArchiveKey }));
  if (!same(candidates, candidatesFor(candidates))) fail('invalid-lifecycle-report-plan');
  return value;
}
export async function applyLifecycleReportAdoption(db, plan, { approvedDigest, compatibleWriters = false, clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db);
  if (typeof approvedDigest !== 'string') fail('lifecycle-report-approved-digest-required');
  const value = validateLifecycleReportAdoptionPlan(plan, db.projectId, approvedDigest);
  if (compatibleWriters !== true || db[lifecycleBinding]?.enabled) fail('lifecycle-report-compatible-runtime-required');
  if (value.entries.some(e => e.action === 'blocked')) fail('lifecycle-report-plan-blocked');
  return db.runTransaction(async tx => {
    const now = timeAt(clock);
    if (now.toMillis() < new Timestamp(...value.plannedAt).toMillis()) fail('lifecycle-report-clock-regressed');
    const current = await inspect(tx, db, value.entries.map(e => ({ reportPath: e.reportPath, contentArchiveKey: e.contentArchiveKey, shoutArchiveKey: e.shoutArchiveKey })), now, value.preserveLegacyText === true);
    if (!same(current.control, value.control)) fail('lifecycle-report-control-drift');
    const pending = [];
    for (let n = 0; n < value.entries.length; n++) {
      const before = value.entries[n], item = current.selected[n], after = item.entry;
      if (before.action === 'bind' && after.action === 'bound' && item.report.get('legacyEvidenceBinding.migrationDigest') === plan.digest &&
          same(before.report.createTime, after.report.createTime) && same(before.archive, after.archive) && same(before.parent, after.parent) &&
          same(before.thread, after.thread) && before.patchHash === after.patchHash && same(before.retainUntil, after.retainUntil)) continue;
      if (!same(before, after)) fail('lifecycle-report-source-drift');
      if (after.action === 'bind') pending.push(item);
    }
    const finalNow = timeAt(clock);
    if (finalNow.toMillis() < now.toMillis()) fail('lifecycle-report-clock-regressed');
    if (current.entries.some(e => finalNow.toMillis() >= new Timestamp(...e.retainUntil).toMillis())) fail('lifecycle-report-source-drift');
    for (const item of pending) tx.update(item.report.ref, { ...item.patch, ...(value.preserveLegacyText ? {} : { text: FieldValue.delete() }), legacyEvidenceBinding: {
      schemaVersion: 1, migrationDigest: plan.digest, reportCreateTime: item.report.createTime } });
    return { state: pending.length ? 'applied' : 'already-applied', reports: pending.length, writes: pending.length, bodyCopies: 0 };
  });
}
