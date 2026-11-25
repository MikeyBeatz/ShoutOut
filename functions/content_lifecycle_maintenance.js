// Inactive bounded adapter. No exported Scheduler host or live cadence.
import { Timestamp, FieldPath } from 'firebase-admin/firestore';
import { lifecycleEnabled, validateLifecycleThread, lifecycleControlUsable } from './content_lifecycle.js';
import { createPurgeDocumentPager } from './account_purge_pager.js';
import { stepContentLifecycleTree, expireLifecycleAccountCopy, finishContentLifecycleThread } from './content_lifecycle_purge.js';

const phases = ['source', 'copies', 'reports', 'commentReports', 'privateReplyReports', 'clearances', 'archives', 'finish'];
const fail = message => { throw new Error(message); };
const stamp = clock => {
  const date = clock();
  if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) fail('invalid-lifecycle-maintenance-clock');
  return Timestamp.fromDate(date);
};
const same = (a, b) => a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b);

export async function runContentLifecycleMaintenance(db, { maxSteps, maxElapsedMillis, retryDelayMillis,
  clock = () => new Date(), workClock = () => globalThis.performance.now(), pager = null, indexWriter = null } = {}) {
  if (!lifecycleEnabled(db)) return { state: 'disabled', steps: 0, deleted: 0 };
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 50 ||
      ![maxElapsedMillis, retryDelayMillis].every(n => Number.isSafeInteger(n) && n > 0) ||
      typeof clock !== 'function' || typeof workClock !== 'function') fail('invalid-lifecycle-maintenance-options');
  const start = workClock();
  if (!Number.isFinite(start)) fail('invalid-lifecycle-work-clock');
  const listing = pager ?? createPurgeDocumentPager(db);
  let steps = 0, deleted = 0;
  const advance = async (candidate, phase, next = null, delay = 0) => db.runTransaction(async tx => {
    const [control, fresh] = await tx.getAll(db.doc('contentLifecycleControl/current'), candidate.ref);
    if (!lifecycleControlUsable(control, { allowPaused: true })) fail('lifecycle-maintenance-paused');
    if (!fresh.exists) return;
    const header = validateLifecycleThread(fresh.data(), candidate.id);
    if (!same(header.sourceCreatedAt, candidate.get('sourceCreatedAt'))) fail('lifecycle-maintenance-replaced');
    if (fresh.get('maintenancePhase') !== phase || fresh.get('maintenanceState') !== 'pending') return;
    const now = stamp(clock);
    tx.update(fresh.ref, { maintenancePhase: next ?? phase,
      nextMaintenanceAt: phase === 'source' ? header.retainUntil : Timestamp.fromMillis(now.toMillis() + delay) });
  });
  const drainReports = async (candidate, collection, now) => db.runTransaction(async tx => {
    const [control, fresh] = await tx.getAll(db.doc('contentLifecycleControl/current'), candidate.ref);
    if (!lifecycleControlUsable(control, { allowPaused: true })) fail('lifecycle-maintenance-paused');
    if (!fresh.exists) return { complete: true, deleted: 0 };
    const h = validateLifecycleThread(fresh.data(), candidate.id);
    if (!same(h.sourceCreatedAt, candidate.get('sourceCreatedAt')) || now.toMillis() < h.retainUntil.toMillis()) fail('lifecycle-report-drain-not-due');
    const rows = await tx.get(db.collection(collection === 'clearances' ? 'moderationClearances' : collection)
      .where('shoutId', '==', candidate.id).limit(50));
    for (const row of rows.docs) {
      if (collection !== 'clearances' && !/^[a-f0-9]{64}$/.test(row.get('contentArchiveKey') ?? '')) fail('lifecycle-report-drain-unbound');
      tx.delete(row.ref, { lastUpdateTime: row.updateTime });
    }
    return { complete: rows.size < 50, deleted: rows.size };
  });
  while (steps < maxSteps) {
    const elapsed = workClock() - start;
    if (!Number.isFinite(elapsed) || elapsed < 0) fail('invalid-lifecycle-work-clock');
    if (elapsed >= maxElapsedMillis) break;
    const now = stamp(clock), control = await db.doc('contentLifecycleControl/current').get();
    if (!lifecycleControlUsable(control, { allowPaused: true })) return { state: 'paused', steps, deleted };
    const row = (await db.collection('contentLifecycleThreads').where('maintenanceState', '==', 'pending')
      .where('nextMaintenanceAt', '<=', now).orderBy('nextMaintenanceAt').orderBy(FieldPath.documentId()).limit(1).get()).docs[0];
    if (!row) return { state: 'idle', steps, deleted };
    try {
    const header = validateLifecycleThread(row.data(), row.id), phase = row.get('maintenancePhase');
    if (!phases.includes(phase)) fail('invalid-lifecycle-maintenance-phase');
    if (phase === 'source') {
      const result = await stepContentLifecycleTree(db, { threadId: row.id, kind: 'source', pager: listing, indexWriter, clock });
      deleted += result.deleted;
      if (result.state === 'complete') await advance(row, phase, 'copies');
    } else {
      if (now.toMillis() < header.retainUntil.toMillis()) fail('lifecycle-maintenance-not-due');
      if (phase === 'copies') {
        const result = await expireLifecycleAccountCopy(db, { threadId: row.id, clock });
        deleted += result.deleted;
        if (result.state === 'complete') await advance(row, phase, 'reports');
      } else if (['reports', 'commentReports', 'privateReplyReports', 'clearances'].includes(phase)) {
        const result = await drainReports(row, phase, now); deleted += result.deleted;
        if (result.complete) await advance(row, phase, phases[phases.indexOf(phase) + 1]);
      } else if (phase === 'archives') {
        const archive = (await db.collection('contentLifecycleArchive').where('threadId', '==', row.id).limit(1).get()).docs[0];
        if (!archive) await advance(row, phase, 'finish');
        else {
          const result = await stepContentLifecycleTree(db, { threadId: row.id, kind: 'archive', archiveKey: archive.id, pager: listing, clock });
          deleted += result.deleted;
        }
      } else {
        const result = await finishContentLifecycleThread(db, { threadId: row.id, clock }); deleted += result.deleted;
        if (result.state === 'waiting-for-account-journal') await advance(row, phase, null, retryDelayMillis);
      }
    }
    } catch (error) {
      if (['lifecycle-purge-version-changed', 'lifecycle-purge-leaf-changed'].includes(error.message)) return { state: 'conflict', steps, deleted };
      if (error.message?.endsWith('-paused')) return { state: 'paused', steps, deleted };
      if ([1, 4, 8, 10, 13, 14].includes(error.code)) throw error;
      await db.runTransaction(async tx => {
        const [control, current] = await tx.getAll(db.doc('contentLifecycleControl/current'), row.ref);
        if (!lifecycleControlUsable(control, { allowPaused: true }) || !current.exists || !same(current.updateTime, row.updateTime)) return;
        const code = typeof error.message === 'string' && /^(?:invalid-)?lifecycle-[a-z0-9-]{1,60}$/.test(error.message) ? error.message : 'invalid-record';
        tx.update(row.ref, { maintenanceState: 'needs-review', maintenanceErrorCode: code });
      });
      return { state: 'needs-review', steps: steps + 1, deleted };
    }
    steps++;
  }
  return { state: 'continuation', steps, deleted };
}
