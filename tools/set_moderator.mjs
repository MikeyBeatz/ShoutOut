import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const [email] = process.argv.slice(2);
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!email || !serviceAccountPath) {
  throw new Error('Usage: FIREBASE_SERVICE_ACCOUNT_PATH=<path> node tools/set_moderator.mjs <email>');
}

initializeApp({ credential: cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8'))) });
const user = await getAuth().getUserByEmail(email);
await getFirestore().collection('accountRoles').doc(user.uid).set({
  role: 'moderator',
  level: 3,
  assignedBy: 'set_moderator.mjs',
  createdAt: FieldValue.serverTimestamp(),
}, { merge: true });
console.log(`Moderator role set for ${user.uid}`);
