import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { beginIndexGc } from './feed_index_gc_store.js';
import { assertFeedRuntimeTarget, runtimeIndexBinding } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { feedSessionLifetimeMillis } from './feed_session_policy.js';

const jobPath = /^feedIndexGenerations\/([a-z][a-z0-9-]{0,39})\/gcJobs\/([0123456789bcdefghjkmnpqrstuvwxyz]{4})$/;
const historyPath = /^feedIndexGenerations\/([a-z][a-z0-9-]{0,39})\/retiredRoots\/[^/]+$/;
const same = (a, b) => a?.isEqual(b) === true;
const leaseMillis = 120000, retryMillis = 60000;
export class IndexGcLeaseLost extends Error {}

// One durable normal-GC job per invocation. No source deletion and no new
// Scheduler: the existing maintenance tick chooses this or one erasure slice.
export async function runNormalIndexGc(db, { clock = () => new Date(), elapsedClock = () => performance.now(),
  maxSteps = 32, maxMillis = 10000 } = {}) {
  assertFeedRuntimeTarget(db);
  if (typeof clock !== 'function' || typeof elapsedClock !== 'function' || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 32 ||
      !Number.isInteger(maxMillis) || maxMillis < 1 || maxMillis > 10000) throw new Error('invalid-normal-gc-options');
  const now = () => {
    const value = clock(); if (!(value instanceof Date) || !Number.isSafeInteger(value.getTime()) || value.getTime() < 0) throw new Error('invalid-normal-gc-clock');
    return Timestamp.fromDate(value);
  };
  const controlRef = db.doc('feedIndexControl/current'), scanRef = db.doc('feedIndexMaintenance/gcSweep');
  const control = await controlRef.get();
  if (!control.exists || validateFeedIndexControl(control.data()).mode === 'off') return { state: 'idle', steps: 0 };

  const validateJob = data => {
    if (!data || data.v !== 1 || data.kind !== 'feed-index-gc' || !['working', 'needs-review'].includes(data.phase) || !(data.generationCreateTime instanceof Timestamp) ||
        !Number.isSafeInteger(data.version) || data.version < 0 || !(data.nextAttemptAt instanceof Timestamp) ||
        (data.leaseToken === null) !== (data.leaseUntil === null) ||
        !(data.leaseToken === null || typeof data.leaseToken === 'string' && data.leaseToken.length > 0) ||
        !(data.leaseUntil === null || data.leaseUntil instanceof Timestamp)) throw new Error('invalid-normal-gc-job');
    return data;
  };
  // Jobs resume even after their last expired archive has already been deleted.
  const due = await db.collectionGroup('gcJobs').where('kind', '==', 'feed-index-gc').where('phase', '==', 'working').where('nextAttemptAt', '<=', now())
    .orderBy('nextAttemptAt').orderBy(FieldPath.documentId()).limit(1).get();
  let ref = due.docs[0]?.ref ?? null;
  if (!ref) {
    const scan = await scanRef.get(), cursor = scan.data();
    if (scan.exists && (cursor.v !== 1 || !(cursor.path === null || historyPath.test(cursor.path)) ||
        !(cursor.retiredAt === null || cursor.retiredAt instanceof Timestamp) || (cursor.path === null) !== (cursor.retiredAt === null))) {
      throw new Error('invalid-normal-gc-scan');
    }
    let query = db.collectionGroup('retiredRoots').where('kind', '==', 'feed-index-root')
      .where('retiredAt', '<', Timestamp.fromMillis(Math.max(0, now().toMillis() - feedSessionLifetimeMillis)))
      .orderBy('retiredAt').orderBy(FieldPath.documentId()).limit(32);
    if (cursor?.path) query = query.startAfter(cursor.retiredAt, db.doc(cursor.path));
    const page = await query.get();
    const candidates = page.docs.map(doc => {
      const match = historyPath.exec(doc.ref.path), cell = doc.get('cell');
      if (!match || typeof cell !== 'string' || !/^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(cell) ||
          !(doc.get('retiredAt') instanceof Timestamp)) throw new Error('invalid-normal-gc-candidate');
      return db.doc(`feedIndexGenerations/${match[1]}/gcJobs/${cell}`);
    });
    for (const candidate of candidates) {
      const doc = await candidate.get();
      if (!doc.exists || validateJob(doc.data()).phase === 'working' && doc.get('nextAttemptAt').toMillis() <= now().toMillis()) { ref = candidate; break; }
    }
    await db.runTransaction(async tx => {
      const fresh = await tx.get(scanRef);
      if (fresh.exists !== scan.exists || fresh.exists && !same(fresh.updateTime, scan.updateTime)) return;
      const last = page.docs.at(-1);
      tx.set(scanRef, { v: 1, path: last?.ref.path ?? null, retiredAt: last?.get('retiredAt') ?? null });
    });
  }
  if (!ref) return { state: 'idle', steps: 0 };
  const match = jobPath.exec(ref.path); if (!match) throw new Error('invalid-normal-gc-job-path');
  const [, generation, cell] = match, binding = runtimeIndexBinding(db, generation), token = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const [job, marker, control] = await tx.getAll(ref, binding.base, controlRef);
    if (!control.exists || validateFeedIndexControl(control.data()).mode === 'off' || marker.get('v') !== 1 ||
        marker.get('schemaVersion') !== 1 || marker.get('accountRetention') !== true) throw new Error('invalid-normal-gc-generation');
    if (job.exists) {
      const data = validateJob(job.data());
      if (!same(data.generationCreateTime, marker.createTime)) throw new Error('index-gc-generation-changed');
      if (data.phase !== 'working' || data.leaseUntil?.toMillis() > now().toMillis() || data.nextAttemptAt.toMillis() > now().toMillis()) return null;
    }
    const data = job.exists ? job.data() : { v: 1, kind: 'feed-index-gc', phase: 'working', generationCreateTime: marker.createTime, version: 0, checkpoint: null };
    tx.set(ref, { ...data, leaseToken: token, leaseUntil: Timestamp.fromMillis(now().toMillis() + leaseMillis),
      nextAttemptAt: Timestamp.fromMillis(now().toMillis() + leaseMillis), version: data.version + 1, lastErrorCode: null });
    return data;
  });
  if (!claimed) return { state: 'busy', steps: 0 };
  const guard = async tx => {
    const [job, marker, control] = await tx.getAll(ref, binding.base, controlRef);
    if (!job.exists || job.get('leaseToken') !== token) throw new IndexGcLeaseLost();
    const data = validateJob(job.data());
    if (data.phase !== 'working' || data.leaseToken !== token || data.leaseUntil?.toMillis() <= now().toMillis() ||
        !same(marker.createTime, claimed.generationCreateTime) || !control.exists || validateFeedIndexControl(control.data()).mode === 'off') throw new IndexGcLeaseLost();
    return data;
  };
  let steps = 0;
  try {
    const gc = await beginIndexGc(db, binding, cell, { checkpoint: claimed.checkpoint, transactionGuard: guard });
    const initial = gc.checkpoint().metrics, started = elapsedClock();
    let result = { state: gc.state, metrics: initial };
    while (steps < maxSteps && result.state !== 'done' && elapsedClock() - started < maxMillis) {
      result = await gc.step({ reads: 32, deletes: 16 }); steps++;
      const checkpoint = gc.checkpoint();
      await db.runTransaction(async tx => {
        const job = await guard(tx);
        tx.update(ref, { checkpoint, version: job.version + 1 });
      });
    }
    await db.runTransaction(async tx => {
      const job = await guard(tx);
      if (result.state === 'done') tx.delete(ref);
      else tx.update(ref, { leaseToken: null, leaseUntil: null, nextAttemptAt: Timestamp.fromMillis(now().toMillis() + retryMillis), version: job.version + 1 });
    });
    return { state: result.state === 'done' ? 'complete' : 'yielded', steps,
      nodesDeleted: result.metrics.nodesDeleted - initial.nodesDeleted, archivesDeleted: result.metrics.archivesDeleted - initial.archivesDeleted };
  } catch (error) {
    if (error instanceof IndexGcLeaseLost) return { state: 'lease-lost', steps };
    const reset = ['index-gc-root-changed', 'index-gc-retention-changed'].includes(error.message);
    const retry = error.message === 'index-cell-retention-busy' || [4, 8, 10, 13, 14, 'unavailable', 'aborted', 'deadline-exceeded'].includes(error.code);
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref); if (doc.get('leaseToken') !== token) return;
      if (reset) { tx.delete(ref); return; }
      const job = validateJob(doc.data());
      tx.update(ref, { phase: retry ? 'working' : 'needs-review', leaseToken: null, leaseUntil: null,
        nextAttemptAt: Timestamp.fromMillis(now().toMillis() + retryMillis), version: job.version + 1,
        lastErrorCode: retry ? 'transient-failure' : 'invalid-gc-state' });
    });
    return { state: reset ? 'restarted' : retry ? 'deferred' : 'needs-review', steps };
  }
}
