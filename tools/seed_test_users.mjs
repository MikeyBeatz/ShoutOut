import { readFileSync } from 'node:fs';
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, GeoPoint, Timestamp, getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const password = process.env.SHOUTOUT_TEST_PASSWORD;

if (!serviceAccountPath || !password) {
  throw new Error(
    'Set FIREBASE_SERVICE_ACCOUNT_PATH and SHOUTOUT_TEST_PASSWORD before running this script.',
  );
}

if (password.length < 6) {
  throw new Error('SHOUTOUT_TEST_PASSWORD must contain at least 6 characters.');
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();
const users = [
  { id: 'alex', nickname: 'SilverFalcon', language: 'cs' },
  { id: 'bea', nickname: 'SunnyOtter', language: 'en' },
  { id: 'chris', nickname: 'CosmicMaple', language: 'de' },
  { id: 'dana', nickname: 'QuietPhoenix', language: 'pl' },
  { id: 'elliot', nickname: 'BrightHarbor', language: 'cs' },
  { id: 'finn', nickname: 'NeonRaven', language: 'en' },
  { id: 'gia', nickname: 'AzureWillow', language: 'de' },
  { id: 'hugo', nickname: 'SwiftBadger', language: 'pl' },
  { id: 'iris', nickname: 'GoldenFox', language: 'cs' },
  { id: 'jules', nickname: 'LunarComet', language: 'en' },
];

for (const testUser of users) {
  const uid = `test_${testUser.id}`;
  const email = `test.${testUser.id}@shoutout.test`;
  const nicknameLower = testUser.nickname.toLowerCase();

  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, {
      email,
      password,
      emailVerified: true,
      displayName: `[TEST] ${testUser.nickname}`,
      disabled: false,
    });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({
      uid,
      email,
      password,
      emailVerified: true,
      displayName: `[TEST] ${testUser.nickname}`,
      disabled: false,
    });
  }

  const nicknameRef = db.collection('nicknames').doc(nicknameLower);
  const existingNickname = await nicknameRef.get();
  if (existingNickname.exists && existingNickname.data().uid !== uid) {
    throw new Error(`Nickname ${testUser.nickname} is already owned by another account.`);
  }

  await Promise.all([
    nicknameRef.set({
      uid,
      nickname: testUser.nickname,
      nicknameLower,
      createdAt: FieldValue.serverTimestamp(),
    }),
    db.collection('users').doc(uid).set({
      nickname: testUser.nickname,
      nicknameLower,
      createdAt: FieldValue.serverTimestamp(),
      nicknameChangedAt: FieldValue.serverTimestamp(),
      nicknameChangeCount: 0,
      emailVerified: true,
      language: testUser.language,
      isTest: true,
    }, { merge: true }),
  ]);

  console.log(`Ready: ${email} (${testUser.nickname})`);
}

console.log(`\nCreated or updated ${users.length} verified ShoutOut development test accounts.`);

if (process.argv.includes('--with-demo-data')) {
  await seedDemoData();
}

async function seedDemoData() {
  // Litoměřice city centre. The offsets below intentionally cover several
  // distance filters in the app, from nearby posts to wider surroundings.
  const centre = { latitude: 50.5384, longitude: 14.1318 };
  const demoShouts = [
    ['market', 0.4, 'Farmářské trhy dnes', 'Na náměstí jsou čerstvé pečivo, zelenina a káva.'],
    ['walk', 1.6, 'Procházka podél Labe', 'Přidá se někdo na krátkou večerní procházku?'],
    ['football', 3.4, 'Malý fotbal od šesti', 'Hledáme ještě dva hráče, tempo pohodové.'],
    ['traffic', 6.8, 'Pozor na omezení dopravy', 'U hlavní silnice je provoz pomalejší než obvykle.'],
    ['cinema', 11.5, 'Film a diskuze', 'Po promítání se můžeme zastavit na čaj.'],
    ['help', 19, 'Potřebuji poradit s kolem', 'Má někdo zkušenost s výměnou duše u městského kola?'],
    ['culture', 32, 'Malá výstava o víkendu', 'Doporučuji návštěvu, vstup je zdarma.'],
  ];
  const categories = [
    ['Akce'], ['Zábava'], ['Sport'], ['Upozornění'], ['Kultura'], ['Pomoc'], ['Kultura'],
  ];
  const now = Date.now();

  for (let index = 0; index < demoShouts.length; index += 1) {
    const [id, distanceKm, title, text] = demoShouts[index];
    const author = users[index % users.length];
    const angle = (index * 51) * Math.PI / 180;
    const latitude = centre.latitude + (distanceKm * Math.cos(angle)) / 111;
    const longitude = centre.longitude +
      (distanceKm * Math.sin(angle)) / (111 * Math.cos(centre.latitude * Math.PI / 180));
    const shoutRef = db.collection('shouts').doc(`demo_litomerice_${id}`);
    await shoutRef.set({
      authorId: `test_${author.id}`,
      authorNickname: author.nickname,
      title: `[TEST] ${title}`,
      text,
      categories: categories[index],
      location: new GeoPoint(latitude, longitude),
      createdAt: Timestamp.fromMillis(now - (index + 1) * 17 * 60 * 1000),
      expiresAt: Timestamp.fromMillis(now + (index + 2) * 2 * 60 * 60 * 1000),
      status: 'active',
      likesCount: 0,
      dislikesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      isTest: true,
    }, { merge: true });

    const commenters = [users[(index + 1) % users.length], users[(index + 3) % users.length]];
    for (let commentIndex = 0; commentIndex < commenters.length; commentIndex += 1) {
      const commenter = commenters[commentIndex];
      const prefix = commentIndex === 1 ? `@${commenters[0].nickname} ` : '';
      const commentRef = shoutRef.collection('comments').doc(`demo_${commentIndex + 1}`);
      await commentRef.set({
        authorId: `test_${commenter.id}`,
        authorNickname: commenter.nickname,
        text: `${prefix}${commentIndex === 0 ? 'To zní dobře, díky za tip!' : 'Souhlasím, dorazím také.'}`,
        createdAt: Timestamp.fromMillis(now - (index + commentIndex + 1) * 9 * 60 * 1000),
        isTest: true,
      }, { merge: true });
      await commentRef.collection('reactions').doc(`test_${author.id}`).set({
        type: 'like',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await shoutRef.collection('reactions').doc(`test_${commenters[0].id}`).set({
      type: 'like',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const controversialRef = db.collection('shouts').doc('demo_litomerice_traffic')
    .collection('comments').doc('demo_hidden_comment');
  await controversialRef.set({
    authorId: 'test_alex',
    authorNickname: 'SilverFalcon',
    text: 'Toto je testovací komentář pro ověření automatického skrytí.',
    createdAt: Timestamp.fromMillis(now - 3 * 60 * 1000),
    isTest: true,
  }, { merge: true });
  for (let index = 0; index < users.length; index += 1) {
    await controversialRef.collection('reactions').doc(`test_${users[index].id}`).set({
      type: index < 7 ? 'dislike' : 'like',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  console.log(`Seeded ${demoShouts.length} Litoměřice demo Shouts, comments and reactions.`);
}
