import { runActiveIdentityTransaction } from './identity_write_fence.mjs';

const requiredApplicationStrings = [
  'countryCode',
  'registrationNumber',
  'submittedCompanyName',
  'submittedAddress',
  'submittedCity',
  'submittedPostalCode',
  'initialLocationName',
  'initialLocationAddress',
  'initialLocationCountryCode',
  'initialLocationGeohash',
  'initialLocationProviderPlaceId',
  'contactEmail',
];

export function buildBusinessActivationWrites({ uid, authUser, application }) {
  if (!uid || authUser?.uid !== uid || application?.userId !== uid) {
    throw new Error('Authentication user and Business application UID must match.');
  }
  if (authUser.emailVerified !== true) {
    throw new Error('The Business contact email is not verified.');
  }
  const authEmail = normalizeEmail(authUser.email);
  const contactEmail = normalizeEmail(application.contactEmail);
  if (!authEmail || authEmail !== contactEmail) {
    throw new Error('Authentication email and Business contact email must match.');
  }
  if (application.status !== 'pending_email') {
    throw new Error(`Expected pending_email application, got ${application.status ?? 'missing'}.`);
  }
  for (const field of requiredApplicationStrings) {
    if (typeof application[field] !== 'string' || application[field].trim() === '') {
      throw new Error(`Business application field ${field} is missing.`);
    }
  }
  const location = application.initialLocation;
  if (!location || !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) || location.latitude < -90 ||
      location.latitude > 90 || location.longitude < -180 ||
      location.longitude > 180) {
    throw new Error('Business application has no valid initial location.');
  }
  if (!/^[A-Za-z]{2}$/.test(application.initialLocationCountryCode)) {
    throw new Error('Business application has an invalid branch country code.');
  }
  if (!/^[0-9b-hj-km-np-z]{7}$/.test(application.initialLocationGeohash)) {
    throw new Error('Business application has an invalid initial geohash.');
  }

  return {
    role: {
      role: 'business',
      level: 2,
      assignedBy: 'activate_business_application.mjs',
      moderationScope: { global: false, countries: [], subdivisions: [] },
    },
    profile: {
      displayName: application.submittedCompanyName.trim(),
      officialName: application.submittedCompanyName.trim(),
      registrationNumber: application.registrationNumber.trim(),
      vatId: '',
      countryCode: application.countryCode.trim().toUpperCase(),
      registryAddress: application.submittedAddress.trim(),
      billingCity: application.submittedCity.trim(),
      billingPostalCode: application.submittedPostalCode.trim(),
      billingEmail: contactEmail,
      status: 'active',
      activationMethod: 'manual_development',
    },
    location: {
      displayName: application.initialLocationName.trim(),
      address: application.initialLocationAddress.trim(),
      active: true,
      deleted: false,
      geocodingStatus: 'verified',
      location,
      geohash: application.initialLocationGeohash,
      providerPlaceId: application.initialLocationProviderPlaceId.trim(),
      countryCode: application.initialLocationCountryCode.trim().toUpperCase(),
    },
    applicationUpdate: {
      status: 'active',
      activationMethod: 'manual_development',
      activatedBy: 'activate_business_application.mjs',
    },
  };
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function activateBusinessAccount(db, authUser, serverTimestamp) {
  if (typeof serverTimestamp !== 'function') throw new Error('server-timestamp-factory-required');
  const uid = authUser?.uid;
  return runActiveIdentityTransaction(db, uid, async transaction => {
    const application = db.doc(`businessApplications/${uid}`);
    const role = db.doc(`accountRoles/${uid}`);
    const profile = db.doc(`businessProfiles/${uid}`);
    const location = profile.collection('locations').doc('initial');
    const [currentApplication, currentRole, currentProfile, currentLocation] = await transaction.getAll(
      application, role, profile, location,
    );
    if (!currentApplication.exists) throw new Error('Business application disappeared.');
    const writes = buildBusinessActivationWrites({ uid, authUser, application: currentApplication.data() });
    if (currentRole.exists && (currentRole.data().role !== 'business' || currentRole.data().level !== 2)) {
      throw new Error('Account already has a different privileged role.');
    }
    if (currentProfile.exists || currentLocation.exists) {
      throw new Error('Business profile or initial location already exists; refusing to overwrite it.');
    }
    const timestamp = serverTimestamp();
    if (!currentRole.exists) transaction.create(role, { ...writes.role, createdAt: timestamp });
    transaction.create(profile, { ...writes.profile, emailVerifiedAt: timestamp, createdAt: timestamp, updatedAt: timestamp });
    transaction.create(location, { ...writes.location, createdAt: timestamp, updatedAt: timestamp });
    transaction.update(application, { ...writes.applicationUpdate, activatedAt: timestamp });
  });
}
