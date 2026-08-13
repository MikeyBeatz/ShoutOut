import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { buildBusinessActivationWrites } from './business_activation.mjs';

const expectedProjectId = 'shoutout-dev-46c81';
const [email, ...options] = process.argv.slice(2);
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const option = (name) => options.find((item) => item.startsWith(`--${name}=`))
  ?.slice(name.length + 3);
const apply = options.includes('--apply');
const confirmedLocation = options.includes('--confirm-location');
const confirmedProject = option('confirm-project');
const confirmedUid = option('confirm-uid');

if (!email || !serviceAccountPath) {
  throw new Error(
    'Usage: FIREBASE_SERVICE_ACCOUNT_PATH=<path> npm run activate:business -- <email> [--apply --confirm-project=shoutout-dev-46c81 --confirm-uid=<uid> --confirm-location]',
  );
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
if (serviceAccount.project_id !== expectedProjectId) {
  throw new Error(`Refusing project ${serviceAccount.project_id}.`);
}

initializeApp({ credential: cert(serviceAccount), projectId: expectedProjectId });
const auth = getAuth();
const db = getFirestore();
const user = await auth.getUserByEmail(email.trim());
const applicationReference = db.collection('businessApplications').doc(user.uid);
const roleReference = db.collection('accountRoles').doc(user.uid);
const profileReference = db.collection('businessProfiles').doc(user.uid);
const locationReference = profileReference.collection('locations').doc('initial');
const [applicationSnapshot, roleSnapshot, profileSnapshot, locationSnapshot] =
  await Promise.all([
    applicationReference.get(),
    roleReference.get(),
    profileReference.get(),
    locationReference.get(),
  ]);

if (!applicationSnapshot.exists) {
  throw new Error(`No Business application exists for ${user.uid}.`);
}

if (applicationSnapshot.data().status === 'active') {
  const role = roleSnapshot.data();
  if (role?.role === 'business' && role?.level === 2 &&
      profileSnapshot.data()?.status === 'active' && locationSnapshot.exists) {
    console.log(`Business application ${user.uid} is already active.`);
    process.exit(0);
  }
  throw new Error('Application is active but its role, profile, or initial location is incomplete.');
}

const writes = buildBusinessActivationWrites({
  uid: user.uid,
  authUser: user,
  application: applicationSnapshot.data(),
});

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  projectId: expectedProjectId,
  uid: user.uid,
  company: writes.profile.officialName,
  registrationNumber: writes.profile.registrationNumber,
  branch: writes.location.displayName,
  branchAddress: writes.location.address,
}, null, 2));

if (!apply) {
  console.log('Dry run only. Review the data, then repeat with --apply and all confirmation flags.');
  process.exit(0);
}
if (confirmedProject !== expectedProjectId) {
  throw new Error(`Pass --confirm-project=${expectedProjectId}.`);
}
if (confirmedUid !== user.uid) {
  throw new Error(`Pass --confirm-uid=${user.uid}.`);
}
if (!confirmedLocation) {
  throw new Error('Inspect the first branch address and pass --confirm-location.');
}

await db.runTransaction(async (transaction) => {
  const currentApplication = await transaction.get(applicationReference);
  const currentRole = await transaction.get(roleReference);
  const currentProfile = await transaction.get(profileReference);
  const currentLocation = await transaction.get(locationReference);
  if (!currentApplication.exists) throw new Error('Business application disappeared.');

  const currentWrites = buildBusinessActivationWrites({
    uid: user.uid,
    authUser: user,
    application: currentApplication.data(),
  });
  if (currentRole.exists) {
    const role = currentRole.data();
    if (role.role !== 'business' || role.level !== 2) {
      throw new Error('Account already has a different privileged role.');
    }
  }
  if (currentProfile.exists || currentLocation.exists) {
    throw new Error('Business profile or initial location already exists; refusing to overwrite it.');
  }

  const timestamp = FieldValue.serverTimestamp();
  if (!currentRole.exists) {
    transaction.create(roleReference, { ...currentWrites.role, createdAt: timestamp });
  }
  transaction.create(profileReference, {
    ...currentWrites.profile,
    emailVerifiedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  transaction.create(locationReference, {
    ...currentWrites.location,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  transaction.update(applicationReference, {
    ...currentWrites.applicationUpdate,
    activatedAt: timestamp,
  });
});

console.log(`Business application activated for ${user.uid}.`);
