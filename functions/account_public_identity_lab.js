// Emulator fence for manually exercising the unintegrated identity prototype.
import { maskDeletedAccountPublicIdentity } from './account_public_identity.js';
export async function maskDeletedAccountPublicIdentityLab(identity, db, auth, options) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('public-identity-emulator-required');
  }
  return maskDeletedAccountPublicIdentity(identity, db, auth, options);
}
