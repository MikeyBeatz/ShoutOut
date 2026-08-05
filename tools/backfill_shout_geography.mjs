import { readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const apiKey = process.env.GOOGLE_MAPS_API_KEY;
if (!serviceAccountPath || !apiKey) {
  throw new Error(
    'Set FIREBASE_SERVICE_ACCOUNT_PATH and GOOGLE_MAPS_API_KEY.',
  );
}
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
if (serviceAccount.project_id !== 'shoutout-dev-46c81') {
  throw new Error('This development tool only supports shoutout-dev-46c81.');
}
initializeApp({ credential: cert(serviceAccount) });

const alphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
function geohash(latitude, longitude, precision = 7) {
  let lat = [-90, 90];
  let lng = [-180, 180];
  let even = true;
  let bit = 0;
  let character = 0;
  let result = '';
  while (result.length < precision) {
    const range = even ? lng : lat;
    const value = even ? longitude : latitude;
    const midpoint = (range[0] + range[1]) / 2;
    character = (character << 1) | (value >= midpoint ? 1 : 0);
    if (value >= midpoint) range[0] = midpoint;
    else range[1] = midpoint;
    even = !even;
    bit += 1;
    if (bit === 5) {
      result += alphabet[character];
      bit = 0;
      character = 0;
    }
  }
  return result;
}

function component(components, type) {
  return components.find((item) => item.types?.includes(type));
}

const db = getFirestore();
const snapshot = await db.collection('shouts').get();
let updated = 0;
for (const document of snapshot.docs) {
  const data = document.data();
  if (data.geography?.schemaVersion === 1 || !data.location) continue;
  const hash = data.geohash ?? geohash(
    data.location.latitude,
    data.location.longitude,
  );
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set(
    'latlng',
    `${data.location.latitude},${data.location.longitude}`,
  );
  url.searchParams.set('key', apiKey);
  url.searchParams.set(
    'result_type',
    'country|administrative_area_level_1|locality',
  );
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || payload.status !== 'OK' || !payload.results?.length) {
    console.warn(`Skipped ${document.id}: ${payload.status ?? response.status}`);
    continue;
  }
  const result = payload.results[0];
  const components = result.address_components ?? [];
  const country = component(components, 'country');
  const subdivision = component(components, 'administrative_area_level_1');
  const locality = component(components, 'locality') ??
    component(components, 'postal_town') ??
    component(components, 'administrative_area_level_2');
  const countryCode = country?.short_name?.toUpperCase() ?? null;
  const providerSubdivision = subdivision?.short_name?.toUpperCase() ?? null;
  await document.ref.update({
    geohash: hash,
    geography: {
      schemaVersion: 1,
      geohash: hash,
      countryCode,
      subdivisionCode: providerSubdivision?.startsWith(`${countryCode}-`)
        ? providerSubdivision
        : null,
      providerSubdivisionName: subdivision?.long_name ?? null,
      localityName: locality?.long_name ?? null,
      provider: 'google',
      providerPlaceId: result.place_id ?? null,
      resolvedAt: FieldValue.serverTimestamp(),
    },
  });
  updated += 1;
}
console.log(`Updated ${updated} shout geography documents.`);
