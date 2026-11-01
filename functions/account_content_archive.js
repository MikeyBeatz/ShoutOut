// Internal archive primitives. Reached only by the gated v3 pipeline; no independent callable export.
import { createHash } from 'node:crypto';
import { Timestamp, FieldPath } from 'firebase-admin/firestore';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';

const retentionMillis = 60 * 86400000;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const same = (a, b) => a instanceof Timestamp && a.isEqual(b);
export class AccountArchiveNeedsReview extends Error {}

export function accountContentArchiveId(projectId, path, createTime) {
  if (typeof projectId !== 'string' || !projectId || typeof path !== 'string' || !(createTime instanceof Timestamp)) {
    throw new Error('invalid-content-archive-identity');
  }
  return createHash('sha256').update(JSON.stringify([projectId, path, createTime.seconds, createTime.nanoseconds])).digest('hex');
}

function context(identity, db, { pageSize = 50, clock = () => new Date(), transactionGuard } = {}) {
  if (!identity || identity.projectId !== db.projectId || !identifier(identity.userId) ||
      !(identity.requestCreateTime instanceof Timestamp) || typeof transactionGuard !== 'function' ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || typeof clock !== 'function') {
    throw new Error('invalid-content-archive-options');
  }
  const requestRef = db.doc(`accountDeletionRequests/${identity.userId}`);
  const retainUntil = Timestamp.fromMillis(identity.requestCreateTime.toMillis() + retentionMillis);
  const now = () => {
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) throw new Error('invalid-content-archive-clock');
    if (date.getTime() >= retainUntil.toMillis()) throw new AccountArchiveNeedsReview('archive-retention-expired');
    return Timestamp.fromDate(date);
  };
  const check = request => {
    if (!request.exists || request.data()?.userId !== identity.userId || request.data()?.status !== 'pending') {
      throw new AccountDeletionRequestUnavailable('not-pending');
    }
    if (!same(request.createTime, identity.requestCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
  };
  const record = async (transaction, progress) => {
    const apply = await transactionGuard(transaction, progress);
    if (typeof apply !== 'function') throw new Error('content-archive-guard-required');
    return apply;
  };
  return { requestRef, retainUntil, pageSize, check, now, record };
}

async function missingAuth(auth, uid) {
  try { await auth.getUser(uid); return false; }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; return true; }
}

function target(snapshot, kind, uid) {
  const parts = snapshot.ref.path.split('/'), data = snapshot.data();
  if (parts.length !== 4 || parts[0] !== 'shouts' || !identifier(parts[1]) || !identifier(parts[3]) ||
      parts[2] !== (kind === 'comment' ? 'comments' : 'privateReplies')) {
    throw new AccountArchiveNeedsReview('unexpected-content-path');
  }
  if (!identifier(data.authorId) || typeof data.text !== 'string' || !(data.createdAt instanceof Timestamp)) {
    throw new AccountArchiveNeedsReview('invalid-archive-content');
  }
  if (kind === 'comment') return data.authorId === uid;
  if (!identifier(data.recipientId) || data.authorId === data.recipientId ||
      !Array.isArray(data.participants) || data.participants.length !== 2 ||
      data.participants[0] !== data.authorId || data.participants[1] !== data.recipientId) {
    throw new AccountArchiveNeedsReview('invalid-archive-participants');
  }
  return data.authorId === uid || data.recipientId === uid;
}

// Archive every matching root, regardless of reports. A comment pauses after
// its root so the caller drains its reactions before continuing other comments.
export async function archiveAccountContentPage(identity, db, auth, options = {}) {
  const c = context(identity, db, options), { kind, beforeTransaction = null } = options;
  if (!['comment', 'privateReply'].includes(kind)) throw new Error('invalid-content-archive-kind');
  c.now(); c.check(await c.requestRef.get());
  if (!await missingAuth(auth, identity.userId)) return { state: 'waiting-for-auth-deletion', archived: 0 };
  const group = db.collectionGroup(kind === 'comment' ? 'comments' : 'privateReplies');
  const candidates = []; let full = false;
  for (const field of kind === 'comment' ? ['authorId'] : ['authorId', 'recipientId']) {
    const remaining = c.pageSize - candidates.length;
    const page = await group.where(field, '==', identity.userId).limit(remaining).get();
    candidates.push(...page.docs);
    if (page.size === remaining) { full = true; break; }
  }
  let archived = 0, skipped = 0;
  for (const candidate of candidates) {
    target(candidate, kind, identity.userId);
    const descendants = await candidate.ref.listCollections();
    if (descendants.some(ref => kind !== 'comment' || ref.id !== 'reactions')) {
      throw new AccountArchiveNeedsReview('unexpected-content-subcollections');
    }
    const archiveId = accountContentArchiveId(db.projectId, candidate.ref.path, candidate.createTime);
    const archiveRef = db.doc(`accountContentArchive/${archiveId}`), shoutRef = candidate.ref.parent.parent;
    if (beforeTransaction) await beforeTransaction(candidate.ref);
    const result = await db.runTransaction(async transaction => {
      const [request, source, existing, shout] = await transaction.getAll(c.requestRef, candidate.ref, archiveRef, shoutRef);
      c.check(request); const time = c.now();
      // Even skipped work must be fenced against a replaced lease.
      if (!source.exists) { await c.record(transaction, { kind: 'check' }); return 'skipped'; }
      if (!same(source.createTime, candidate.createTime)) throw new AccountArchiveNeedsReview('content-incarnation-changed');
      if (!target(source, kind, identity.userId)) { await c.record(transaction, { kind: 'check' }); return 'skipped'; }
      if (existing.exists) throw new AccountArchiveNeedsReview('archive-source-coexist');
      const count = shout.data()?.commentsCount ?? 0;
      if (kind === 'comment' && shout.exists && (!Number.isSafeInteger(count) || count < 0)) {
        throw new AccountArchiveNeedsReview('invalid-parent-comment-count');
      }
      const apply = await c.record(transaction, { kind: 'archive-root', contentKind: kind, archiveId,
        pendingArchiveId: kind === 'comment' ? archiveId : null });
      transaction.create(archiveRef, { schemaVersion: 1, kind, sourcePath: source.ref.path,
        sourceCreateTime: source.createTime, sourceUpdateTime: source.updateTime,
        retentionOwnerId: identity.userId, requestCreateTime: identity.requestCreateTime,
        archivedAt: time, retainUntil: c.retainUntil, content: source.data(),
        reactionsComplete: kind !== 'comment', parentMissing: !shout.exists });
      transaction.delete(source.ref, { lastUpdateTime: source.updateTime });
      if (kind === 'comment' && shout.exists) transaction.update(shoutRef, { commentsCount: Math.max(0, count - 1) });
      apply(); return 'archived';
    });
    if (result === 'archived') archived++; else skipped++;
    if (kind === 'comment' && result === 'archived') return { state: 'reactions-pending', archived, skipped, archiveId, examined: archived + skipped };
  }
  return { state: full ? 'continuation' : 'content-page-complete', archived, skipped, examined: archived + skipped };
}

// The caller persists archiveId in the same root transaction. Reactions are
// copied before their source is removed; the archive inherits one fixed deadline.
export async function drainArchivedCommentReactionsPage(identity, db, auth, options = {}) {
  const c = context(identity, db, options), { archiveId, beforeTransaction = null } = options;
  if (typeof archiveId !== 'string' || !/^[a-f0-9]{64}$/.test(archiveId)) throw new Error('invalid-comment-archive-id');
  c.now(); c.check(await c.requestRef.get());
  if (!await missingAuth(auth, identity.userId)) return { state: 'waiting-for-auth-deletion', copied: 0 };
  const archiveRef = db.doc(`accountContentArchive/${archiveId}`), initial = await archiveRef.get();
  const checkArchive = snapshot => {
    const data = snapshot.data();
    if (!snapshot.exists || data.schemaVersion !== 1 || data.kind !== 'comment' ||
        data.retentionOwnerId !== identity.userId || !same(data.requestCreateTime, identity.requestCreateTime) ||
        !same(data.retainUntil, c.retainUntil) || typeof data.reactionsComplete !== 'boolean' ||
        !/^shouts\/[A-Za-z0-9_-]{1,128}\/comments\/[A-Za-z0-9_-]{1,128}$/.test(data.sourcePath) ||
        accountContentArchiveId(db.projectId, data.sourcePath, data.sourceCreateTime) !== archiveId) {
      throw new AccountArchiveNeedsReview('invalid-comment-archive');
    }
    return data;
  };
  const archived = checkArchive(initial), sourceRef = db.doc(archived.sourcePath);
  const page = await sourceRef.collection('reactions').orderBy(FieldPath.documentId()).limit(c.pageSize).get();
  let copied = 0;
  for (const candidate of page.docs) {
    if (!identifier(candidate.id) || (await candidate.ref.listCollections()).length) {
      throw new AccountArchiveNeedsReview('unexpected-reaction-subcollections');
    }
    if (beforeTransaction) await beforeTransaction(candidate.ref);
    const copiedRef = archiveRef.collection('reactions').doc(candidate.id);
    const changed = await db.runTransaction(async transaction => {
      const [request, archive, parent, source, existing] = await transaction.getAll(c.requestRef, archiveRef, sourceRef, candidate.ref, copiedRef);
      c.check(request); const data = checkArchive(archive), time = c.now();
      if (parent.exists) throw new AccountArchiveNeedsReview('comment-recreated-during-drain');
      if (data.reactionsComplete) throw new AccountArchiveNeedsReview('reaction-created-after-drain');
      const apply = await c.record(transaction, { kind: 'archive-reaction', archiveId, copied: source.exists ? 1 : 0 });
      if (!source.exists) return false;
      if (!same(source.createTime, candidate.createTime) || existing.exists) throw new AccountArchiveNeedsReview('reaction-archive-conflict');
      transaction.create(copiedRef, { sourceCreateTime: source.createTime, sourceUpdateTime: source.updateTime,
        archivedAt: time, content: source.data() });
      transaction.delete(source.ref, { lastUpdateTime: source.updateTime }); apply(); return true;
    });
    if (changed) copied++;
  }
  if (page.size === c.pageSize) return { state: 'continuation', copied, examined: page.size };
  await db.runTransaction(async transaction => {
    const [request, archive, parent] = await transaction.getAll(c.requestRef, archiveRef, sourceRef);
    c.check(request); const data = checkArchive(archive); c.now();
    if (parent.exists) throw new AccountArchiveNeedsReview('comment-recreated-during-drain');
    const apply = await c.record(transaction, { kind: 'reactions-complete', archiveId });
    if (!data.reactionsComplete) transaction.update(archiveRef, { reactionsComplete: true });
    apply();
  });
  return { state: 'reactions-complete', copied, examined: page.size };
}
