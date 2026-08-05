import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

initializeApp();

const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');

function component(components, type) {
  return components.find((item) => item.types?.includes(type));
}

function normalizedGeography(result, geohash) {
  const components = result.address_components ?? [];
  const country = component(components, 'country');
  const subdivision = component(components, 'administrative_area_level_1');
  const locality =
    component(components, 'locality') ??
    component(components, 'postal_town') ??
    component(components, 'administrative_area_level_2');
  const countryCode = country?.short_name?.toUpperCase() ?? null;
  const subdivisionShort = subdivision?.short_name?.toUpperCase() ?? null;

  return {
    schemaVersion: 1,
    geohash,
    countryCode,
    // Google often returns ISO 3166-2 here, but not in every country. Keep
    // non-ISO values provider-specific instead of treating them as canonical.
    subdivisionCode:
      subdivisionShort?.startsWith(`${countryCode}-`) === true
        ? subdivisionShort
        : null,
    providerSubdivisionName: subdivision?.long_name ?? null,
    localityName: locality?.long_name ?? null,
    provider: 'google',
    providerPlaceId: result.place_id ?? null,
    resolvedAt: FieldValue.serverTimestamp(),
  };
}

export const enrichShoutGeography = onDocumentCreated(
  {
    document: 'shouts/{shoutId}',
    region: 'europe-west1',
    secrets: [googleMapsApiKey],
    retry: true,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    if (data.geography?.schemaVersion === 1) return;
    const location = data.location;
    const geohash = data.geohash;
    if (!location || typeof geohash !== 'string') return;

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${location.latitude},${location.longitude}`);
    url.searchParams.set('key', googleMapsApiKey.value());
    url.searchParams.set('result_type', 'country|administrative_area_level_1|locality');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.status === 'ZERO_RESULTS') {
      await snapshot.ref.update({
        geography: {
          schemaVersion: 1,
          geohash,
          provider: 'google',
          resolutionStatus: 'zeroResults',
          resolvedAt: FieldValue.serverTimestamp(),
        },
      });
      return;
    }
    if (payload.status !== 'OK' || !payload.results?.length) {
      throw new Error(`Geocoding failed: ${payload.status ?? 'unknown'}`);
    }
    await snapshot.ref.update({
      geography: normalizedGeography(payload.results[0], geohash),
    });
  },
);

export { normalizedGeography };
