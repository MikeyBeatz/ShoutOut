import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { privateReportModeratorLevel } from './remove_reported_private_reply.js';
import { requireIdentityRuntime, identityId, identityNow, validateIdentityAccount, identityCollections } from './archive_identity.js';
import { lifecycleSubjectDeadline, validateLifecycleArchive, validateLifecycleThread } from './content_lifecycle.js';

const fail = (code, text) => { throw new HttpsError(code, text); };
const absent = () => fail('not-found', 'The retained archive is unavailable.');
const actions = ['lookup', 'shouts', 'comments', 'detail'];
const projection = ['kind', 'sourcePath', 'threadId', 'threadCreatedAt', 'sourceCreatedAt', 'authorAccountKey', 'subjectUserIds'];
const uidFields = data => [...new Set(data.subjectUserIds ?? [])];

function inputFor(request, codec) {
  const uid = requireCallableIdentity(request).uid, input = request.data;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['action', 'expectedUserId', 'requestId', 'caseReference', 'type', 'value', 'accountKey', 'archiveKey', 'threadArchiveKey', 'cursor'].includes(k)) ||
      input.expectedUserId !== uid || !actions.includes(input.action) ||
      typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(input.requestId) ||
      typeof input.caseReference !== 'string' || !input.caseReference.trim() || input.caseReference.length > 200) fail('invalid-argument', 'Invalid archive access request.');
  const { action } = input;
  if (action === 'lookup' ? !['email', 'phone'].includes(input.type) || input.accountKey !== undefined || input.archiveKey !== undefined :
    !identityId(input.accountKey) || input.type !== undefined || input.value !== undefined) fail('invalid-argument', 'Invalid archive selection.');
  if (['detail', 'comments'].includes(action) ? !identityId(input.archiveKey) : input.archiveKey !== undefined) fail('invalid-argument', 'Invalid archive target.');
  if (action === 'detail' && input.cursor !== undefined) fail('invalid-argument', 'A detail has no page cursor.');
  if (input.threadArchiveKey !== undefined && (action !== 'detail' || !identityId(input.threadArchiveKey))) fail('invalid-argument', 'Invalid archive thread selection.');
  const selection = codec.digest('selection', uid, action, input.caseReference.trim(),
    action === 'lookup' ? codec.contact(input.type, input.value) : input.accountKey, input.archiveKey ?? null, input.threadArchiveKey ?? null);
  const cursor = input.cursor;
  if (cursor != null && (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || Object.keys(cursor).sort().join() !== 'id,mac,selection' ||
      !identityId(cursor.id) || cursor.selection !== selection || cursor.mac !== codec.digest('cursor', selection, cursor.id))) fail('invalid-argument', 'The archive cursor belongs to a different request.');
  return { ...input, uid, selection, caseReference: input.caseReference.trim() };
}

async function accountAt(tx, runtime, key, now, subjects) {
  const { db, codec } = runtime, snapshot = await tx.get(db.doc(`${identityCollections.accounts}/${key}`));
  if (!snapshot.exists) return null;
  const data = validateIdentityAccount(snapshot.data(), codec, key);
  // Auth removal alone does not deny retained data. Request birth, purge fence,
  // and the existing public deletion marker remain the authority for expiry.
  const end = await lifecycleSubjectDeadline(tx, db, [data.userId], Timestamp.fromMillis(253402300799000), subjects);
  if (data.deletionRequestCreateTime !== undefined && !(data.deletionRequestCreateTime instanceof Timestamp)) fail('failed-precondition', 'Invalid retained identity deadline.');
  if (data.deletionClosedAt !== undefined && data.deletionRequestCreateTime === undefined) {
    const originalRequest = subjects.get(data.userId)?.[0];
    if (!(data.deletionClosedAt instanceof Timestamp) || !originalRequest?.exists ||
        !identityId(data.deletionClosureKey) || originalRequest.get('identityClosureKey') !== data.deletionClosureKey) return null;
  }
  const deadline = Math.min(end.retainUntil.toMillis(), data.deletionRequestCreateTime ? data.deletionRequestCreateTime.toMillis() + 60 * 86400000 : Infinity);
  if (deadline <= now.toMillis()) return null;
  return { key, ...data, retainUntil: Timestamp.fromMillis(deadline) };
}
async function contentAt(tx, runtime, snapshot, now, subjects, { full = false, headers = new Map() } = {}) {
  const data = snapshot.data();
  if (!['shout', 'comment'].includes(data?.kind)) return null; // No general private conversation access.
  if (!Array.isArray(data.subjectUserIds) || data.subjectUserIds.length !== 1 || !(data.sourceCreatedAt instanceof Timestamp) ||
      typeof data.threadId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.threadId) || !(data.threadCreatedAt instanceof Timestamp)) fail('data-loss', 'Invalid archive page identity.');
  if (full) validateLifecycleArchive(runtime.db, snapshot.id, data);
  if (!headers.has(data.threadId)) headers.set(data.threadId, await tx.get(runtime.db.doc(`contentLifecycleThreads/${data.threadId}`)));
  const thread = headers.get(data.threadId);
  if (!thread.exists) return null;
  const header = validateLifecycleThread(thread.data(), data.threadId);
  if (!data.threadCreatedAt.isEqual(header.sourceCreatedAt)) fail('failed-precondition', 'The archive thread incarnation changed.');
  const end = await lifecycleSubjectDeadline(tx, runtime.db, uidFields(data), header.retainUntil, subjects);
  if (end.retainUntil.toMillis() <= now.toMillis()) return null;
  return { data, retainUntil: end.retainUntil };
}
function publicDetail(data) {
  const fields = data.kind === 'shout' ? ['authorId', 'authorNickname', 'title', 'text', 'category'] : ['authorId', 'authorNickname', 'text', 'replyToCommentId', 'replyToNickname'];
  return Object.fromEntries(fields.filter(k => typeof data.content[k] === 'string').map(k => [k, data.content[k]]));
}

export async function getArchiveIdentityPageOperation(request, runtime) {
  const { db, codec, clock } = requireIdentityRuntime(runtime), input = inputFor(request, codec);
  return db.runTransaction(async tx => {
    const now = identityNow(clock), subjects = new Map(), headers = new Map();
    await requireEligibleActor({ request, db, reader: tx, now: now.toDate() });
    const [role, legacy] = await tx.getAll(db.doc(`accountRoles/${input.uid}`), db.doc(`moderators/${input.uid}`));
    const level = privateReportModeratorLevel(role.data(), legacy.data());
    if (![5, 6].includes(level)) fail('permission-denied', 'Administrator or owner permission is required.');
    let query, target, account, root;
    if (input.action === 'lookup') {
      query = db.collection(identityCollections.bindings).where('contactKey', '==', codec.contact(input.type, input.value));
    } else {
      account = await accountAt(tx, runtime, input.accountKey, now, subjects);
      if (!account) return absent();
      if (['comments', 'detail'].includes(input.action)) {
        root = await tx.get(db.doc(`contentLifecycleArchive/${input.archiveKey}`));
        if (!root.exists) return absent();
        target = await contentAt(tx, runtime, root, now, subjects, { full: true, headers });
        if (!target || input.action === 'comments' && root.get('kind') !== 'shout') return absent();
        if (input.threadArchiveKey) {
          const parent = await tx.get(db.doc(`contentLifecycleArchive/${input.threadArchiveKey}`));
          if (!parent.exists || parent.get('kind') !== 'shout' || root.get('kind') !== 'comment' ||
              parent.get('authorAccountKey') !== account.key || parent.get('threadId') !== root.get('threadId') ||
              !parent.get('threadCreatedAt')?.isEqual(root.get('threadCreatedAt')) ||
              !await contentAt(tx, runtime, parent, now, subjects, { full: true, headers })) return absent();
        } else if (root.get('authorAccountKey') !== account.key) return absent();
      }
      if (input.action === 'shouts') query = db.collection('contentLifecycleArchive').where('authorAccountKey', '==', account.key).where('kind', '==', 'shout');
      if (input.action === 'comments') query = db.collection('contentLifecycleArchive').where('threadId', '==', root.get('threadId')).where('kind', '==', 'comment');
    }
    const items = [], targetUids = new Set(), accountKeys = new Set();
    let earliestDeadline = account?.retainUntil.toMillis() ?? Infinity;
    let next = null;
    if (query) {
      query = query.orderBy(FieldPath.documentId()).limit(50);
      if (input.cursor) query = query.startAfter(input.cursor.id);
      if (input.action !== 'lookup') query = query.select(...projection);
      const page = await tx.get(query);
      for (const doc of page.docs) {
        if (input.action === 'lookup') {
          const b = doc.data();
          if (b.schemaVersion !== 1 || b.keyVersion !== codec.keyVersion || b.type !== input.type ||
              doc.id !== codec.digest('binding', b.contactKey, b.accountKey) || !identityId(b.accountKey) ||
              !(b.observedAt instanceof Timestamp)) fail('data-loss', 'Invalid retained contact binding.');
          const a = await accountAt(tx, runtime, b.accountKey, now, subjects);
          if (!a) continue;
          earliestDeadline = Math.min(earliestDeadline, a.retainUntil.toMillis());
          if (b.userId !== a.userId || b.observedAt.toMillis() < a.authCreatedAtMillis) fail('data-loss', 'Invalid retained contact provenance.');
          items.push({ accountKey: a.key, userId: a.userId, authCreatedAtMillis: a.authCreatedAtMillis,
            observedAtMillis: b.observedAt.toMillis(), proof: b.proof });
          targetUids.add(a.userId); accountKeys.add(a.key);
        } else {
          const visible = await contentAt(tx, runtime, doc, now, subjects, { headers });
          if (!visible || input.action === 'comments' && !doc.get('threadCreatedAt').isEqual(root.get('threadCreatedAt'))) continue;
          earliestDeadline = Math.min(earliestDeadline, visible.retainUntil.toMillis());
          items.push({ archiveKey: doc.id, kind: doc.get('kind'), threadId: doc.get('threadId'),
            createdAtMillis: doc.get('sourceCreatedAt').toMillis(), retainUntilMillis: Math.min(account.retainUntil.toMillis(), visible.retainUntil.toMillis()),
            // Opening a comment remains scoped to its proven author, not the parent author.
            accountKey: doc.get('authorAccountKey') ?? null });
          uidFields(visible.data).forEach(uid => targetUids.add(uid));
        }
      }
      // A sparse nonfinal page still advances exactly 50 examined rows.
      if (page.size === 50) {
        const id = page.docs.at(-1).id;
        next = { id, selection: input.selection, mac: codec.digest('cursor', input.selection, id) };
      }
    } else {
      earliestDeadline = Math.min(earliestDeadline, target.retainUntil.toMillis());
      items.push({ archiveKey: root.id, kind: root.get('kind'), threadId: root.get('threadId'),
        createdAtMillis: root.get('sourceCreatedAt').toMillis(), capturedAtMillis: root.get('archivedAt').toMillis(),
        retainUntilMillis: Math.min(account.retainUntil.toMillis(), target.retainUntil.toMillis()), captureMode: root.get('captureMode') ?? 'atomic-write',
        privacyRedacted: root.get('redactedFromHash') !== undefined, content: publicDetail(root.data()) });
      uidFields(root.data()).forEach(uid => targetUids.add(uid));
    }
    if (account) { targetUids.add(account.userId); accountKeys.add(account.key); }
    const auditRef = db.doc(`archiveIdentityAccess/${input.uid}/accessAudits/${input.requestId}`);
    const old = await tx.get(auditRef);
    if (identityNow(clock).toMillis() >= earliestDeadline) return absent();
    const fingerprint = codec.digest('access', input.selection, input.cursor?.id ?? null);
    if (old.exists && old.get('fingerprint') !== fingerprint) fail('already-exists', 'The access request identifier was already used.');
    if (!old.exists) tx.create(auditRef, { schemaVersion: 1, actorId: input.uid, roleLevel: level, action: input.action,
      fingerprint, caseReference: input.caseReference, readAt: now, subjectUserIds: [...targetUids], accountKeys: [...accountKeys], examinedLimit: 50 });
    // Do not persist response bodies for replay. Every retry rechecks role,
    // deletion and retention, even when its access audit already exists.
    return { version: 1, userId: input.uid, action: input.action, items, next, coverage: 'proven-incarnations-only',
      validForMillis: Number.isFinite(earliestDeadline) ? Math.max(0, Math.floor(earliestDeadline - identityNow(clock).toMillis())) : null };
  });
}
