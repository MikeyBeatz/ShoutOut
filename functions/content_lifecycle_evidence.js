// Inactive evidence core. No callable export and no archive listing API.
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { privateReportModeratorLevel, assertPrivateReportScope } from './remove_reported_private_reply.js';
import { isPurgedShoutContext } from './shout_context.js';
import { validateLifecycleArchive, validateLifecycleThread, lifecycleSubjectDeadline, lifecycleArchiveKey, lifecycleBodyHash, lifecycleGeography } from './content_lifecycle.js';
import { validLegacyReportBinding, reportArchiveVersionProven, reportArchivePairProven } from './content_lifecycle_report_provenance.js';
import { readLifecycleAccountReportEvidence } from './content_lifecycle_account_evidence.js';

const collections = { shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' };
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const archiveKey = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const fail = (code, message) => { throw new HttpsError(code, message); };
const absent = () => fail('not-found', 'The reported archive is unavailable.');

// A typed trusted result, not a forged Firestore DocumentSnapshot. All checks
// and subsequent moderation mutations must share the caller's transaction.
export async function readLifecycleReportEvidence(tx, db, report, targetType, now, cache = { documents: new Map(), subjects: new Map() }) {
  const r = report?.data();
  if (r && r.contentArchiveKey === undefined && ['comment', 'privateReply'].includes(targetType)) {
    return readLifecycleAccountReportEvidence(tx, db, report, targetType, now, cache);
  }
  if (!r || !Object.hasOwn(collections, targetType) || report.ref.parent.id !== collections[targetType] ||
      !identifier(r.reporterId) || !identifier(r.shoutId) || !identifier(r.authorId) ||
      !['open', 'escalated', 'resolved'].includes(r.status) || typeof r.reason !== 'string' || !r.reason ||
      r.accountArchiveId !== undefined || r.accountEvidenceBinding !== undefined ||
      !(r.createdAt instanceof Timestamp) || !archiveKey(r.contentArchiveKey) ||
      !(archiveKey(r.shoutArchiveKey) || targetType !== 'shout' && r.parentContextPurged === true &&
        r.shoutArchiveKey === undefined && r.moderationGeography === null)) {
    fail('failed-precondition', 'Invalid immutable report binding.');
  }
  const childId = targetType === 'comment' ? r.commentId : r.privateReplyId;
  if (targetType !== 'shout' && !identifier(childId) ||
      report.id !== `${r.reporterId}_${r.shoutId}${targetType === 'shout' ? '' : `_${childId}`}`) {
    fail('failed-precondition', 'Invalid report identity.');
  }
  const sourcePath = `shouts/${r.shoutId}${targetType === 'shout' ? '' : `/${targetType === 'comment' ? 'comments' : 'privateReplies'}/${childId}`}`;
  const paths = [`contentLifecycleArchive/${r.contentArchiveKey}`, `contentLifecycleThreads/${r.shoutId}`];
  const missing = paths.filter(path => !cache.documents.has(path));
  if (missing.length) {
    const docs = await tx.getAll(...missing.map(path => db.doc(path)));
    missing.forEach((path, n) => cache.documents.set(path, docs[n]));
  }
  const [archive, thread] = paths.map(path => cache.documents.get(path));
  if (!archive.exists || !thread.exists) return absent();
  const data = archive.data(), header = validateLifecycleThread(thread.data(), r.shoutId);
  validateLifecycleArchive(db, archive.id, data);
  const legacy = r.legacyEvidenceBinding !== undefined;
  if (data.sourcePath !== sourcePath || data.kind !== targetType || data.content.authorId !== r.authorId ||
      !data.threadCreatedAt.isEqual(header.sourceCreatedAt) || data.content.authorId === r.reporterId ||
      legacy && !validLegacyReportBinding(report) || !reportArchiveVersionProven(archive, report, legacy) ||
      targetType === 'shout' && r.shoutArchiveKey !== archive.id ||
      targetType === 'privateReply' && data.content.recipientId !== r.reporterId) {
    fail('failed-precondition', 'The reported content identity changed.');
  }
  const deadline = await lifecycleSubjectDeadline(tx, db, [...new Set([...data.subjectUserIds, r.reporterId])], header.retainUntil, cache.subjects);
  if (now.toMillis() >= deadline.retainUntil.toMillis()) return absent();
  // Geography is captured by the server at reporting time. Never infer it
  // from a replacement parent or accept client-selected scope.
  const g = r.moderationGeography;
  if (g !== null && (g?.schemaVersion !== 1 || typeof g.countryCode !== 'string' || !/^[A-Z]{2}$/.test(g.countryCode) ||
      g.subdivisionCode !== undefined && (typeof g.subdivisionCode !== 'string' || !/^[A-Z]{2}-[A-Z0-9-]{1,8}$/.test(g.subdivisionCode)) ||
      Object.keys(g).some(k => !['schemaVersion', 'countryCode', 'subdivisionCode'].includes(k)))) fail('failed-precondition', 'Invalid report geography.');
  if (legacy && targetType === 'shout' && JSON.stringify(lifecycleGeography(data.content)) !== JSON.stringify(lifecycleGeography({ geography: g }))) {
    fail('failed-precondition', 'The original reported geography changed.');
  }
  let parentContent = null;
  if (targetType !== 'shout' && r.parentContextPurged !== true) {
    const path = `contentLifecycleArchive/${r.shoutArchiveKey}`;
    if (!cache.documents.has(path)) cache.documents.set(path, await tx.get(db.doc(path)));
    const parent = cache.documents.get(path);
    if (parent.exists) {
      validateLifecycleArchive(db, parent.id, parent.data());
      if (parent.get('kind') !== 'shout' || parent.get('sourcePath') !== `shouts/${r.shoutId}` ||
          !parent.get('threadCreatedAt').isEqual(header.sourceCreatedAt) ||
          legacy && (!reportArchivePairProven(archive, parent, report) ||
            JSON.stringify(lifecycleGeography(parent.get('content'))) !== JSON.stringify(lifecycleGeography({ geography: g })))) fail('failed-precondition', 'Invalid reported parent evidence.');
      const parentEnd = await lifecycleSubjectDeadline(tx, db, parent.get('subjectUserIds'), header.retainUntil, cache.subjects);
      if (now.toMillis() < parentEnd.retainUntil.toMillis()) parentContent = parent.get('content');
    } else if (legacy) return absent();
  }
  return Object.freeze({ kind: targetType, sourcePath, archiveRef: archive.ref, archiveKey: archive.id,
    content: data.content, finalState: data.state, geography: g, retainUntil: deadline.retainUntil,
    contentHash: data.contentHash, privacyRedacted: data.redactedFromHash !== undefined, captureMode: data.captureMode ?? 'atomic-write',
    parentContent, parentKey: r.shoutArchiveKey, archivedAt: data.archivedAt, sourceCreatedAt: data.sourceCreatedAt });
}

export async function resolveLifecycleReportGroup(tx, db, reports, input, source, now) {
  const ids = reports.docs.map(d => d.id).sort();
  if (ids.length < 1 || ids.length > 50 || JSON.stringify(ids) !== JSON.stringify(input.reportIds)) {
    fail('failed-precondition', 'The report group changed.');
  }
  let selected = null;
  const cache = { documents: new Map(), subjects: new Map() };
  for (const report of reports.docs) {
    const r = report.data();
    if (!['open', 'escalated'].includes(r.status) || typeof r.reason !== 'string' || !r.reason ||
        r.shoutId !== input.shoutId || input.targetType === 'comment' && r.commentId !== input.targetId ||
        input.targetType === 'privateReply' && r.privateReplyId !== input.targetId ||
        input.decision === 'escalate' && r.status !== 'open') fail('failed-precondition', 'Invalid report group.');
    const evidence = await readLifecycleReportEvidence(tx, db, report, input.targetType, now, cache);
    if (selected && (selected.archiveRef.path !== evidence.archiveRef.path || selected.archiveKey !== evidence.archiveKey || selected.parentKey !== evidence.parentKey ||
        JSON.stringify(selected.geography) !== JSON.stringify(evidence.geography))) fail('failed-precondition', 'Ambiguous reported versions.');
    selected = evidence;
  }
  if (source.exists && selected.archiveStorage === 'account') fail('failed-precondition', 'The archived report source was recreated.');
  if (source.exists && !isPurgedShoutContext(source.data()) && (source.ref.path !== selected.sourcePath || !source.get('createdAt')?.isEqual(selected.sourceCreatedAt) ||
      (selected.privacyRedacted ? lifecycleBodyHash(source.data()) !== selected.contentHash :
        source.get('contentArchiveKey') !== selected.archiveKey || lifecycleArchiveKey(db.projectId, source.ref.path, source.data()) !== selected.archiveKey))) {
    fail('failed-precondition', 'The live report target changed.');
  }
  return selected;
}

// Preserve the storage namespace in receipts/audits. An account copy ID must
// never masquerade as a contentLifecycleArchive document that does not exist.
export function lifecycleEvidenceReference(evidence) {
  return evidence ? { [evidence.archiveStorage === 'account' ? 'accountArchiveId' : 'contentArchiveKey']: evidence.archiveKey,
    moderationGeography: evidence.geography } : {};
}

export async function readLifecycleSourceBinding(tx, db, source, now) {
  const key = source.get('contentArchiveKey');
  if (!source.exists || !archiveKey(key) || lifecycleArchiveKey(db.projectId, source.ref.path, source.data()) !== key) {
    fail('failed-precondition', 'The source archive binding is unavailable.');
  }
  const archive = await tx.get(db.doc(`contentLifecycleArchive/${key}`));
  if (!archive.exists) return absent();
  const data = archive.data(); validateLifecycleArchive(db, key, data);
  if (data.sourcePath !== source.ref.path || data.contentHash !== lifecycleBodyHash(source.data())) fail('failed-precondition', 'The source archive identity changed.');
  const thread = await tx.get(db.doc(`contentLifecycleThreads/${data.threadId}`));
  if (!thread.exists) return absent();
  const header = validateLifecycleThread(thread.data(), data.threadId);
  if (!data.threadCreatedAt.isEqual(header.sourceCreatedAt)) fail('failed-precondition', 'The source thread changed.');
  const deadline = await lifecycleSubjectDeadline(tx, db, data.subjectUserIds, header.retainUntil);
  if (now.toMillis() >= deadline.retainUntil.toMillis()) return absent();
  return Object.freeze({ kind: data.kind, sourcePath: data.sourcePath, archiveRef: archive.ref, archiveKey: key,
    content: data.content, finalState: data.state, geography: header.geography, retainUntil: deadline.retainUntil });
}

function publicTarget(evidence) {
  const body = evidence.content;
  // No participants, location, email, raw report data or another conversation.
  const allowed = evidence.kind === 'shout' ? ['authorId', 'authorNickname', 'title', 'text', 'category'] :
    ['authorId', 'authorNickname', 'text'];
  return { ...Object.fromEntries(allowed.filter(k => typeof body[k] === 'string').map(k => [k, body[k]])),
    createdAtMillis: body.createdAt.toMillis() };
}

export async function getLifecycleReportEvidenceOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request), input = request.data;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['reportId', 'targetType', 'expectedUserId'].includes(k)) ||
      !Object.hasOwn(collections, input.targetType) || typeof input.reportId !== 'string' || !/^[A-Za-z0-9_-]{1,386}$/.test(input.reportId)) {
    fail('invalid-argument', 'A specific report is required.');
  }
  if (input.expectedUserId !== uid) fail('unauthenticated', 'The signed-in account changed.');
  const auditId = db.collection('contentLifecycleArchive').doc().id;
  return db.runTransaction(async tx => {
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) fail('failed-precondition', 'operation-clock-unavailable');
    const now = Timestamp.fromDate(date);
    await requireEligibleActor({ request, db, reader: tx, now: date });
    const [role, legacy, report] = await tx.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`),
      db.doc(`${collections[input.targetType]}/${input.reportId}`));
    const level = privateReportModeratorLevel(role.data(), legacy.data());
    if (!report.exists) return absent();
    if (report.get('status') === 'escalated' && level < 4) fail('permission-denied', 'Senior moderator permission is required.');
    const evidence = await readLifecycleReportEvidence(tx, db, report, input.targetType, now);
    assertPrivateReportScope(role.data(), level, { geography: evidence.geography });
    tx.create(evidence.archiveRef.collection('accessAudits').doc(auditId), {
      actorId: uid, roleLevel: level, reportId: report.id, reportCollection: collections[input.targetType],
      action: 'read-reported-content', readAt: now, retainUntil: evidence.retainUntil,
    });
    return { archived: true, privacyRedacted: evidence.privacyRedacted, captureMode: evidence.captureMode,
      capturedAtMillis: Math.floor(evidence.archivedAt.toMillis()), targetData: publicTarget(evidence),
      ...(evidence.parentContent ? { parentData: publicTarget({ kind: 'shout', content: evidence.parentContent }) } : {}),
      retainUntilMillis: evidence.retainUntil.toMillis() };
  });
}
