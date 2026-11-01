// Internal Storage phase helper; no standalone Function export or object deletion.
import { Timestamp } from 'firebase-admin/firestore';

export class AccountLogoRevocationNeedsReview extends Error {}
const tokenKey = 'firebaseStorageDownloadTokens';

function validate(identity, db, bucket) {
  if (!identity || identity.projectId !== db.projectId || typeof identity.userId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(identity.userId ?? '') ||
      !(identity.requestCreateTime instanceof Timestamp) ||
      ![`${identity.projectId}.appspot.com`, `${identity.projectId}.firebasestorage.app`].includes(bucket?.name)) {
    throw new Error('invalid-logo-revocation-target');
  }
}

// Must be rerun before each side effect and before acknowledging success.
async function confirm(identity, db, auth, options) {
  try { await auth.getUser(identity.userId); throw new AccountLogoRevocationNeedsReview('auth-still-exists'); }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  await db.runTransaction(async transaction => {
    const [request, profile] = await transaction.getAll(
      db.doc(`accountDeletionRequests/${identity.userId}`), db.doc(`publicProfiles/${identity.userId}`),
    );
    const now = options.clock();
    if (!(now instanceof Date) || !Number.isSafeInteger(now.getTime())) throw new Error('invalid-logo-clock');
    if (!request.exists || request.data().userId !== identity.userId || request.data().status !== 'pending' ||
        !request.createTime.isEqual(identity.requestCreateTime) ||
        now.getTime() >= identity.requestCreateTime.toMillis() + 60 * 86400000 ||
        profile.data()?.accountStatus !== 'deleted' || profile.data()?.schemaVersion !== 1 ||
        Object.keys(profile.data()).length !== 2) {
      throw new AccountLogoRevocationNeedsReview('confirmed-deletion-unavailable');
    }
    await options.transactionGuard(transaction);
  });
}

function validPath(uid, path) {
  return typeof path === 'string' && new RegExp(`^businessLogos/${uid}/logo-[0-9]+\\.png$`).test(path);
}

function settings(options) {
  if (typeof options?.transactionGuard !== 'function') throw new Error('logo-transaction-guard-required');
  const result = { clock: () => new Date(), ...options };
  if (typeof result.clock !== 'function') throw new Error('invalid-logo-clock');
  return result;
}

// Caller selects an explicit page size; this does not set a live worker budget.
export async function listDeletedAccountLogos(identity, db, auth, bucket, options) {
  validate(identity, db, bucket);
  const opts = settings(options);
  if (!Number.isSafeInteger(opts.pageSize) || opts.pageSize < 1 ||
      (opts.pageToken !== undefined && (typeof opts.pageToken !== 'string' || !opts.pageToken))) {
    throw new Error('invalid-logo-page');
  }
  await confirm(identity, db, auth, opts);
  const [files, next] = await bucket.getFiles({ prefix: `businessLogos/${identity.userId}/`,
    maxResults: opts.pageSize, autoPaginate: false, ...(opts.pageToken ? { pageToken: opts.pageToken } : {}) });
  if (files.length > opts.pageSize || new Set(files.map(file => file.name)).size !== files.length ||
      (next?.pageToken !== undefined && next?.pageToken !== null && (typeof next.pageToken !== 'string' || !next.pageToken))) {
    throw new AccountLogoRevocationNeedsReview('unexpected-logo-page');
  }
  if (files.some(file => !validPath(identity.userId, file.name))) {
    throw new AccountLogoRevocationNeedsReview('unexpected-logo-path');
  }
  await confirm(identity, db, auth, opts);
  return { paths: files.map(file => file.name), nextPageToken: next?.pageToken ?? null };
}

// One object per call. A failed/lost acknowledgement is safely retried from metadata.
export async function revokeDeletedAccountLogo(identity, db, auth, bucket, path, options) {
  validate(identity, db, bucket);
  if (!validPath(identity.userId, path)) throw new Error('invalid-logo-path');
  const opts = settings(options);
  await confirm(identity, db, auth, opts);
  const file = bucket.file(path);
  let current;
  try { [current] = await file.getMetadata(); }
  catch (error) {
    if (error?.code !== 404) throw error;
    await confirm(identity, db, auth, opts);
    return { state: 'absent', changed: false };
  }
  if (!/^[1-9][0-9]*$/.test(String(current.generation)) || !/^[1-9][0-9]*$/.test(String(current.metageneration))) {
    throw new AccountLogoRevocationNeedsReview('logo-version-unavailable');
  }
  const tokens = current.metadata?.[tokenKey];
  if (tokens !== undefined && tokens !== null && typeof tokens !== 'string') {
    throw new AccountLogoRevocationNeedsReview('invalid-logo-token-metadata');
  }
  if (tokens) {
    await confirm(identity, db, auth, opts);
    // Patch just this key; preserve all other metadata and the object bytes.
    await file.setMetadata({ metadata: { [tokenKey]: null } }, {
      ifGenerationMatch: String(current.generation), ifMetagenerationMatch: String(current.metageneration),
    });
  }
  const [verified] = await file.getMetadata();
  if (String(verified.generation) !== String(current.generation) || verified.metadata?.[tokenKey]) {
    throw new AccountLogoRevocationNeedsReview('logo-revocation-not-verified');
  }
  await confirm(identity, db, auth, opts);
  return { state: 'tokens-absent', changed: Boolean(tokens) };
}
