import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const nickname = process.argv[2]?.trim();
const apply = process.argv.includes('--apply');

if (!serviceAccountPath || !nickname) {
  throw new Error(
    'Usage: set FIREBASE_SERVICE_ACCOUNT_PATH, then run with <nickname> [--apply].',
  );
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
if (serviceAccount.project_id !== 'shoutout-dev-46c81') {
  throw new Error(
    `Refusing to modify unexpected project "${serviceAccount.project_id}".`,
  );
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const auth = getAuth();
const nicknameReservation = await db
  .collection('nicknames')
  .doc(nickname.toLowerCase())
  .get();
const profileMatches = nicknameReservation.exists
  ? []
  : (await db.collection('users').where('nickname', '==', nickname).get()).docs;
const authorIds = nicknameReservation.exists
  ? [nicknameReservation.get('uid')]
  : [...new Set(profileMatches.map((doc) => doc.id))];

if (authorIds.length !== 1 || typeof authorIds[0] !== 'string') {
  throw new Error(
    `Expected exactly one author for ${nickname}, found ${authorIds.length}.`,
  );
}

const [userId] = authorIds;
const deletionRequest = await db
  .collection('accountDeletionRequests')
  .doc(userId)
  .get();
if (!deletionRequest.exists || deletionRequest.get('status') !== 'pending') {
  throw new Error(`Account ${userId} has no pending deletion request.`);
}

try {
  await auth.getUser(userId);
  throw new Error(`Authentication account ${userId} still exists.`);
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error;
}

const activeShouts = await db
  .collection('shouts')
  .where('authorId', '==', userId)
  .where('status', '==', 'active')
  .get();

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  nickname,
  userId,
  activeShouts: activeShouts.docs.map((doc) => ({
    id: doc.id,
    title: doc.get('title'),
    highlighted: doc.get('businessHighlighted') === true,
    spotlight: doc.get('businessSpotlight') === true,
  })),
}, null, 2));

if (!apply || activeShouts.empty) process.exit(0);

for (let offset = 0; offset < activeShouts.docs.length; offset += 400) {
  const batch = db.batch();
  for (const shout of activeShouts.docs.slice(offset, offset + 400)) {
    batch.update(shout.ref, { status: 'deleted' });
  }
  await batch.commit();
}

const remaining = await db
  .collection('shouts')
  .where('authorId', '==', userId)
  .where('status', '==', 'active')
  .limit(1)
  .get();
if (!remaining.empty) throw new Error('Active Shouts remain after cleanup.');
console.log(`Hidden ${activeShouts.size} active Shouts.`);
