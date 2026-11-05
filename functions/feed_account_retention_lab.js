// R5 prototype only. No live collection, callable, scheduler or Auth deletion.
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { accountPurgeJobRef, accountRetentionMillis, samePurgeTime } from './account_purge_guard.js';
import { encodedBytes, verifyNode } from './feed_block_index.js';

export function retentionCell(data) {
  if (data === undefined) return { version: 0, phase: 'ready' };
  if (!data || data.v !== 1 || !Number.isSafeInteger(data.version) || data.version < 1 ||
      !['ready', 'erasing', 'cleaning'].includes(data.phase) ||
      Object.keys(data).some(key => !['v', 'version', 'phase', 'owner'].includes(key)) ||
      (data.phase === 'ready' ? Object.hasOwn(data, 'owner') : !/^[a-f0-9]{64}$/.test(data.owner))) {
    throw new Error('invalid-index-retention-fence');
  }
  return data;
}

export function createAccountRetentionLab(db, base, removeRows) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
      !/^feedIndexLab\/[a-z][a-z0-9-]{0,39}$/.test(base.path)) throw new Error('index-lab-emulator-only');
  const nodes = base.collection('nodes'), cells = base.collection('cells'), histories = base.collection('retiredRoots');
  const fences = base.collection('cellRetention'), jobs = base.collection('accountErasures');
  const checkCell = cell => { if (!/^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(cell)) throw new Error('invalid-erasure-cell'); };
  const checkpoint = task => { if (encodedBytes(task) > 262144) throw new Error('erasure-checkpoint-too-large'); return task; };
  const jobFor = identity => jobs.doc(accountPurgeJobRef(db, identity).id);

  async function identityGuard(tx, identity, clock, guard) {
    if (guard) await guard(tx);
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) throw new Error('invalid-erasure-clock');
    const [request, profile] = await tx.getAll(db.doc(`accountDeletionRequests/${identity.userId}`), db.doc(`publicProfiles/${identity.userId}`));
    if (!request.exists || !samePurgeTime(request.createTime, identity.requestCreateTime) ||
        request.get('status') !== 'pending' || request.get('userId') !== identity.userId ||
        !(request.get('authDeletionConfirmedAt') instanceof Timestamp) ||
        request.get('authDeletionConfirmedAt').toMillis() < request.createTime.toMillis() ||
        request.get('authDeletionConfirmedAt').toMillis() > date.getTime() ||
        profile.get('schemaVersion') !== 1 || profile.get('accountStatus') !== 'deleted' ||
        Object.keys(profile.data() ?? {}).length !== 2) throw new Error('invalid-erasure-identity');
    return Timestamp.fromMillis(identity.requestCreateTime.toMillis() + accountRetentionMillis);
  }

  // Persisted journal/marks make every step restartable with a cold adapter.
  // The supplied outer guard fences the existing account worker's lease too.
  async function step(identity, { clock = () => new Date(), guard, reads = 32, deletes = 16, beforeCommit } = {}) {
    const ref = jobFor(identity);
    if (!Number.isInteger(reads) || reads < 1 || reads > 32 || !Number.isInteger(deletes) || deletes < 1 || deletes > 16) {
      throw new Error('invalid-erasure-work');
    }
    let attempts = 0, readUnits = 0, writeCalls = 0, committedWrites = 0;
    const result = await db.runTransaction(async real => {
      attempts++; let plannedWrites = 0;
      const tx = new Proxy(real, { get(target, key) {
        if (key === 'get') return async (...args) => { const value = await target.get(...args); readUnits += Math.max(1, value.size ?? 1); return value; };
        if (key === 'getAll') return async (...args) => { const value = await target.getAll(...args); readUnits += value.length; return value; };
        if (['create', 'set', 'update', 'delete'].includes(key)) return (...args) => { plannedWrites++; writeCalls++; target[key](...args); return tx; };
        return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
      } });
      const retainUntil = await identityGuard(tx, identity, clock, guard), [marker, snapshot] = await tx.getAll(base, ref);
      if (marker.get('accountRetention') !== true) throw new Error('index-retention-mode-mismatch');
      const active = marker.get('activeErasure');
      if (active && (active.id !== ref.id || active.userId !== identity.userId)) throw new Error('index-erasure-busy');
      const job = snapshot.data();
      if (job && (job.v !== 1 || job.userId !== identity.userId || !samePurgeTime(job.requestCreateTime, identity.requestCreateTime) ||
          !samePurgeTime(job.retainUntil, retainUntil) || !Number.isSafeInteger(job.version) || job.version < 0 ||
          !['inventory', 'cells', 'verify', 'cleanup', 'complete'].includes(job.phase) ||
          !(job.cursor === null || /^[a-f0-9]{64}$/.test(job.cursor)) ||
          !(job.cellCursor === null || /^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(job.cellCursor)))) throw new Error('invalid-erasure-journal');
      const save = patch => tx.update(ref, { ...patch, version: job.version + 1 });
      let state = job?.phase ?? 'inventory';
      if (!job) {
        tx.create(ref, { v: 1, userId: identity.userId, requestCreateTime: identity.requestCreateTime, retainUntil,
          phase: 'inventory', cursor: null, cellCursor: null, version: 0 });
        tx.update(base, { activeErasure: { id: ref.id, userId: identity.userId }, erasureRevision: FieldValue.increment(1) });
      } else if (job.phase === 'inventory' || job.phase === 'verify') {
        let query = nodes.orderBy(FieldPath.documentId()).limit(reads);
        if (job.cursor) query = query.startAfter(job.cursor);
        const page = await tx.get(query), found = new Set();
        for (const doc of page.docs) {
          const node = verifyNode(doc.id, doc.data()), cell = node.path.slice(0, 4); checkCell(cell);
          if (node.rows?.some(row => row.authorId === identity.userId)) found.add(cell);
        }
        if (job.phase === 'verify' && found.size) throw new Error('erasure-verification-failed');
        const taskRefs = [...found].map(cell => ref.collection('cells').doc(cell));
        const tasks = taskRefs.length ? await tx.getAll(...taskRefs) : [];
        tasks.forEach(task => { if (!task.exists) tx.create(task.ref, { v: 1, phase: 'pending', frontier: [], cursor: null }); });
        const next = page.size === reads ? page.docs.at(-1).id : null;
        state = next ? job.phase : job.phase === 'inventory' ? 'cells' : 'cleanup';
        save({ phase: state, cursor: next });
      } else if (job.phase === 'cells') {
        let query = ref.collection('cells').orderBy(FieldPath.documentId()).limit(1);
        if (job.cellCursor) query = query.startAfter(job.cellCursor);
        const taskDoc = (await tx.get(query)).docs[0];
        if (!taskDoc) { state = 'verify'; save({ phase: state, cursor: null }); }
        else {
          const cell = taskDoc.id; checkCell(cell);
          const task = taskDoc.data(), fenceRef = fences.doc(cell), rootRef = cells.doc(cell);
          const [fence, root] = await tx.getAll(fenceRef, rootRef);
          retentionCell(fence.data());
          if (task.v !== 1 || !Array.isArray(task.frontier) || task.frontier.some(item =>
            !/^[a-f0-9]{64}$/.test(item.hash) || !(item.after === null || /^[A-Za-z0-9_-]{1,128}$/.test(item.after)))) {
            throw new Error('invalid-erasure-cell-journal');
          }
          const held = fence.get('owner') === ref.id;
          if (task.phase !== 'pending' && !held) throw new Error('erasure-cell-fence-lost');
          const setTask = patch => tx.update(taskDoc.ref, checkpoint({ ...task, ...patch }));
          if (task.phase === 'pending') {
            if (fence.get('owner') && !held) throw new Error('index-erasure-busy');
            tx.set(fenceRef, { v: 1, version: (fence.get('version') ?? 0) + 1, phase: 'erasing', owner: ref.id });
            setTask({ phase: 'remove', frontier: root.exists ? [{ hash: root.get('hash'), after: null }] : [] });
          } else if (task.phase === 'remove' || task.phase === 'mark') {
            const frontier = [...task.frontier], selected = [], marks = []; let processed = 0;
            while (frontier.length && processed < reads && selected.length < 50) {
              const item = frontier.pop(), doc = await tx.get(nodes.doc(item.hash)); processed++;
              const node = verifyNode(item.hash, doc.data());
              if (!node.path.startsWith(cell)) throw new Error('index-path-mismatch');
              if (task.phase === 'mark') {
                if (node.rows?.some(row => row.authorId === identity.userId)) throw new Error('erasure-current-root-not-clean');
                marks.push(ref.collection('marks').doc(`${cell}-${item.hash}`));
              }
              if (node.kind === 'branch') {
                frontier.push(...Object.values(node.children).map(child => ({ hash: child.hash, after: null })));
              } else if (task.phase === 'remove') {
                const rows = node.rows.filter(row => row.authorId === identity.userId && (!item.after || row.id > item.after));
                const chosen = rows.slice(0, 50 - selected.length); selected.push(...chosen);
                if (chosen.length < rows.length) frontier.push({ hash: item.hash, after: chosen.at(-1).id });
              }
            }
            const plan = selected.length ? await removeRows(tx, selected, { id: ref.id, cell }) : null;
            if (selected.length && typeof plan?.apply !== 'function') throw new Error('invalid-erasure-index-plan');
            // All reads (including next-root capture) precede the first write.
            let nextFrontier = frontier, phase = task.phase;
            if (!frontier.length) {
              if (phase === 'remove') {
                // A removal plan may replace the root in this very transaction.
                // Capture it in the next step, rather than read after apply().
                phase = 'capture'; nextFrontier = [];
              } else phase = 'sweep';
            }
            plan?.apply(); marks.forEach(mark => tx.set(mark, { v: 1 }));
            setTask({ phase, frontier: nextFrontier, cursor: null });
          } else if (task.phase === 'capture') {
            setTask({ phase: 'mark', frontier: root.exists ? [{ hash: root.get('hash'), after: null }] : [] });
            tx.update(fenceRef, { phase: 'cleaning' });
          } else if (task.phase === 'sweep') {
            let query = nodes.where('path', '>=', cell).where('path', '<', cell + '\uf8ff')
              .orderBy('path').orderBy(FieldPath.documentId()).limit(Math.min(reads, deletes));
            if (task.cursor) query = query.startAfter(task.cursor.path, task.cursor.id);
            const page = await tx.get(query), markRefs = page.docs.map(doc => ref.collection('marks').doc(`${cell}-${doc.id}`));
            const marked = markRefs.length ? await tx.getAll(...markRefs) : [];
            page.docs.forEach((doc, i) => { if (!marked[i].exists) tx.delete(doc.ref, { lastUpdateTime: doc.updateTime }); });
            const last = page.docs.at(-1), more = page.size === Math.min(reads, deletes);
            setTask({ phase: more ? 'sweep' : 'archives', cursor: more ? { path: last.get('path'), id: last.id } : null });
          } else if (task.phase === 'archives' || task.phase === 'unmark') {
            const collection = task.phase === 'archives' ? histories.where('cell', '==', cell) :
              ref.collection('marks').where(FieldPath.documentId(), '>=', cell + '-').where(FieldPath.documentId(), '<', cell + '-\uf8ff');
            const page = await tx.get(collection.limit(Math.min(reads, deletes)));
            page.docs.forEach(doc => tx.delete(doc.ref, { lastUpdateTime: doc.updateTime }));
            if (page.empty) {
              if (task.phase === 'archives') setTask({ phase: 'unmark' });
              else {
                tx.set(fenceRef, { v: 1, version: fence.get('version'), phase: 'ready' });
                setTask({ phase: 'done' }); save({ cellCursor: cell });
              }
            } else save({});
          } else if (task.phase === 'done') save({ cellCursor: cell });
          else throw new Error('invalid-erasure-cell-stage');
          if (!['archives', 'unmark', 'done'].includes(task.phase)) save({});
        }
      } else if (job.phase === 'cleanup') {
        const page = await tx.get(ref.collection('cells').limit(Math.min(reads, deletes)));
        page.docs.forEach(doc => { if (doc.get('phase') !== 'done') throw new Error('incomplete-erasure-cell'); tx.delete(doc.ref); });
        if (page.empty) { state = 'complete'; save({ phase: state }); } else save({});
      } else if (job.phase !== 'complete') throw new Error('invalid-erasure-stage');
      if (beforeCommit) await beforeCommit({ phase: state, transaction: tx });
      committedWrites = plannedWrites;
      return { state, retainUntil };
    });
    return { ...result, metrics: { attempts, readUnits, writeCalls, committedWrites } };
  }

  async function prepareFinish(tx, identity, { clock = () => new Date(), guard } = {}) {
    const ref = jobFor(identity); await identityGuard(tx, identity, clock, guard);
    const [marker, job, tasks, marks] = await Promise.all([tx.get(base), tx.get(ref),
      tx.get(ref.collection('cells').limit(1)), tx.get(ref.collection('marks').limit(1))]);
    if (job.get('phase') !== 'complete' || marker.get('activeErasure')?.id !== ref.id || !tasks.empty || !marks.empty) {
      throw new Error('incomplete-account-index-erasure');
    }
    let applied = false;
    return { apply() {
      if (applied) throw new Error('index-plan-already-applied'); applied = true;
      tx.delete(ref); tx.update(base, { activeErasure: FieldValue.delete(), erasureRevision: FieldValue.increment(1) });
    } };
  }
  return { step, prepareFinish, jobFor };
}
