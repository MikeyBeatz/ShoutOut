// Bounded runner shared by protected lab and DEV generation adapters.
import { performance } from 'node:perf_hooks';
import { accountPurgeJobRef } from './account_purge_guard.js';


export class AccountIndexSliceError extends Error {
  constructor(cause, report) {
    super('account-index-slice-failed', { cause }); this.report = report;
  }
}

// Count every attempted operation, including failed guards and retries. Only
// acknowledged transactions contribute to acknowledgedWrites/Deletes: a lost
// commit acknowledgement must not be presented as proof of rollback.
function measuredDatabase(db, metrics) {
  return new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async (operation, ...options) => {
      let acknowledged = null;
      const value = await target.runTransaction(async transaction => {
        metrics.attempts++; const planned = { writes: 0, deletes: 0 };
        const tx = new Proxy(transaction, { get(real, method) {
          if (method === 'get') return async (...args) => {
            metrics.readRequests++;
            try { const doc = await real.get(...args); metrics.readUnits += Math.max(1, doc.size ?? 1); return doc; }
            catch (error) { metrics.failedReadRequests++; throw error; }
          };
          if (method === 'getAll') return async (...args) => {
            metrics.readRequests++;
            try { const docs = await real.getAll(...args); metrics.readUnits += docs.length; return docs; }
            catch (error) { metrics.failedReadRequests++; throw error; }
          };
          if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => {
            const removal = method === 'delete'; metrics[removal ? 'deleteCalls' : 'writeCalls']++;
            planned[removal ? 'deletes' : 'writes']++; real[method](...args); return tx;
          };
          return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
        } });
        const result = await operation(tx); acknowledged = planned; return result;
      }, ...options);
      metrics.acknowledgedTransactions++;
      metrics.acknowledgedWrites += acknowledged.writes; metrics.acknowledgedDeletes += acknowledged.deletes;
      return value;
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}

export async function runAccountIndexErasureSliceStore(identity, db, {
  createIndex, guard, clock = () => new Date(), elapsedClock = () => performance.now(),
  maxSteps = 32, maxMillis = 10000, beforeCommit,
} = {}) {
  accountPurgeJobRef(db, identity);
  if (typeof createIndex !== 'function' || typeof guard !== 'function' || typeof clock !== 'function' || typeof elapsedClock !== 'function' ||
      !Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 32 ||
      !Number.isSafeInteger(maxMillis) || maxMillis < 1 || maxMillis > 10000 ||
      !(beforeCommit === undefined || typeof beforeCommit === 'function')) throw new Error('invalid-index-runner-options');
  let last = -Infinity;
  const elapsed = () => {
    const value = elapsedClock();
    if (!Number.isFinite(value) || value < last) throw new Error('invalid-index-runner-elapsed-clock');
    last = value; return value;
  };
  const started = elapsed(), metrics = { attempts: 0, readRequests: 0, failedReadRequests: 0, readUnits: 0, writeCalls: 0, deleteCalls: 0,
    acknowledgedTransactions: 0, acknowledgedWrites: 0, acknowledgedDeletes: 0 };
  const adapter = createIndex(measuredDatabase(db, metrics));
  let steps = 0, retainUntil = null;
  const report = (state, reason = null) => ({ state, reason, steps, elapsedMillis: last - started,
    retainUntil, metrics: { ...metrics } });
  try {
    while (steps < maxSteps) {
      if (elapsed() - started >= maxMillis) return report('yielded', 'time-budget');
      // Default R5 work remains reads=32/deletes=16. Ownership is rechecked
      // INSIDE every transaction; a preflight-only lease check is insufficient.
      const result = await adapter.purgeAccountIndex(identity, { clock, guard, beforeCommit });
      steps++; retainUntil = result.retainUntil; elapsed();
      if (result.state === 'complete') return report('complete');
    }
    return report('yielded', 'step-budget');
  } catch (cause) {
    throw new AccountIndexSliceError(cause, report('failed'));
  }
}
