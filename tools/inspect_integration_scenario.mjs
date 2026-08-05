import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const expectedProjectId = 'shoutout-dev-46c81';
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH.');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
if (serviceAccount.project_id !== expectedProjectId) {
  throw new Error(`Refusing project ${serviceAccount.project_id}.`);
}
initializeApp({ credential: cert(serviceAccount), projectId: expectedProjectId });
const db = getFirestore();

const shoutId = 'it_reported_comment_shout';
const commentId = 'it_reported_comment';
const [shout, comment, reports, sanctions, restriction, ban, revocations] =
  await Promise.all([
    db.collection('shouts').doc(shoutId).get(),
    db.collection('shouts').doc(shoutId).collection('comments').doc(commentId).get(),
    db.collection('commentReports').where('shoutId', '==', shoutId)
      .where('commentId', '==', commentId).get(),
    db.collection('sanctions').where('userId', '==', 'it_user_commenter').get(),
    db.collection('contentRestrictions').doc('it_user_commenter').get(),
    db.collection('bans').doc('it_user_commenter').get(),
    db.collection('sanctionRevocations').where('userId', '==', 'it_user_commenter').get(),
  ]);

console.log(JSON.stringify({
  projectId: expectedProjectId,
  shout: {
    exists: shout.exists,
    status: shout.data()?.status ?? null,
    commentsCount: shout.data()?.commentsCount ?? null,
  },
  comment: {
    exists: comment.exists,
    authorId: comment.data()?.authorId ?? null,
    text: comment.data()?.text ?? null,
  },
  reports: reports.docs.map((document) => ({
    id: document.id,
    reporterId: document.data().reporterId,
    reason: document.data().reason,
    status: document.data().status,
    resolved: Boolean(document.data().resolvedAt),
  })),
  sanctions: sanctions.docs.map((document) => ({
    id: document.id,
    type: document.data().type,
    reason: document.data().reason,
    status: document.data().status,
    moderatorId: document.data().moderatorId,
    sourceType: document.data().sourceType,
    sourceContentType: document.data().sourceContentType,
    sourceContentId: document.data().sourceContentId,
    permanent: document.data().permanent,
    expiresAt: document.data().expiresAt?.toDate().toISOString() ?? null,
    hasSnapshot: Boolean(document.data().contentSnapshot),
  })),
  activeRestriction: restriction.exists,
  activeBan: ban.exists,
  revocations: revocations.size,
}, null, 2));
