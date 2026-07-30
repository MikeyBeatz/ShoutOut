import { readFileSync } from 'node:fs';
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
} = {}) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'shouts', id), {
      authorId,
      authorNickname,
      title: 'Bezpečný test',
      text: 'Obsah testovacího Shoutu.',
      categories: ['Obecné'],
      location: new GeoPoint(50.54, 14.13),
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
    title: 'Nový Shout',
    text: 'Text bezpečného testovacího Shoutu.',
    categories: ['Obecné'],
    location: new GeoPoint(50.54, 14.13),
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
      avatarId: 'fox',
      avatarBackgroundStart: 'teal',
      avatarBackgroundEnd: 'navy',
      avatarGradientDirection: 'diagonal',
    });
    await assertSucceeds(batch.commit());
  });

  test('user can update a complete valid avatar style', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    await assertSucceeds(
      updateDoc(doc(authenticatedDb('reader'), 'users', 'reader'), {
        avatarId: 'owl',
        avatarBackgroundStart: 'purple',
        avatarBackgroundEnd: 'gold',
        avatarGradientDirection: 'vertical',
      }),
    );
  });

  test('avatar style accepts identical colors but rejects unknown directions', async () => {
    await seedEligibleUser('reader', 'SafeReader');
    const profile = doc(authenticatedDb('reader'), 'users', 'reader');
    await assertSucceeds(
      updateDoc(profile, {
        avatarBackgroundStart: 'teal',
        avatarBackgroundEnd: 'teal',
      }),
    );
    await assertFails(
      updateDoc(profile, {
        avatarGradientDirection: 'reverse-diagonal',
      }),
    );
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
          count: 10,
        },
      );
    });
    const db = authenticatedDb('writer');
    const batch = writeBatch(db);
    batch.set(doc(db, 'rateLimits', 'writer', 'actions', 'shout'), {
      lastAt: serverTimestamp(),
      lastEventId: 'over-limit',
      windowStartedAt: oldWindowStart,
      count: 11,
    });
    batch.set(
      doc(db, 'shouts', 'over-limit'),
      shoutData('writer', 'SafeWriter'),
    );
    await assertFails(batch.commit());
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
    await assertSucceeds(batch.commit());
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
