import { readFileSync } from 'node:fs';
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const password = process.env.SHOUTOUT_TEST_PASSWORD;

if (!serviceAccountPath || !password) {
  throw new Error(
    'Set FIREBASE_SERVICE_ACCOUNT_PATH and SHOUTOUT_TEST_PASSWORD before running this script.',
  );
}

if (password.length < 6) {
  throw new Error('SHOUTOUT_TEST_PASSWORD must contain at least 6 characters.');
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();
const users = [
  { id: 'alex', nickname: 'SilverFalcon', language: 'cs' },
  { id: 'bea', nickname: 'SunnyOtter', language: 'en' },
  { id: 'chris', nickname: 'CosmicMaple', language: 'de' },
  { id: 'dana', nickname: 'QuietPhoenix', language: 'pl' },
  { id: 'elliot', nickname: 'BrightHarbor', language: 'cs' },
];

for (const testUser of users) {
  const uid = `test_${testUser.id}`;
  const email = `test.${testUser.id}@shoutout.test`;
  const nicknameLower = testUser.nickname.toLowerCase();

  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, {
      email,
      password,
      emailVerified: true,
      displayName: `[TEST] ${testUser.nickname}`,
      disabled: false,
    });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({
      uid,
      email,
      password,
      emailVerified: true,
      displayName: `[TEST] ${testUser.nickname}`,
      disabled: false,
    });
  }

  const nicknameRef = db.collection('nicknames').doc(nicknameLower);
  const existingNickname = await nicknameRef.get();
  if (existingNickname.exists && existingNickname.data().uid !== uid) {
    throw new Error(`Nickname ${testUser.nickname} is already owned by another account.`);
  }

  await Promise.all([
    nicknameRef.set({
      uid,
      nickname: testUser.nickname,
      nicknameLower,
      createdAt: FieldValue.serverTimestamp(),
    }),
    db.collection('users').doc(uid).set({
      nickname: testUser.nickname,
      nicknameLower,
      createdAt: FieldValue.serverTimestamp(),
      nicknameChangedAt: FieldValue.serverTimestamp(),
      nicknameChangeCount: 0,
      emailVerified: true,
      language: testUser.language,
      isTest: true,
    }, { merge: true }),
  ]);

  console.log(`Ready: ${email} (${testUser.nickname})`);
}

console.log('\nCreated or updated 5 verified ShoutOut development test accounts.');
