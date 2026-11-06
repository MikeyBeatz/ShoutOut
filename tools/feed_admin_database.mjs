import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CLI only. Credential values are never returned to callers or printed.
export async function feedAdminDatabase(projectId) {
  if (!['shoutout-dev-46c81', 'shoutout-production-a1b34'].includes(projectId) || process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('explicit-live-feed-project-required');
  }
  const root = resolve(import.meta.dirname, '..'), require = createRequire(resolve(root, 'functions/package.json'));
  const { Firestore } = require('firebase-admin/firestore');
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const account = JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
    if (account.project_id !== projectId) throw new Error('feed-credential-project-mismatch');
    return new Firestore({ projectId, credentials: { client_email: account.client_email, private_key: account.private_key } });
  }
  const toolRequire = createRequire(resolve(root, 'tools/package.json'));
  const auth = toolRequire('firebase-tools/lib/auth.js');
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error('existing-cli-authentication-required');
  const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(); client.setCredentials({ access_token: token.access_token, expiry_date: Date.now() + 3500000 });
  return new Firestore({ projectId, authClient: client });
}
