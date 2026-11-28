// Inactive local core. No callable, scheduler or live control is exported.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { receiptRetentionFields, operationRetryWindowMillis } from './operation_retention.js';
import { normalizeBusinessLogo, businessLogoMaximumBytes } from './business_logo_image.js';
import { logoDigest, validLogoPath } from './business_logo_storage.js';

const action = 'updateBusinessLogo', hash = s => createHash('sha256').update(s).digest('hex');
const fail = (code, text) => { throw new HttpsError(code, text); };
const stamp = t => `${t.seconds}:${t.nanoseconds}`;
const avatarIds = 'fox owl otter raccoon robot astronaut cactus mushroom moon comet cat dragon mountain lightning controller octopus bear panda rabbit penguin frog dog hedgehog parrot'.split(' ');
const colors = 'teal navy aqua purple coral gold green rose sky indigo pink orange lime mint brown slate'.split(' ');
const avatarFields = ['avatarId', 'avatarBackgroundStart', 'avatarBackgroundEnd', 'avatarGradientDirection'];
export function validateLogoRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some(k => !['expectedUserId', 'idempotencyKey', 'mode', 'pngBase64', 'avatar'].includes(k)) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(data.expectedUserId ?? '') || typeof data.idempotencyKey !== 'string' || data.idempotencyKey.length > 128 ||
      !['replace', 'remove'].includes(data.mode)) fail('invalid-argument', 'Invalid logo request.');
  let bytes = null, avatar = null;
  if (data.mode === 'replace') {
    const s = data.pngBase64;
    if (data.avatar !== undefined || typeof s !== 'string' || !s.length || s.length > Math.ceil(businessLogoMaximumBytes / 3) * 4) fail('invalid-argument', 'Invalid logo bytes.');
    bytes = Buffer.from(s, 'base64');
    if (!bytes.length || bytes.length > businessLogoMaximumBytes || bytes.toString('base64') !== s) fail('invalid-argument', 'Invalid logo bytes.');
  } else {
    if (data.pngBase64 !== undefined) fail('invalid-argument', 'Unexpected logo bytes.');
    if (data.avatar !== undefined) {
      const a = data.avatar;
      if (!a || typeof a !== 'object' || Object.keys(a).length !== 4 || !avatarFields.every(k => Object.hasOwn(a, k)) ||
          !avatarIds.includes(a.avatarId) || !colors.includes(a.avatarBackgroundStart) || !colors.includes(a.avatarBackgroundEnd) ||
          !['horizontal', 'diagonal', 'vertical'].includes(a.avatarGradientDirection)) fail('invalid-argument', 'Invalid avatar.');
      avatar = Object.fromEntries(avatarFields.map(k => [k, a[k]]));
    }
  }
  return { ...data, bytes, avatar, fingerprint: hash(JSON.stringify([data.mode, bytes ? logoDigest(bytes) : null, avatar])) };
}

function refs(db, uid) { return { state: db.doc(`businessProfiles/${uid}/logoState/current`), user: db.doc(`users/${uid}`), public: db.doc(`publicProfiles/${uid}`) }; }
async function eligible(tx, db, request, now) {
  const actor = await requireEligibleActor({ request, db, reader: tx, now, includeProfileSnapshot: true });
  const [role, business, profile] = await tx.getAll(db.doc(`accountRoles/${actor.uid}`), db.doc(`businessProfiles/${actor.uid}`), db.doc(`publicProfiles/${actor.uid}`));
  if (role.get('role') !== 'business' || role.get('level') !== 2 || role.get('accountStatus') === 'deleted' ||
      !business.exists || profile.get('accountStatus') === 'deleted' || !profile.exists || !actor.profile.nickname) fail('permission-denied', 'Business permission is required.');
  if ((actor.profile.businessLogoPath ?? null) !== (profile.get('businessLogoPath') ?? null) ||
      (actor.profile.businessLogoVersion ?? null) !== (profile.get('businessLogoVersion') ?? null)) fail('failed-precondition', 'The public and private logo references disagree.');
  return { actor, incarnation: stamp(actor.profileSnapshot.createTime) };
}
function matching(pending, operationId, fingerprint, incarnation) {
  if (!pending || pending.operationId !== operationId || pending.fingerprint !== fingerprint || pending.incarnation !== incarnation) fail('already-exists', 'Retry the existing logo operation first.');
}

export async function updateBusinessLogoOperation(request, db, storage, { enabled = false, clock = () => new Date() } = {}) {
  if (enabled !== true) fail('failed-precondition', 'Business logo processing is disabled.');
  const identity = requireCallableIdentity(request), input = validateLogoRequest(request.data), uid = identity.uid;
  if (uid !== input.expectedUserId) fail('unauthenticated', 'The signed-in account changed.');
  const r = refs(db, uid), operationId = hash(`${uid}\n${action}\n${input.idempotencyKey}`), receiptRef = db.doc(`serverOperations/${operationId}`);
  const inspect = () => db.runTransaction(async tx => {
    const date = clock(), { actor, incarnation } = await eligible(tx, db, request, date);
    const [receipt, state] = await tx.getAll(receiptRef, r.state);
    const retention = receiptRetentionFields(input.idempotencyKey, Timestamp.fromDate(date), receipt.data());
    if (receipt.exists) {
      if (receipt.get('fingerprint') !== input.fingerprint || receipt.get('incarnation') !== incarnation) fail('already-exists', 'The logo request changed.');
      if (receipt.get('result.status') === 'cancelled') fail('failed-precondition', 'The original logo operation was cancelled.');
      return { complete: receipt.get('result'), pending: state.get('pending') ?? null, incarnation };
    }
    const pending = state.get('pending');
    if (pending && pending.phase !== 'published') matching(pending, operationId, input.fingerprint, incarnation);
    return { pending: pending ?? null, incarnation, actor, retention };
  });
  let first = await inspect();
  if (first.pending?.phase === 'published') {
    await cleanupBusinessLogoOperation(db, storage, uid, { enabled, clock });
    first = await inspect();
  }
  if (first.complete) return first.complete;
  const png = input.bytes ? await normalizeBusinessLogo(input.bytes) : null;
  const oldPath = first.actor.profile.businessLogoPath ?? null;
  if (oldPath && !validLogoPath(uid, oldPath)) fail('failed-precondition', 'The previous logo requires review.');
  const old = oldPath ? await storage.inspect(uid, oldPath) : null;
  const pending = await db.runTransaction(async tx => {
    const date = clock(), { actor, incarnation } = await eligible(tx, db, request, date), now = Timestamp.fromDate(date);
    const [state, receipt] = await tx.getAll(r.state, receiptRef);
    receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) return null;
    if (state.get('pending')) { matching(state.get('pending'), operationId, input.fingerprint, incarnation); return state.get('pending'); }
    if ((actor.profile.businessLogoPath ?? null) !== oldPath) fail('aborted', 'The previous logo changed.');
    const version = Math.max(date.getTime(), (state.get('version') ?? 0) + 1, (actor.profile.businessLogoVersion ?? 0) + 1);
    if (!Number.isSafeInteger(version) || version <= 0) fail('failed-precondition', 'Invalid logo version.');
    const p = { operationId, fingerprint: input.fingerprint, incarnation, phase: 'prepared', mode: input.mode,
      version, path: png ? `businessLogos/${uid}/logo-${version}.png` : null, digest: png ? logoDigest(png) : null,
      oldPath, oldGeneration: old?.generation ?? null, createdAt: now, expiresAt: Timestamp.fromMillis(now.toMillis() + operationRetryWindowMillis) };
    tx.set(r.state, { version, pending: p, cleanupAt: p.expiresAt }); return p;
  });
  if (!pending) return (await inspect()).complete;
  const guard = async () => { const current = await inspect(); if (!current.complete) matching(current.pending, operationId, input.fingerprint, current.incarnation); };
  const object = pending.phase === 'prepared' && png ? await storage.put(uid, pending.path, png, guard) : null;
  const result = await db.runTransaction(async tx => {
    const date = clock(), { actor, incarnation } = await eligible(tx, db, request, date), now = Timestamp.fromDate(date);
    const [receipt, state] = await tx.getAll(receiptRef, r.state);
    const retention = receiptRetentionFields(input.idempotencyKey, now, receipt.data());
    if (receipt.exists) return receipt.get('result');
    const p = state.get('pending'); matching(p, operationId, input.fingerprint, incarnation);
    if ((actor.profile.businessLogoPath ?? null) !== p.oldPath || p.phase !== 'prepared') fail('failed-precondition', 'The profile changed during logo processing.');
    const patch = p.path ? { businessLogoPath: p.path, businessLogoVersion: p.version } :
      { businessLogoPath: FieldValue.delete(), businessLogoVersion: FieldValue.delete(), ...(input.avatar ?? {}) };
    tx.update(r.user, patch); tx.update(r.public, patch);
    const done = { status: 'complete', path: p.path, version: p.path ? p.version : null };
    tx.create(receiptRef, { action, userId: uid, incarnation, fingerprint: input.fingerprint, idempotencyKey: input.idempotencyKey, createdAt: now, ...retention, result: done });
    tx.update(r.state, { pending: { ...p, phase: 'published', generation: object?.generation ?? null }, cleanupAt: now });
    return done;
  });
  // Failure here leaves the committed logo and a durable cleanup pointer. Never
  // delete the newly published object to compensate a lost client response.
  await cleanupBusinessLogoOperation(db, storage, uid, { enabled, clock });
  return result;
}

// Exact-account, bounded maintenance adapter; no global scan or live schedule.
export async function cleanupBusinessLogoOperation(db, storage, uid, { enabled = false, clock = () => new Date() } = {}) {
  if (!enabled) return { status: 'disabled' };
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Error('invalid-logo-cleanup-user');
  const r = refs(db, uid);
  const read = () => db.runTransaction(async tx => {
    const [state, user, profile, deletion] = await tx.getAll(r.state, r.user, r.public, db.doc(`accountDeletionRequests/${uid}`));
    const p = state.get('pending'); if (!p) return null;
    if (!(p.createdAt instanceof Timestamp) || !(p.expiresAt instanceof Timestamp) || p.expiresAt.toMillis() !== p.createdAt.toMillis() + operationRetryWindowMillis ||
        !['prepared', 'published'].includes(p.phase) || (p.path && !validLogoPath(uid, p.path)) || (p.oldPath && !validLogoPath(uid, p.oldPath))) fail('failed-precondition', 'Invalid logo cleanup state.');
    const retired = deletion.exists || !user.exists || stamp(user.createTime) !== p.incarnation || profile.get('accountStatus') === 'deleted';
    // Already-published user files present at account deletion stay under the
    // original account retention. The existing account purge owns that prefix.
    if (p.phase === 'published' && deletion.exists) return { p, accountPurge: true };
    if (p.phase === 'prepared' && !retired && clock().getTime() < p.expiresAt.toMillis()) return null;
    const path = p.phase === 'published' ? p.oldPath : p.path;
    if (path && (user.get('businessLogoPath') === path || profile.get('businessLogoPath') === path)) fail('failed-precondition', 'Cleanup cannot remove the current logo.');
    return { p, path, expected: p.phase === 'published' ? p.oldGeneration : null };
  });
  const chosen = await read(); if (!chosen) return { status: 'idle' };
  if (chosen.accountPurge) {
    await db.runTransaction(async tx => {
      const [state, deletion] = await tx.getAll(r.state, db.doc(`accountDeletionRequests/${uid}`));
      if (deletion.exists && state.get('pending.operationId') === chosen.p.operationId) {
        // Account purge owns the files; do not rediscover this idle work every
        // minute throughout the original retention. Keep the durable pointer.
        tx.update(r.state, { cleanupAt: FieldValue.delete() });
      }
    });
    return { status: 'account-purge' };
  }
  const existing = chosen.path ? await storage.inspect(uid, chosen.path) : null;
  if (existing && (chosen.p.phase === 'published' ? existing.generation !== chosen.expected : existing.digest !== chosen.p.digest)) fail('failed-precondition', 'The retired logo generation changed.');
  if (existing) await storage.remove(uid, chosen.path, existing.generation, async () => {
    const current = await read();
    if (!current || current.p.operationId !== chosen.p.operationId || current.path !== chosen.path) fail('aborted', 'The logo cleanup changed.');
  });
  await db.runTransaction(async tx => {
    const receiptRef = db.doc(`serverOperations/${chosen.p.operationId}`);
    const [state, receipt] = await tx.getAll(r.state, receiptRef);
    if (state.get('pending.operationId') === chosen.p.operationId) {
      // Remember a retired in-flight operation within its original window. A
      // recreated account/profile must not reuse its key after orphan cleanup.
      // Never recreate a receipt after the original retry deadline.
      if (chosen.p.phase === 'prepared' && !receipt.exists && clock().getTime() < chosen.p.expiresAt.toMillis()) {
        tx.create(receiptRef, { action, userId: uid, incarnation: chosen.p.incarnation, fingerprint: chosen.p.fingerprint,
          keyVersion: 1, createdAt: chosen.p.createdAt, expiresAt: chosen.p.expiresAt, result: { status: 'cancelled' } });
      }
      tx.update(r.state, { pending: null, cleanupAt: FieldValue.delete() });
    }
  });
  return { status: 'cleaned', objectsRemoved: existing ? 1 : 0 };
}

// Optional bounded discovery for a future existing worker. It is not installed
// into any live wrapper. The caller persists the returned checkpoint; invalid
// rows are reported rather than creating an unbounded first-page loop.
export async function cleanupBusinessLogoBatch(db, storage, { enabled = false, clock = () => new Date(), limit = 50, after = null } = {}) {
  if (!enabled) return { status: 'disabled' };
  const parts = typeof after?.path === 'string' ? after.path.split('/') : [];
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || after !== null &&
      (!(after.at instanceof Timestamp) || after.at.toMillis() > clock().getTime() || parts.length < 2 || parts.length % 2 !== 0 ||
        parts.at(-2) !== 'logoState' || parts.some(p => !/^[A-Za-z0-9_-]{1,128}$/.test(p)))) throw Error('invalid-logo-cleanup-page');
  let query = db.collectionGroup('logoState').where('cleanupAt', '<=', Timestamp.fromDate(clock()))
    .orderBy('cleanupAt').orderBy(FieldPath.documentId());
  if (after) query = query.startAfter(after.at, db.doc(after.path));
  const page = await query.limit(limit).get(); let cleaned = 0; const needsReview = [];
  for (const row of page.docs) {
    const match = /^businessProfiles\/([A-Za-z0-9_-]{1,128})\/logoState\/current$/.exec(row.ref.path);
    if (!match) { needsReview.push(row.ref.path); continue; }
    try { if ((await cleanupBusinessLogoOperation(db, storage, match[1], { enabled, clock })).status === 'cleaned') cleaned++; }
    catch (error) { if (error.code === 'failed-precondition') needsReview.push(row.ref.path); else throw error; }
  }
  const last = page.docs.at(-1);
  return { status: 'checked', examined: page.size, cleaned, needsReview, after: page.size === limit ? { at: last.get('cleanupAt'), path: last.ref.path } : null };
}
