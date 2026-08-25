import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
const [users, roles] = await Promise.all([
  db.collection('users').get(),
  db.collection('accountRoles').get(),
]);
const rolesByUser = new Map(roles.docs.map((role) => [role.id, role.data().role]));
let written = 0;
for (let offset = 0; offset < users.docs.length; offset += 400) {
  const batch = db.batch();
  for (const user of users.docs.slice(offset, offset + 400)) {
    const data = user.data();
    if (!data.nickname || !data.avatarId) continue;
    const publicRole = rolesByUser.get(user.id);
    batch.set(db.collection('publicProfiles').doc(user.id), {
      nickname: data.nickname,
      avatarId: data.avatarId,
      avatarBackgroundStart: data.avatarBackgroundStart,
      avatarBackgroundEnd: data.avatarBackgroundEnd,
      avatarGradientDirection: data.avatarGradientDirection,
      ...(publicRole && publicRole !== 'user' ? { publicRole } : {}),
    }, { merge: true });
    written += 1;
  }
  await batch.commit();
}
console.log(`Public profiles written: ${written}`);
