import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { backfillPublicProfileForUser } from './account_identity_writes.mjs';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH.');
}
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
if (serviceAccount.project_id !== 'shoutout-dev-46c81') {
  throw new Error('This development tool only supports shoutout-dev-46c81.');
}
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const users = await db.collection('users').select().get();
let written = 0;
let skippedDeleting = 0;
for (const user of users.docs) {
  const result = await backfillPublicProfileForUser(db, user.id);
  if (result.written) written++;
  if (result.reason === 'account-deleting') skippedDeleting++;
}
console.log(`Public profiles written: ${written}`);
console.log(`Deleting accounts skipped: ${skippedDeleting}`);
