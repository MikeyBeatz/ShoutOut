// Paged, emulator-only mark/sweep. No Scheduler, live exports or source deletes.
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { verifyNode } from './feed_block_index.js';
import { feedSessionLifetimeMillis } from './feed_session_policy.js';

const compareTime = (a, b) => a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
const preconditionFailure = error => [5, 9, 'not-found', 'failed-precondition'].includes(error.code);

export async function beginIndexGcLab(db, base, cell, { onNodeDeleted = () => {}, testTimeAdvanceMillis = 0 } = {}) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
      !/^feedIndexLab\/[a-z][a-z0-9-]{0,39}$/.test(base.path)) throw new Error('index-lab-emulator-only');
  if (!/^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(cell)) throw new Error('invalid-index-cell');
  if (!Number.isSafeInteger(testTimeAdvanceMillis) || testTimeAdvanceMillis < 0) throw new Error('invalid-gc-test-clock');
  const cells = base.collection('cells'), nodes = base.collection('nodes'), history = base.collection('retiredRoots');
  const [marker, root] = await db.runTransaction(tx => tx.getAll(base, cells.doc(cell)), { readOnly: true });
  if (!marker.exists || marker.data().v !== 1) throw new Error('index-not-seeded');
  const fence = marker.readTime;
  const cutoff = new Timestamp(fence.seconds - feedSessionLifetimeMillis / 1000 + Math.floor(testTimeAdvanceMillis / 1000), fence.nanoseconds);
  const metrics = { initialReads: 2, historyReadUnits: 0, markReads: 0, scanReadUnits: 0,
    archiveReadUnits: 0, rootCheckReads: 0, nodesDeleted: 0, archivesDeleted: 0, casAttempts: 0, deleteRequests: 0, changedOrGone: 0 };
  const queue = [], queued = new Set(), marked = new Set();
  const enqueue = key => {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('invalid-index-history');
    if (!marked.has(key) && !queued.has(key)) { queue.push(key); queued.add(key); }
  };
  if (root.exists) {
    if (root.data().v !== 1) throw new Error('invalid-index-directory');
    enqueue(root.data().hash);
  }
  let phase = 'mark', flight = null, historyCursor = null, historyDone = false;
  let scanCursor = null, scanDone = false, buffer = [], archiveCursor = null;
  const status = () => ({ state: phase, markedNodes: marked.size, metrics: { ...metrics } });

  function validateArchive(doc) {
    const row = doc.data();
    if (row.v !== 1 || row.cell !== cell || !(row.retiredAt instanceof Timestamp) ||
        !/^[a-f0-9]{64}$/.test(row.hash)) throw new Error('invalid-index-history');
    return row;
  }

  async function deleteSnapshots(docs, kind, hook) {
    if (!docs.length) return;
    if (hook) await hook({ phase: kind, docs, fence });
    if (phase === 'cancelled') return;
    const commit = selected => db.runTransaction(async tx => {
      metrics.rootCheckReads++;
      const current = await tx.get(cells.doc(cell));
      if (current.exists !== root.exists || (current.exists && !current.updateTime.isEqual(root.updateTime))) {
        throw new Error('index-gc-root-changed');
      }
      for (const doc of selected) tx.delete(doc.ref, { lastUpdateTime: doc.updateTime });
    });
    metrics.casAttempts += docs.length; metrics.deleteRequests++;
    const deleted = doc => {
      if (kind === 'nodes') { metrics.nodesDeleted++; onNodeDeleted(doc.id); }
      else metrics.archivesDeleted++;
    };
    try {
      await commit(docs); docs.forEach(deleted);
    } catch (error) {
      if (!preconditionFailure(error)) throw error;
      // A collision aborts the whole batch. Retry each with the SAME condition;
      // never fall back to an unconditional delete of a republished block.
      for (const doc of docs) {
        metrics.casAttempts++; metrics.deleteRequests++;
        try { await commit([doc]); deleted(doc); }
        catch (failure) { if (preconditionFailure(failure)) metrics.changedOrGone++; else throw failure; }
      }
    }
  }

  async function step(work, hooks) {
    let reads = work.reads, deletes = work.deletes;
    while (phase !== 'done' && phase !== 'cancelled') {
      if (phase === 'mark') {
        if (queue.length) {
          if (!reads) break;
          const keys = queue.slice(0, reads);
          const docs = await db.getAll(...keys.map(key => nodes.doc(key)));
          reads -= docs.length; metrics.markReads += docs.length;
          // Finish validation before changing the queue. Missing/corrupt data
          // aborts the step before any sweep can start.
          const payloads = docs.map((doc, i) => verifyNode(keys[i], doc.data()));
          if (payloads.some(node => !node.path.startsWith(cell))) throw new Error('index-path-mismatch');
          queue.splice(0, keys.length);
          for (let i = 0; i < keys.length; i++) { queued.delete(keys[i]); marked.add(keys[i]); }
          for (const node of payloads) if (node.children) Object.values(node.children).forEach(child => enqueue(child.hash));
          continue;
        }
        if (!historyDone) {
          if (!reads) break;
          const limit = reads;
          let query = history.where('cell', '==', cell).orderBy(FieldPath.documentId()).limit(limit);
          if (historyCursor) query = query.startAfter(historyCursor);
          const result = await query.get(), units = Math.max(1, result.size);
          reads -= units; metrics.historyReadUnits += units;
          for (const doc of result.docs) {
            const archive = validateArchive(doc);
            if (compareTime(doc.createTime, cutoff) >= 0) enqueue(archive.hash);
          }
          const last = result.docs.at(-1);
          if (last) historyCursor = last.id;
          historyDone = result.size < limit;
          continue;
        }
        phase = 'sweep'; continue;
      }
      if (phase === 'sweep') {
        if (!buffer.length && !scanDone) {
          if (!reads) break;
          const limit = reads;
          let query = nodes.where('path', '>=', cell).where('path', '<', `${cell}\uf8ff`)
            .orderBy('path').orderBy(FieldPath.documentId()).limit(limit);
          if (scanCursor) query = query.startAfter(scanCursor.path, scanCursor.id);
          const result = await query.get(), units = Math.max(1, result.size);
          reads -= units; metrics.scanReadUnits += units;
          buffer = result.docs; scanDone = result.size < limit;
        }
        if (!buffer.length) { phase = 'archives'; continue; }
        const handled = [], candidates = [];
        for (const doc of buffer) {
          const candidate = !marked.has(doc.id) && compareTime(doc.updateTime, fence) <= 0;
          if (candidate && candidates.length >= deletes) break;
          handled.push(doc);
          if (candidate) candidates.push(doc);
        }
        if (!handled.length) break;
        await deleteSnapshots(candidates, 'nodes', hooks.beforeDelete);
        if (phase === 'cancelled') break;
        deletes -= candidates.length;
        const last = handled.at(-1);
        scanCursor = { path: last.data().path, id: last.id };
        buffer.splice(0, handled.length);
        continue;
      }
      if (phase === 'archives') {
        if (!reads || !deletes) break;
        const limit = Math.min(reads, deletes);
        let query = history.where('cell', '==', cell).orderBy(FieldPath.documentId()).limit(limit);
        if (archiveCursor) query = query.startAfter(archiveCursor);
        const result = await query.get(), units = Math.max(1, result.size);
        reads -= units; metrics.archiveReadUnits += units;
        result.docs.forEach(validateArchive);
        const expired = result.docs.filter(doc => compareTime(doc.createTime, cutoff) < 0);
        await deleteSnapshots(expired, 'archives', hooks.beforeDelete);
        if (phase === 'cancelled') break;
        deletes -= expired.length;
        const last = result.docs.at(-1);
        if (last) archiveCursor = last.id;
        if (result.size < limit) phase = 'done';
      }
    }
    return status();
  }

  return {
    get state() { return phase; },
    cancel() { phase = 'cancelled'; },
    step(work = { reads: 32, deletes: 16 }, hooks = {}) {
      if (!Number.isInteger(work.reads) || work.reads < 1 || !Number.isInteger(work.deletes) || work.deletes < 1) {
        return Promise.reject(new Error('invalid-gc-work'));
      }
      if (phase === 'done' || phase === 'cancelled') return Promise.resolve(status());
      if (!flight) flight = step(work, hooks).finally(() => { flight = null; });
      return flight;
    },
  };
}
