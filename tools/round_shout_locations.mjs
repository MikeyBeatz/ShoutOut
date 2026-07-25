import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { GeoPoint, getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH before running this script.');
}

initializeApp({
  credential: cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8'))),
});

const db = getFirestore();
const snapshot = await db.collection('shouts').get();
const roundToPublicGrid = (value) => Math.round(value * 100) / 100;
let updated = 0;
let batch = db.batch();
let operations = 0;

for (const doc of snapshot.docs) {
  const location = doc.data().location;
  if (!(location instanceof GeoPoint)) continue;
  const latitude = roundToPublicGrid(location.latitude);
  const longitude = roundToPublicGrid(location.longitude);
  if (location.latitude === latitude && location.longitude === longitude) continue;
  batch.update(doc.ref, { location: new GeoPoint(latitude, longitude) });
  updated += 1;
  operations += 1;
  if (operations === 450) {
    await batch.commit();
    batch = db.batch();
    operations = 0;
  }
}
if (operations > 0) await batch.commit();
console.log(`Rounded public locations for ${updated} shout(s).`);
