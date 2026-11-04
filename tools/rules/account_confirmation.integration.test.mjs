import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, deleteDoc, updateDoc, deleteField, setDoc, serverTimestamp, getDoc, getDocs, collection } from 'firebase/firestore';
import { confirmAccountAuthDeletion as confirm } from '../../functions/account_deletion_confirmation.js';
const sdk = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = sdk('firebase-admin/app');
const { getFirestore, Timestamp } = sdk('firebase-admin/firestore');
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
let app, db, env; const roots = [];
const missing = { async getUser() { throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' }); } };
before(async () => {
  assert.ok(enabled, 'emulator required');
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: { host: '127.0.0.1', port: 8080,
    rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
  app = initializeApp({ projectId: 'shoutout-rules-test' }, 'confirmation-tests'); db = getFirestore(app);
});
after(async () => { if (db) { for (const root of roots) await db.recursiveDelete(root); await db.terminate(); await deleteApp(app); } if (env) await env.cleanup(); });
async function fixture() {
  const uid = randomUUID(), request = db.doc(`accountDeletionRequests/${uid}`), lease = db.doc(`confirmationLab/${uid}`);
  roots.push(request, lease);
  await request.set({ userId: uid, email: 'fixture@example.test', requestedAt: Timestamp.now(),
    retainUntil: Timestamp.fromMillis(Date.now() + 60 * 86400000), status: 'pending' });
  await lease.set({ owner: 'first' });
  const snapshot = await request.get(), identity = { projectId: db.projectId, userId: uid, requestCreateTime: snapshot.createTime };
  const options = { clock: () => new Date(), transactionGuard: async transaction => {
    assert.equal((await transaction.get(lease)).data()?.owner, 'first');
  } };
  const context = env.authenticatedContext(uid, { email: 'fixture@example.test', email_verified: true });
  const client = doc(context.firestore(), request.path);
  return { uid, request, lease, identity, options, snapshot, client, run: () => confirm(identity, db, missing, options) };
}
test('client rollback is denied even before server confirmation', async () => {
  const f = await fixture(); await assertFails(deleteDoc(f.client)); assert.equal((await f.request.get()).exists, true);
});

test('confirmation atomically retires modern and legacy authority while preserving metadata and retention', async () => {
  const f = await fixture(), modern = db.doc(`accountRoles/${f.uid}`), legacy = db.doc(`moderators/${f.uid}`);
  roots.push(modern, legacy);
  await modern.set({ role: 'administrator', level: 5, audit: 'original' });
  await legacy.set({ grantedBy: 'original' });
  const options = { ...f.options, retireRoles: true };
  await confirm(f.identity, db, missing, options);
  const request = await f.request.get(), role = await modern.get(), old = await legacy.get();
  assert.deepEqual(role.data(), { role: 'administrator', level: 5, audit: 'original', accountStatus: 'deleted' });
  assert.deepEqual(old.data(), { grantedBy: 'original', accountStatus: 'deleted' });
  assert.ok(request.data().rolesRetiredAt.isEqual(request.data().authDeletionConfirmedAt));
  assert.ok(request.createTime.isEqual(f.snapshot.createTime));
  assert.ok(request.data().retainUntil.isEqual(f.snapshot.data().retainUntil));
  await confirm(f.identity, db, missing, options);
  for (const [ref, before] of [[f.request, request], [modern, role], [legacy, old]]) {
    assert.ok((await ref.get()).updateTime.isEqual(before.updateTime));
  }
});

test('Auth presence, provider error and lease loss cannot partially retire roles', async () => {
  const f = await fixture(), role = db.doc(`accountRoles/${f.uid}`); roots.push(role);
  await role.set({ role: 'business', level: 2 }); const before = await role.get();
  const options = { ...f.options, retireRoles: true };
  await confirm(f.identity, db, { getUser: async () => ({ uid: f.uid }) }, options);
  await assert.rejects(confirm(f.identity, db, { getUser: async () => { throw new Error('outage'); } }, options));
  await f.lease.update({ owner: 'another' }); await assert.rejects(confirm(f.identity, db, missing, options));
  assert.ok((await role.get()).updateTime.isEqual(before.updateTime));
  assert.ok((await f.request.get()).updateTime.isEqual(f.snapshot.updateTime));
});

test('missing roles stay missing and malformed retirement markers fail closed', async () => {
  const f = await fixture(), options = { ...f.options, retireRoles: true };
  await confirm(f.identity, db, missing, options);
  assert.equal((await db.doc(`accountRoles/${f.uid}`).get()).exists, false);
  assert.equal((await db.doc(`moderators/${f.uid}`).get()).exists, false);
  await f.request.update({ rolesRetiredAt: 'invalid' }); const before = await f.request.get();
  await assert.rejects(confirm(f.identity, db, missing, options), /invalid-role-retirement/);
  assert.ok((await f.request.get()).updateTime.isEqual(before.updateTime));
});
test('server confirmation prevents deletion/erasure/replacement using an old token and replays without extending retention', async () => {
  const f = await fixture(); assert.deepEqual(await f.run(), { state: 'auth-deletion-confirmed', changed: true });
  const confirmed = await f.request.get(), expected = f.snapshot.data();
  assert.ok(confirmed.data().authDeletionConfirmedAt instanceof Timestamp);
  const { authDeletionConfirmedAt, ...unchanged } = confirmed.data(); assert.ok(authDeletionConfirmedAt);
  assert.deepEqual(unchanged, expected); assert.ok(confirmed.createTime.isEqual(f.snapshot.createTime));
  await assertFails(deleteDoc(f.client)); await assertFails(updateDoc(f.client, { authDeletionConfirmedAt: deleteField() }));
  await assertFails(setDoc(f.client, { ...expected, requestedAt: expected.requestedAt.toDate(), retainUntil: expected.retainUntil.toDate() }));
  await assertFails(updateDoc(f.client, { userId: 'another', status: 'completed' }));
  const foreign = env.authenticatedContext('another', { email_verified: true, email: 'other@example.test' }).firestore();
  await assertFails(getDoc(doc(foreign, f.request.path))); await assertFails(deleteDoc(doc(foreign, f.request.path)));
  const anonymous = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonymous, f.request.path))); await assertFails(getDocs(collection(anonymous, 'accountDeletionRequests')));
  assert.deepEqual(await f.run(), { state: 'auth-deletion-confirmed', changed: false });
  assert.ok((await f.request.get()).updateTime.isEqual(confirmed.updateTime));
});
test('a client cannot forge server confirmation when creating a request', async () => {
  const f = await fixture(); await f.request.delete();
  const clientData = { ...f.snapshot.data(), requestedAt: serverTimestamp(), retainUntil: f.snapshot.data().retainUntil.toDate() };
  await assertFails(setDoc(f.client, { ...clientData, authDeletionConfirmedAt: new Date() }));
  assert.equal((await f.request.get()).exists, false);
  await assertFails(setDoc(f.client, clientData));
  assert.equal((await f.request.get()).exists, false);
});
test('existing Auth and provider failures cannot create confirmation', async () => {
  const f = await fixture();
  assert.deepEqual(await confirm(f.identity, db, { getUser: async () => ({ uid: f.uid }) }, f.options), { state: 'waiting-for-auth-deletion' });
  await assert.rejects(confirm(f.identity, db, { getUser: async () => { throw new Error('provider-outage'); } }, f.options), /provider-outage/);
  assert.ok((await f.request.get()).updateTime.isEqual(f.snapshot.updateTime));
});
test('lost lease, invalid server marker and exact retention boundary cannot partially change a request', async () => {
  const f = await fixture(); await f.lease.update({ owner: 'other' }); await assert.rejects(f.run());
  assert.ok((await f.request.get()).updateTime.isEqual(f.snapshot.updateTime));
  await f.lease.update({ owner: 'first' });
  await f.request.update({ authDeletionConfirmedAt: 'untrusted' }); const invalid = await f.request.get();
  await assertFails(deleteDoc(f.client));
  await assert.rejects(f.run(), /invalid-auth-deletion-confirmation/); assert.ok((await f.request.get()).updateTime.isEqual(invalid.updateTime));
  await assert.rejects(confirm(f.identity, db, missing, { ...f.options,
    clock: () => new Date(f.identity.requestCreateTime.toMillis() + 60 * 86400000) }), /retention-invalid/);
});
test('privileged request removal during Auth lookup stops confirmation', async () => {
  const f = await fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers();
  const running = confirm(f.identity, db, { async getUser() { entered.resolve(); await release.promise; return missing.getUser(); } }, f.options);
  await entered.promise; await assertFails(deleteDoc(f.client)); await f.request.delete(); release.resolve();
  await assert.rejects(running, /not-pending/); assert.equal((await f.request.get()).exists, false);
});
test('confirmation commits before a concurrent old-token delete, which must then fail', { timeout: 25000 }, async () => {
  const f = await fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers();
  const running = confirm(f.identity, db, missing, { ...f.options, transactionGuard: async transaction => {
    await f.options.transactionGuard(transaction); entered.resolve(); await release.promise;
  } });
  await entered.promise; const cancelled = assertFails(deleteDoc(f.client)); release.resolve();
  assert.equal((await running).state, 'auth-deletion-confirmed'); await cancelled;
  assert.ok((await f.request.get()).data().authDeletionConfirmedAt instanceof Timestamp);
});
test('a replacement request with the same UID cannot inherit a prior Auth observation', async () => {
  const f = await fixture();
  await assert.rejects(confirm(f.identity, db, { async getUser() {
    await f.request.delete(); await f.request.set(f.snapshot.data()); return missing.getUser();
  } }, f.options), /replaced/);
  assert.equal((await f.request.get()).data().authDeletionConfirmedAt, undefined);
});
