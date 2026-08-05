import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const [email, role, ...options] = process.argv.slice(2);
const roles = new Map([
  ['user', 1],
  ['business', 2],
  ['moderator', 3],
  ['seniorModerator', 4],
  ['administrator', 5],
  ['owner', 6],
]);
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!email || !roles.has(role) || !serviceAccountPath) {
  throw new Error(
    'Usage: FIREBASE_SERVICE_ACCOUNT_PATH=<path> node tools/set_role.mjs <email> <user|business|moderator|seniorModerator|administrator|owner>',
  );
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
if (serviceAccount.project_id !== 'shoutout-dev-46c81') {
  throw new Error('This development tool only supports shoutout-dev-46c81.');
}

initializeApp({ credential: cert(serviceAccount) });
const user = await getAuth().getUserByEmail(email);
const roleDocument = getFirestore().collection('accountRoles').doc(user.uid);

if (role === 'user') {
  await roleDocument.delete();
} else {
  const option = (name) => options
    .find((item) => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean) ?? [];
  await roleDocument.set({
    role,
    level: roles.get(role),
    assignedBy: 'set_role.mjs',
    createdAt: FieldValue.serverTimestamp(),
    moderationScope: {
      global: role === 'administrator' || role === 'owner',
      countries: option('countries'),
      subdivisions: option('subdivisions'),
    },
  });
}

console.log(`Role ${role} (level ${roles.get(role)}) set for ${user.uid}`);
