// Prepared B2 runtime. No live entry point imports this module yet.
import { createHmac } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { syncReadBatchOperation, getReadStatePageOperation } from './read_sync.js';

export const readSyncRatePolicy = Object.freeze({ capacity: 40, refillMillis: 1000 });
const reject = (reason, retryAfterMs) => {
  throw new HttpsError(reason === 'read-sync-rate-limit' ? 'resource-exhausted' : 'failed-precondition',
    'Read synchronization is temporarily unavailable.', { reason, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) });
};
function activeControl(snapshot) {
  const data = snapshot.data();
  if (!snapshot.exists || !data || Object.keys(data).sort().join(',') !== 'mode,revision,v' ||
      data.v !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 1 ||
      !['off', 'active', 'paused'].includes(data.mode)) reject('read-sync-disabled');
  if (data.mode !== 'active') reject(data.mode === 'paused' ? 'read-sync-paused' : 'read-sync-disabled');
  return { revision: data.revision, updateTime: snapshot.updateTime };
}
function assertSameControl(snapshot, admission) {
  const current = activeControl(snapshot);
  if (current.revision !== admission.revision || !current.updateTime.isEqual(admission.updateTime)) reject('read-sync-control-changed');
}

// Integer millisecond credits avoid rounding drift. Denied attempts never write.
export function consumeReadSyncCredit(data, nowMillis) {
  if (!Number.isSafeInteger(nowMillis) || nowMillis < 0) throw new Error('invalid-read-sync-clock');
  const capacity = readSyncRatePolicy.capacity * readSyncRatePolicy.refillMillis;
  let available = capacity, stamp = nowMillis;
  if (data !== undefined) {
    if (!data || Object.keys(data).sort().join(',') !== 'creditMillis,updatedAt,v' || data.v !== 1 ||
        !Number.isSafeInteger(data.creditMillis) || data.creditMillis < 0 || data.creditMillis > capacity ||
        !(data.updatedAt instanceof Timestamp) || !Number.isSafeInteger(data.updatedAt.toMillis()) || data.updatedAt.toMillis() < 0) {
      throw new Error('invalid-read-sync-rate-record');
    }
    stamp = Math.max(nowMillis, data.updatedAt.toMillis());
    available = Math.min(capacity, data.creditMillis + Math.max(0, nowMillis - data.updatedAt.toMillis()));
  }
  if (available < readSyncRatePolicy.refillMillis) {
    return { allowed: false, retryAfterMs: stamp - nowMillis + readSyncRatePolicy.refillMillis - available };
  }
  return { allowed: true, record: { v: 1, creditMillis: available - readSyncRatePolicy.refillMillis, updatedAt: Timestamp.fromMillis(stamp) } };
}

export function deriveReadSyncCursorKey(projectKey) {
  if (!(projectKey instanceof Uint8Array) || projectKey.length !== 32) throw new Error('invalid-read-sync-project-key');
  return createHmac('sha256', projectKey).update('shoutout/read-sync/cursor/v1').digest();
}

export function createReadSyncRuntime(db, { key, clock = () => new Date(), afterAdmission, beforeCommit, afterRead, onMetrics } = {}) {
  assertFeedRuntimeTarget(db);
  const signingKey = deriveReadSyncCursorKey(key), control = db.doc('maintenanceState/readSyncControl');
  const access = {
    async admit(request, direction) {
      const { uid } = requireCallableIdentity(request);
      const rateRef = db.doc(`rateLimits/${uid}/actions/readSync${direction === 'upload' ? 'Upload' : 'Download'}`);
      const admission = await db.runTransaction(async tx => {
        // Admission replaces the initial download eligibility read, rather than
        // repeating it. Never cache account authority or the control document.
        await requireEligibleActor({ request, db, reader: tx, now: clock() });
        const token = activeControl(await tx.get(control));
        const rate = await tx.get(rateRef), result = consumeReadSyncCredit(rate.data(), clock().getTime());
        if (!result.allowed) reject('read-sync-rate-limit', result.retryAfterMs);
        tx.set(rateRef, result.record);
        return token;
      });
      if (afterAdmission) await afterAdmission(direction);
      return admission;
    },
    async guard(tx, admission) { assertSameControl(await tx.get(control), admission); },
    async confirm(request, admission) {
      // Current transaction, never the historical readTime of the page.
      await db.runTransaction(async tx => {
        await requireEligibleActor({ request, db, reader: tx, now: clock() });
        await access.guard(tx, admission);
      }, { readOnly: true });
    },
  };
  return Object.freeze({
    upload: request => syncReadBatchOperation(request, db, { clock, access, beforeCommit, onMetrics }),
    download: request => getReadStatePageOperation(request, db, { key: signingKey, clock, access, pageSize: 32, afterRead }),
  });
}
