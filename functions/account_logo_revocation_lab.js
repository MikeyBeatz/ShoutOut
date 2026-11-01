// All manual/emulator exercise goes through this fence; never a live worker.
import { listDeletedAccountLogos, revokeDeletedAccountLogo } from './account_logo_revocation.js';
function fence(db, bucket) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
      process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199' ||
      bucket?.storage?.apiEndpoint !== 'http://127.0.0.1:9199') throw new Error('logo-emulators-required');
}
export async function listDeletedAccountLogosLab(identity, db, auth, bucket, options) {
  fence(db, bucket); return listDeletedAccountLogos(identity, db, auth, bucket, options);
}
export async function revokeDeletedAccountLogoLab(identity, db, auth, bucket, path, options) {
  fence(db, bucket); return revokeDeletedAccountLogo(identity, db, auth, bucket, path, options);
}
