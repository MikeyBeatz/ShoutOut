// Internal, report-specific compatibility reader. No archive listing API,
// body copy, migration, activation or report mutation on import.
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { accountContentArchiveId, accountArchiveEffectiveDeadline } from './account_content_archive.js';
import { accountReportBodyProven } from './account_archive_lifecycle_binding.js';
import { lifecycleBodyHash, lifecycleGeography, lifecycleSubjectDeadline, validateLifecycleArchive, validateLifecycleThread } from './content_lifecycle.js';
import { reportArchiveVersionProven, lifecycleTimeAtOrBefore } from './content_lifecycle_report_provenance.js';

const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const equal = (a, b) => a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b);
const fail = () => { throw new HttpsError('failed-precondition', 'The original account archive evidence is unproven.'); };
const absent = () => { throw new HttpsError('not-found', 'The reported archive is unavailable.'); };
export async function readLifecycleAccountReportEvidence(tx, db, report, kind, now, cache) {
  const r = report.data(), childId = kind === 'comment' ? r?.commentId : r?.privateReplyId;
  if (!['comment', 'privateReply'].includes(kind) || report.ref.parent.id !== (kind === 'comment' ? 'commentReports' : 'privateReplyReports') ||
      !id(r?.reporterId) || !id(r.shoutId) || !id(childId) || report.id !== `${r.reporterId}_${r.shoutId}_${childId}` ||
      !['open', 'escalated', 'resolved'].includes(r.status) || typeof r.reason !== 'string' || !r.reason || !(r.createdAt instanceof Timestamp) ||
      ['contentArchiveKey', 'shoutArchiveKey', 'legacyEvidenceBinding', 'moderationGeography', 'parentContextPurged'].some(k => r[k] !== undefined)) fail();
  const sourcePath = `shouts/${r.shoutId}/${kind === 'comment' ? 'comments' : 'privateReplies'}/${childId}`;
  // The same bounded lookup as the existing public-comment archive API. SDK
  // birth selects the original incarnation, never an application date.
  const queryKey = `account-evidence:${sourcePath}:${report.createTime.seconds}:${report.createTime.nanoseconds}`;
  if (!cache.documents.has(queryKey)) cache.documents.set(queryKey, await tx.get(db.collection('accountContentArchive')
    .where('sourcePath', '==', sourcePath).where('sourceCreateTime', '<=', report.createTime).orderBy('sourceCreateTime', 'desc').limit(2)));
  const rows = cache.documents.get(queryKey).docs, archive = rows[0], d = archive?.data();
  if (!archive) return fail(); // Preserve the existing unbound-report contract.
  if (rows[1] && equal(rows[1].get('sourceCreateTime'), d.sourceCreateTime) || !accountReportBodyProven(archive, report)) fail();
  const b = d.lifecycleAccountBinding, body = d.content, owners = kind === 'comment' ? [body?.authorId] : [body?.authorId, body?.recipientId];
  if (d.schemaVersion !== 1 || d.kind !== kind || d.sourceShoutId !== r.shoutId || d.sourcePath !== sourcePath ||
      accountContentArchiveId(db.projectId, sourcePath, d.sourceCreateTime) !== archive.id || !id(d.retentionOwnerId) ||
      !owners.every(id) || !owners.includes(d.retentionOwnerId) || JSON.stringify(owners) !== JSON.stringify(d.subjectUserIds) ||
      body.authorId === r.reporterId || r.authorId !== undefined && r.authorId !== body.authorId || typeof body.text !== 'string' ||
      !(body.createdAt instanceof Timestamp) || kind === 'privateReply' && (body.recipientId !== r.reporterId || body.authorId === body.recipientId ||
        r.text !== body.text || JSON.stringify(body.participants) !== JSON.stringify(owners))) fail();
  const paths = [sourcePath, `contentLifecycleThreads/${r.shoutId}`, `contentLifecycleArchive/${b.parentArchiveKey}`];
  const missing = paths.filter(path => !cache.documents.has(path));
  if (missing.length) for (const doc of await tx.getAll(...missing.map(path => db.doc(path)))) cache.documents.set(doc.ref.path, doc);
  const [source, thread, parent] = paths.map(path => cache.documents.get(path));
  if (source.exists) fail(); // Re-created or still-live sources need their own binding.
  if (!thread.exists || !parent.exists) return absent();
  const header = validateLifecycleThread(thread.data(), r.shoutId);
  validateLifecycleArchive(db, parent.id, parent.data());
  if (!equal(parent.createTime, b.parentArchiveCreateTime) || parent.get('kind') !== 'shout' || parent.get('sourcePath') !== `shouts/${r.shoutId}` ||
      !equal(parent.get('threadCreatedAt'), header.sourceCreatedAt) || !equal(parent.get('sourceCreateTime'), b.parentCreateTime) ||
      !reportArchiveVersionProven(parent, report, true) || !lifecycleTimeAtOrBefore(b.parentCreateTime, d.sourceCreateTime) ||
      !lifecycleTimeAtOrBefore(header.sourceCreatedAt, body.createdAt) || !lifecycleTimeAtOrBefore(body.createdAt, header.publicUntil)) fail();
  const accountCache = { threads: new Map([[r.shoutId, thread]]), subjects: cache.subjects };
  const accountEnd = await accountArchiveEffectiveDeadline(tx, db, d, archive, accountCache);
  const deadline = await lifecycleSubjectDeadline(tx, db, [...new Set([...owners, r.reporterId])], accountEnd, cache.subjects);
  if (now.toMillis() >= deadline.retainUntil.toMillis()) return absent();
  // Parent content has its own subject deadline; its expiry never exposes an
  // unrelated conversation. Geographic authority comes from this proven copy.
  const parentEnd = await lifecycleSubjectDeadline(tx, db, parent.get('subjectUserIds'), header.retainUntil, cache.subjects);
  if (now.toMillis() >= parentEnd.retainUntil.toMillis()) return absent();
  return Object.freeze({ kind, sourcePath, archiveRef: archive.ref, archiveKey: archive.id, archiveStorage: 'account',
    content: body, contentHash: lifecycleBodyHash(body), finalState: 'deleted', geography: lifecycleGeography(parent.get('content')),
    retainUntil: Timestamp.fromMillis(Math.min(deadline.retainUntil.toMillis(), parentEnd.retainUntil.toMillis())),
    privacyRedacted: false, captureMode: 'account-archive', parentContent: parent.get('content'), parentKey: parent.id,
    archivedAt: archive.createTime, sourceCreatedAt: body.createdAt });
}
