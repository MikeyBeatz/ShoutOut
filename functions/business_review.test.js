import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBusinessReview, validateBusinessFields, businessReviewEnabled } from './business_review.js';
import { GeoPoint } from 'firebase-admin/firestore';
import { encodeGeohash } from './geohash.js';
const fields = { countryCode: 'cz', registrationNumber: '12345', submittedCompanyName: 'Synthetic firm', submittedAddress: 'Synthetic 1', submittedCity: 'City', submittedPostalCode: '12345',
  initialLocationName: 'Branch', initialLocationAddress: 'Synthetic 2', initialLocationCity: '', initialLocationPostalCode: '', initialLocationCountryCode: 'cz', initialLocationProviderPlaceId: 'fixture',
  initialLocation: { latitude: 50.53, longitude: 14.13 } };
const input = { expectedUserId: 'admin', applicationId: 'applicant', expectedRevision: 0, decision: 'reject', note: ' Concrete reason ', idempotencyKey: 'fixture-key' };
test('approved DEV Business core is enabled and normalizes bounded fields/coordinates without trusting a client geohash', () => {
  assert.equal(businessReviewEnabled, true);
  const result = validateBusinessFields(fields); assert(result.initialLocation instanceof GeoPoint);
  assert.equal(result.countryCode, 'CZ'); assert.equal(result.initialLocationGeohash, encodeGeohash(50.53, 14.13));
  assert.equal(validateBusinessReview(input).note, 'Concrete reason');
});
test('role, audit, state and timestamp injection are rejected; self-admin decisions and foreign resubmit are invalid', () => {
  for (const patch of [{ role: 6 }, { status: 'active' }, { createdAt: 1 }, { audit: {} }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { decision: 'reject', note: ' ' },
    { decision: 'suspend', note: 'x'.repeat(501) }, { applicationId: 'admin' }, { decision: 'resubmit', application: fields }]) {
    assert.throws(() => validateBusinessReview({ ...input, ...patch }));
  }
});
test('resubmission cannot supply contact email, a role, server geohash, arbitrary branch data or malformed location', () => {
  for (const patch of [{ contactEmail: 'other@example.test' }, { role: 2 }, { initialLocationGeohash: 'u2xxxxx' }, { submittedCompanyName: 'x'.repeat(161) },
    { initialLocationName: 'x'.repeat(81) }, { initialLocation: { latitude: 91, longitude: 1 } }, { initialLocation: { latitude: 1, longitude: 1, authorId: 'other' } }]) {
    assert.throws(() => validateBusinessFields({ ...fields, ...patch }));
  }
});
