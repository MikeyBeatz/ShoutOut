import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  GeoPoint,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';

const expectedProjectId = 'shoutout-dev-46c81';
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const password = process.env.SHOUTOUT_TEST_PASSWORD;
const confirmation = process.argv.find((value) =>
  value.startsWith('--confirm-project='));
const confirmedProjectId = confirmation?.split('=')[1];

if (!serviceAccountPath) {
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH.');
}
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
if (serviceAccount.project_id !== expectedProjectId) {
  throw new Error(
    `Refusing project ${serviceAccount.project_id}; expected ${expectedProjectId}.`,
  );
}
initializeApp({ credential: cert(serviceAccount), projectId: expectedProjectId });

const auth = getAuth();
const db = getFirestore();

async function listAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function inspectScope() {
  const authUsers = await listAuthUsers();
  const collections = await db.listCollections();
  const collectionCounts = [];
  for (const collection of collections) {
    const aggregate = await collection.count().get();
    collectionCounts.push({
      id: collection.id,
      rootDocuments: aggregate.data().count,
    });
  }
  return { authUsers, collections, collectionCounts };
}

const scope = await inspectScope();
console.log(`Project: ${expectedProjectId}`);
console.log(`Authentication users to delete: ${scope.authUsers.length}`);
for (const item of scope.collectionCounts) {
  console.log(`Firestore ${item.id}: ${item.rootDocuments} root documents`);
}

if (confirmedProjectId !== expectedProjectId) {
  console.log('\nDry run only. No data changed.');
  console.log(
    `Run again with --confirm-project=${expectedProjectId} to reset and seed.`,
  );
  process.exit(0);
}
if (!password || password.length < 12 || !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) || !/\d/.test(password)) {
  throw new Error(
    'SHOUTOUT_TEST_PASSWORD must be 12+ characters with upper/lowercase and a number.',
  );
}

console.log('\nConfirmed destructive reset of development data.');
for (const collection of scope.collections) {
  await db.recursiveDelete(collection);
  console.log(`Deleted Firestore collection: ${collection.id}`);
}
for (let index = 0; index < scope.authUsers.length; index += 1000) {
  const userIds = scope.authUsers.slice(index, index + 1000).map((user) => user.uid);
  if (userIds.length) await auth.deleteUsers(userIds);
}
console.log(`Deleted ${scope.authUsers.length} Authentication users.`);

const accounts = [
  { uid: 'it_user_author', email: 'test.user1@shoutout.test', nickname: 'TestAuthor', role: 'user', level: 1 },
  { uid: 'it_user_commenter', email: 'test.user2@shoutout.test', nickname: 'TestCommenter', role: 'user', level: 1 },
  { uid: 'it_business', email: 'test.business@shoutout.test', nickname: 'TestBusiness', role: 'business', level: 2 },
  { uid: 'it_moderator', email: 'test.moderator@shoutout.test', nickname: 'TestModerator', role: 'moderator', level: 3 },
  { uid: 'it_senior', email: 'test.senior@shoutout.test', nickname: 'TestSenior', role: 'seniorModerator', level: 4 },
  { uid: 'it_admin', email: 'test.admin@shoutout.test', nickname: 'TestAdmin', role: 'administrator', level: 5 },
  { uid: 'it_owner', email: 'test.owner@shoutout.test', nickname: 'TestOwner', role: 'owner', level: 6 },
];

for (const account of accounts) {
  await auth.createUser({
    uid: account.uid,
    email: account.email,
    password,
    emailVerified: true,
    displayName: `[INTEGRATION] ${account.nickname}`,
  });
  const now = FieldValue.serverTimestamp();
  await Promise.all([
    db.collection('users').doc(account.uid).set({
      nickname: account.nickname,
      nicknameLower: account.nickname.toLowerCase(),
      createdAt: now,
      nicknameChangedAt: now,
      nicknameChangeCount: 0,
      emailVerified: true,
      language: 'cs',
      avatarId: 'fox',
      avatarBackgroundStart: 'teal',
      avatarBackgroundEnd: 'navy',
      avatarGradientDirection: 'diagonal',
      isTest: true,
    }),
    db.collection('nicknames').doc(account.nickname.toLowerCase()).set({
      uid: account.uid,
      nickname: account.nickname,
      nicknameLower: account.nickname.toLowerCase(),
      createdAt: now,
    }),
    db.collection('users').doc(account.uid).collection('legal')
      .doc('acceptance_2026_07_25').set({
        termsVersion: '2026-07-25',
        privacyVersion: '2026-07-25',
        communityRulesVersion: '2026-07-25',
        ageConfirmed: true,
        acceptedAt: now,
        acceptedLanguage: 'cs',
      }),
  ]);
  if (account.level > 1) {
    await db.collection('accountRoles').doc(account.uid).set({
      role: account.role,
      level: account.level,
      assignedBy: 'reset_integration_scenario.mjs',
      createdAt: now,
      moderationScope: {
        global: account.level >= 5,
        countries: account.level >= 3 && account.level < 5 ? ['CZ'] : [],
        subdivisions: account.level >= 3 && account.level < 5
          ? ['CZ-42']
          : [],
      },
    });
  }
  console.log(`Created level ${account.level}: ${account.email}`);
}

const shoutId = 'it_reported_comment_shout';
const commentId = 'it_reported_comment';
const createdAt = Timestamp.now();
const expiresAt = Timestamp.fromMillis(createdAt.toMillis() + 24 * 60 * 60 * 1000);
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
  resolvedAt: createdAt,
};
const shoutRef = db.collection('shouts').doc(shoutId);
await shoutRef.set({
  authorId: 'it_user_author',
  authorNickname: 'TestAuthor',
  title: '[TEST] Integrační moderace komentáře',
  text: 'Tento shout slouží k ověření kompletního moderátorského postupu.',
  categories: ['Obecné'],
  location,
  geohash: geography.geohash,
  geography,
  createdAt,
  expiresAt,
  status: 'active',
  likesCount: 0,
  dislikesCount: 0,
  commentsCount: 1,
  savesCount: 0,
  isTest: true,
});
await shoutRef.collection('comments').doc(commentId).set({
  authorId: 'it_user_commenter',
  authorNickname: 'TestCommenter',
  text: 'Jsi úplně neschopný, takové lidi tu nikdo nechce.',
  createdAt: Timestamp.fromMillis(createdAt.toMillis() + 1000),
  likesCount: 0,
  dislikesCount: 0,
  isTest: true,
});
console.log('\nIntegration scenario ready:');
console.log(`Shout: ${shoutId}`);
console.log(`Comment: ${commentId}`);
console.log('No report or sanction was seeded; create both manually through the UI.');
