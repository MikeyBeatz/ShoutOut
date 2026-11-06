import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { GeoPoint, getFirestore } from 'firebase-admin/firestore';
import { assertDevelopmentProject, devProject } from './web_environment.mjs';
import { applyLegacyFeedAdminUpdates, runLegacyFeedAdminTransaction } from '../functions/feed_index_admin_guard.js';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH before running this script.');
}

const credentials = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
assertDevelopmentProject(credentials.project_id);
initializeApp({ credential: cert(credentials), projectId: devProject });

const db = getFirestore();
await runLegacyFeedAdminTransaction(db, () => undefined);
const snapshot = await db.collection('shouts').get();
const roundToPublicGrid = (value) => Math.round(value * 100) / 100;
let updated = 0;
let changes = [];

for (const doc of snapshot.docs) {
  const location = doc.data().location;
  if (!(location instanceof GeoPoint)) continue;
  const latitude = roundToPublicGrid(location.latitude);
  const longitude = roundToPublicGrid(location.longitude);
  if (location.latitude === latitude && location.longitude === longitude) continue;
  changes.push({ ref: doc.ref, data: { location: new GeoPoint(latitude, longitude) }, updateTime: doc.updateTime });
  updated += 1;
  if (changes.length === 450) {
    await applyLegacyFeedAdminUpdates(db, changes);
    changes = [];
  }
}
if (changes.length) await applyLegacyFeedAdminUpdates(db, changes);
console.log(`Rounded public locations for ${updated} shout(s).`);
