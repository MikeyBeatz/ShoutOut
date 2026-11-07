// Shared runtime. Activation requires the checked installation and live writer cutover.
import { createBlockIndexStore } from './feed_block_index_store.js';
import { createEarlyErasureQueueStore } from './feed_early_erasure_queue.js';
import { assertFeedRuntimeTarget, runtimeIndexBinding } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { indexMaintenance } from './feed_index_maintenance.js';

export const feedRuntimeConfiguration = Object.freeze({ enabled: true });
export const feedTransactionWriteBudget = 450; // Existing conservative planner limit, now shared across generations/caller writes.
const transactionBudgets = new WeakMap();

// Every attempted SDK mutation counts, including source/receipt/rate/journal
// writes after plan.apply(). Exceeding the limit throws BEFORE commit. The
// counter is fresh on every SDK transaction retry; no partial commit occurs.
function budgetDatabase(db) {
  return new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return (operation, ...options) => target.runTransaction(async real => {
      const budget = { writes: 0, exceeded: false };
      const tx = new Proxy(real, { get(transaction, method) {
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => {
          if (++budget.writes > feedTransactionWriteBudget) {
            budget.exceeded = true; throw new Error('feed-transaction-write-budget-exceeded');
          }
          transaction[method](...args); return tx;
        };
        return typeof transaction[method] === 'function' ? transaction[method].bind(transaction) : transaction[method];
      } });
      transactionBudgets.set(tx, budget);
      const result = await operation(tx);
      if (budget.exceeded) throw new Error('feed-transaction-write-budget-exceeded');
      return result;
    }, ...options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}

export function createFeedGenerationStore(db, generationId) {
  const binding = runtimeIndexBinding(db, generationId);
  const store = createBlockIndexStore(db, { binding, accountRetention: true });
  // No seed, arbitrary source mutation, fake GC time, or fixture hooks. Runtime
  // generation creation/backfill/GC orchestration is a separate migration gate.
  return Object.freeze({ base: store.base, prepare: store.prepare, prepareBatch: store.prepareBatch,
    open: store.open, hydrate: store.hydrate, capturePortable: store.capturePortable, portablePage: store.portablePage, hydratePortable: store.hydratePortable,
    purgeAccountIndex: store.purgeAccountIndex, prepareAccountIndexFinish: store.prepareAccountIndexFinish });
}

export function createFeedRuntime(db, auth, { enabled = feedRuntimeConfiguration.enabled, clock = () => new Date() } = {}) {
  if (typeof enabled !== 'boolean') throw new Error('invalid-feed-runtime-enabled');
  // Disabled wrappers keep the exact legacy database and do not even inspect
  // control/registry/queue documents or require a new Auth capability.
  if (!enabled) return Object.freeze({ enabled: false, database: db, indexWriter: null, earlyErasureQueue: null, indexErasureCoordinator: null, indexMaintenance: null });
  assertFeedRuntimeTarget(db);
  if (typeof clock !== 'function' || typeof auth?.getUser !== 'function') throw new Error('invalid-feed-runtime-options');
  const database = budgetDatabase(db);
  const binding = {
    base: database.doc('feedIndexMaintenance/erasureQueue'),
    indexFor: id => runtimeIndexBinding(database, id).base,
    createIndex: (measured, id) => createFeedGenerationStore(measured, id),
  };
  const earlyErasureQueue = createEarlyErasureQueueStore(database, auth, { binding, clock });

  async function prepareBatch(tx, changes, options = {}) {
    const budget = transactionBudgets.get(tx);
    if (!budget) throw new Error('feed-budgeted-transaction-required');
    if (!Array.isArray(changes) || changes.length > 50) throw new Error('invalid-index-batch');
    const control = await tx.get(database.doc('feedIndexControl/current'));
    if (!control.exists) throw new Error('feed-index-control-required');
    const state = validateFeedIndexControl(control.data());
    if (state.mode === 'off') {
      if (!(await tx.get(database.collection('feedIndexGenerations').limit(1))).empty) throw new Error('feed-off-with-maintained-generations');
    }
    // Plan all generations before any apply. The same control snapshot fences
    // concurrent activation, pause and generation replacement transactions.
    const plans = [];
    for (const id of state.writeGenerationIds) {
      const store = createFeedGenerationStore(database, id);
      plans.push(await store.prepareBatch(tx, changes, options));
    }
    const sum = key => plans.reduce((count, plan) => count + plan[key], 0);
    const indexWrites = sum('nodeWrites') + sum('directoryWrites') + sum('historyWrites');
    const additional = options.additionalWrites ?? 0;
    if (!Number.isSafeInteger(additional) || additional < 0 || indexWrites + changes.length + additional > feedTransactionWriteBudget) {
      budget.exceeded = true;
      throw new Error('feed-transaction-write-budget-exceeded');
    }
    let applied = false;
    return { reads: 1 + Number(state.mode === 'off') + sum('reads'), sourceChanges: plans[0]?.sourceChanges ?? 0, sourceChanged: Boolean(plans[0]?.sourceChanged),
      nodeWrites: sum('nodeWrites'), directoryWrites: sum('directoryWrites'), historyWrites: sum('historyWrites'),
      totalWrites: indexWrites + changes.length + additional, generations: plans.length,
      apply() {
        if (applied) throw new Error('index-plan-already-applied'); applied = true;
        plans.forEach(plan => plan.apply());
      } };
  }
  const indexWriter = Object.freeze({ prepareBatch,
    prepare: (tx, id, before, after, options) => prepareBatch(tx, [{ id, before, after }], options) });
  return Object.freeze({ enabled: true, database, indexWriter, earlyErasureQueue,
    indexMaintenance: indexMaintenance(database, earlyErasureQueue, { clock }),
    indexErasureCoordinator: Object.freeze(earlyErasureQueue.purgeCoordinator({ deferWork: true })) });
}
