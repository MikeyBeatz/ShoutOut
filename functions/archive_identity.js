// Server-only identity observations. No raw contact or secret is persisted.
import { createHmac, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { archiveDeploymentProfile } from './archive_deployment.js';

// Once installed, cleanup stays enabled through an ingress/reader rollback.
export const archiveIdentityConfiguration = Object.freeze({ enabled: archiveDeploymentProfile().identity,
  purgeEnabled: archiveDeploymentProfile().identityPurge });
export const identityCollections = Object.freeze({ accounts: 'archiveIdentityAccounts', bindings: 'archiveIdentityBindings' });
const fail = (code, text) => { throw new HttpsError(code, text); };
export const identityId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const identityUid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function identityContact(type, value) {
  if (typeof value !== 'string' || value.length > 320) fail('invalid-argument', 'Invalid exact contact.');
  if (type === 'email') {
    const email = value.trim().toLowerCase();
    // Match Firebase's case-insensitive email identity, without provider-specific
    // dot/plus aliases, accent folding or guessing a missing country prefix.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  }
  if (type === 'phone' && /^\+[1-9][0-9]{6,14}$/.test(value)) return value;
  fail('invalid-argument', 'Invalid exact contact.');
}
export function createArchiveIdentityCodec(projectId, key, keyVersion = 'v1') {
  if (typeof projectId !== 'string' || !projectId || !(Buffer.isBuffer(key) && key.length >= 32) ||
      typeof keyVersion !== 'string' || !/^[a-zA-Z0-9_-]{1,24}$/.test(keyVersion)) throw new Error('archive-identity-key-required');
  const digest = (...parts) => createHmac('sha256', key).update(JSON.stringify([projectId, keyVersion, ...parts])).digest('hex');
  return Object.freeze({ projectId, keyVersion, digest,
    contact: (type, value) => digest('contact', type, identityContact(type, value)),
    account: (uid, authCreatedAt, profileCreateTime) => digest('account', uid, authCreatedAt, profileCreateTime.seconds, profileCreateTime.nanoseconds),
  });
}
export function identityNow(clock) {
  const date = clock();
  if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) || date.getTime() < 0) throw new Error('archive-identity-clock-required');
  return Timestamp.fromDate(date);
}
export function validateIdentityAccount(data, codec, accountKey) {
  if (data?.schemaVersion !== 1 || !identityUid(data.userId) || data.keyVersion !== codec.keyVersion ||
      !Number.isSafeInteger(data.authCreatedAtMillis) || data.authCreatedAtMillis < 0 ||
      !(data.profileCreateTime instanceof Timestamp) || !(data.observedAt instanceof Timestamp) ||
      data.profileCreateTime.toMillis() > data.observedAt.toMillis() ||
      codec.account(data.userId, data.authCreatedAtMillis, data.profileCreateTime) !== accountKey) fail('failed-precondition', 'Invalid retained account identity.');
  return data;
}
export function createArchiveIdentityRuntime(db, { enabled = archiveIdentityConfiguration.enabled, key, keyVersion, clock = () => new Date() } = {}) {
  if (typeof enabled !== 'boolean') throw new Error('invalid-archive-identity-option');
  // The off path does not inspect Auth, open collections or require a key.
  if (!enabled) return Object.freeze({ enabled: false });
  assertFeedRuntimeTarget(db);
  const codec = createArchiveIdentityCodec(db.projectId, key, keyVersion);
  return Object.freeze({ enabled, db, codec, clock });
}
export function requireIdentityRuntime(runtime) {
  if (runtime?.enabled !== true) fail('failed-precondition', 'Archive identity lookup is disabled.');
  return runtime;
}

// The caller supplies only its authenticated request. The observation is made
// by Admin Auth; email_verified, phone and account birth are never request data.
export async function observeArchiveIdentity(request, runtime, auth) {
  const { db, codec, clock } = requireIdentityRuntime(runtime), { uid, email } = requireCallableIdentity(request);
  if (!identityUid(uid)) fail('failed-precondition', 'Invalid retained account identifier.');
  const proofStartedAt = identityNow(clock);
  const record = await auth.getUser(uid);
  const observedAt = identityNow(clock);
  const born = Date.parse(record?.metadata?.creationTime);
  const tokenAuth = request.auth.token.auth_time;
  if (record?.uid !== uid || record.disabled || record.emailVerified !== true ||
      identityContact('email', record.email) !== identityContact('email', email) ||
      !Number.isSafeInteger(born) || born < 0 || born > observedAt.toMillis() ||
      !Number.isSafeInteger(tokenAuth) || tokenAuth < Math.floor(born / 1000)) fail('unauthenticated', 'The authenticated account incarnation changed.');
  const contacts = [{ type: 'email', contactKey: codec.contact('email', record.email), proof: 'admin-auth-verified-email' }];
  if (typeof record.phoneNumber === 'string') contacts.push({ type: 'phone', contactKey: codec.contact('phone', record.phoneNumber), proof: 'admin-auth-phone' });
  const fingerprint = codec.digest('contacts', contacts);
  return db.runTransaction(async tx => {
    const actor = await requireEligibleActor({ request, db, reader: tx, now: identityNow(clock).toDate(), includeProfileSnapshot: true });
    const profile = actor.profileSnapshot;
    const accountKey = codec.account(uid, born, profile.createTime), accountRef = db.doc(`${identityCollections.accounts}/${accountKey}`);
    const [existing, current] = await tx.getAll(accountRef, db.doc(`archiveIdentityCurrent/${uid}`));
    // A delayed pre-purge Auth read cannot attach to a newly created profile.
    if (!profile.exists || profile.createTime.toMillis() > proofStartedAt.toMillis()) fail('failed-precondition', 'The account observation is stale.');
    if (existing.exists) {
      const old = validateIdentityAccount(existing.data(), codec, accountKey);
      if (old.deletionClosedAt !== undefined || old.deletionRequestCreateTime !== undefined) fail('failed-precondition', 'The retained identity is closed.');
      if (!old.profileCreateTime.isEqual(profile.createTime)) fail('failed-precondition', 'The profile incarnation changed.');
      if (old.fingerprint === fingerprint && current.get('accountKey') === accountKey) return { accountKey, changed: false };
    }
    const refs = contacts.map(c => db.doc(`${identityCollections.bindings}/${codec.digest('binding', c.contactKey, accountKey)}`));
    const bindings = await tx.getAll(...refs);
    // A newer observation wins. A lost response can safely repeat without a
    // second audit/contact document or an artificial verification timestamp.
    if (existing.get('observedAt')?.toMillis() > observedAt.toMillis()) return { accountKey, changed: false };
    const account = { schemaVersion: 1, keyVersion: codec.keyVersion, userId: uid, authCreatedAtMillis: born,
      profileCreateTime: profile.createTime, observedAt, fingerprint };
    tx.set(accountRef, account);
    tx.set(db.doc(`archiveIdentityCurrent/${uid}`), { accountKey, profileCreateTime: profile.createTime, authCreatedAtMillis: born });
    contacts.forEach((contact, n) => {
      if (bindings[n].exists) {
        const old = bindings[n].data();
        if (old.accountKey !== accountKey || old.userId !== uid || old.contactKey !== contact.contactKey) fail('data-loss', 'Invalid retained contact identity.');
      } else tx.create(refs[n], { schemaVersion: 1, keyVersion: codec.keyVersion, ...contact, accountKey, userId: uid, observedAt });
    });
    return { accountKey, changed: true };
  });
}

// Called inside the same buffered source/archive transaction, only for a new
// archive body. Never infer an old incarnation from UID alone.
export async function archiveAuthorIdentity(tx, db, source, { codec, expectedAuthor }, cache = new Map()) {
  const uid = source.authorId;
  if (!cache.has(uid)) {
    const [current, profile, deletion] = await tx.getAll(db.doc(`archiveIdentityCurrent/${uid}`), db.doc(`users/${uid}`), db.doc(`accountDeletionRequests/${uid}`));
    if (deletion.exists || !profile.exists || !identityId(current.get('accountKey')) ||
        !current.get('profileCreateTime')?.isEqual(profile.createTime)) fail('failed-precondition', 'A verified author observation is required.');
    const account = await tx.get(db.doc(`${identityCollections.accounts}/${current.get('accountKey')}`));
    if (!account.exists) fail('failed-precondition', 'The author identity is unavailable.');
    const data = validateIdentityAccount(account.data(), codec, account.id);
    if (data.deletionClosedAt !== undefined || data.deletionRequestCreateTime !== undefined) fail('failed-precondition', 'The retained author identity is closed.');
    if (data.userId !== uid || !data.profileCreateTime.isEqual(profile.createTime)) fail('failed-precondition', 'The author incarnation changed.');
    cache.set(uid, { key: account.id, data });
  }
  const { key, data } = cache.get(uid);
  if (expectedAuthor && (expectedAuthor.userId !== uid || expectedAuthor.accountKey !== key)) fail('failed-precondition', 'The observed author incarnation changed.');
  if (!(source.createdAt instanceof Timestamp) || source.createdAt.toMillis() < data.authCreatedAtMillis ||
      source.createdAt.toMillis() < data.profileCreateTime.toMillis()) fail('failed-precondition', 'The source author incarnation is unproven.');
  return { authorAccountKey: key };
}

export async function prepareArchiveIdentityDeletion(tx, db, uid, runtime, existingRequest = null) {
  if (runtime?.enabled !== true) return null;
  const current = await tx.get(db.doc(`archiveIdentityCurrent/${uid}`));
  if (!current.exists) return null;
  if (!identityId(current.get('accountKey'))) fail('failed-precondition', 'Invalid current identity.');
  const ref = db.doc(`${identityCollections.accounts}/${current.get('accountKey')}`), account = await tx.get(ref);
  if (!account.exists) fail('failed-precondition', 'Missing current identity.');
  const data = validateIdentityAccount(account.data(), runtime.codec, account.id);
  if (data.userId !== uid || !data.profileCreateTime.isEqual(current.get('profileCreateTime'))) fail('failed-precondition', 'The deletion identity changed.');
  if (data.deletionRequestCreateTime !== undefined) {
    if (!(data.deletionRequestCreateTime instanceof Timestamp)) fail('failed-precondition', 'Invalid identity deletion deadline.');
    return null; // Never replace the first committed request birth with a newer one.
  }
  if (data.deletionClosedAt !== undefined) {
    if (!(data.deletionClosedAt instanceof Timestamp) || !identityId(data.deletionClosureKey)) fail('failed-precondition', 'Invalid identity closure.');
    if (!existingRequest?.exists || existingRequest.get('identityClosureKey') !== data.deletionClosureKey) return null;
    return { apply() { tx.update(ref, { deletionRequestCreateTime: existingRequest.createTime }); } };
  }
  if (existingRequest?.exists) return { apply() { tx.update(ref, { deletionClosedAt: FieldValue.serverTimestamp(), deletionRequestCreateTime: existingRequest.createTime }); } };
  const closureKey = runtime.codec.digest('deletion-closure', randomUUID());
  // The first transaction atomically closes ingress and tags the new request.
  // A bounded second transaction binds its actual SDK createTime. Until then,
  // readers accept only this exact tagged request; losing it fails closed.
  return { requestFields: { identityClosureKey: closureKey }, apply() {
    tx.update(ref, { deletionClosedAt: FieldValue.serverTimestamp(), deletionClosureKey: closureKey });
  } };
}
