import { createRequire } from 'node:module';
// DEV-only Admin Auth for the single approved fixture. Credentials stay private.
export async function openDevPilotAuth(projectId) {
  if (projectId !== 'shoutout-dev-46c81' || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) throw Error('mod-business-pilot-explicit-live-dev-required');
  const require = createRequire(new URL('../functions/package.json', import.meta.url)), cli = createRequire(new URL('./package.json', import.meta.url));
  const { initializeApp, deleteApp } = require('firebase-admin/app'), { getAuth } = require('firebase-admin/auth');
  const login = cli('firebase-tools/lib/auth.js'), account = login.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw Error('mod-business-pilot-existing-login-required');
  const app = initializeApp({ projectId, credential: { async getAccessToken() {
    const t = await login.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
    return { access_token: t.access_token, expires_in: 3500 };
  } } }, `approved-mod-business-${Date.now()}`);
  return { auth: getAuth(app), close: () => deleteApp(app) };
}
