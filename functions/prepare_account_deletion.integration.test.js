import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { prepareAccountDeletionOperation as prepare } from './prepare_account_deletion.js';
import { operationTestKey } from './test_helpers.js';
import { receiptMayBePurged } from './cleanup_operation_receipts.js';
import { operationRetryWindowMillis as week } from './operation_retention.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'account-preparation-tests') : null;
const db = app ? getFirestore(app) : null, roots = [];
const now = new Date('2026-11-03T12:00:00Z');
after(async () => { if (db) { for (const ref of roots) await db.recursiveDelete(ref); await db.terminate(); await deleteApp(app); } });
const clock = () => now;
const code = value => error => error.code === value;
async function add(path, value) { const ref = db.doc(path); roots.push(ref); await ref.set(value); return ref; }
async function fixture(count = 0) {
  const uid = randomUUID(), request = { auth: { uid, token: { email: 'fixture@example.test', email_verified: true } },
    app: { appId: 'fixture' }, data: { expectedUserId: uid, idempotencyKey: operationTestKey(randomUUID(), now) } };
  await add(`users/${uid}`, { nickname: 'Fixture' }); await add(`users/${uid}/legal/acceptance_2026_07_25`, {});
  const shouts = [];
  for (let i = 0; i < count; i++) shouts.push(await add(`shouts/${randomUUID()}`, { authorId: uid, status: 'active', text: 'Retain body', likesCount: 3 }));
  const receiptFor = req => {
    const ref = db.doc(`serverOperations/${createHash('sha256').update(`${uid}\nprepareAccountDeletion\n${req.data.idempotencyKey}`).digest('hex')}`); roots.push(ref); return ref;
  };
  return { uid, request, shouts, receipt: receiptFor(request), receiptFor,
    next: () => ({ ...request, data: { ...request.data, idempotencyKey: operationTestKey(randomUUID(), now) } }) };
}

test('preparation drains 51 own Shouts in bounded atomic pages, retaining foreign/inactive content and children', { skip: !enabled }, async () => {
  const f = await fixture(51), foreign = await add(`shouts/${randomUUID()}`, { authorId: 'other', status: 'active' });
  const expired = await add(`shouts/${randomUUID()}`, { authorId: f.uid, status: 'expired' });
  const child = f.shouts[0].collection('comments').doc('keep'); await child.set({ text: 'Keep child' });
  assert.deepEqual(await prepare(f.request, db, clock), { hidden: 50, hasMore: true });
  const first = await db.getAll(...f.shouts); assert.equal(first.filter(row => row.get('status') === 'deleted').length, 50);
  const next = f.next(); f.receiptFor(next);
  assert.deepEqual(await prepare(next, db, clock), { hidden: 1, hasMore: false });
  for (const ref of f.shouts) assert.deepEqual((await ref.get()).data(), { authorId: f.uid, status: 'deleted', text: 'Retain body', likesCount: 3 });
  assert.equal((await foreign.get()).get('status'), 'active'); assert.equal((await expired.get()).get('status'), 'expired');
  assert.equal((await child.get()).get('text'), 'Keep child');
  assert.equal((await db.doc(`accountDeletionRequests/${f.uid}`).get()).exists, false);
});

test('duplicate/replayed page acknowledges its original result and never consumes a later page', { skip: !enabled }, async () => {
  const f = await fixture(1);
  const responses = await Promise.all([prepare(f.request, db, clock), prepare(f.request, db, clock)]);
  assert.deepEqual(responses, [{ hidden: 1, hasMore: false }, { hidden: 1, hasMore: false }]);
  const later = await add(`shouts/${randomUUID()}`, { authorId: f.uid, status: 'active' });
  assert.deepEqual(await prepare(f.request, db, clock), responses[0]); assert.equal((await later.get()).get('status'), 'active');
  const saved = (await f.receipt.get()).data(); assert(receiptMayBePurged(saved, Timestamp.fromMillis(now.getTime() + week)));
  await assert.rejects(prepare(f.request, db, () => new Date(now.getTime() + week)), code('failed-precondition'));
  await f.receipt.delete();
  await assert.rejects(prepare(f.request, db, () => new Date(now.getTime() + week)), code('failed-precondition'));
  assert.equal((await later.get()).get('status'), 'active');
});

test('Auth, App Check, current actor eligibility and strict owner-only input precede every mutation and replay', { skip: !enabled }, async () => {
  for (const mode of ['auth', 'app', 'email', 'expected', 'foreign-input', 'profile', 'legal', 'ban', 'intent']) {
    const f = await fixture(1), request = globalThis.structuredClone(f.request);
    if (mode === 'auth') delete request.auth;
    if (mode === 'app') delete request.app;
    if (mode === 'email') request.auth.token.email_verified = false;
    if (mode === 'expected') request.data.expectedUserId = 'other';
    if (mode === 'foreign-input') request.data.shoutIds = ['other'];
    if (mode === 'profile') await db.doc(`users/${f.uid}`).delete();
    if (mode === 'legal') await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    if (mode === 'ban') await add(`bans/${f.uid}`, {});
    if (mode === 'intent') await add(`accountDeletionRequests/${f.uid}`, { userId: f.uid, status: 'pending' });
    await assert.rejects(prepare(request, db, clock));
    assert.equal((await f.shouts[0].get()).get('status'), 'active'); assert.equal((await f.receipt.get()).exists, false);
  }
  const f = await fixture(0); await prepare(f.request, db, clock);
  await add(`accountDeletionRequests/${f.uid}`, { userId: f.uid, status: 'pending' });
  await assert.rejects(prepare(f.request, db, clock), code('failed-precondition'));
});

test('failure before commit rolls back every staged source change and the receipt', { skip: !enabled }, async () => {
  const f = await fixture(2);
  await assert.rejects(prepare(f.request, db, clock, { beforeCommit: () => { throw new Error('injected transaction failure'); } }), /injected transaction failure/);
  for (const ref of f.shouts) assert.equal((await ref.get()).get('status'), 'active');
  assert.equal((await f.receipt.get()).exists, false);
});
