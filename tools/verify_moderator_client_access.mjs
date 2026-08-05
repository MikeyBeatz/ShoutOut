import process from 'node:process';

const apiKey = 'AIzaSyAqcieaTn_wC-0tB2Y3gVCtD7dj9lINSJs';
const projectId = 'shoutout-dev-46c81';
const password = process.env.SHOUTOUT_TEST_PASSWORD;
if (!password) throw new Error('Set SHOUTOUT_TEST_PASSWORD.');

const signInResponse = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'test.moderator@shoutout.test',
      password,
      returnSecureToken: true,
    }),
    signal: AbortSignal.timeout(15000),
  },
);
if (!signInResponse.ok) {
  throw new Error(`Sign-in failed: ${signInResponse.status}`);
}
const { idToken, localId } = await signInResponse.json();
const paths = [
  ['profile', `users/${localId}`],
  ['deletion', `accountDeletionRequests/${localId}`],
  ['ban', `bans/${localId}`],
  ['restriction', `contentRestrictions/${localId}`],
  ['legal', `users/${localId}/legal/acceptance_2026_07_25`],
  ['role', `accountRoles/${localId}`],
];
for (const [label, path] of paths) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    {
      headers: { authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  console.log(`${label}: HTTP ${response.status}`);
}
