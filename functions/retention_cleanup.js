// Prepared bounded runners only. No live entry point imports this module.
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { receiptMayBePurged } from './cleanup_operation_receipts.js';
import { operationRetryWindowMillis, legacyOperationKeysAccepted } from './operation_retention.js';
import { readBucketId, readRetentionMillis, validateReadBlock } from './read_sync_blocks.js';
import { createRetentionChildProbe } from './retention_child_probe.js';

const dayMillis = 86400000, leaseMillis = 120000, retryMillis = 60000;
const stamp = value => value instanceof Timestamp && Number.isSafeInteger(value.toMillis()) && value.toMillis() >= 0;
const pathOf = path => typeof path === 'string' && path.split('/').length % 2 === 0 &&
  path.split('/').every(p => p && p !== '.' && p !== '..');
const emptyCounts = () => ({ scanned: 0, deleted: 0, pruned: 0, skipped: 0 });
const addCounts = (a, b) => Object.fromEntries(Object.keys(emptyCounts()).map(k => [k, a[k] + b[k]]));
export class RetentionLeaseLost extends Error {}

function validateState(data, kind) {
  if (!data || data.v !== 1 || data.kind !== kind || !Number.isSafeInteger(data.version) || data.version < 1 ||
      !(data.cutoff === null || stamp(data.cutoff)) || !stamp(data.nextRunAt) ||
      !(data.leaseToken === null || typeof data.leaseToken === 'string' && data.leaseToken.length > 0) ||
      !(data.leaseUntil === null || stamp(data.leaseUntil)) ||
      (data.leaseToken === null) !== (data.leaseUntil === null) ||
      !data.counts || Object.keys(emptyCounts()).some(k => !Number.isSafeInteger(data.counts[k]) || data.counts[k] < 0) ||
      !(data.epochStartedAt === null || stamp(data.epochStartedAt))) throw new Error('invalid-retention-checkpoint');
  if (data.cursor !== null) {
    if (!data.cutoff || !pathOf(data.cursor.path)) throw new Error('invalid-retention-cursor');
    // The cursor is a query sort value, not a bucket schema: a malformed
    // fractional day must remain skippable rather than poisoning continuation.
    if (kind === 'reads' && (!Number.isFinite(data.cursor.day) || data.cursor.day < 0 ||
        data.cursor.day > Math.floor((data.cutoff.toMillis() - readRetentionMillis) / dayMillis) ||
        data.cursor.path.split('/').at(-2) !== 'readBuckets')) throw new Error('invalid-retention-cursor');
    if (kind === 'receipts' && (!(data.cursor.createdAt instanceof Timestamp) || !Number.isSafeInteger(data.cursor.createdAt.toMillis()) ||
        data.cursor.createdAt.toMillis() > data.cutoff.toMillis() - operationRetryWindowMillis ||
        !/^serverOperations\/[^/]+$/.test(data.cursor.path))) throw new Error('invalid-retention-cursor');
  }
  if ((data.cutoff === null) !== (data.epochStartedAt === null) || data.cutoff === null && data.cursor !== null) throw new Error('invalid-retention-checkpoint');
  return data;
}

// These count SDK attempts, including retries and empty queries. Metadata RPCs
// are reported separately; index-entry billing/network/cloud CPU are excluded.
function measured(db, metrics) {
  return new Proxy(db, { get(target, name) {
    if (name !== 'runTransaction') return typeof target[name] === 'function' ? target[name].bind(target) : target[name];
    return async (operation, ...options) => {
      let committed;
      const value = await target.runTransaction(async real => {
        metrics.transactionAttempts++;
        const planned = { writes: 0, deletes: 0 };
        const tx = new Proxy(real, { get(real, method) {
          if (method === 'get' || method === 'getAll') return async (...args) => {
            metrics.readRequests++;
            const value = await real[method](...args);
            metrics.readUnits += Array.isArray(value) ? value.length : Math.max(1, value.size ?? 1);
            return value;
          };
          if (['set', 'update', 'create', 'delete'].includes(method)) return (...args) => {
            const category = method === 'delete' ? 'deletes' : 'writes'; planned[category]++;
            metrics[method === 'delete' ? 'attemptedDeletes' : 'attemptedWrites']++;
            real[method](...args); return tx;
          };
          return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
        } });
        const result = await operation(tx); committed = planned; return result;
      }, ...options);
      metrics.transactions++; metrics.committedWrites += committed.writes; metrics.committedDeletes += committed.deletes;
      return value;
    };
  } });
}

function readDecision(doc, cutoff) {
  const match = /^users\/([A-Za-z0-9_-]{1,128})\/readBuckets\/([^/]+)$/.exec(doc.ref.path), node = doc.data();
  if (!match) return { skipped: 1 };
  try {
    if (doc.id !== readBucketId(node.day, node.prefix)) return { skipped: 1 };
    validateReadBlock(node, node.day, node.prefix);
  } catch { return { skipped: 1 }; }
  const cutoffDay = Math.floor((cutoff.toMillis() - readRetentionMillis) / dayMillis);
  if (node.day < cutoffDay) return { deleted: 1 };
  if (node.kind !== 'leaf') return {};
  const entries = Object.fromEntries(Object.entries(node.entries).filter(([, row]) => row.retainUntil > cutoff.toMillis()));
  const pruned = Object.keys(node.entries).length - Object.keys(entries).length;
  // Keep empty leaves and routing branches in the partial UTC day. A new valid
  // upload must still find all its required children. No valid-state revision changes.
  return pruned ? { pruned, replacement: { ...node, entries } } : {};
}

async function runCleanup(kind, db, {
  clock = () => new Date(), elapsedClock = () => performance.now(), pageSize = 50,
  maxPages = 10, maxMillis = 10000, childProbe = null, beforeCommit,
} = {}) {
  assertFeedRuntimeTarget(db);
  if (kind === 'receipts' && legacyOperationKeysAccepted) throw new Error('retention-timed-clients-required');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10 ||
      !Number.isInteger(maxMillis) || maxMillis < 1 || maxMillis > 10000 ||
      typeof clock !== 'function' || typeof elapsedClock !== 'function' ||
      !(beforeCommit === undefined || typeof beforeCommit === 'function')) throw new Error('invalid-retention-options');
  const now = () => { const value = Timestamp.fromDate(clock()); if (!stamp(value)) throw new Error('invalid-retention-clock'); return value; };
  let previousElapsed = -Infinity;
  const elapsed = () => { const value = elapsedClock(); if (!Number.isFinite(value) || value < previousElapsed) throw new Error('invalid-retention-elapsed-clock'); previousElapsed = value; return value; };
  const metrics = { transactionAttempts: 0, transactions: 0, readRequests: 0, readUnits: 0,
    attemptedWrites: 0, attemptedDeletes: 0, committedWrites: 0, committedDeletes: 0, metadataRequests: 0 };
  const database = measured(db, metrics), ref = db.doc(`maintenanceState/${kind === 'reads' ? 'readRetentionCleanup' : 'continuingReceiptCleanup'}`);
  const token = randomUUID(), started = elapsed(); let pages = 0, counts = emptyCounts(), claimed, done = false;
  const probe = childProbe ?? createRetentionChildProbe(db);
  let lastState;
  const report = (state, errorCode = null) => ({ state, kind, pages, ...counts, errorCode,
    needsContinuation: ['yielded', 'failed', 'lease-lost', 'busy'].includes(state),
    needsReview: (lastState?.counts.skipped ?? 0) > 0 || ['invalid-retention-checkpoint', 'invalid-retention-cursor'].includes(errorCode),
    epochAgeMillis: lastState?.epochStartedAt ? Math.max(0, now().toMillis() - lastState.epochStartedAt.toMillis()) : 0,
    elapsedMillis: elapsed() - started, metrics: { ...metrics } });
  const guard = async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new RetentionLeaseLost();
    const data = validateState(snapshot.data(), kind);
    if (data.leaseToken !== token || data.leaseUntil.toMillis() <= now().toMillis() ||
        now().toMillis() < data.cutoff.toMillis()) throw new RetentionLeaseLost();
    return data;
  };
  try {
    claimed = await database.runTransaction(async tx => {
      const snapshot = await tx.get(ref), time = now();
      const old = snapshot.exists ? validateState(snapshot.data(), kind) : null; lastState = old;
      if (old && (old.leaseUntil?.toMillis() > time.toMillis() || old.nextRunAt.toMillis() > time.toMillis())) return null;
      const continuing = old?.cutoff !== null && old?.cutoff !== undefined;
      if (continuing && old.cutoff.toMillis() > time.toMillis()) throw new Error('invalid-retention-clock');
      const next = { v: 1, kind, version: (old?.version ?? 0) + 1,
        cutoff: continuing ? old.cutoff : time, epochStartedAt: continuing ? old.epochStartedAt : time,
        cursor: continuing ? old.cursor : null, counts: continuing ? old.counts : emptyCounts(),
        leaseToken: token, leaseUntil: Timestamp.fromMillis(time.toMillis() + leaseMillis),
        nextRunAt: Timestamp.fromMillis(time.toMillis() + leaseMillis) };
      tx.set(ref, next); return next;
    });
    if (!claimed) return report(lastState?.cutoff ? 'busy' : 'idle');
    lastState = claimed;
    while (pages < maxPages && elapsed() - started < maxMillis) {
      const result = await database.runTransaction(async tx => {
        const state = await guard(tx), cutoff = state.cutoff;
        let query = kind === 'reads' ? db.collectionGroup('readBuckets')
          .where('day', '>=', 0).where('day', '<=', Math.floor((cutoff.toMillis() - readRetentionMillis) / dayMillis)).orderBy('day').orderBy(FieldPath.documentId()) :
          db.collection('serverOperations').where('createdAt', '<=', Timestamp.fromMillis(cutoff.toMillis() - operationRetryWindowMillis))
            .orderBy('createdAt').orderBy(FieldPath.documentId());
        if (state.cursor) query = query.startAfter(kind === 'reads' ? state.cursor.day : state.cursor.createdAt, db.doc(state.cursor.path));
        const page = await tx.get(query.limit(pageSize)), changes = [], delta = emptyCounts(); delta.scanned = page.size;
        for (const doc of page.docs) {
          let plan = kind === 'reads' ? readDecision(doc, cutoff) : receiptMayBePurged(doc.data(), cutoff) ? { deleted: 1 } : { skipped: 1 };
          if (plan.deleted || plan.replacement) {
            metrics.metadataRequests++;
            if (await probe.hasChildren(doc.ref.path)) plan = { skipped: 1 };
          }
          for (const key of ['deleted', 'pruned', 'skipped']) delta[key] += plan[key] ?? 0;
          if (plan.deleted || plan.replacement) changes.push({ doc, plan });
        }
        if (beforeCommit) await beforeCommit({ tx, kind, refs: page.docs.map(d => d.ref), state });
        // Recheck wall time after metadata RPCs/hooks: no stale lease authorizes writes.
        if (state.leaseUntil.toMillis() <= now().toMillis() || now().toMillis() < cutoff.toMillis()) throw new RetentionLeaseLost();
        for (const { doc, plan } of changes) {
          if (plan.deleted) tx.delete(doc.ref, { lastUpdateTime: doc.updateTime });
          else tx.update(doc.ref, plan.replacement, { lastUpdateTime: doc.updateTime });
        }
        const complete = page.size < pageSize, last = page.docs.at(-1);
        const next = { ...state, version: state.version + 1, counts: addCounts(state.counts, delta),
          cursor: complete ? null : { path: last.ref.path, ...(kind === 'reads' ? { day: last.get('day') } : { createdAt: last.get('createdAt') }) },
          cutoff: complete ? null : cutoff, epochStartedAt: complete ? null : state.epochStartedAt,
          ...(complete ? { leaseToken: null, leaseUntil: null, nextRunAt: Timestamp.fromMillis(now().toMillis() + retryMillis) } : {}) };
        tx.set(ref, next); return { next, delta, complete };
      });
      pages++; counts = addCounts(counts, result.delta); lastState = result.next;
      if (result.complete) { done = true; return report('complete'); }
    }
    await database.runTransaction(async tx => {
      const state = await guard(tx);
      tx.update(ref, { leaseToken: null, leaseUntil: null, nextRunAt: now(), version: state.version + 1 });
    });
    done = true; return report('yielded');
  } catch (error) {
    if (claimed && !done) {
      try { await database.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists || snapshot.get('leaseToken') !== token) return;
        validateState(snapshot.data(), kind);
        tx.update(ref, { leaseToken: null, leaseUntil: null, nextRunAt: Timestamp.fromMillis(now().toMillis() + retryMillis), version: snapshot.get('version') + 1 });
      }); } catch { /* The next owner can recover after the bounded lease. */ }
    }
    const code = ['invalid-retention-checkpoint', 'invalid-retention-cursor', 'invalid-retention-clock'].includes(error.message) ? error.message : 'retention-work-failed';
    return report(error instanceof RetentionLeaseLost ? 'lease-lost' : 'failed', code);
  } finally { if (!childProbe) await probe.close(); }
}

export const runReadRetentionCleanup = (db, options) => runCleanup('reads', db, options);
export const runContinuingReceiptCleanup = (db, options) => runCleanup('receipts', db, options);

// Independent leases/budgets: a failed phase cannot prevent attempting the other.
export async function runRetentionMaintenance(db, options = {}) {
  const results = {};
  for (const [kind, run] of [['receipts', runContinuingReceiptCleanup], ['reads', runReadRetentionCleanup]]) {
    try { results[kind] = await run(db, options[kind]); }
    catch { results[kind] = { state: 'failed', needsContinuation: true, errorCode: 'retention-phase-failed' }; }
  }
  return results;
}
