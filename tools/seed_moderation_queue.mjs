import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { GeoPoint, Timestamp, getFirestore } from 'firebase-admin/firestore';

import {
  eligibleModerationContentAuthors,
  moderationSeedUserAt,
} from './moderation_seed.mjs';

const expectedProjectId = 'shoutout-dev-46c81';
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH.');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
if (serviceAccount.project_id !== expectedProjectId) {
  throw new Error(`Refusing project ${serviceAccount.project_id}.`);
}
if (!process.argv.includes(`--confirm-project=${expectedProjectId}`)) {
  throw new Error(`Pass --confirm-project=${expectedProjectId}.`);
}
initializeApp({ credential: cert(serviceAccount), projectId: expectedProjectId });
const db = getFirestore();

const users = [
  ['it_user_author', 'TestAuthor'],
  ['it_user_commenter', 'TestCommenter'],
  ['it_business', 'TestBusiness'],
  ['it_moderator', 'TestModerator'],
  ['it_senior', 'TestSenior'],
  ['it_admin', 'TestAdmin'],
  ['it_owner', 'TestOwner'],
];
const staffUserIds = new Set([
  'it_moderator',
  'it_senior',
  'it_admin',
  'it_owner',
]);
const contentAuthors = eligibleModerationContentAuthors(users, staffUserIds);
const titles = [
  'Noční hluk v centru',
  'Nabídka vstupenek na koncert',
  'Dopravní omezení u nádraží',
  'Hledá se pomoc se stěhováním',
  'Podezřelá nabídka práce',
  'Sportovní akce o víkendu',
  'Ztracený pes u parku',
  'Diskuze o místní restauraci',
  'Nevhodná reklama ve městě',
  'Setkání sousedů na náměstí',
  'Varování před podvodníkem',
  'Hledáme spoluhráče',
];
const shoutTexts = [
  'Testovací obsah pro ověření moderátorské fronty a regionálního dohledu.',
  'Tento příspěvek má několik nezávislých hlášení od různých uživatelů.',
  'Ukázkový shout s různým časem vytvoření a prioritou ke kontrole.',
];
const commentTexts = [
  'Tohle je zavádějící a podle mě úmyslně nepravdivé.',
  'Takové lidi bych odsud všechny vyhodil.',
  'Napiš mi soukromě, mám nabídku mimo pravidla aplikace.',
  'Opakovaný spam se stejným odkazem a reklamním sdělením.',
  'Osobní útok na autora a nevhodné urážky.',
  'Komentář obsahující podezřelou nabídku a nátlak.',
];
const reasons = [
  'Spam nebo podvod',
  'Obtěžování a osobní útoky',
  'Nebezpečný nebo nezákonný obsah',
  'Nevhodná reklama',
  'Sdílení osobních údajů',
];
const now = Date.now();
const location = new GeoPoint(50.5384, 14.1318);
const geography = {
  schemaVersion: 1,
  geohash: 'u2fkn8u',
  countryCode: 'CZ',
  subdivisionCode: 'CZ-42',
  providerSubdivisionName: 'Ústecký kraj',
  localityName: 'Litoměřice',
  provider: 'integrationTest',
  providerPlaceId: null,
  resolvedAt: Timestamp.fromMillis(now),
};

let shoutReports = 0;
let commentReports = 0;
let privateReplyReports = 0;

for (let index = 0; index < 12; index += 1) {
  const shoutId = `queue_demo_shout_${String(index + 1).padStart(2, '0')}`;
  const [authorId, authorNickname] = moderationSeedUserAt(contentAuthors, index);
  const createdAt = Timestamp.fromMillis(now - (index + 1) * 47 * 60 * 1000);
  const shoutRef = db.collection('shouts').doc(shoutId);
  const commentCount = 2 + (index % 3);
  await shoutRef.set({
    authorId,
    authorNickname,
    title: `[FRONTA] ${titles[index]}`,
    text: shoutTexts[index % shoutTexts.length],
    categories: [index % 2 === 0 ? 'Obecné' : 'Upozornění'],
    location,
    geohash: geography.geohash,
    geography,
    createdAt,
    expiresAt: Timestamp.fromMillis(now + (36 + index) * 60 * 60 * 1000),
    status: 'active',
    likesCount: index % 5,
    dislikesCount: index % 4,
    commentsCount: commentCount,
    savesCount: index % 3,
    isTest: true,
  });

  // Report only selected Shouts, with 1-4 independent reporters.
  if (index % 2 === 0) {
    const reportCount = 1 + (index % 4);
    const reporters = users.filter(([uid]) => uid !== authorId).slice(0, reportCount);
    for (let reportIndex = 0; reportIndex < reporters.length; reportIndex += 1) {
      const [reporterId] = reporters[reportIndex];
      await db.collection('reports').doc(`${reporterId}_${shoutId}`).set({
        reporterId,
        shoutId,
        reason: reasons[(index + reportIndex) % reasons.length],
        createdAt: Timestamp.fromMillis(createdAt.toMillis() + (reportIndex + 1) * 60000),
        status: 'open',
      });
      shoutReports += 1;
    }
  }

  for (let commentIndex = 0; commentIndex < commentCount; commentIndex += 1) {
    const commentId = `queue_comment_${commentIndex + 1}`;
    const [commentAuthorId, commentAuthorNickname] = moderationSeedUserAt(
      contentAuthors,
      index + commentIndex + 1,
    );
    const commentCreatedAt = Timestamp.fromMillis(
      createdAt.toMillis() + (commentIndex + 1) * 5 * 60000,
    );
    await shoutRef.collection('comments').doc(commentId).set({
      authorId: commentAuthorId,
      authorNickname: commentAuthorNickname,
      text: commentTexts[(index + commentIndex) % commentTexts.length],
      createdAt: commentCreatedAt,
      likesCount: 0,
      dislikesCount: commentIndex,
      isTest: true,
    });
    if ((index + commentIndex) % 2 === 0) {
      const reportCount = 1 + ((index + commentIndex) % 5);
      const reporters = users
        .filter(([uid]) => uid !== commentAuthorId)
        .slice(0, reportCount);
      for (let reportIndex = 0; reportIndex < reporters.length; reportIndex += 1) {
        const [reporterId] = reporters[reportIndex];
        const reportId = `${reporterId}_${shoutId}_${commentId}`;
        await db.collection('commentReports').doc(reportId).set({
          reporterId,
          shoutId,
          commentId,
          reason: reasons[(commentIndex + reportIndex) % reasons.length],
          createdAt: Timestamp.fromMillis(
            commentCreatedAt.toMillis() + (reportIndex + 1) * 60000,
          ),
          status: 'open',
        });
        commentReports += 1;
      }
    }
  }

  if (index < 8) {
    const replyId = 'queue_private_reply';
    const [replyAuthorId, replyAuthorNickname] = moderationSeedUserAt(
      contentAuthors,
      index + 2,
    );
    const recipients = users.filter(([uid]) => uid !== replyAuthorId);
    const [recipientId, recipientNickname] = moderationSeedUserAt(
      recipients,
      index + 3,
    );
    const text = `Soukromá testovací odpověď ${index + 1} s obsahem určeným ke kontrole.`;
    const replyCreatedAt = Timestamp.fromMillis(createdAt.toMillis() + 11 * 60000);
    await shoutRef.collection('privateReplies').doc(replyId).set({
      authorId: replyAuthorId,
      authorNickname: replyAuthorNickname,
      recipientId,
      recipientNickname,
      participants: [replyAuthorId, recipientId],
      text,
      createdAt: replyCreatedAt,
      targetType: 'shout',
      isTest: true,
    });
    const reportCount = 1 + (index % 3);
    const reporters = users
      .filter(([uid]) => uid !== replyAuthorId)
      .slice(0, reportCount);
    for (let reportIndex = 0; reportIndex < reporters.length; reportIndex += 1) {
      const [reporterId] = reporters[reportIndex];
      const reportId = `${reporterId}_${shoutId}_${replyId}`;
      await db.collection('privateReplyReports').doc(reportId).set({
        reporterId,
        shoutId,
        privateReplyId: replyId,
        authorId: replyAuthorId,
        authorNickname: replyAuthorNickname,
        text,
        reason: reasons[(index + reportIndex + 1) % reasons.length],
        createdAt: Timestamp.fromMillis(
          replyCreatedAt.toMillis() + (reportIndex + 1) * 60000,
        ),
        status: 'open',
        priority: 'high',
      });
      privateReplyReports += 1;
    }
  }
}

console.log('Moderation queue seeded.');
console.log('Shouts: 12');
console.log(`Shout reports: ${shoutReports}`);
console.log(`Comment reports: ${commentReports}`);
console.log(`Private reply reports: ${privateReplyReports}`);
