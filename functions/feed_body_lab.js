// Emulator-only B4a comparison adapter. Not exported from a Functions host.
import { isDeepStrictEqual } from 'node:util';
import { Buffer } from 'node:buffer';
import { labIndexBinding } from './feed_index_paths.js';
import { bodyProjection, bodyDigest, canonicalBody } from './feed_body_contract.js';
import { isPurgedShoutContext } from './shout_context.js';
import { feedBodyState } from './feed_body_state.js';

export function bodyProjectionLab(db, { namespace, mode = 'packed', indexes = [], extendedState = false }) {
  const binding = labIndexBinding(db, namespace);
  if (!['packed', 'individual', 'hybrid'].includes(mode)) throw new Error('invalid-body-lab-mode');
  const { base, source } = binding;
  const projections = base.collection('projection');
  const liveState = base.collection('liveState');
  const metrics = { reads: 0, sourceReads: 0, jsonBytes: 0, requests: 0, queries: 0 };
  const shard = id => mode === 'individual' ? id : bodyDigest(id).slice(0, 1);
  const bytes = value => Buffer.byteLength(canonicalBody(value));
  const project = (id, value) => extendedState ? feedBodyState(id, value) : bodyProjection(value);
  const projection = (id, value) => value && !isPurgedShoutContext(value) ? project(id, value).state : null;
  const idsValid = ids => {
    if (!Array.isArray(ids) || ids.length > 50 || new Set(ids).size !== ids.length ||
        ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error('invalid-body-lab-ids');
  };
  async function readStates(reader, ids) {
    idsValid(ids); if (!ids.length) return new Map();
    const keys = [...new Set(ids.map(shard))];
    const docs = await reader.getAll(...keys.map(key => projections.doc(key)));
    metrics.reads += docs.length; metrics.requests++;
    const byShard = new Map(docs.map(doc => {
      const rows = doc.data()?.rows ?? {}; metrics.jsonBytes += bytes(rows); return [doc.id, rows];
    }));
    return new Map(ids.filter(id => Object.hasOwn(byShard.get(shard(id)), id)).map(id => [id, byShard.get(shard(id))[id]]));
  }
  async function readBodies(reader, ids) {
    idsValid(ids); if (!ids.length) return new Map();
    const docs = await reader.getAll(...ids.map(id => source.doc(id)));
    metrics.sourceReads += docs.length; metrics.reads += docs.length; metrics.requests++;
    for (const doc of docs) if (doc.exists && !isPurgedShoutContext(doc.data())) metrics.jsonBytes += bytes(project(doc.id, doc.data()));
    return new Map(docs.filter(doc => doc.exists).map(doc => [doc.id, doc.data()]));
  }
  return { base, source, liveState, binding, metrics, states: ids => readStates(db, ids), readStates, readBodies,
    resetMetrics() { for (const key of Object.keys(metrics)) metrics[key] = 0; },
    bodies: ids => readBodies(db, ids),
    async mutate(changes, { additionalWrites = 0, beforeApply = () => {}, guard = async () => {} } = {}) {
      idsValid(changes.map(change => change.id));
      if (!Number.isSafeInteger(additionalWrites) || additionalWrites < 0) throw new Error('invalid-body-write-reservation');
      return db.runTransaction(async raw => {
        let actualWrites = 0, exceeded = false;
        const tx = new Proxy(raw, { get(target, method) {
          if (method === 'getAll') return async (...args) => {
            const docs = await target.getAll(...args); metrics.reads += docs.length; metrics.requests++; return docs;
          };
          if (method === 'get') return async (...args) => {
            const result = await target.get(...args); metrics.requests++;
            if (Array.isArray(result.docs)) { metrics.queries++; metrics.reads += Math.max(1, result.docs.length); }
            else metrics.reads++;
            return result;
          };
          if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => {
            if (++actualWrites > 450) { exceeded = true; throw new Error('body-write-budget-exceeded'); }
            target[method](...args); return tx;
          };
          return typeof target[method] === 'function' ? target[method].bind(target) : target[method];
        } });
        await guard(tx);
        const docs = changes.length ? await tx.getAll(...changes.map(change => source.doc(change.id))) : [];
        metrics.sourceReads += docs.length;
        const edits = changes.map((change, i) => ({ ...change, before: docs[i].exists ? docs[i].data() : null }))
          .filter(change => !isDeepStrictEqual(change.before, change.after));
        const keys = [...new Set(edits.map(change => shard(change.id)))];
        const packs = keys.length ? await tx.getAll(...keys.map(key => projections.doc(key))) : [];
        const live = mode === 'hybrid' && edits.length ? await tx.getAll(...edits.map(edit => liveState.doc(edit.id))) : [];
        const next = new Map(packs.map(doc => [doc.id, { ...(doc.data()?.rows ?? {}) }]));
        const dirty = new Set();
        const liveChanges = [];
        for (const [i, edit] of edits.entries()) {
          const key = shard(edit.id), rows = next.get(key), old = projection(edit.id, edit.before);
          if (!isDeepStrictEqual(Object.hasOwn(rows, edit.id) ? rows[edit.id] : null, old)) throw new Error('body-projection-inconsistent');
          const state = projection(edit.id, edit.after);
          if (mode === 'hybrid') {
            if (!isDeepStrictEqual(live[i].exists ? live[i].data() : null, old)) throw new Error('body-live-projection-inconsistent');
            if (!isDeepStrictEqual(old, state)) liveChanges.push({ id: edit.id, state });
          }
          if (state) Object.defineProperty(rows, edit.id, { value: state, enumerable: true, configurable: true, writable: true });
          else delete rows[edit.id];
          if (!isDeepStrictEqual(old, state)) dirty.add(key);
        }
        for (const rows of next.values()) {
          if (Object.keys(rows).length > 64 || bytes(rows) > 65536) throw new Error('body-lab-pack-full');
        }
        // All generations share one budget, including source and projection.
        const plans = [];
        for (const index of indexes) plans.push(await index.prepareBatch(tx, edits.map(edit => ({ ...edit,
          before: isPurgedShoutContext(edit.before) ? null : edit.before,
          after: isPurgedShoutContext(edit.after) ? null : edit.after,
        }))));
        if (plans.some(plan => !plan || typeof plan.apply !== 'function')) throw new Error('body-index-plan-required');
        const indexWrites = plans.reduce((sum, plan) => sum + plan.nodeWrites + plan.directoryWrites + plan.historyWrites, 0);
        const writes = edits.length + dirty.size + liveChanges.length + indexWrites + additionalWrites;
        if (!Number.isSafeInteger(writes) || writes > 450) throw new Error('body-write-budget-exceeded');
        await beforeApply(tx); // Test rollback/lost-response injection, never live.
        plans.forEach(plan => plan.apply());
        for (const edit of edits) {
          if (edit.after) tx.set(source.doc(edit.id), edit.after); else tx.delete(source.doc(edit.id));
        }
        for (const key of dirty) {
          if (Object.keys(next.get(key)).length) tx.set(projections.doc(key), { rows: next.get(key) });
          else tx.delete(projections.doc(key));
        }
        for (const { id, state } of liveChanges) {
          if (state) tx.set(liveState.doc(id), state); else tx.delete(liveState.doc(id));
        }
        if (exceeded) throw new Error('body-write-budget-exceeded');
        return { writes, sourceWrites: edits.length, projectionWrites: dirty.size + liveChanges.length, indexWrites };
      });
    },
  };
}
