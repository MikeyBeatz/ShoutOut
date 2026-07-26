import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { GeoPoint, getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH before running this script.');
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
if (serviceAccount.project_id !== 'shoutout-dev-46c81') {
  throw new Error(
    `Refusing to modify unexpected project "${serviceAccount.project_id}".`,
  );
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const shouts = await db.collection('shouts').get();
const roundToPublicGrid = (value) => Math.round(value * 100) / 100;
let updatedShouts = 0;
let updatedComments = 0;

for (const shout of shouts.docs) {
  const [comments, reactions, saves] = await Promise.all([
    shout.ref.collection('comments').get(),
    shout.ref.collection('reactions').get(),
    shout.ref.collection('saves').get(),
  ]);
  const shoutLikes = reactions.docs.filter(
    (reaction) => reaction.data().type === 'like',
  ).length;
  const shoutDislikes = reactions.docs.filter(
    (reaction) => reaction.data().type === 'dislike',
  ).length;
  const location = shout.data().location;
  const update = {
    likesCount: shoutLikes,
    dislikesCount: shoutDislikes,
    commentsCount: comments.size,
    savesCount: saves.size,
  };
  if (location instanceof GeoPoint) {
    update.location = new GeoPoint(
      roundToPublicGrid(location.latitude),
      roundToPublicGrid(location.longitude),
    );
  }
  await shout.ref.update(update);
  updatedShouts += 1;

  for (const comment of comments.docs) {
    const commentReactions = await comment.ref.collection('reactions').get();
    await comment.ref.update({
      likesCount: commentReactions.docs.filter(
        (reaction) => reaction.data().type === 'like',
      ).length,
      dislikesCount: commentReactions.docs.filter(
        (reaction) => reaction.data().type === 'dislike',
      ).length,
    });
    updatedComments += 1;
  }
}

console.log(
  `Reconciled ${updatedShouts} Shout(s) and ${updatedComments} comment(s) in shoutout-dev-46c81.`,
);
