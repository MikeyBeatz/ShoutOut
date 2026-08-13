import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildBusinessActivationWrites } from './business_activation.mjs';

const uid = 'business-user';
const authUser = { uid, email: 'Business@Example.com', emailVerified: true };
const application = {
  userId: uid,
  countryCode: 'cz',
  registrationNumber: '12345678',
  submittedCompanyName: 'Test Business s.r.o.',
  submittedAddress: 'Testovací 1',
  submittedCity: 'Praha',
  submittedPostalCode: '11000',
  initialLocationName: 'Centrum',
  initialLocationAddress: 'Václavské náměstí 1, Praha',
  initialLocationCountryCode: 'cz',
  initialLocation: { latitude: 50.081, longitude: 14.426 },
  initialLocationGeohash: 'u2fkbn0',
  initialLocationProviderPlaceId: 'geoapify-test-place',
  contactEmail: 'business@example.com',
  status: 'pending_email',
};

describe('Business activation writes', () => {
  test('builds an active profile, role and verified first branch', () => {
    const writes = buildBusinessActivationWrites({ uid, authUser, application });
    assert.equal(writes.role.role, 'business');
    assert.equal(writes.role.level, 2);
    assert.equal(writes.profile.status, 'active');
    assert.equal(writes.profile.billingEmail, 'business@example.com');
    assert.equal(writes.location.geocodingStatus, 'verified');
    assert.equal(writes.location.geohash, application.initialLocationGeohash);
    assert.equal(writes.applicationUpdate.status, 'active');
  });

  test('rejects an unverified or mismatched contact email', () => {
    assert.throws(
      () => buildBusinessActivationWrites({
        uid,
        authUser: { ...authUser, emailVerified: false },
        application,
      }),
      /not verified/,
    );
    assert.throws(
      () => buildBusinessActivationWrites({
        uid,
        authUser,
        application: { ...application, contactEmail: 'other@example.com' },
      }),
      /must match/,
    );
  });

  test('rejects invalid state and location data', () => {
    assert.throws(
      () => buildBusinessActivationWrites({
        uid,
        authUser,
        application: { ...application, status: 'active' },
      }),
      /Expected pending_email/,
    );
    assert.throws(
      () => buildBusinessActivationWrites({
        uid,
        authUser,
        application: { ...application, initialLocationGeohash: 'invalid' },
      }),
      /invalid initial geohash/,
    );
    assert.throws(
      () => buildBusinessActivationWrites({
        uid,
        authUser,
        application: {
          ...application,
          initialLocation: { latitude: 91, longitude: 14.426 },
        },
      }),
      /no valid initial location/,
    );
  });
});
