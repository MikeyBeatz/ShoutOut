import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { cleanupExpiredOperationReceipts as cleanup, runOperationReceiptCleanup } from './cleanup_operation_receipts.js';
import { operationRetryWindowMillis as week } from './operation_retention.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'receipt-cleanup-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-11-02T12:00:00Z');
const clock = () => now;
const old = Timestamp.fromMillis(now.getTime() - week);
async function fixture(count = 0) {
  // Isolate each destructive test without changing the production collection.
  const collection = db.collection('cleanupTestScopes').doc(randomUUID()).collection('serverOperations');
  const checkpoint = collection.parent.collection('maintenanceState').doc('operationReceiptCleanup');
  const scopedDb = { collection: name => { assert.equal(name, 'serverOperations'); return collection; },
    doc: path => { assert.equal(path, 'maintenanceState/operationReceiptCleanup'); return checkpoint; },
    batch: () => db.batch() };
  for (let index = 0; index < count; index++) {
    await collection.doc(`old-${index}`).set({ userId: 'actor', action: 'toggleShoutSave', createdAt: old,
      keyVersion: 1, expiresAt: Timestamp.fromDate(now) });
  }
  return { collection, scopedDb, checkpoint };
}

test('cleanup removes expired timed and legacy receipts, preserves live/unknown data and repeats safely', { skip: !enabled }, async () => {
  const f = await fixture(2);
  await f.collection.doc('legacy').set({ userId: 'actor', action: 'createShout', createdAt: old });
  await f.collection.doc('fresh').set({ userId: 'actor', action: 'deleteComment', createdAt: Timestamp.fromDate(now) });
  await f.collection.doc('unknown').set({ userId: 'actor', action: 'futureOperation', createdAt: old });
  const first = await cleanup(f.scopedDb, { clock });
  assert.equal(first.deleted, 3);assert.equal(first.skipped, 1);
  assert.equal((await f.collection.get()).size, 2);
  const second = await cleanup(f.scopedDb, { clock });
  assert.equal(second.deleted, 0);assert.equal(second.skipped, 1);
});

test('bounded pagination makes progress across more than one page and resumes on the next invocation', { skip: !enabled }, async () => {
  const f = await fixture(5);
  const first = await cleanup(f.scopedDb, { clock, pageSize: 2, maximum: 3 });
  assert.equal(first.deleted, 3);assert.equal(first.scanned, 3);assert.equal(first.reachedLimit, true);
  assert.equal((await f.collection.get()).size, 2);
  const second = await cleanup(f.scopedDb, { clock, pageSize: 2 });
  assert.equal(second.deleted, 2);assert.equal(second.reachedLimit, false);
  assert.equal((await f.collection.get()).size, 0);
});

test('persisted cursor advances past preserved records and wraps after the last page', { skip: !enabled }, async () => {
  const f = await fixture(3);
  for (const id of ['unknown-a', 'unknown-b']) await f.collection.doc(id).set({
    userId: 'actor', action: 'futureOperation', createdAt: Timestamp.fromMillis(old.toMillis() - 1),
  });
  const first = await runOperationReceiptCleanup(f.scopedDb, { clock, maximum: 2 });
  assert.equal(first.skipped, 2);assert.equal(first.deleted, 0);
  assert.equal(first.reachedLimit, true);assert.equal(first.checkpointConflict, false);
  const second = await runOperationReceiptCleanup(f.scopedDb, { clock, maximum: 2 });
  assert.equal(second.deleted, 2);assert.equal(second.skipped, 0);
  const third = await runOperationReceiptCleanup(f.scopedDb, { clock, maximum: 2 });
  assert.equal(third.deleted, 1);assert.equal(third.nextCursor, null);
  assert.equal((await f.checkpoint.get()).data().cursor, null);
  const repeat = await runOperationReceiptCleanup(f.scopedDb, { clock, maximum: 3 });
  assert.equal(repeat.deleted, 0);assert.equal(repeat.skipped, 2);
});

test('a changed receipt aborts the whole deletion batch instead of deleting a renewed record', { skip: !enabled }, async () => {
  const f = await fixture(2);
  let changed = false;
  const racingDb = { ...f.scopedDb, batch: () => {
    const batch = db.batch();
    return { delete: (ref, condition) => batch.delete(ref, condition), commit: async () => {
      if (!changed) {
        changed = true;
        await f.collection.doc('old-0').update({ createdAt: Timestamp.fromDate(now),
          expiresAt: Timestamp.fromMillis(now.getTime() + week) });
      }
      return batch.commit();
    } };
  } };
  const result = await cleanup(racingDb, { clock });
  assert.equal(result.conflict, true);assert.equal(result.deleted, 0);
  assert.equal((await f.collection.get()).size, 2);
  const retry = await cleanup(f.scopedDb, { clock });
  assert.equal(retry.deleted, 1);
  assert.equal((await f.collection.doc('old-0').get()).exists, true);
});

test('concurrent checkpoint creation is preserved and safe cleanup can be repeated', { skip: !enabled }, async () => {
  const f = await fixture(2);
  const racingDb = { ...f.scopedDb, doc: () => ({
    get: () => f.checkpoint.get(),
    create: async next => {
      await f.checkpoint.create({ cursor: null, otherWorker: true });
      return f.checkpoint.create(next);
    },
  }) };
  const result = await runOperationReceiptCleanup(racingDb, { clock });
  assert.equal(result.deleted, 2);assert.equal(result.checkpointConflict, true);
  assert.deepEqual((await f.checkpoint.get()).data(), { cursor: null, otherWorker: true });
  const retry = await runOperationReceiptCleanup(f.scopedDb, { clock });
  assert.equal(retry.deleted, 0);assert.equal(retry.checkpointConflict, false);
});
