// Prepared source-list reader. Never lists the private archive or conversations.
import { createHash } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { publicFeedBody } from './feed_public_body.js';
import { distanceKm } from './feed_spatial.js';
import { contentLifecycleConfiguration, validateLifecycleThread, lifecycleArchiveKey } from './content_lifecycle.js';
import { privateReportModeratorLevel, assertPrivateReportScope } from './remove_reported_private_reply.js';

const views = ['comments', 'profile', 'business', 'staff', 'home'];
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const fail = (code, message) => { throw new HttpsError(code, message); };
const bad = () => fail('invalid-argument', 'Invalid content source page.');
const stamp = v => [v.seconds, v.nanoseconds];
function timestamp(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isSafeInteger) ||
      value[0] < 0 || value[0] > 253402300799 || value[1] < 0 || value[1] >= 1e9) bad();
  return new Timestamp(...value);
}
function nowAt(clock) {
  const now = clock();
  if (!(now instanceof Date) || !Number.isSafeInteger(now.getTime())) fail('failed-precondition', 'operation-clock-unavailable');
  return Timestamp.fromDate(now);
}
export function validateLifecycleSourceInput(input, uid) {
  if (!plain(input) || Object.keys(input).some(k => !['expectedUserId', 'view', 'authorId', 'countryCode', 'subdivisionCode', 'point', 'after'].includes(k)) ||
      input.expectedUserId !== uid || !id(uid) || !views.includes(input.view)) bad();
  const authorId = input.authorId ?? null, countryCode = input.countryCode ?? null, subdivisionCode = input.subdivisionCode ?? null;
  if (input.view === 'profile' ? !id(authorId) : authorId !== null) bad();
  if (countryCode !== null && (typeof countryCode !== 'string' || !/^[A-Z]{2}$/.test(countryCode)) ||
      subdivisionCode !== null && (typeof subdivisionCode !== 'string' || !/^[A-Z]{2}-[A-Z0-9-]{1,8}$/.test(subdivisionCode)) ||
      input.view !== 'staff' && (countryCode !== null || subdivisionCode !== null) || countryCode !== null && subdivisionCode !== null) bad();
  if (input.point != null && (!plain(input.point) || Object.keys(input.point).length !== 2 ||
      !Number.isFinite(input.point.latitude) || Math.abs(input.point.latitude) > 90 ||
      !Number.isFinite(input.point.longitude) || Math.abs(input.point.longitude) > 180)) bad();
  const selection = createHash('sha256').update(JSON.stringify([input.view, authorId, countryCode, subdivisionCode])).digest('hex');
  const after = input.after ?? null;
  if (after !== null) {
    if (!plain(after) || Object.keys(after).length !== 6 || after.v !== 1 || after.userId !== uid || after.view !== input.view ||
        after.selection !== selection || typeof after.path !== 'string' ||
        !(input.view === 'comments' ? /^shouts\/[A-Za-z0-9_-]{1,128}\/comments\/[A-Za-z0-9_-]{1,128}$/ : /^shouts\/[A-Za-z0-9_-]{1,128}$/).test(after.path)) bad();
    timestamp(after.createdAt);
  }
  return { view: input.view, authorId, countryCode, subdivisionCode, point: input.point ?? null, after, selection };
}

export async function getLifecycleSourcePageOperation(request, db, { enabled = contentLifecycleConfiguration.enabled,
  clock = () => new Date() } = {}) {
  if (typeof enabled !== 'boolean') throw new Error('invalid-content-lifecycle-option');
  if (!enabled) fail('failed-precondition', 'Content lifecycle is not enabled.');
  assertFeedRuntimeTarget(db);
  const { uid } = requireCallableIdentity(request), input = validateLifecycleSourceInput(request.data, uid);
  return db.runTransaction(async tx => {
    await requireEligibleActor({ request, db, reader: tx, now: nowAt(clock).toDate() });
    let role, level;
    if (input.view === 'staff') {
      const [current, legacy] = await tx.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`));
      role = current.data(); level = privateReportModeratorLevel(role, legacy.data());
      assertPrivateReportScope(role, level, { geography: input.countryCode || input.subdivisionCode ? {
        schemaVersion: 1, countryCode: input.countryCode, subdivisionCode: input.subdivisionCode,
      } : null });
    }
    let query = input.view === 'comments' ? db.collectionGroup('comments').where('authorId', '==', uid) : db.collection('shouts');
    if (input.view === 'profile') query = query.where('authorId', '==', input.authorId);
    if (input.view === 'business') query = query.where('authorId', '==', uid).where('status', 'in', ['active', 'expired', 'deleted']);
    else if (input.view !== 'comments') query = query.where('status', '==', 'active');
    if (input.countryCode) query = query.where('geography.countryCode', '==', input.countryCode);
    if (input.subdivisionCode) query = query.where('geography.subdivisionCode', '==', input.subdivisionCode);
    query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (input.after) query = query.startAfter(timestamp(input.after.createdAt), db.doc(input.after.path));
    // A sparse page is not terminal: advance by the last scanned source even
    // when every body is unavailable. Never scan unboundedly to fill a page.
    const page = await tx.get(query.limit(50)), parents = new Map(), headers = new Map(), authors = new Map();
    const fetch = async (cache, paths) => {
      const missing = [...new Set(paths)].filter(path => !cache.has(path));
      if (missing.length) for (const doc of await tx.getAll(...missing.map(path => db.doc(path)))) cache.set(doc.ref.path, doc);
    };
    for (const source of page.docs) {
      const parts = source.ref.path.split('/');
      if (!(source.get('createdAt') instanceof Timestamp) || source.get('createdAt').seconds < 0) fail('data-loss', 'Invalid source timestamp.');
      if (parts[0] !== 'shouts' || !id(parts[1]) || (input.view === 'comments' ? parts.length !== 4 || parts[2] !== 'comments' || !id(parts[3]) : parts.length !== 2)) {
        fail('data-loss', 'Unexpected content source path.');
      }
      if (input.view !== 'comments') parents.set(source.ref.path, source);
    }
    await fetch(parents, page.docs.map(source => `shouts/${source.ref.path.split('/')[1]}`));
    const candidates = page.docs.map(source => ({ source, root: parents.get(`shouts/${source.ref.path.split('/')[1]}`) })).filter(({ root }) =>
      root.exists && root.get('contentPurged') !== true && ['active', 'expired', 'deleted'].includes(root.get('status')) &&
      (root.get('status') !== 'deleted' || root.get('authorId') === uid));
    const authorIds = [...new Set(candidates.flatMap(({ root, source }) => [root.get('authorId'), ...(input.view === 'comments' ? [source.get('authorId')] : [])]))];
    if (!authorIds.every(id)) fail('data-loss', 'Invalid content author.');
    // Eligibility has already read and rejected the actor's deletion request
    // in this transaction. Reuse that result rather than charge another read.
    await fetch(authors, authorIds.flatMap(author => [`publicProfiles/${author}`, ...(author === uid ? [] : [`accountDeletionRequests/${author}`])]));
    const visibleAuthor = author => !authors.get(`accountDeletionRequests/${author}`)?.exists && authors.get(`publicProfiles/${author}`).get('accountStatus') !== 'deleted';
    const eligible = candidates.filter(({ root, source }) => visibleAuthor(root.get('authorId')) &&
      (input.view !== 'comments' || visibleAuthor(source.get('authorId'))));
    await fetch(headers, eligible.map(({ root }) => `contentLifecycleThreads/${root.id}`));
    const selected = [];
    for (const { root, source } of eligible) {
      if (!root.exists || root.get('contentPurged') === true || !['active', 'expired', 'deleted'].includes(root.get('status'))) continue;
      if (root.get('status') === 'deleted' && root.get('authorId') !== uid) continue;
      const thread = headers.get(`contentLifecycleThreads/${root.id}`);
      if (!thread.exists) fail('failed-precondition', 'Content archive migration is required.');
      const header = validateLifecycleThread(thread.data(), root.id), body = root.data();
      if (!header.sourceCreatedAt.isEqual(body.createdAt) || !header.plannedExpiresAt.isEqual(body.expiresAt) ||
          root.get('contentArchiveKey') !== lifecycleArchiveKey(db.projectId, root.ref.path, body) ||
          !header.publicUntil.isEqual(body.publicUntil) || !header.historyUntil.isEqual(body.historyUntil) ||
          input.view === 'comments' && source.get('contentArchiveKey') !== lifecycleArchiveKey(db.projectId, source.ref.path, source.data())) {
        fail('data-loss', 'Invalid source lifecycle binding.');
      }
      if (input.view === 'staff') assertPrivateReportScope(role, level, body);
      const activeOnly = !['comments', 'business'].includes(input.view);
      if (activeOnly && (body.status !== 'active' || header.publicUntil.toMillis() <= nowAt(clock).toMillis())) continue;
      if (header.historyUntil.toMillis() <= nowAt(clock).toMillis()) continue;
      if (input.point && (!Number.isFinite(body.location?.latitude) || !Number.isFinite(body.location?.longitude))) continue;
      if (input.view === 'business' && !body.businessHighlighted && !body.businessSpotlight && !body.businessExtendedDuration) continue;
      const comment = input.view === 'comments' ? source.data() : null;
      if (comment && (comment.authorId !== uid || typeof comment.text !== 'string' || !(comment.createdAt instanceof Timestamp) ||
          comment.createdAt.toMillis() < header.sourceCreatedAt.toMillis() || comment.createdAt.toMillis() > header.publicUntil.toMillis())) fail('data-loss', 'Invalid own comment.');
      selected.push({ source, root, body, header, comment, activeOnly });
    }
    const now = nowAt(clock).toMillis(), items = selected.filter(s => s.header.historyUntil.toMillis() > now &&
      (!s.activeOnly || s.header.publicUntil.toMillis() > now)).map(({ source, root, body, header, comment }) => ({
      id: root.id, distanceKm: input.point && Number.isFinite(body.location?.latitude) && Number.isFinite(body.location?.longitude)
        ? distanceKm(input.point, body.location) : 0,
      data: { ...publicFeedBody(body), publicUntil: header.publicUntil.toMillis(), historyUntil: header.historyUntil.toMillis(),
        ...(header.publicUntil.toMillis() <= now ? { readOnlyHistory: true } : {}) },
      ...(comment ? { comment: { id: source.id, text: comment.text, createdAt: comment.createdAt.toMillis() } } : {}),
    }));
    const last = page.docs.at(-1);
    return { version: 1, view: input.view, userId: uid, selection: input.selection, items,
      next: page.size === 50 ? { v: 1, userId: uid, view: input.view, selection: input.selection, path: last.ref.path, createdAt: stamp(last.get('createdAt')) } : null };
  });
}
