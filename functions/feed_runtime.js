// Shared runtime. Activation requires the checked installation and live writer cutover.
import { createBlockIndexStore, blockCache } from './feed_block_index_store.js';
import { createEarlyErasureQueueStore } from './feed_early_erasure_queue.js';
import { assertFeedRuntimeTarget, runtimeIndexBinding } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { isPurgedShoutContext } from './shout_context.js';
import { bindCardPublisher, prepareCardStates, registerCardSourcePlan, cardSourceMutation, assertCardTransaction, observeCardSources } from './feed_card_state.js';
import { indexMaintenance } from './feed_index_maintenance.js';
import { preparePublicationSignal } from './feed_news_signals.js';
import { createContentLifecycleDatabase, contentLifecycleConfiguration } from './content_lifecycle.js';
import { createContentLifecycleMaintenance, contentLifecycleMaintenanceConfiguration } from './content_lifecycle_runtime.js';

export const feedRuntimeConfiguration = Object.freeze({ enabled: true, compatibleGenerations: true,
  cardStateEnabled: true, deltaResponsesEnabled: true, newsEnabled: true, newsRuntimeEnabled: true, recenterEnabled: true, unreadFirst: true, maxReadBlockReads: 256 }); // Approved DEV pilot, not production capacity.
export const feedTransactionWriteBudget = 450; // Existing conservative planner limit, now shared across generations/caller writes.
const transactionBudgets = new WeakMap();
// One existing bounded public-node cache per process. A fresh timer-backed
// cache on every request would keep abandoned request maps alive for an hour.
export const feedRuntimeBlockCache = blockCache();

// Every attempted SDK mutation counts, including source/receipt/rate/journal
// writes after plan.apply(). Exceeding the limit throws BEFORE commit. The
// counter is fresh on every SDK transaction retry; no partial commit occurs.
function budgetDatabase(db, cardStateEnabled) {
  return new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return (operation, ...options) => target.runTransaction(async real => {
      const budget = { writes: 0, exceeded: false, invalidMutation: null };
      const tx = new Proxy(real, { get(transaction, method) {
        if (cardStateEnabled && ['get', 'getAll'].includes(method)) return async (...args) => observeCardSources(tx, await transaction[method](...args));
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => {
          if (++budget.writes > feedTransactionWriteBudget) {
            budget.exceeded = true; throw new Error('feed-transaction-write-budget-exceeded');
          }
          try { transaction[method](...(cardStateEnabled ? cardSourceMutation(tx, method, args) : args)); }
          catch (error) { budget.invalidMutation = error; throw error; }
          return tx;
        };
        return typeof transaction[method] === 'function' ? transaction[method].bind(transaction) : transaction[method];
      } });
      transactionBudgets.set(tx, budget);
      const result = await operation(tx);
      if (budget.invalidMutation) throw budget.invalidMutation;
      if (cardStateEnabled) assertCardTransaction(tx);
      if (budget.exceeded) throw new Error('feed-transaction-write-budget-exceeded');
      return result;
    }, ...options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}

export function createFeedGenerationStore(db, generationId, { contentIdentity = false, cardProjection = false } = {}) {
  const binding = runtimeIndexBinding(db, generationId);
  const store = createBlockIndexStore(db, { binding, accountRetention: true, contentIdentity, cardProjection, cache: feedRuntimeBlockCache });
  // No seed, arbitrary source mutation, fake GC time, or fixture hooks. Runtime
  // generation creation/backfill/GC orchestration is a separate migration gate.
  return Object.freeze({ base: store.base, prepare: store.prepare, prepareBatch: store.prepareBatch,
    open: store.open, hydrate: store.hydrate, capturePortable: store.capturePortable, portablePage: store.portablePage, hydratePortable: store.hydratePortable,
    readHeaderRows: store.readHeaderRows, restorePosition: store.restorePosition,
    purgeAccountIndex: store.purgeAccountIndex, prepareAccountIndexFinish: store.prepareAccountIndexFinish });
}

export function createFeedRuntime(db, auth, { enabled = feedRuntimeConfiguration.enabled, clock = () => new Date(), contentIdentity = false,
  compatibleGenerations = feedRuntimeConfiguration.compatibleGenerations, cardStateEnabled = feedRuntimeConfiguration.cardStateEnabled,
  newsRuntimeEnabled = feedRuntimeConfiguration.newsRuntimeEnabled,
  contentLifecycleEnabled = contentLifecycleConfiguration.enabled,
  contentMaintenanceEnabled = contentLifecycleMaintenanceConfiguration.enabled } = {}) {
  if (typeof enabled !== 'boolean' || typeof contentIdentity !== 'boolean' || typeof compatibleGenerations !== 'boolean' || typeof cardStateEnabled !== 'boolean' ||
      typeof contentLifecycleEnabled !== 'boolean' || contentLifecycleEnabled && !enabled ||
      typeof contentMaintenanceEnabled !== 'boolean' || contentMaintenanceEnabled && !contentLifecycleEnabled) throw new Error('invalid-feed-runtime-enabled');
  if (typeof newsRuntimeEnabled !== 'boolean' || newsRuntimeEnabled && !cardStateEnabled) throw new Error('invalid-news-runtime-enabled');
  const format = compatibleGenerations ? 'generation' : contentIdentity;
  // Disabled wrappers keep the exact legacy database and do not even inspect
  // control/registry/queue documents or require a new Auth capability.
  if (!enabled) return Object.freeze({ enabled: false, database: db, indexWriter: null, earlyErasureQueue: null, indexErasureCoordinator: null, indexMaintenance: null, contentMaintenance: null });
  assertFeedRuntimeTarget(db);
  if (typeof clock !== 'function' || typeof auth?.getUser !== 'function') throw new Error('invalid-feed-runtime-options');
  const database = budgetDatabase(createContentLifecycleDatabase(db, { enabled: contentLifecycleEnabled, clock,
    writeBudget: feedTransactionWriteBudget }), cardStateEnabled);
  const binding = {
    base: database.doc('feedIndexMaintenance/erasureQueue'),
    indexFor: id => runtimeIndexBinding(database, id).base,
    createIndex: (measured, id) => createFeedGenerationStore(measured, id, { contentIdentity: format, cardProjection: cardStateEnabled ? 'generation' : false }),
  };
  const earlyErasureQueue = createEarlyErasureQueueStore(database, auth, { binding, clock });

  async function prepareBatch(tx, changes, options = {}) {
    const budget = transactionBudgets.get(tx);
    if (!budget) throw new Error('feed-budgeted-transaction-required');
    if (!Array.isArray(changes) || changes.length > 50) throw new Error('invalid-index-batch');
    const control = await tx.get(database.doc('feedIndexControl/current'));
    if (!control.exists) throw new Error('feed-index-control-required');
    const state = validateFeedIndexControl(control.data());
    if (!cardStateEnabled && state.schemaVersion === 2 && state.cardWriteGenerationIds.length) throw new Error('card-publisher-required');
    if (state.mode === 'off') {
      if (!(await tx.get(database.collection('feedIndexGenerations').limit(1))).empty) throw new Error('feed-off-with-maintained-generations');
    }
    // Plan all generations before any apply. The same control snapshot fences
    // concurrent activation, pause and generation replacement transactions.
    const plans = [];
    const generationContext = { transaction: tx, control: state, markers: new Map(), jobs: new Map(), profiles: new Map() };
    for (const id of state.writeGenerationIds) {
      if (cardStateEnabled) generationContext.markers.set(id, await tx.get(database.doc(`feedIndexGenerations/${id}`)));
      const store = createFeedGenerationStore(database, id, { contentIdentity: format, cardProjection: cardStateEnabled ? (state.cardWriteGenerationIds ?? []).includes(id) : false });
      plans.push(await store.prepareBatch(tx, changes.map(change => ({ ...change, before: isPurgedShoutContext(change.before) ? null : change.before, after: isPurgedShoutContext(change.after) ? null : change.after })), { ...options, reconcileBuilding: options.cardBackfill ? options.cardBackfill === id : options.reconcileBuilding, generationContext }));
    }
    const cards = cardStateEnabled ? await prepareCardStates(tx, database, changes, state, generationContext, options) : null;
    if (options.publication !== undefined && options.publication !== true) throw new Error('invalid-publication-option');
    const publication = newsRuntimeEnabled && options.publication ? await preparePublicationSignal(tx, database, changes, state, generationContext) : null;
    const appliedCards = cards ? registerCardSourcePlan(tx, cards.edits) : null;
    const sum = key => plans.reduce((count, plan) => count + plan[key], 0);
    const indexWrites = sum('nodeWrites') + sum('directoryWrites') + sum('historyWrites') + (cards?.writes ?? 0) + (publication?.writes ?? 0);
    const additional = options.additionalWrites ?? 0;
    if (!Number.isSafeInteger(additional) || additional < 0 || indexWrites + changes.length + additional > feedTransactionWriteBudget) {
      budget.exceeded = true;
      throw new Error('feed-transaction-write-budget-exceeded');
    }
    let applied = false;
    const changedIds = new Set(plans.flatMap(plan => plan.changedIds));
    return { reads: 1 + Number(state.mode === 'off') + sum('reads'), sourceChanges: changedIds.size, sourceChanged: changedIds.size > 0,
      nodeWrites: sum('nodeWrites'), directoryWrites: sum('directoryWrites'), historyWrites: sum('historyWrites'),
      cardWrites: cards?.writes ?? 0, signalWrites: publication?.writes ?? 0, totalWrites: indexWrites + changes.length + additional, generations: plans.length,
      apply() {
        if (applied) throw new Error('index-plan-already-applied'); applied = true;
        plans.forEach(plan => plan.apply()); cards?.apply(); publication?.apply(); appliedCards?.();
      } };
  }
  const indexWriter = Object.freeze({ prepareBatch,
    prepare: (tx, id, before, after, options) => prepareBatch(tx, [{ id, before, after }], options) });
  if (cardStateEnabled) bindCardPublisher(database, indexWriter);
  return Object.freeze({ enabled: true, database, indexWriter, earlyErasureQueue,
    indexMaintenance: indexMaintenance(database, earlyErasureQueue, { clock }),
    contentMaintenance: createContentLifecycleMaintenance(database, indexWriter, { enabled: contentMaintenanceEnabled, clock }),
    indexErasureCoordinator: Object.freeze(earlyErasureQueue.purgeCoordinator({ deferWork: true })) });
}
