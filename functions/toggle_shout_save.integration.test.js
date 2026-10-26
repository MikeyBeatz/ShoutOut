import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { toggleShoutSaveOperation as toggle } from './toggle_shout_save.js';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'shout-save-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = new Date('2026-10-26T12:00:00Z');
const at = (ms = 0) => () => new Date(now.getTime() + ms);
async function actor() {
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set({ nickname: 'Test saver' });
  await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});
  return uid;
}
async function fixture() {
  const uid = await actor(), owner = randomUUID();
  const shoutRef = db.doc(`shouts/${randomUUID()}`);
  const shoutData = { authorId: owner, title: 'Target', text: 'Original content', status: 'active',
    likesCount: 2, dislikesCount: 3, commentsCount: 4, savesCount: 5 };
  await shoutRef.set(shoutData);
  const request = { auth: { uid, token: { email: 'test@example.test', email_verified: true } },
    app: { appId: 'test' }, data: { idempotencyKey: 'first', shoutId: shoutRef.id, expectedUserId: uid } };
  return { uid, owner, shoutRef, shoutData, request };
}
const rate = uid => db.doc(`rateLimits/${uid}/actions/interaction`);
const saved = f => f.shoutRef.collection('saves').doc(f.uid);
const receipt = (f, key = 'first') => db.doc(`serverOperations/${createHash('sha256').update(`${f.uid}\ntoggleShoutSave\n${key}`).digest('hex')}`);
const change = (request, idempotencyKey) => ({ ...request, data: { ...request.data, idempotencyKey } });

test('save and removal atomically update one counter, rate and receipt without notifications', { skip: !enabled }, async () => {
  const f = await fixture();
  assert.deepEqual(await toggle(f.request, db, at()), { saved: true, count: 6 });
  assert.deepEqual((await saved(f).get()).data(), { createdAt: Timestamp.fromDate(now) });
  const first = (await receipt(f).get()).data();
  assert.equal(first.userId, f.uid);
  assert.equal(first.action, 'toggleShoutSave');
  assert.equal(first.shoutId, f.shoutRef.id);
  assert.deepEqual(first.result, { saved: true, count: 6 });
  assert.equal(first.createdAt.toMillis(), now.getTime());
  assert.deepEqual(Object.keys(first).sort(), ['action','createdAt','fingerprint','result','shoutId','userId']);
  assert.deepEqual(await toggle(change(f.request, 'remove'), db, at(1000)), { saved: false, count: 5 });
  assert.equal((await saved(f).get()).exists, false);
  assert.deepEqual((await f.shoutRef.get()).data(), f.shoutData);
  const limit = (await rate(f.uid).get()).data();
  assert.equal(limit.count, 2);
  assert.equal(limit.lastEventId, `save_${f.shoutRef.id}`);
  assert.equal(limit.lastAt.toMillis(), now.getTime() + 1000);
  assert.equal((await db.collection(`users/${f.owner}/notifications`).get()).size, 0);
});

test('concurrent retry applies once and historical replay cannot re-save a removed Shout', { skip: !enabled }, async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => toggle(f.request, db, at())));
  for (const result of results) assert.deepEqual(result, { saved: true, count: 6 });
  assert.equal((await rate(f.uid).get()).data().count, 1);
  await toggle(change(f.request, 'remove'), db, at(1000));
  assert.deepEqual(await toggle(f.request, db, at(2000)), results[0]);
  assert.equal((await saved(f).get()).exists, false);
  assert.equal((await f.shoutRef.get()).data().savesCount, 5);
  assert.equal((await rate(f.uid).get()).data().count, 2);
  await assert.rejects(toggle({ ...f.request, data: { ...f.request.data, shoutId: 'another-target' } }, db, at(2000)), error => error.code === 'already-exists');
  await db.doc(`bans/${f.uid}`).set({});
  await assert.rejects(toggle(f.request, db, at(3000)), error => error.code === 'permission-denied');
});

test('distinct concurrent requests by one actor cannot bypass cooldown or toggle twice', { skip: !enabled }, async () => {
  const f = await fixture();
  const results = await Promise.allSettled(['one','two'].map(key => toggle(change(f.request, key), db, at())));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await saved(f).get()).exists, true);
  assert.equal((await f.shoutRef.get()).data().savesCount, 6);
  assert.equal((await rate(f.uid).get()).data().count, 1);
  const receipts = await db.getAll(receipt(f,'one'),receipt(f,'two'));
  assert.equal(receipts.filter(snapshot => snapshot.exists).length, 1);
});

test('parallel actors preserve the total and have independent operation identities', { skip: !enabled }, async () => {
  const f = await fixture(), other = await actor();
  const otherRequest = { ...f.request, auth: { ...f.request.auth, uid: other }, data: { ...f.request.data, expectedUserId: other } };
  await Promise.all([toggle(f.request, db, at()), toggle(otherRequest, db, at())]);
  assert.equal((await f.shoutRef.get()).data().savesCount, 7);
  assert.equal((await saved(f).get()).exists, true);
  assert.equal((await f.shoutRef.collection('saves').doc(other).get()).exists, true);
  assert.equal((await rate(f.uid).get()).data().count, 1);
  assert.equal((await rate(other).get()).data().count, 1);
  assert.equal((await receipt(f).get()).exists, true);
  assert.equal((await receipt({ ...f, uid: other }).get()).exists, true);
});

test('saves and reactions share cooldown while the same retry key has a separate namespace', { skip: !enabled }, async () => {
  const f = await fixture();
  await toggle(f.request, db, at());
  const reaction = { ...f.request, data: { ...f.request.data, button: 'like' } };
  await assert.rejects(toggleShoutReactionOperation(reaction, db, at(500)), error => error.code === 'resource-exhausted');
  await toggleShoutReactionOperation(reaction, db, at(1000));
  await assert.rejects(toggle(change(f.request, 'remove'), db, at(1500)), error => error.code === 'resource-exhausted');
  await toggle(change(f.request, 'remove'), db, at(2000));
  assert.equal((await f.shoutRef.get()).data().savesCount, 5);
  assert.equal((await f.shoutRef.get()).data().likesCount, 3);
  assert.equal((await rate(f.uid).get()).data().count, 3);
  assert.equal((await receipt(f).get()).data().action, 'toggleShoutSave');
});

test('invalid account, missing target and inconsistent counters leave no partial save writes', { skip: !enabled }, async () => {
  for (const mode of ['ban','deletion','legal','profile','missing','other-counter','null-counter','negative','underflow','overflow']) {
    const f = await fixture();
    if (mode === 'ban') await db.doc(`bans/${f.uid}`).set({});
    if (mode === 'deletion') await db.doc(`accountDeletionRequests/${f.uid}`).set({});
    if (mode === 'legal') await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    if (mode === 'profile') await db.doc(`users/${f.uid}`).delete();
    if (mode === 'missing') await f.shoutRef.delete();
    if (mode === 'other-counter') await f.shoutRef.update({ commentsCount: -1 });
    if (mode === 'null-counter') await f.shoutRef.update({ savesCount: null });
    if (mode === 'negative') await f.shoutRef.update({ savesCount: -1 });
    if (mode === 'overflow') await f.shoutRef.update({ savesCount: Number.MAX_SAFE_INTEGER });
    if (mode === 'underflow') {
      await f.shoutRef.update({ savesCount: 0 });
      await saved(f).set({ createdAt: Timestamp.fromDate(now) });
    }
    await assert.rejects(toggle(f.request, db, at()));
    assert.equal((await rate(f.uid).get()).exists, false);
    assert.equal((await receipt(f).get()).exists, false);
    assert.equal((await saved(f).get()).exists, mode === 'underflow');
    if (mode !== 'missing') assert.equal((await f.shoutRef.get()).data().likesCount, 2);
  }
});

test('hourly boundary, retained inactive Shouts and creation restrictions preserve current save policy', { skip: !enabled }, async () => {
  for (const status of ['expired','deleted']) {
    const f = await fixture();
    await f.shoutRef.update({ status });
    await db.doc(`contentRestrictions/${f.uid}`).set({ expiresAt: Timestamp.fromMillis(now.getTime() + 60000) });
    await rate(f.uid).set({ count: 120, lastAt: Timestamp.fromMillis(now.getTime() - 1000),
      windowStartedAt: Timestamp.fromMillis(now.getTime() - 3599000), lastEventId: 'shoutReaction_previous' });
    await assert.rejects(toggle(f.request, db, at()), error => error.code === 'resource-exhausted');
    assert.equal((await saved(f).get()).exists, false);
    await toggle(f.request, db, at(1000));
    assert.equal((await rate(f.uid).get()).data().count, 1);
    assert.equal((await f.shoutRef.get()).data().savesCount, 6);
  }
});
