// Metadata views obey the same logical deadline as archived body access;
// physical GC lag never extends report-reason visibility.
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { validateLifecycleThread, lifecycleSubjectDeadline } from './content_lifecycle.js';
import { readLifecycleReportEvidence } from './content_lifecycle_evidence.js';
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const same = (a, b) => a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b);
const fields = ['schemaVersion', 'sourcePath', 'threadId', 'threadCreatedAt', 'subjectUserIds'];
const corrupt = () => { throw new HttpsError('failed-precondition', 'Invalid moderation retention binding.'); };

export async function readableModerationQueueReports(tx, db, reports, kinds, date) {
  const now = Timestamp.fromDate(date), available = [], subjects = new Map();
  const archiveRefs = new Map(), threadRefs = new Map();
  for (const report of reports) if (digest(report.get('contentArchiveKey'))) {
    archiveRefs.set(report.get('contentArchiveKey'), db.doc(`contentLifecycleArchive/${report.get('contentArchiveKey')}`));
    threadRefs.set(report.get('shoutId'), db.doc(`contentLifecycleThreads/${report.get('shoutId')}`));
  }
  const archiveKeys = [...archiveRefs.keys()], threadKeys = [...threadRefs.keys()];
  const archives = archiveKeys.length ? await tx.getAll(...archiveRefs.values(), { fieldMask: fields }) : [];
  const threads = threadKeys.length ? await tx.getAll(...threadRefs.values()) : [];
  const a = new Map(archives.map((d, n) => [archiveKeys[n], d])), t = new Map(threads.map((d, n) => [threadKeys[n], d]));
  // Prime distinct subject checks in one SDK read, then apply each record's
  // own deadline below. A page must not issue50 sequential identity RPCs.
  const uids = [...new Set(reports.flatMap(r => {
    const row = a.get(r.get('contentArchiveKey'))?.data();
    return [...(Array.isArray(row?.subjectUserIds) ? row.subjectUserIds : []), r.get('reporterId')].filter(id);
  }))];
  if (uids.length) await lifecycleSubjectDeadline(tx, db, uids, now, subjects);
  const fallbackCache = { documents: new Map(), subjects };
  for (let n = 0; n < reports.length; n++) {
    const report = reports[n], r = report.data(), key = r?.contentArchiveKey;
    if (digest(key)) {
      const archive = a.get(key), thread = t.get(r.shoutId);
      if (!archive?.exists || !thread?.exists) { available.push(false); continue; }
      const header = validateLifecycleThread(thread.data(), r.shoutId), row = archive.data();
      const path = `shouts/${r.shoutId}${kinds[n] === 'shout' ? '' : `/${kinds[n] === 'comment' ? 'comments' : 'privateReplies'}/${kinds[n] === 'comment' ? r.commentId : r.privateReplyId}`}`;
      if (row.schemaVersion !== 1 || row.sourcePath !== path || row.threadId !== r.shoutId ||
          !same(row.threadCreatedAt, header.sourceCreatedAt) || !Array.isArray(row.subjectUserIds) ||
          ![1, 2].includes(row.subjectUserIds.length) || !row.subjectUserIds.every(id) || !row.subjectUserIds.includes(r.authorId) || !id(r.reporterId)) corrupt();
      const deadline = await lifecycleSubjectDeadline(tx, db, [...new Set([...row.subjectUserIds, r.reporterId])], header.retainUntil, subjects);
      available.push(now.toMillis() < deadline.retainUntil.toMillis());
    } else if (digest(r?.accountArchiveId)) {
      // The unusual legacy account-copy contract has its own incarnation and
      // ordinary/subject deadline proof. Reuse it, never invent that identity.
      try {
        const full = await tx.get(report.ref);
        const e = await readLifecycleReportEvidence(tx, db, full, kinds[n], now, fallbackCache);
        const deadline = await lifecycleSubjectDeadline(tx, db, [r.reporterId], e.retainUntil, subjects);
        available.push(now.toMillis() < deadline.retainUntil.toMillis());
      } catch (error) { if (error.code !== 'not-found') throw error; available.push(false); }
    } else {
      // Old fixtures exercise compatibility only in a local emulator. A live
      // activation must first bind all pending reports to retained evidence.
      if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') corrupt();
      available.push(true);
    }
  }
  return available;
}
