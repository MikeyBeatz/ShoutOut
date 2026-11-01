import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { accountContentArchiveId } from './account_content_archive.js';

const fail = (code, text) => { throw new HttpsError(code, text); };
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

// Only an existing reported public comment may be read. This is not an API for
// browsing the archive, private conversations, exporting or changing evidence.
export async function getArchivedCommentReportTargetOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request), input = request.data;
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => k !== 'reportId') ||
      typeof input.reportId !== 'string' || !/^[A-Za-z0-9_-]{1,386}$/.test(input.reportId)) {
    fail('invalid-argument', 'A comment report identity is required.');
  }
  const auditId = db.collection('accountContentArchive').doc().id;
  return db.runTransaction(async transaction => {
    const now = Timestamp.fromDate(clock());
    await requireEligibleActor({ request, db, reader: transaction, now: now.toDate() });
    const [role, legacy, report] = await transaction.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`),
      db.doc(`commentReports/${input.reportId}`));
    const level = role.data()?.level;
    if (!(Number.isSafeInteger(level) && level >= 3) && !legacy.exists) fail('permission-denied', 'Moderator permission is required.');
    if (!report.exists) fail('not-found', 'The report target is unavailable.');
    const data = report.data();
    if (!identifier(data.shoutId) || !identifier(data.commentId) || !identifier(data.reporterId) ||
        report.id !== `${data.reporterId}_${data.shoutId}_${data.commentId}`) {
      fail('failed-precondition', 'Invalid stored comment report.');
    }
    const sourcePath = `shouts/${data.shoutId}/comments/${data.commentId}`;
    const rows = await transaction.get(db.collection('accountContentArchive').where('sourcePath', '==', sourcePath)
      .where('sourceCreateTime', '<=', report.createTime).orderBy('sourceCreateTime', 'desc').limit(2));
    const snapshot = rows.docs[0], archive = snapshot?.data();
    if (!archive || !(archive.retainUntil instanceof Timestamp) || archive.retainUntil.toMillis() <= now.toMillis() ||
        (snapshot.createTime.seconds < report.createTime.seconds || snapshot.createTime.seconds === report.createTime.seconds && snapshot.createTime.nanoseconds < report.createTime.nanoseconds)) fail('not-found', 'The report target is unavailable.');
    if (rows.docs[1]?.data().sourceCreateTime?.isEqual(archive.sourceCreateTime)) fail('failed-precondition', 'Ambiguous stored target.');
    if (archive.schemaVersion !== 1 || archive.kind !== 'comment' || archive.sourcePath !== sourcePath ||
        !(archive.sourceCreateTime instanceof Timestamp) || !(archive.requestCreateTime instanceof Timestamp) ||
        archive.retainUntil.toMillis() !== archive.requestCreateTime.toMillis() + 60 * 86400000 ||
        accountContentArchiveId(db.projectId, sourcePath, archive.sourceCreateTime) !== snapshot.id ||
        !identifier(archive.content?.authorId) || archive.content.authorId !== archive.retentionOwnerId ||
        archive.content.authorId === data.reporterId || typeof archive.content.text !== 'string' ||
        !(archive.content.createdAt instanceof Timestamp)) fail('failed-precondition', 'Invalid stored archived target.');
    const targetData = { authorId: archive.content.authorId, text: archive.content.text,
      createdAtMillis: Math.floor(archive.content.createdAt.toMillis()) };
    if (typeof archive.content.authorNickname === 'string') targetData.authorNickname = archive.content.authorNickname;
    transaction.create(snapshot.ref.collection('accessAudits').doc(auditId), {
      actorId: uid, roleLevel: Number.isSafeInteger(level) && level >= 3 ? level : 3,
      reportId: report.id, action: 'read-reported-comment', readAt: now, retainUntil: archive.retainUntil,
    });
    return { targetData, archived: true, retainUntilMillis: archive.retainUntil.toMillis() };
  });
}
