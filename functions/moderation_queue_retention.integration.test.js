import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { log } from 'node:console';
import { runScheduledRetention } from './receipt_cleanup_handler.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'queue-composed-retention') : null;
const raw = app ? getFirestore(app) : null;
const paths = ['maintenanceState/retentionControl', 'maintenanceState/readRetentionCleanup', 'maintenanceState/continuingReceiptCleanup', 'moderationQueueControl/current'];
after(async () => { if (app) { for (const p of paths) await raw.doc(p).delete(); await raw.terminate(); await deleteApp(app); } });
test('complete scheduled retention adds exactly two idle reads and reaps at most50 jobs, also paused', { skip: !enabled }, async t => {
  for (const p of paths) await raw.doc(p).delete();
  const now = new Date(), clock = () => now;
  await raw.doc(paths[0]).set({ v: 1, revision: 1, mode: 'active' });
  await raw.doc(paths[3]).set({ schemaVersion: 1, revision: 1, incarnation: 'a'.repeat(64), mode: 'active' });
  let reads = 0, writes = 0, transactions = 0;
  const record = v => { reads += Math.max(1, Array.isArray(v) ? v.length : v.docs?.length ?? 1); return v; };
  const db = new Proxy(raw, { get(target, key) {
    if (key === 'doc') return (...args) => {
      const ref = target.doc(...args); return new Proxy(ref, { get(r, k) {
        if (k === 'get') return async (...a) => record(await r.get(...a));
        return typeof r[k] === 'function' ? r[k].bind(r) : r[k];
      } });
    };
    if (key === 'runTransaction') return (op, ...args) => target.runTransaction(async tx => {
      transactions++;
      const measured = new Proxy(tx, { get(real, method) {
        if (['get', 'getAll'].includes(method)) return async (...a) => record(await real[method](...a));
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...a) => { writes++; real[method](...a); return measured; };
        return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
      } }); return op(measured);
    }, ...args);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await runScheduledRetention(db, { moderationQueueEnabled: true, clock });
  reads = writes = transactions = 0;
  const idle = await runScheduledRetention(db, { moderationQueueEnabled: true, clock });
  assert.equal(idle.state, 'checked'); assert.equal(idle.moderationQueue.examined, 0);
  assert.equal(reads, 5); assert.equal(writes, 0); assert.equal(transactions, 3);
  const idleCounts = { reads, writes, transactions };
  const refs = Array.from({ length: 51 }, (_, n) => raw.doc(`moderationCaseDecisions/${String(n).padStart(64, 'b')}`));
  t.after(async () => { for (const ref of refs) await ref.delete(); });
  for (const ref of refs) await ref.set({ expiresAt: Timestamp.fromMillis(now.getTime() - 1), caseId: 'c'.repeat(64), caseIncarnation: 'd'.repeat(64) });
  await raw.doc(paths[3]).update({ mode: 'paused', revision: 2 });
  reads = writes = transactions = 0;
  const first = await runScheduledRetention(db, { moderationQueueEnabled: true, clock });
  assert.equal(first.moderationQueue.examined, 50); assert.equal(first.moderationQueue.deleted, 50);
  assert.equal((await raw.collection('moderationCaseDecisions').get()).size, 1);
  const debtCounts = { reads, writes, transactions };
  assert.equal((await runScheduledRetention(db, { moderationQueueEnabled: true, clock })).moderationQueue.deleted, 1);
  assert.equal((await runScheduledRetention(db, { moderationQueueEnabled: false, clock })).moderationQueue, undefined);
  log('MODERATION_QUEUE_COMPOSED_RETENTION', JSON.stringify({ idle: idleCounts, first50: debtCounts, softMillisPerOriginalPhase: 10000, maxOriginalDocumentsPerPhase: 500, queueJobsPerRun: 50 }));
});
