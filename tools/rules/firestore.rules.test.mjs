import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  GeoPoint,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const projectId = 'shoutout-rules-test';
const legalDocument = 'acceptance_2026_07_25';
const now = () => Timestamp.fromMillis(Date.now());
const future = (milliseconds) =>
  Timestamp.fromMillis(Date.now() + milliseconds);

let testEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(
        new URL('../../firestore.rules', import.meta.url),
        'utf8',
      ),
    },
  });
});

describe('business registration', () => {
  const application = {
    userId: 'business-owner',
    countryCode: 'CZ',
    registrationNumber: '12345678',
    submittedCompanyName: 'Test Business s.r.o.',
    submittedAddress: 'Testovací 1',
    submittedCity: 'Praha',
    submittedPostalCode: '11000',
    initialLocationName: 'Centrum',
    initialLocationAddress: 'Václavské náměstí 1, Praha',
    initialLocationCity: 'Praha',
    initialLocationPostalCode: '11000',
    initialLocationCountryCode: 'CZ',
    initialLocation: new GeoPoint(50.081, 14.426),
    initialLocationGeohash: 'u2fkbn0',
    initialLocationProviderPlaceId: 'geoapify-test-place',
    contactEmail: 'business@example.com',
    status: 'pending_email',
    submittedAt: serverTimestamp(),
  };

  test('unverified owner can submit a pending application', async () => {
    const db = authenticatedDb('business-owner', {
      emailVerified: false,
      email: 'business@example.com',
    });
    await assertSucceeds(
      setDoc(doc(db, 'businessApplications', 'business-owner'), application),
    );
  });

  test('client cannot submit an application for another email or activate it', async () => {
    const db = authenticatedDb('business-owner', {
      emailVerified: false,
      email: 'business@example.com',
    });
    await assertFails(
      setDoc(doc(db, 'businessApplications', 'business-owner'), {
        ...application,
        contactEmail: 'other@example.com',
      }),
    );
    await assertFails(
      setDoc(doc(db, 'businessApplications', 'business-owner'), {
        ...application,
        status: 'active',
      }),
    );
  });

  test('application requires a validated initial business location', async () => {
    const db = authenticatedDb('business-owner', {
      emailVerified: false,
      email: 'business@example.com',
    });
    const { initialLocation, ...withoutLocation } = application;
    await assertFails(
      setDoc(
        doc(db, 'businessApplications', 'business-owner'),
        withoutLocation,
      ),
    );
    await assertFails(
      setDoc(doc(db, 'businessApplications', 'business-owner'), {
        ...application,
        initialLocationGeohash: 'invalid',
      }),
    );
  });
});

describe('business locations', () => {
  test('ordinary user can publish outside Litoměřice', async () => {
    await seedEligibleUser('rome-publisher', 'RomePublisher');
    await assertSucceeds(createShoutBatch(
      authenticatedDb('rome-publisher'),
      'rome-publisher',
      'RomePublisher',
      'ordinary-rome-shout',
      {
        location: new GeoPoint(41.90, 12.50),
        geohash: 'sr2yk3v',
      },
    ));
  });

  test('business owner can publish from a verified branch', async () => {
    await seedEligibleUser('business-publisher', 'BusinessPublisher');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'accountRoles', 'business-publisher'), {
        role: 'business', level: 2, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'businessProfiles', 'business-publisher'), {
        displayName: 'Test Business', status: 'active',
      });
      await setDoc(doc(
        db,
        'businessProfiles',
        'business-publisher',
        'locations',
        'usti',
      ), {
        displayName: 'Ústí nad Labem',
        address: 'Mírové náměstí 1, Ústí nad Labem',
        active: true,
        deleted: false,
        geocodingStatus: 'verified',
        location: new GeoPoint(50.6605659, 14.0402374),
        geohash: 'u31bpqr',
        providerPlaceId: 'geoapify-usti',
        countryCode: 'CZ',
        createdAt: now(),
        updatedAt: now(),
      });
    });
    const db = authenticatedDb('business-publisher');
    await assertFails(createShoutBatch(
      db,
      'business-publisher',
      'Test Business – Ústí nad Labem',
      'business-prefixed-name-shout',
      {
        businessLocationId: 'usti',
        businessAuthorFormat: 'branch',
        location: new GeoPoint(50.6605659, 14.0402374),
        geohash: 'u31bpqr',
        expiresAt: future(48 * 60 * 60 * 1000),
      },
    ));
    await assertSucceeds(createShoutBatch(
      db,
      'business-publisher',
      'Ústí nad Labem',
      'business-usti-shout',
      {
        businessLocationId: 'usti',
        businessAuthorFormat: 'branch',
        location: new GeoPoint(50.6605659, 14.0402374),
        geohash: 'u31bpqr',
        expiresAt: future(48 * 60 * 60 * 1000),
      },
    ));
  });

  test('business owner can create and pause a branch', async () => {
    await seedEligibleUser('business-owner', 'BusinessOwner');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'accountRoles', 'business-owner'), {
        role: 'business', level: 2, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'businessProfiles', 'business-owner'), {
        displayName: 'Test Business',
      });
    });
    const db = authenticatedDb('business-owner');
    const branch = doc(
      db,
      'businessProfiles',
      'business-owner',
      'locations',
      'litomerice',
    );
    await assertSucceeds(setDoc(branch, {
      displayName: 'Litoměřice',
      address: 'Mírové náměstí 1, Litoměřice',
      active: true,
      deleted: false,
      geocodingStatus: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(branch, {
      active: false,
      updatedAt: serverTimestamp(),
    }));
  });

  test('business Shout uses the selected branch rather than registered office', async () => {
    await seedEligibleUser('lovosice-publisher', 'LovosicePublisher');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'accountRoles', 'lovosice-publisher'), {
        role: 'business', level: 2, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'businessProfiles', 'lovosice-publisher'), {
        displayName: 'Pražská firma', status: 'active',
        billingAddress: 'Praha',
      });
      await setDoc(doc(
        db, 'businessProfiles', 'lovosice-publisher', 'locations', 'lovosice',
      ), {
        displayName: 'Lovosice', address: 'Václavské náměstí, Lovosice',
        active: true, deleted: false, geocodingStatus: 'verified',
        location: new GeoPoint(50.515, 14.051), geohash: 'u31b4bc',
        providerPlaceId: 'geoapify-lovosice', countryCode: 'CZ',
        createdAt: now(), updatedAt: now(),
      });
    });
    await assertSucceeds(createShoutBatch(
      authenticatedDb('lovosice-publisher'),
      'lovosice-publisher',
      'Lovosice',
      'business-lovosice-shout',
      {
        businessLocationId: 'lovosice',
        businessAuthorFormat: 'branch',
        location: new GeoPoint(50.515, 14.051),
        geohash: 'u31b4bc',
      },
    ));
  });

  test('paused, deleted or unverified branch cannot publish', async () => {
    await seedEligibleUser('blocked-branch', 'BlockedBranch');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'accountRoles', 'blocked-branch'), {
        role: 'business', level: 2, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'businessProfiles', 'blocked-branch'), {
        displayName: 'Blocked Business', status: 'active',
      });
      for (const [id, active, deleted, status] of [
        ['paused', false, false, 'verified'],
        ['deleted', true, true, 'verified'],
        ['pending', true, false, 'pending'],
      ]) {
        await setDoc(doc(
          db, 'businessProfiles', 'blocked-branch', 'locations', id,
        ), {
          displayName: id, address: id, active, deleted,
          geocodingStatus: status, location: new GeoPoint(50.66, 14.04),
          geohash: 'u31bpqr', providerPlaceId: `place-${id}`,
          countryCode: 'CZ', createdAt: now(), updatedAt: now(),
        });
      }
    });
    for (const id of ['paused', 'deleted', 'pending']) {
      await assertFails(createShoutBatch(
        authenticatedDb('blocked-branch'),
        'blocked-branch',
        `Blocked Business – ${id}`,
        `blocked-${id}-shout`,
        {
          businessLocationId: id,
          businessAuthorFormat: 'branch',
          location: new GeoPoint(50.66, 14.04),
          geohash: 'u31bpqr',
        },
      ));
    }
  });

  test('ordinary user cannot create a business branch', async () => {
    await seedEligibleUser('ordinary', 'OrdinaryUser');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'businessProfiles', 'ordinary'), {
        displayName: 'Fake Business',
      });
    });
    const db = authenticatedDb('ordinary');
    await assertFails(setDoc(
      doc(db, 'businessProfiles', 'ordinary', 'locations', 'fake'),
      {
        displayName: 'Fake', address: 'Fake address', active: true,
        deleted: false, geocodingStatus: 'pending',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      },
    ));
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

after(async () => {
  await testEnvironment.cleanup();
});

function authenticatedDb(
  uid,
  { emailVerified = true, email = `${uid}@example.com` } = {},
) {
  return testEnvironment
    .authenticatedContext(uid, {
      email,
      email_verified: emailVerified,
    })
    .firestore();
}

async function seedEligibleUser(uid, nickname = `User_${uid}`) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', uid), {
      nickname,
      nicknameLower: nickname.toLowerCase(),
      createdAt: now(),
      nicknameChangedAt: now(),
      nicknameChangeCount: 0,
      emailVerified: true,
      language: 'cs',
      themeMode: 'system',
      showOnboardingHelp: false,
      avatarId: 'fox',
      avatarBackgroundStart: 'teal',
      avatarBackgroundEnd: 'navy',
      avatarGradientDirection: 'diagonal',
    });
    await setDoc(doc(db, 'publicProfiles', uid), {
      nickname,
      avatarId: 'fox',
      avatarBackgroundStart: 'teal',
      avatarBackgroundEnd: 'navy',
      avatarGradientDirection: 'diagonal',
    });
    await setDoc(doc(db, 'users', uid, 'legal', legalDocument), {
      termsVersion: '2026-07-25',
      privacyVersion: '2026-07-25',
      communityRulesVersion: '2026-07-25',
      ageConfirmed: true,
      acceptedAt: now(),
      acceptedLanguage: 'cs',
    });
  });
}

async function seedShout({
  id = 'shout-1',
  authorId = 'author',
  authorNickname = 'Author',
  commentsCount = 0,
  countryCode,
} = {}) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'shouts', id), {
      authorId,
      authorNickname,
      title: 'Bezpečný test',
      text: 'Obsah testovacího Shoutu.',
      categories: ['Obecné'],
      location: new GeoPoint(50.54, 14.13),
      geohash: 'u2fkbnh',
      ...(countryCode ? {
        geography: {
          schemaVersion: 1,
          geohash: 'u2fkbnh',
          countryCode,
        },
      } : {}),
      createdAt: now(),
      expiresAt: future(2 * 60 * 60 * 1000),
      status: 'active',
      likesCount: 0,
      dislikesCount: 0,
      commentsCount,
      savesCount: 0,
    });
  });
}

function rateData(eventId, { count = 1, windowStartedAt } = {}) {
  return {
    lastAt: serverTimestamp(),
    lastEventId: eventId,
    windowStartedAt: windowStartedAt ?? serverTimestamp(),
    count,
  };
}

function shoutData(uid, nickname, overrides = {}) {
  return {
    authorId: uid,
    authorNickname: nickname,
    avatarId: 'fox',
    avatarBackgroundStart: 'teal',
    avatarBackgroundEnd: 'navy',
    avatarGradientDirection: 'diagonal',
    title: 'Nový Shout',
    text: 'Text bezpečného testovacího Shoutu.',
    categories: ['Obecné'],
    location: new GeoPoint(50.54, 14.13),
    geohash: 'u2fkbnh',
    createdAt: serverTimestamp(),
    expiresAt: future(2 * 60 * 60 * 1000),
    status: 'active',
    likesCount: 0,
    dislikesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    ...overrides,
  };
}

async function createShoutBatch(db, uid, nickname, shoutId, overrides = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'rateLimits', uid, 'actions', 'shout'), rateData(shoutId));
  batch.set(doc(db, 'shouts', shoutId), shoutData(uid, nickname, overrides));
  return batch.commit();
}

describe('identity and account gates', () => {
  test('verified onboarding can accept legal terms and create profile atomically', async () => {
    const db = authenticatedDb('new-user');
    await assertSucceeds(
      setDoc(doc(db, 'users', 'new-user', 'legal', legalDocument), {
        termsVersion: '2026-07-25',
        privacyVersion: '2026-07-25',
        communityRulesVersion: '2026-07-25',
        ageConfirmed: true,
        acceptedAt: serverTimestamp(),
        acceptedLanguage: 'cs',
      }),
    );

    const batch = writeBatch(db);
    batch.set(doc(db, 'nicknames', 'newuser'), {
      uid: 'new-user',
      nickname: 'NewUser',
      nicknameLower: 'newuser',
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', 'new-user'), {
      nickname: 'NewUser',
      nicknameLower: 'newuser',
      createdAt: serverTimestamp(),
      nicknameChangedAt: serverTimestamp(),
      nicknameChangeCount: 0,
      emailVerified: true,
      language: 'cs',
      themeMode: 'system',
      showOnboardingHelp: true,
      avatarId: 'fox',
      avatarBackgroundStart: 'teal',
      avatarBackgroundEnd: 'navy',
      avatarGradientDirection: 'diagonal',
    });
    batch.set(doc(db, 'publicProfiles', 'new-user'), {
      nickname: 'NewUser',
      avatarId: 'fox',
      avatarBackgroundStart: 'teal',
      avatarBackgroundEnd: 'navy',
      avatarGradientDirection: 'diagonal',
    });
    await assertSucceeds(batch.commit());
  });

  test('user can update a complete valid avatar style', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    const db = authenticatedDb('reader');
    const batch = writeBatch(db);
    const avatar = {
      avatarId: 'owl', avatarBackgroundStart: 'purple',
      avatarBackgroundEnd: 'gold', avatarGradientDirection: 'vertical',
    };
    batch.update(doc(db, 'users', 'reader'), avatar);
    batch.set(doc(db, 'publicProfiles', 'reader'), {
      nickname: 'SafeReader', ...avatar,
    });
    await assertSucceeds(batch.commit());
  });

  test('avatar style accepts identical colors but rejects unknown directions', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    const db = authenticatedDb('reader');
    const profile = doc(db, 'users', 'reader');
    const allowed = writeBatch(db);
    allowed.update(profile, {
      avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'teal',
    });
    allowed.set(doc(db, 'publicProfiles', 'reader'), {
      nickname: 'SafeReader', avatarId: 'fox',
      avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'teal',
      avatarGradientDirection: 'diagonal',
    });
    await assertSucceeds(allowed.commit());
    await assertFails(
      updateDoc(profile, {
        avatarGradientDirection: 'reverse-diagonal',
      }),
    );
  });

  test('public profile exposes current identity but cannot be spoofed', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await seedEligibleUser('other', 'SafeOther');
    const db = authenticatedDb('reader');
    await assertSucceeds(getDoc(doc(db, 'publicProfiles', 'other')));
    await assertFails(setDoc(doc(db, 'publicProfiles', 'other'), {
      nickname: 'Impostor', avatarId: 'owl',
      avatarBackgroundStart: 'purple', avatarBackgroundEnd: 'gold',
      avatarGradientDirection: 'vertical',
    }));
    await assertFails(updateDoc(doc(db, 'publicProfiles', 'reader'), {
      avatarId: 'owl',
    }));
  });

  test('profile accepts the new languages and rejects unknown language codes', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    const profile = doc(authenticatedDb('reader'), 'users', 'reader');
    for (const language of ['sk', 'uk', 'vi']) {
      await assertSucceeds(updateDoc(profile, { language }));
    }
    await assertFails(updateDoc(profile, { language: 'fr' }));
  });

  test('user can permanently dismiss onboarding but cannot enable it again', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', 'reader'), {
        showOnboardingHelp: true,
      });
    });
    const profile = doc(authenticatedDb('reader'), 'users', 'reader');
    await assertSucceeds(updateDoc(profile, { showOnboardingHelp: false }));
    await assertFails(updateDoc(profile, { showOnboardingHelp: true }));
  });

  test('user can select a supported theme mode', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    const profile = doc(authenticatedDb('reader'), 'users', 'reader');
    await assertSucceeds(updateDoc(profile, { themeMode: 'dark' }));
    await assertSucceeds(updateDoc(profile, { themeMode: 'light' }));
    await assertFails(updateDoc(profile, { themeMode: 'midnight' }));
  });

  test('eligible user can create a rate-limited bug report', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    const db = authenticatedDb('reader');
    const reportId = 'bug-report-1';
    const batch = writeBatch(db);
    batch.set(doc(db, 'rateLimits', 'reader', 'actions', 'report'), {
      lastAt: serverTimestamp(),
      lastEventId: `bug_${reportId}`,
      windowStartedAt: serverTimestamp(),
      count: 1,
    });
    batch.set(doc(db, 'bugReports', reportId), {
      userId: 'reader',
      description: 'The profile page does not open correctly.',
      createdAt: serverTimestamp(),
      expiresAt: future(60 * 24 * 60 * 60 * 1000),
      status: 'open',
      screenshotPath: null,
      screenshotContentType: null,
      screenshotSize: null,
    });
    await assertSucceeds(batch.commit());
  });

  test('unverified onboarding cannot forge an email-verified profile', async () => {
    const db = authenticatedDb('new-user', { emailVerified: false });
    await assertFails(
      setDoc(doc(db, 'users', 'new-user', 'legal', legalDocument), {
        termsVersion: '2026-07-25',
        privacyVersion: '2026-07-25',
        communityRulesVersion: '2026-07-25',
        ageConfirmed: true,
        acceptedAt: serverTimestamp(),
        acceptedLanguage: 'cs',
      }),
    );
  });

  test('eligible verified user can read a limited feed', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await seedShout();
    const db = authenticatedDb('reader');
    await assertSucceeds(
      getDocs(query(collection(db, 'shouts'), limit(50))),
    );
  });

  test('unverified email cannot read content even with a forged profile flag', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await seedShout();
    const db = authenticatedDb('reader', { emailVerified: false });
    await assertFails(getDoc(doc(db, 'shouts', 'shout-1')));
  });

  test('missing legal acceptance blocks content access', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'reader'), {
        nickname: 'SafeReader',
        nicknameLower: 'safereader',
        emailVerified: true,
      });
    });
    await seedShout();
    await assertFails(
      getDoc(doc(authenticatedDb('reader'), 'shouts', 'shout-1')),
    );
  });

  test('active ban blocks writes and an expired ban does not', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'bans', 'writer'), {
        userId: 'writer',
        reason: 'test',
        createdAt: now(),
        expiresAt: null,
        moderatorId: 'moderator',
      });
    });
    const db = authenticatedDb('writer');
    await assertFails(createShoutBatch(db, 'writer', 'SafeWriter', 'blocked'));

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'bans', 'writer'), {
        expiresAt: Timestamp.fromMillis(Date.now() - 1000),
      });
    });
    await assertSucceeds(
      createShoutBatch(db, 'writer', 'SafeWriter', 'after-ban'),
    );
  });

  test('pending account deletion blocks content writes', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'accountDeletionRequests', 'writer'),
        {
          userId: 'writer',
          email: 'writer@example.com',
          requestedAt: now(),
          retainUntil: future(60 * 24 * 60 * 60 * 1000),
          status: 'pending',
        },
      );
    });
    await assertFails(
      createShoutBatch(
        authenticatedDb('writer'),
        'writer',
        'SafeWriter',
        'deleted-user',
      ),
    );
  });

  test('content restriction blocks creating content until it expires', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'contentRestrictions', 'writer'), {
        userId: 'writer',
        reason: 'test',
        createdAt: now(),
        expiresAt: future(24 * 60 * 60 * 1000),
        moderatorId: 'moderator',
        sanctionId: 'sanction-1',
      });
    });
    const db = authenticatedDb('writer');
    await assertFails(
      createShoutBatch(db, 'writer', 'SafeWriter', 'restricted'),
    );

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(
        doc(context.firestore(), 'contentRestrictions', 'writer'),
        { expiresAt: Timestamp.fromMillis(Date.now() - 1000) },
      );
    });
    await assertSucceeds(
      createShoutBatch(db, 'writer', 'SafeWriter', 'restriction-expired'),
    );
  });
});

describe('bounded reads', () => {
  test('feed query without a limit is rejected', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await assertFails(getDocs(collection(authenticatedDb('reader'), 'shouts')));
  });

  test('feed query above the maximum is rejected', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    const db = authenticatedDb('reader');
    await assertFails(getDocs(query(collection(db, 'shouts'), limit(51))));
  });

  test('comment query requires a limit', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await seedShout();
    const db = authenticatedDb('reader');
    await assertFails(
      getDocs(collection(db, 'shouts', 'shout-1', 'comments')),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'shouts', 'shout-1', 'comments'),
          limit(50),
        ),
      ),
    );
  });
});

describe('notifications and preferences', () => {
  test('notification preferences include every supported category', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    const reference = doc(
      authenticatedDb('reader'),
      'users',
      'reader',
      'settings',
      'notifications',
    );
    await assertSucceeds(setDoc(reference, {
      replies: true,
      reactions: true,
      privateReplies: true,
      followedProfiles: true,
      nearbyShouts: false,
    }));
    await assertFails(setDoc(reference, {
      replies: true,
      reactions: true,
      nearbyShouts: true,
    }));
  });

  test('only the recipient reads and marks server notifications as read', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await seedEligibleUser('other', 'SafeOther');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'users', 'reader', 'notifications', 'n1'),
        {
          kind: 'reaction',
          actorId: 'other',
          actorNickname: 'SafeOther',
          targetShoutId: 'shout-1',
          createdAt: now(),
          readAt: null,
        },
      );
    });
    const readerReference = doc(
      authenticatedDb('reader'),
      'users',
      'reader',
      'notifications',
      'n1',
    );
    await assertSucceeds(getDoc(readerReference));
    await assertFails(getDoc(doc(
      authenticatedDb('other'),
      'users',
      'reader',
      'notifications',
      'n1',
    )));
    await assertSucceeds(updateDoc(readerReference, {readAt: serverTimestamp()}));
    await assertFails(updateDoc(readerReference, {kind: 'comment'}));
    await assertFails(setDoc(
      doc(
        authenticatedDb('reader'),
        'users',
        'reader',
        'notifications',
        'client-created',
      ),
      {kind: 'reaction', createdAt: serverTimestamp(), readAt: null},
    ));
  });
});

describe('Shout validation and rate limiting', () => {
  test('valid Shout and its matching rate record are created atomically', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    await assertSucceeds(
      createShoutBatch(
        authenticatedDb('writer'),
        'writer',
        'SafeWriter',
        'valid-shout',
      ),
    );
  });

  test('Shout without a rate record is rejected', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    const db = authenticatedDb('writer');
    await assertFails(
      setDoc(
        doc(db, 'shouts', 'no-rate'),
        shoutData('writer', 'SafeWriter'),
      ),
    );
  });

  test('spoofed nickname, unknown fields and invalid categories are rejected', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    const db = authenticatedDb('writer');
    await assertFails(
      createShoutBatch(db, 'writer', 'Impostor', 'spoofed-nickname'),
    );
    await assertFails(
      createShoutBatch(db, 'writer', 'SafeWriter', 'extra-field', {
        admin: true,
      }),
    );
    await assertFails(
      createShoutBatch(db, 'writer', 'SafeWriter', 'bad-category', {
        categories: ['Neznámá'],
      }),
    );
    await assertFails(
      createShoutBatch(db, 'writer', 'SafeWriter', 'too-short', {
        expiresAt: future(2 * 60 * 1000),
      }),
    );
    await assertFails(
      createShoutBatch(db, 'writer', 'SafeWriter', 'too-long', {
        expiresAt: future(25 * 60 * 60 * 1000),
      }),
    );
  });

  test('one rate event cannot authorize multiple Shouts in a batch', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    const db = authenticatedDb('writer');
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'rateLimits', 'writer', 'actions', 'shout'),
      rateData('first'),
    );
    batch.set(
      doc(db, 'shouts', 'first'),
      shoutData('writer', 'SafeWriter'),
    );
    batch.set(
      doc(db, 'shouts', 'second'),
      shoutData('writer', 'SafeWriter'),
    );
    await assertFails(batch.commit());
  });

  test('cooldown rejects an immediate second Shout', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    const db = authenticatedDb('writer');
    await assertSucceeds(
      createShoutBatch(db, 'writer', 'SafeWriter', 'first'),
    );
    const rateSnapshot = await getDoc(
      doc(db, 'rateLimits', 'writer', 'actions', 'shout'),
    );
    const batch = writeBatch(db);
    batch.set(doc(db, 'rateLimits', 'writer', 'actions', 'shout'), {
      ...rateData('second', {
        count: 2,
        windowStartedAt: rateSnapshot.data().windowStartedAt,
      }),
    });
    batch.set(
      doc(db, 'shouts', 'second'),
      shoutData('writer', 'SafeWriter'),
    );
    await assertFails(batch.commit());
  });

  test('daily Shout maximum is enforced even after the cooldown', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    const oldWindowStart = Timestamp.fromMillis(
      Date.now() - 60 * 60 * 1000,
    );
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          'rateLimits',
          'writer',
          'actions',
          'shout',
        ),
        {
          lastAt: Timestamp.fromMillis(Date.now() - 3 * 60 * 1000),
          lastEventId: 'previous',
          windowStartedAt: oldWindowStart,
          count: 50,
        },
      );
    });
    const db = authenticatedDb('writer');
    const batch = writeBatch(db);
    batch.set(doc(db, 'rateLimits', 'writer', 'actions', 'shout'), {
      lastAt: serverTimestamp(),
      lastEventId: 'over-limit',
      windowStartedAt: oldWindowStart,
      count: 51,
    });
    batch.set(
      doc(db, 'shouts', 'over-limit'),
      shoutData('writer', 'SafeWriter'),
    );
    await assertFails(batch.commit());
  });
});

describe('technical error log access', () => {
  test('eligible user can create only a short-lived own technical error', async () => {
    await seedEligibleUser('error-writer', 'ErrorWriter');
    const ownLog = {
      userId: 'error-writer', action: 'publish_shout', code: 'permission-denied',
      message: 'Safe diagnostic message', createdAt: serverTimestamp(),
      expiresAt: future(60 * 24 * 60 * 60 * 1000),
    };
    await assertSucceeds(setDoc(doc(
      authenticatedDb('error-writer'), 'clientErrorLogs', 'valid-error',
    ), ownLog));
    await assertFails(setDoc(doc(
      authenticatedDb('error-writer'), 'clientErrorLogs', 'forged-error',
    ), { ...ownLog, userId: 'another-user' }));
    await assertFails(setDoc(doc(
      authenticatedDb('error-writer'), 'clientErrorLogs', 'long-lived-error',
    ), { ...ownLog, expiresAt: future(90 * 24 * 60 * 60 * 1000) }));
  });

  test('only administrator and owner can read technical errors', async () => {
    for (const [uid, role, level] of [
      ['moderator-errors', 'moderator', 3],
      ['senior-errors', 'seniorModerator', 4],
      ['admin-errors', 'administrator', 5],
      ['owner-errors', 'owner', 6],
    ]) {
      await seedEligibleUser(uid, uid);
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'accountRoles', uid), {
          role, level, createdAt: now(), assignedBy: 'test',
        });
      });
    }
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'clientErrorLogs', 'error-1'), {
        userId: 'writer', action: 'publish_shout', code: 'denied',
        message: 'Test error', createdAt: now(),
      });
    });
    await assertFails(getDoc(doc(
      authenticatedDb('moderator-errors'), 'clientErrorLogs', 'error-1',
    )));
    await assertFails(getDoc(doc(
      authenticatedDb('senior-errors'), 'clientErrorLogs', 'error-1',
    )));
    await assertSucceeds(getDoc(doc(
      authenticatedDb('admin-errors'), 'clientErrorLogs', 'error-1',
    )));
    await assertSucceeds(getDoc(doc(
      authenticatedDb('owner-errors'), 'clientErrorLogs', 'error-1',
    )));
  });

  test('only administrator and owner can create immutable access audit', async () => {
    for (const [uid, role, level] of [
      ['moderator-audit', 'moderator', 3],
      ['admin-audit', 'administrator', 5],
      ['owner-audit', 'owner', 6],
    ]) {
      await seedEligibleUser(uid, uid);
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'accountRoles', uid), {
          role, level, createdAt: now(), assignedBy: 'test',
        });
      });
    }
    const audit = (uid, role) => ({
      userId: uid, role, action: 'view_client_error_logs',
      createdAt: serverTimestamp(),
      expiresAt: future(60 * 24 * 60 * 60 * 1000),
    });
    await assertFails(setDoc(doc(
      authenticatedDb('moderator-audit'), 'technicalLogAccessAudits', 'mod',
    ), audit('moderator-audit', 'moderator')));
    await assertSucceeds(setDoc(doc(
      authenticatedDb('admin-audit'), 'technicalLogAccessAudits', 'admin',
    ), audit('admin-audit', 'administrator')));
    await assertSucceeds(setDoc(doc(
      authenticatedDb('owner-audit'), 'technicalLogAccessAudits', 'owner',
    ), audit('owner-audit', 'owner')));
    await assertFails(setDoc(doc(
      authenticatedDb('admin-audit'), 'technicalLogAccessAudits', 'forged',
    ), audit('owner-audit', 'owner')));
  });
});

describe('following profiles', () => {
  test('user can follow a public profile but not self or blocked profile', async () => {
    await seedEligibleUser('follower', 'Follower');
    await seedEligibleUser('followed', 'Followed');
    const validFollow = {
      targetUserId: 'followed', createdAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(
      authenticatedDb('follower'), 'users', 'follower', 'following', 'followed',
    ), validFollow));
    await assertFails(setDoc(doc(
      authenticatedDb('follower'), 'users', 'follower', 'following', 'follower',
    ), { targetUserId: 'follower', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(
      authenticatedDb('followed'), 'users', 'follower', 'following', 'followed',
    ), validFollow));
    await setDoc(doc(
      authenticatedDb('follower'), 'users', 'follower', 'blocked', 'followed',
    ), { createdAt: serverTimestamp() });
    await assertSucceeds(deleteDoc(doc(
      authenticatedDb('follower'), 'users', 'follower', 'following', 'followed',
    )));
    await assertFails(setDoc(doc(
      authenticatedDb('follower'), 'users', 'follower', 'following', 'followed',
    ), validFollow));
  });

  test('account report identifies reporter and cannot target self', async () => {
    await seedEligibleUser('account-reporter', 'AccountReporter');
    await seedEligibleUser('reported-account', 'ReportedAccount');
    const report = {
      reporterId: 'account-reporter', targetUserId: 'reported-account',
      reason: 'Spam profile', status: 'open', createdAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(
      authenticatedDb('account-reporter'), 'accountReports',
      'account-reporter_reported-account',
    ), report));
    await assertFails(setDoc(doc(
      authenticatedDb('account-reporter'), 'accountReports', 'forged-report',
    ), { ...report, reporterId: 'reported-account' }));
    await assertFails(setDoc(doc(
      authenticatedDb('account-reporter'), 'accountReports', 'self-report',
    ), { ...report, targetUserId: 'account-reporter' }));
  });
});

describe('comments, reactions, saves and reports', () => {
  test('comment creation requires an atomic parent counter increment', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    await seedEligibleUser('author', 'ShoutAuthor');
    await seedShout({ authorId: 'author', authorNickname: 'ShoutAuthor' });
    const db = authenticatedDb('writer');
    const commentId = 'comment-1';
    const comment = {
      authorId: 'writer',
      authorNickname: 'SafeWriter',
      text: 'Bezpečný komentář',
      createdAt: serverTimestamp(),
      likesCount: 0,
      dislikesCount: 0,
    };

    const invalidBatch = writeBatch(db);
    invalidBatch.set(
      doc(db, 'rateLimits', 'writer', 'actions', 'comment'),
      rateData(commentId),
    );
    invalidBatch.set(
      doc(db, 'shouts', 'shout-1', 'comments', commentId),
      comment,
    );
    await assertFails(invalidBatch.commit());

    const validBatch = writeBatch(db);
    validBatch.set(
      doc(db, 'rateLimits', 'writer', 'actions', 'comment'),
      rateData(commentId),
    );
    validBatch.set(
      doc(db, 'shouts', 'shout-1', 'comments', commentId),
      comment,
    );
    validBatch.update(doc(db, 'shouts', 'shout-1'), { commentsCount: 1 });
    await assertSucceeds(validBatch.commit());
  });

  test('reaction updates both the reaction and trusted count', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await seedEligibleUser('reader2', 'SafeReaderTwo');
    await seedEligibleUser('author', 'ShoutAuthor');
    await seedShout({ authorId: 'author', authorNickname: 'ShoutAuthor' });
    const db = authenticatedDb('reader');
    const eventId = 'shoutReaction_shout-1';
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'rateLimits', 'reader', 'actions', 'interaction'),
      rateData(eventId),
    );
    batch.set(doc(db, 'shouts', 'shout-1', 'reactions', 'reader'), {
      type: 'like',
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'shouts', 'shout-1'), { likesCount: 1 });
    batch.set(
      doc(
        db,
        'users',
        'author',
        'notifications',
        'reaction_like_shout-1',
      ),
      {
        kind: 'reaction',
        actorId: 'reader',
        actorNickname: 'SafeReader',
        targetShoutId: 'shout-1',
        targetTitle: 'Bezpečný test',
        reactionType: 'like',
        eventCount: 1,
        createdAt: serverTimestamp(),
        readAt: null,
      },
    );
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(
      authenticatedDb('author'),
      'users',
      'author',
      'notifications',
      'reaction_like_shout-1',
    )));

    const secondDb = authenticatedDb('reader2');
    const secondBatch = writeBatch(secondDb);
    secondBatch.set(
      doc(secondDb, 'rateLimits', 'reader2', 'actions', 'interaction'),
      rateData(eventId),
    );
    secondBatch.set(doc(secondDb, 'shouts', 'shout-1', 'reactions', 'reader2'), {
      type: 'like', updatedAt: serverTimestamp(),
    });
    secondBatch.update(doc(secondDb, 'shouts', 'shout-1'), { likesCount: 2 });
    secondBatch.set(
      doc(secondDb, 'users', 'author', 'notifications', 'reaction_like_shout-1'),
      {
        kind: 'reaction', actorId: 'reader2', actorNickname: 'SafeReaderTwo',
        targetShoutId: 'shout-1', targetTitle: 'Bezpečný test',
        reactionType: 'like', eventCount: 2,
        createdAt: serverTimestamp(), readAt: null,
      },
    );
    await assertSucceeds(secondBatch.commit());
    const aggregate = await getDoc(doc(
      authenticatedDb('author'), 'users', 'author', 'notifications',
      'reaction_like_shout-1',
    ));
    assert.equal(aggregate.data().eventCount, 2);
    assert.equal(aggregate.data().actorNickname, 'SafeReaderTwo');
  });

  test('comments, replies, private replies and comment reactions create trusted notifications', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    await seedEligibleUser('author', 'ShoutAuthor');
    await seedEligibleUser('commenter', 'SafeCommenter');
    await seedShout({ authorId: 'author', authorNickname: 'ShoutAuthor' });
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'shouts', 'shout-1', 'comments', 'parent'),
        {
          authorId: 'commenter', authorNickname: 'SafeCommenter',
          text: 'Parent', createdAt: now(), likesCount: 0, dislikesCount: 0,
        },
      );
    });

    const db = authenticatedDb('writer');
    const commentBatch = writeBatch(db);
    commentBatch.set(
      doc(db, 'rateLimits', 'writer', 'actions', 'comment'),
      rateData('comment-notified'),
    );
    commentBatch.set(
      doc(db, 'shouts', 'shout-1', 'comments', 'comment-notified'),
      {
        authorId: 'writer', authorNickname: 'SafeWriter', text: 'Reply',
        createdAt: serverTimestamp(), likesCount: 0, dislikesCount: 0,
        replyToCommentId: 'parent', replyToNickname: 'SafeCommenter',
      },
    );
    commentBatch.update(doc(db, 'shouts', 'shout-1'), { commentsCount: 1 });
    commentBatch.set(
      doc(db, 'users', 'author', 'notifications', 'comment_shout-1'),
      {
        kind: 'comment', actorId: 'writer', actorNickname: 'SafeWriter',
        targetShoutId: 'shout-1', targetTitle: 'Bezpečný test',
        targetCommentId: 'comment-notified', eventCount: 1,
        createdAt: serverTimestamp(), readAt: null,
      },
    );
    commentBatch.set(
      doc(db, 'users', 'commenter', 'notifications', 'reply_shout-1'),
      {
        kind: 'reply', actorId: 'writer', actorNickname: 'SafeWriter',
        targetShoutId: 'shout-1', targetTitle: 'Bezpečný test',
        targetCommentId: 'comment-notified', parentCommentId: 'parent',
        eventCount: 1, createdAt: serverTimestamp(), readAt: null,
      },
    );
    await assertSucceeds(commentBatch.commit());

    const privateBatch = writeBatch(db);
    privateBatch.set(
      doc(db, 'rateLimits', 'writer', 'actions', 'privateReply'),
      rateData('private-1'),
    );
    privateBatch.set(
      doc(db, 'shouts', 'shout-1', 'privateReplies', 'private-1'),
      {
        authorId: 'writer', authorNickname: 'SafeWriter', recipientId: 'author',
        recipientNickname: 'ShoutAuthor', participants: ['writer', 'author'],
        text: 'Private', createdAt: serverTimestamp(), targetType: 'shout',
      },
    );
    privateBatch.set(
      doc(db, 'users', 'author', 'notifications', 'privateReply_shout-1'),
      {
        kind: 'privateReply', actorId: 'writer', actorNickname: 'SafeWriter',
        targetShoutId: 'shout-1', targetTitle: 'Bezpečný test',
        targetPrivateReplyId: 'private-1', eventCount: 1,
        createdAt: serverTimestamp(), readAt: null,
      },
    );
    await assertSucceeds(privateBatch.commit());

    const reactionBatch = writeBatch(db);
    reactionBatch.set(
      doc(db, 'rateLimits', 'writer', 'actions', 'interaction'),
      rateData('commentReaction_shout-1_parent'),
    );
    reactionBatch.set(
      doc(db, 'shouts', 'shout-1', 'comments', 'parent', 'reactions', 'writer'),
      { type: 'like', updatedAt: serverTimestamp() },
    );
    reactionBatch.update(
      doc(db, 'shouts', 'shout-1', 'comments', 'parent'),
      { likesCount: 1, dislikesCount: 0 },
    );
    reactionBatch.set(
      doc(db, 'users', 'commenter', 'notifications',
        'commentReaction_like_shout-1_parent'),
      {
        kind: 'commentReaction', actorId: 'writer', actorNickname: 'SafeWriter',
        targetShoutId: 'shout-1', targetTitle: 'Bezpečný test',
        targetCommentId: 'parent', reactionType: 'like', eventCount: 1,
        createdAt: serverTimestamp(), readAt: null,
      },
    );
    await assertSucceeds(reactionBatch.commit());
  });

  test('reaction and save collections cannot be enumerated', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await seedShout();
    const db = authenticatedDb('reader');
    await assertFails(
      getDocs(collection(db, 'shouts', 'shout-1', 'reactions')),
    );
    await assertFails(
      getDocs(collection(db, 'shouts', 'shout-1', 'saves')),
    );
  });

  test('report ID is deterministic and users cannot report their own Shout', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await seedEligibleUser('author', 'ShoutAuthor');
    await seedShout({ authorId: 'author', authorNickname: 'ShoutAuthor' });
    const db = authenticatedDb('reader');
    const reportId = 'reader_shout-1';
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'rateLimits', 'reader', 'actions', 'report'),
      rateData(reportId),
    );
    batch.set(doc(db, 'reports', reportId), {
      reporterId: 'reader',
      shoutId: 'shout-1',
      reason: 'Spam',
      createdAt: serverTimestamp(),
      status: 'open',
    });
    await assertSucceeds(batch.commit());

    const authorDb = authenticatedDb('author');
    const ownReportId = 'author_shout-1';
    const ownBatch = writeBatch(authorDb);
    ownBatch.set(
      doc(authorDb, 'rateLimits', 'author', 'actions', 'report'),
      rateData(ownReportId),
    );
    ownBatch.set(doc(authorDb, 'reports', ownReportId), {
      reporterId: 'author',
      shoutId: 'shout-1',
      reason: 'Vlastní obsah',
      createdAt: serverTimestamp(),
      status: 'open',
    });
    await assertFails(ownBatch.commit());
  });

  test('comment deletion requires its parent counter decrement', async () => {
    await seedEligibleUser('writer', 'SafeWriter');
    await seedShout({
      authorId: 'writer',
      authorNickname: 'SafeWriter',
      commentsCount: 1,
    });
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'shouts', 'shout-1', 'comments', 'mine'),
        {
          authorId: 'writer',
          authorNickname: 'SafeWriter',
          text: 'Komentář',
          createdAt: now(),
          likesCount: 0,
          dislikesCount: 0,
        },
      );
    });
    const db = authenticatedDb('writer');
    await assertFails(
      deleteDoc(doc(db, 'shouts', 'shout-1', 'comments', 'mine')),
    );

    const batch = writeBatch(db);
    batch.set(
      doc(db, 'rateLimits', 'writer', 'actions', 'delete'),
      rateData('mine'),
    );
    batch.delete(doc(db, 'shouts', 'shout-1', 'comments', 'mine'));
    batch.update(doc(db, 'shouts', 'shout-1'), { commentsCount: 0 });
    await assertSucceeds(batch.commit());
  });
});

describe('moderation access', () => {
  test('moderator revokes own temporary sanction but not another moderator sanction', async () => {
    await seedEligibleUser('moderator', 'SafeModerator');
    await seedEligibleUser('other-moderator', 'OtherModerator');
    await seedEligibleUser('senior', 'SafeSenior');
    await seedEligibleUser('target', 'SafeTarget');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'accountRoles', 'moderator'), {
        role: 'moderator', level: 3, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'accountRoles', 'other-moderator'), {
        role: 'moderator', level: 3, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'accountRoles', 'senior'), {
        role: 'seniorModerator', level: 4, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'sanctions', 'own-temp'), {
        userId: 'target', type: 'accountBan', permanent: false,
        moderatorId: 'moderator', purgeAt: future(1000000),
      });
      await setDoc(doc(db, 'bans', 'target'), {
        userId: 'target', reason: 'test', createdAt: now(),
        expiresAt: future(1000000), moderatorId: 'moderator',
        sanctionId: 'own-temp',
      });
    });

    const db = authenticatedDb('moderator');
    const allowed = writeBatch(db);
    allowed.set(doc(db, 'sanctionRevocations', 'own-temp'), {
      userId: 'target', sanctionId: 'own-temp', originalType: 'accountBan',
      reason: 'Mistake', createdAt: serverTimestamp(), revokedBy: 'moderator',
      purgeAt: future(1000000),
    });
    allowed.delete(doc(db, 'bans', 'target'));
    await assertSucceeds(allowed.commit());

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'sanctions', 'other-temp'), {
        userId: 'target', type: 'contentRestriction', permanent: false,
        moderatorId: 'other-moderator', purgeAt: future(1000000),
      });
      await setDoc(doc(adminDb, 'contentRestrictions', 'target'), {
        userId: 'target', reason: 'test', createdAt: now(),
        expiresAt: future(1000000), moderatorId: 'other-moderator',
        sanctionId: 'other-temp',
      });
    });
    const forbidden = writeBatch(db);
    forbidden.set(doc(db, 'sanctionRevocations', 'other-temp'), {
      userId: 'target', sanctionId: 'other-temp',
      originalType: 'contentRestriction', reason: 'Not mine',
      createdAt: serverTimestamp(), revokedBy: 'moderator',
      purgeAt: future(1000000),
    });
    forbidden.delete(doc(db, 'contentRestrictions', 'target'));
    await assertFails(forbidden.commit());

    const seniorDb = authenticatedDb('senior');
    const seniorAllowed = writeBatch(seniorDb);
    seniorAllowed.set(doc(seniorDb, 'sanctionRevocations', 'other-temp'), {
      userId: 'target', sanctionId: 'other-temp',
      originalType: 'contentRestriction', reason: 'Senior review',
      createdAt: serverTimestamp(), revokedBy: 'senior',
      purgeAt: future(1000000),
    });
    seniorAllowed.delete(doc(seniorDb, 'contentRestrictions', 'target'));
    await assertSucceeds(seniorAllowed.commit());
  });

  test('moderator observation stores a snapshot and respects role hierarchy', async () => {
    await seedEligibleUser('moderator', 'SafeModerator');
    await seedEligibleUser('target', 'SafeTarget');
    await seedEligibleUser('senior', 'SafeSenior');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'accountRoles', 'moderator'), {
        role: 'moderator', level: 3, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'accountRoles', 'senior'), {
        role: 'seniorModerator', level: 4, createdAt: now(), assignedBy: 'test',
      });
    });

    const db = authenticatedDb('moderator');
    const allowed = writeBatch(db);
    allowed.set(doc(db, 'sanctions', 'observed-warning'), {
      userId: 'target', type: 'warning', reason: 'Observed violation',
      createdAt: serverTimestamp(), expiresAt: null, permanent: false,
      moderatorId: 'moderator', status: 'active', sourceReportId: '',
      previousSanctionsCount: 0,
      purgeAt: future(180 * 24 * 60 * 60 * 1000),
      sourceType: 'moderatorObservation', sourceContentType: 'comment',
      sourceContentId: 'comment-1', contentSnapshot: { text: 'violation' },
    });
    allowed.set(doc(db, 'warnings', 'observed-warning'), {
      userId: 'target', reason: 'Observed violation',
      createdAt: serverTimestamp(), moderatorId: 'moderator',
      sanctionId: 'observed-warning',
    });
    await assertSucceeds(allowed.commit());

    const forbidden = writeBatch(db);
    forbidden.set(doc(db, 'sanctions', 'senior-warning'), {
      userId: 'senior', type: 'warning', reason: 'Invalid hierarchy',
      createdAt: serverTimestamp(), expiresAt: null, permanent: false,
      moderatorId: 'moderator', status: 'active', sourceReportId: '',
      previousSanctionsCount: 0,
      purgeAt: future(180 * 24 * 60 * 60 * 1000),
      sourceType: 'moderatorObservation', sourceContentType: 'shout',
      sourceContentId: 'shout-1', contentSnapshot: { text: 'test' },
    });
    forbidden.set(doc(db, 'warnings', 'senior-warning'), {
      userId: 'senior', reason: 'Invalid hierarchy',
      createdAt: serverTimestamp(), moderatorId: 'moderator',
      sanctionId: 'senior-warning',
    });
    await assertFails(forbidden.commit());
  });

  test('users can read only their own role and cannot assign roles', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await seedEligibleUser('other', 'SafeOther');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accountRoles', 'reader'), {
        role: 'business',
        level: 2,
        createdAt: now(),
        assignedBy: 'test',
      });
    });

    const db = authenticatedDb('reader');
    await assertSucceeds(getDoc(doc(db, 'accountRoles', 'reader')));
    await assertFails(getDoc(doc(db, 'accountRoles', 'other')));
    await assertFails(setDoc(doc(db, 'accountRoles', 'reader'), {
      role: 'owner',
      level: 6,
      createdAt: serverTimestamp(),
      assignedBy: 'reader',
    }));
  });

  test('moderator sanctions are limited to assigned countries', async () => {
    await seedEligibleUser('scoped-moderator', 'ScopedModerator');
    await seedEligibleUser('target', 'ScopedTarget');
    await seedShout({ id: 'cz-shout', authorId: 'target', countryCode: 'CZ' });
    await seedShout({ id: 'de-shout', authorId: 'target', countryCode: 'DE' });
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accountRoles', 'scoped-moderator'), {
        role: 'moderator', level: 3, createdAt: now(), assignedBy: 'test',
        moderationScope: {
          global: false, countries: ['CZ'], subdivisions: [],
        },
      });
    });

    const db = authenticatedDb('scoped-moderator');
    const warningBatch = (id, shoutId) => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'sanctions', id), {
        userId: 'target', type: 'warning', reason: 'Regional violation',
        createdAt: serverTimestamp(), expiresAt: null, permanent: false,
        moderatorId: 'scoped-moderator', status: 'active', sourceReportId: '',
        previousSanctionsCount: 0,
        purgeAt: future(180 * 24 * 60 * 60 * 1000),
        sourceType: 'moderatorObservation', sourceContentType: 'shout',
        sourceContentId: shoutId, contentSnapshot: { text: 'test' },
      });
      batch.set(doc(db, 'warnings', id), {
        userId: 'target', reason: 'Regional violation',
        createdAt: serverTimestamp(), moderatorId: 'scoped-moderator',
        sanctionId: id,
      });
      return batch;
    };

    await assertSucceeds(warningBatch('cz-warning', 'cz-shout').commit());
    await assertFails(warningBatch('de-warning', 'de-shout').commit());
  });

  test('approved content cannot be reported again and reports can escalate', async () => {
    await seedEligibleUser('moderator', 'ReviewModerator');
    await seedEligibleUser('author', 'ReviewAuthor');
    await seedEligibleUser('reporter', 'ReviewReporter');
    await seedEligibleUser('second-reporter', 'SecondReporter');
    await seedShout({ id: 'review-shout', authorId: 'author', countryCode: 'CZ' });
    await seedShout({ id: 'escalate-shout', authorId: 'author', countryCode: 'CZ' });
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'accountRoles', 'moderator'), {
        role: 'moderator', level: 3, createdAt: now(), assignedBy: 'test',
        moderationScope: {
          global: false, countries: ['CZ'], subdivisions: [],
        },
      });
      await setDoc(doc(db, 'reports', 'reporter_review-shout'), {
        reporterId: 'reporter', shoutId: 'review-shout', reason: 'Review me',
        createdAt: now(), status: 'open',
      });
      await setDoc(doc(db, 'reports', 'reporter_escalate-shout'), {
        reporterId: 'reporter', shoutId: 'escalate-shout', reason: 'Escalate me',
        createdAt: now(), status: 'open',
      });
    });

    const moderatorDb = authenticatedDb('moderator');
    const approval = writeBatch(moderatorDb);
    approval.set(
      doc(moderatorDb, 'moderationClearances', 'shout_review-shout'),
      {
        targetType: 'shout', shoutId: 'review-shout',
        contentId: 'review-shout', createdAt: serverTimestamp(),
        moderatorId: 'moderator', reason: 'Content is allowed',
        sourceReportIds: ['reporter_review-shout'],
      },
    );
    approval.update(doc(moderatorDb, 'reports', 'reporter_review-shout'), {
      status: 'resolved', resolution: 'contentApproved',
      resolvedAt: serverTimestamp(),
    });
    await assertSucceeds(approval.commit());

    const secondReporterDb = authenticatedDb('second-reporter');
    const repeatReport = writeBatch(secondReporterDb);
    repeatReport.set(
      doc(secondReporterDb, 'rateLimits', 'second-reporter', 'actions', 'report'),
      rateData('second-reporter_review-shout'),
    );
    repeatReport.set(
      doc(secondReporterDb, 'reports', 'second-reporter_review-shout'),
      {
        reporterId: 'second-reporter', shoutId: 'review-shout',
        reason: 'Trying again', createdAt: serverTimestamp(), status: 'open',
      },
    );
    await assertFails(repeatReport.commit());

    await assertSucceeds(updateDoc(
      doc(moderatorDb, 'reports', 'reporter_escalate-shout'),
      {
        status: 'escalated', assignedRole: 'seniorModerator',
        escalatedAt: serverTimestamp(), escalatedBy: 'moderator',
        escalationNote: 'Needs senior review',
      },
    ));
  });

  test('business cannot moderate and permanent bans require level four', async () => {
    await seedEligibleUser('business', 'SafeBusiness');
    await seedEligibleUser('moderator', 'SafeModerator');
    await seedEligibleUser('senior', 'SafeSenior');
    await seedEligibleUser('target', 'SafeTarget');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'accountRoles', 'business'), {
        role: 'business', level: 2, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'accountRoles', 'moderator'), {
        role: 'moderator', level: 3, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'accountRoles', 'senior'), {
        role: 'seniorModerator', level: 4, createdAt: now(), assignedBy: 'test',
      });
      await setDoc(doc(db, 'reports', 'role-report'), {
        reporterId: 'target', shoutId: 'shout-1', reason: 'Spam',
        createdAt: now(), status: 'open',
      });
    });

    await assertFails(getDocs(query(
      collection(authenticatedDb('business'), 'reports'), limit(50),
    )));
    const moderatorDb = authenticatedDb('moderator');
    const moderatorPermanentBatch = writeBatch(moderatorDb);
    moderatorPermanentBatch.set(
      doc(moderatorDb, 'sanctions', 'moderator-permanent'),
      {
        userId: 'target', type: 'accountBan', reason: 'Permanent',
        createdAt: serverTimestamp(), expiresAt: null, permanent: true,
        moderatorId: 'moderator', status: 'active',
        sourceReportId: 'role-report', previousSanctionsCount: 0,
        purgeAt: future(730 * 24 * 60 * 60 * 1000),
        sourceType: 'report', sourceContentType: 'shout',
        sourceContentId: 'shout-1', contentSnapshot: { text: 'test' },
      },
    );
    moderatorPermanentBatch.set(doc(moderatorDb, 'bans', 'target'), {
      userId: 'target', reason: 'Permanent',
      createdAt: serverTimestamp(), expiresAt: null,
      moderatorId: 'moderator', sanctionId: 'moderator-permanent',
    });
    await assertFails(moderatorPermanentBatch.commit());
    const seniorDb = authenticatedDb('senior');
    const permanentBatch = writeBatch(seniorDb);
    permanentBatch.set(doc(seniorDb, 'sanctions', 'senior-permanent'), {
      userId: 'target',
      type: 'accountBan',
      reason: 'Permanent',
      createdAt: serverTimestamp(),
      expiresAt: null,
      permanent: true,
      moderatorId: 'senior',
      status: 'active',
      sourceReportId: 'role-report',
      previousSanctionsCount: 0,
      purgeAt: future(730 * 24 * 60 * 60 * 1000),
      sourceType: 'report',
      sourceContentType: 'shout',
      sourceContentId: 'shout-1',
      contentSnapshot: { text: 'test' },
    });
    permanentBatch.set(doc(seniorDb, 'bans', 'target'), {
      userId: 'target', reason: 'Permanent',
      createdAt: serverTimestamp(), expiresAt: null,
      moderatorId: 'senior', sanctionId: 'senior-permanent',
    });
    await assertSucceeds(permanentBatch.commit());
  });

  test('only an eligible moderator can list and resolve reports', async () => {
    await seedEligibleUser('moderator', 'SafeModerator');
    await seedEligibleUser('reader', 'SafeReader');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'moderators', 'moderator'), {
        createdAt: now(),
      });
      await setDoc(doc(db, 'reports', 'seeded-report'), {
        reporterId: 'reader',
        shoutId: 'shout-1',
        reason: 'Spam',
        createdAt: now(),
        status: 'open',
      });
    });

    const readerDb = authenticatedDb('reader');
    await assertFails(
      getDocs(query(collection(readerDb, 'reports'), limit(50))),
    );

    const moderatorDb = authenticatedDb('moderator');
    await assertSucceeds(
      getDocs(query(collection(moderatorDb, 'reports'), limit(50))),
    );
    await assertSucceeds(
      updateDoc(doc(moderatorDb, 'reports', 'seeded-report'), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
      }),
    );
  });

  test('an active ban also blocks moderator writes', async () => {
    await seedEligibleUser('moderator', 'SafeModerator');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'moderators', 'moderator'), {
        createdAt: now(),
      });
      await setDoc(doc(db, 'bans', 'moderator'), {
        userId: 'moderator',
        reason: 'test',
        createdAt: now(),
        expiresAt: null,
        moderatorId: 'other-moderator',
      });
      await setDoc(doc(db, 'reports', 'seeded-report'), {
        reporterId: 'reader',
        shoutId: 'shout-1',
        reason: 'Spam',
        createdAt: now(),
        status: 'open',
      });
    });
    const db = authenticatedDb('moderator');
    await assertFails(
      updateDoc(doc(db, 'reports', 'seeded-report'), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
      }),
    );
  });
});
