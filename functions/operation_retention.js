import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export const operationRetryWindowMillis = 7 * 24 * 60 * 60 * 1000;
// Cutover phase: deploy only after all clients use timed keys. Existing legacy
// receipts remain replayable inside their original seven-day server window.
export const legacyOperationKeysAccepted = false;

const reject = (message) => { throw new HttpsError('failed-precondition', message); };

/** Runs inside the operation transaction, after current account eligibility.
 * Expiration is enforced in code, independently of eventual physical cleanup.
 * `op1` keys carry server-issued epoch seconds and 128 bits of random entropy.
 * The client must derive time from Auth, not from the device wall clock.
 */
export function receiptRetentionFields(key, now, stored, {
  allowLegacy = legacyOperationKeysAccepted,
} = {}) {
  if (!(now instanceof Timestamp)) reject('operation-clock-unavailable');
  const match = /^op1_([1-9][0-9]{0,12})_([a-f0-9]{32})$/.exec(key);
  if (!match && key.startsWith('op1_')) reject('operation-key-upgrade-required');
  if (stored) {
    // Legacy receipt replay is safe even after the compatibility phase ends.
    // Its age must then be checked before the old receipt can be cleaned up.
    if (!match && allowLegacy && stored.expiresAt === undefined) return {};
    if (!(stored.createdAt instanceof Timestamp)) reject('invalid-operation-retention');
    const expiry = stored.createdAt.toMillis() + operationRetryWindowMillis;
    if (match && (stored.keyVersion !== 1 || !(stored.expiresAt instanceof Timestamp))) {
      reject('invalid-operation-retention');
    }
    if (stored.expiresAt !== undefined &&
        (!(stored.expiresAt instanceof Timestamp) || stored.expiresAt.toMillis() !== expiry)) {
      reject('invalid-operation-retention');
    }
    if (now.toMillis() >= expiry) reject('operation-expired');
    return {};
  }
  if (!match) {
    if (!allowLegacy) reject('operation-key-upgrade-required');
    return {}; // Never attach a cleanup deadline to an executable legacy key.
  }
  const issuedMillis = Number(match[1]) * 1000;
  if (!Number.isSafeInteger(issuedMillis) || issuedMillis > now.toMillis()) {
    reject('operation-key-time-invalid');
  }
  if (now.toMillis() >= issuedMillis + operationRetryWindowMillis) reject('operation-expired');
  return { keyVersion: 1, expiresAt: Timestamp.fromMillis(now.toMillis() + operationRetryWindowMillis) };
}
