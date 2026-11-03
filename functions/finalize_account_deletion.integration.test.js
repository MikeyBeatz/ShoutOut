import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { finalizeAccountDeletionOperation as finalize } from './finalize_account_deletion.js';
import { prepareAccountDeletionOperation as prepare } from './prepare_account_deletion.js';
import { createShoutOperation as publish } from './create_shout.js';
import { operationTestKey } from './test_helpers.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'account-finalization-tests') : null;
const db = app ? getFirestore(app) : null, uids = [], roots = [];
const now = new Date('2026-11-03T12:00:00Z'), clock = () => now;
const code = value => error => error.code === value;
after(async () => {
  if (!db) return;
  for (const uid of uids) {
    for (const collection of ['shouts', 'serverOperations']) {
      const docs = await db.collection(collection).where(collection === 'shouts' ? 'authorId' : 'userId', '==', uid).get();
      for (const doc of docs.docs) await db.recursiveDelete(doc.ref);
    }
    for (const name of ['users', 'accountDeletionRequests', 'rateLimits']) await db.recursiveDelete(db.doc(`${name}/${uid}`));
  }
  for (const ref of roots) await db.recursiveDelete(ref);
  await db.terminate(); await deleteApp(app);
});
async function fixture() {
  const uid = randomUUID(); uids.push(uid);
  await db.doc(`users/${uid}`).set({ nickname: 'Fixture', avatarId: 'avatar_01',
    avatarBackgroundStart: 1, avatarBackgroundEnd: 2, avatarGradientDirection: 'horizontal' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  const r = { auth: { uid, token: { email: 'fixture@example.test', email_verified: true } },
    app: { appId: 'fixture' }, data: { expectedUserId: uid } };
  return { uid, r, ref: db.doc(`accountDeletionRequests/${uid}`),
    preparation: { ...r, data: { ...r.data, idempotencyKey: operationTestKey(randomUUID(), now) } },
    publication: { ...r, data: { idempotencyKey: operationTestKey(randomUUID(), now),
      title: 'Dotaz', text: 'Fixture', categories: ['Dotaz'], durationMinutes: 120,
      location: { latitude: 50.0755, longitude: 14.4378 } } } };
}
async function active(f) { return db.collection('shouts').where('authorId', '==', f.uid).where('status', '==', 'active').get(); }
function assertNoEscapedPublication(intent, shouts) { assert(!(intent.exists && shouts.size > 0), 'pending request and active owned Shout must not coexist'); }

test('finalization creates only the owned request, preserving foreign and inactive content', { skip: !enabled }, async () => {
  const f = await fixture(), foreign = db.doc(`shouts/${randomUUID()}`); roots.push(foreign);
  await foreign.set({ authorId: 'other', status: 'active', text: 'foreign' });
  const inactive = db.doc(`shouts/${randomUUID()}`);
  await inactive.set({ authorId: f.uid, status: 'expired', text: 'retain' });
  await inactive.collection('comments').doc('foreign').set({ authorId: 'other', text: 'keep' });
  assert.deepEqual(await finalize(f.r, db, clock), { userId: f.uid, ready: true, confirmed: false });
  const saved = await f.ref.get();
  assert.equal(saved.get('email'), f.r.auth.token.email); assert.equal(saved.get('status'), 'pending');
  assert(saved.get('requestedAt') instanceof Timestamp);
  assert.equal(saved.get('retainUntil').toMillis(), now.getTime() + 60 * 86400000);
  assert.equal((await foreign.get()).get('text'), 'foreign');
  assert.equal((await inactive.get()).get('status'), 'expired');
  assert.equal((await inactive.collection('comments').doc('foreign').get()).get('text'), 'keep');
});

test('a publication after preparation returns not ready; another bounded preparation permits finalization', { skip: !enabled }, async () => {
  const f = await fixture(); await prepare(f.preparation, db, clock);
  const created = await publish(f.publication, db, clock);
  assert.deepEqual(await finalize(f.r, db, clock), { userId: f.uid, ready: false, confirmed: false });
  assert.equal((await f.ref.get()).exists, false);
  assert.equal((await db.doc(`shouts/${created.shoutId}`).get()).get('status'), 'active');
  const next = { ...f.preparation, data: { ...f.preparation.data, idempotencyKey: operationTestKey(randomUUID(), now) } };
  assert.equal((await prepare(next, db, clock)).hidden, 1);
  assert.equal((await finalize(f.r, db, clock)).ready, true);
});

test('duplicate and lost-ack replay preserve request bytes, createTime and original deadline', { skip: !enabled }, async () => {
  const f = await fixture();
  const replies = await Promise.all([finalize(f.r, db, clock), finalize(f.r, db, clock)]);
  assert.deepEqual(replies[0], replies[1]);
  const original = await f.ref.get();
  await finalize(f.r, db, () => new Date(now.getTime() + 86400000));
  const replay = await f.ref.get();
  assert(original.createTime.isEqual(replay.createTime)); assert(original.updateTime.isEqual(replay.updateTime));
  assert.deepEqual(original.data(), replay.data());
  await f.ref.update({ authDeletionConfirmedAt: Timestamp.now() });
  const confirmed = await f.ref.get();
  assert.equal((await finalize(f.r, db, clock)).confirmed, true);
  assert.deepEqual((await f.ref.get()).data(), confirmed.data());
});

test('Auth, App Check, strict own input and eligibility reject before mutation', { skip: !enabled }, async () => {
  for (const mode of ['auth', 'app', 'email', 'uid', 'extra', 'profile', 'legal', 'ban']) {
    const f = await fixture(), request = globalThis.structuredClone(f.r);
    if (mode === 'auth') delete request.auth;
    if (mode === 'app') delete request.app;
    if (mode === 'email') request.auth.token.email_verified = false;
    if (mode === 'uid') request.data.expectedUserId = 'other';
    if (mode === 'extra') request.data.retainUntil = 'spoof';
    if (mode === 'profile') await db.doc(`users/${f.uid}`).delete();
    if (mode === 'legal') await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    if (mode === 'ban') { const ban = db.doc(`bans/${f.uid}`); roots.push(ban); await ban.set({}); }
    await assert.rejects(finalize(request, db, clock));
    assert.equal((await f.ref.get()).exists, false);
  }
});

test('malformed existing requests fail closed and are never overwritten', { skip: !enabled }, async () => {
  for (const change of [{ userId: 'other' }, { status: 'other' }, { requestedAt: null }, { retainUntil: null }, { authDeletionConfirmedAt: 'invalid' }]) {
    const f = await fixture(); await finalize(f.r, db, clock); await f.ref.update(change);
    const before = await f.ref.get();
    await assert.rejects(finalize(f.r, db, clock), code('failed-precondition'));
    assert.deepEqual((await f.ref.get()).data(), before.data());
  }
});

test('failure before final commit creates no request', { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(finalize(f.r, db, clock, { beforeCommit: () => { throw Error('injected'); } }), /injected/);
  assert.equal((await f.ref.get()).exists, false);
});

test('finalization first rejects subsequent publication through the real content gateway', { skip: !enabled }, async () => {
  const f = await fixture(); await finalize(f.r, db, clock);
  await assert.rejects(publish(f.publication, db, clock), code('failed-precondition'));
  assert.equal((await active(f)).size, 0);
});

test('concurrent publication and finalization serialize without escaping active content', { skip: !enabled }, async () => {
  for (let i = 0; i < 4; i++) {
    const f = await fixture();
    const [publication, finalization] = await Promise.allSettled([publish(f.publication, db, clock), finalize(f.r, db, clock)]);
    assert.equal(finalization.status, 'fulfilled');
    const intent = await f.ref.get(), shouts = await active(f); assertNoEscapedPublication(intent, shouts);
    if (publication.status === 'fulfilled') { assert.equal(finalization.value.ready, false); assert.equal(shouts.size, 1); }
    else { assert.equal(finalization.value.ready, true); assert.equal(publication.reason.code, 'failed-precondition'); }
  }
});
