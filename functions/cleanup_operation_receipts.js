import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { legacyOperationKeysAccepted, operationRetryWindowMillis } from './operation_retention.js';

const actions = new Set(['createShout', 'createComment', 'createPrivateReply', 'toggleShoutReaction',
  'toggleCommentReaction', 'toggleShoutSave', 'createContentReport', 'deleteComment', 'deleteShout']);

export function receiptMayBePurged(data, now) {
  if (!data || !actions.has(data.action) || typeof data.userId !== 'string' || !data.userId ||
      !(data.createdAt instanceof Timestamp) || !(now instanceof Timestamp) ||
      ![undefined, 1].includes(data.keyVersion)) return false;
  const expires = data.createdAt.toMillis() + operationRetryWindowMillis;
  if (data.keyVersion === 1 && !(data.expiresAt instanceof Timestamp)) return false;
  if (data.expiresAt !== undefined &&
      (!(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() !== expires)) return false;
  return now.toMillis() >= expires;
}

/** Bounded, repeatable cleanup. Never enable before the timed-client cutover.
 * A last-update precondition avoids a second read of every immutable receipt.
 */
export async function cleanupExpiredOperationReceipts(db, {
  clock = () => new Date(), pageSize = 50, maximum = 500, cursor = null,
} = {}) {
  if (legacyOperationKeysAccepted) throw new Error('Legacy operation keys must be disabled before cleanup.');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 500) {
    throw new TypeError('Invalid cleanup work bounds.');
  }
  const now = Timestamp.fromDate(clock());
  const cutoff = Timestamp.fromMillis(now.toMillis() - operationRetryWindowMillis);
  if (cursor !== null && (!(cursor.createdAt instanceof Timestamp) ||
      typeof cursor.id !== 'string' || !cursor.id || cursor.id.includes('/') ||
      cursor.createdAt.toMillis() > cutoff.toMillis())) throw new TypeError('Invalid cleanup cursor.');
  const base = db.collection('serverOperations').where('createdAt', '<=', cutoff)
    .orderBy('createdAt').orderBy(FieldPath.documentId());
  const result = { scanned: 0, deleted: 0, skipped: 0, conflict: false,
    reachedLimit: false, nextCursor: cursor };
  while (result.scanned < maximum) {
    const limit = Math.min(pageSize, maximum - result.scanned);
    const page = await (cursor ? base.startAfter(cursor.createdAt, cursor.id) : base).limit(limit).get();
    if (page.empty) return { ...result, nextCursor: null };
    const candidates = page.docs.filter(doc => receiptMayBePurged(doc.data(), now));
    result.scanned += page.size;
    result.skipped += page.size - candidates.length;
    if (candidates.length) {
      const batch = db.batch();
      for (const doc of candidates) batch.delete(doc.ref, { lastUpdateTime: doc.updateTime });
      try {
        await batch.commit();
      } catch (error) {
        if (error.code !== 9) throw error; // FAILED_PRECONDITION: no batch deletes committed.
        result.conflict = true;
        return result; // A later invocation gets fresh snapshots.
      }
      result.deleted += candidates.length;
    }
    const last = page.docs.at(-1);
    cursor = { createdAt: last.get('createdAt'), id: last.id };
    result.nextCursor = cursor;
    if (page.size < limit) return { ...result, nextCursor: null };
  }
  result.reachedLimit = true;
  return result;
}

/** Persist scan progress so preserved malformed records cannot starve later pages.
 * Concurrent invocations may repeat safe work, but cannot overwrite a newer cursor.
 */
export async function runOperationReceiptCleanup(db, options = {}) {
  const checkpoint = db.doc('maintenanceState/operationReceiptCleanup');
  const before = await checkpoint.get();
  const result = await cleanupExpiredOperationReceipts(db, {
    ...options, cursor: before.data()?.cursor ?? null,
  });
  const next = { cursor: result.nextCursor, completedAt: Timestamp.fromDate(new Date()),
    scanned: result.scanned, deleted: result.deleted, skipped: result.skipped,
    conflict: result.conflict, reachedLimit: result.reachedLimit };
  try {
    if (before.exists) await checkpoint.update(next, { lastUpdateTime: before.updateTime });
    else await checkpoint.create(next);
  } catch (error) {
    if (![6, 9].includes(error.code)) throw error;
    return { ...result, checkpointConflict: true };
  }
  return { ...result, checkpointConflict: false };
}
