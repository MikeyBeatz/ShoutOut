import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile } from 'node:fs/promises';
import { assertDevelopmentProject, devProject } from './web_environment.mjs';

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!keyPath) throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is required.');

const credentials = JSON.parse(await readFile(keyPath, 'utf8'));
assertDevelopmentProject(credentials.project_id);
const app = initializeApp({ credential: cert(credentials), projectId: devProject });
const db = getFirestore(app);
const testUserIds = [
  'it_user_author',
  'it_user_commenter',
  'it_business',
  'it_moderator',
  'it_senior',
  'it_admin',
  'it_owner',
];

const batch = db.batch();
for (const uid of testUserIds) {
  batch.set(db.collection('users').doc(uid), {
    themeMode: 'system',
    showOnboardingHelp: true,
    onboardingStep: 0,
  }, { merge: true });
}
await batch.commit();
console.log(`Enabled the first-run tutorial for ${testUserIds.length} test users.`);
