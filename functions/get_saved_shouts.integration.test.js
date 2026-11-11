import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { getSavedShoutsOperation as page } from './get_saved_shouts.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'saved-pages-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t, count = 55) {
  const uid = randomUUID(), roots = [db.doc(`users/${uid}`)], batch = db.batch(), refs = [];
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  batch.create(roots[0], { nickname: 'Fixture' }); batch.create(roots[0].collection('legal').doc('acceptance_2026_07_25'), {});
  for (let i = 0; i < count; i++) {
    const ref = db.doc(`shouts/saved-${uid}-${String(i).padStart(3, '0')}`); roots.push(ref); refs.push(ref);
    batch.create(ref, { authorId: `${uid}-author`, authorNickname: 'Author', title: 'Saved older Shout', text: 'Full content',
      status: 'active', createdAt: Timestamp.fromMillis(Date.now() - 86400000), expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
      likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 1, privateFixture: 'Never return this' });
    batch.create(ref.collection('saves').doc(uid), { userId: uid, createdAt: Timestamp.now() });
  }
  await batch.commit();
  return { uid, refs, roots, request: after => ({ auth: { uid, token: { email: 'saved@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { expectedUserId: uid, ...(after ? { after } : {}) } }) };
}

test('saved pages authenticate before accessing any private collections', async () => {
  await assert.rejects(page({}, { projectId: 'shoutout-dev-46c81', doc() { assert.fail('No unauthenticated access'); } }), { code: 'unauthenticated' });
});
test('bookmarks outside the nearby/recent window remain available in bounded owner-only pages', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await page(f.request(), db), second = await page(f.request(first.next), db);
  assert.equal(first.items.length, 50); assert.equal(second.items.length, 5); assert.equal(second.next, null);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 55);
  assert(first.items.every(item => item.data.title === 'Saved older Shout' && item.data.privateFixture === undefined));
  await f.refs[0].update({ location: new GeoPoint(50.08, 14.44) });
  const located = f.request(); located.data.point = { latitude: 50.09, longitude: 14.44 };
  const item = (await page(located, db)).items.find(item => item.id === f.refs[0].id);
  assert(item.distanceKm > 1 && item.distanceKm < 1.2);
  located.data.point.latitude = 100;
  await assert.rejects(page(located, db), { code: 'invalid-argument' });
  await assert.rejects(page(f.request(first.next.slice(0, -f.uid.length) + 'other'), db), { code: 'invalid-argument' });
  const changed = f.request(); changed.data.expectedUserId = 'other';
  await assert.rejects(page(changed, db), { code: 'invalid-argument' });
});
test('deleted, expired, blocked and erased-author sources are not returned; pending actors cannot enumerate', { skip: !enabled }, async t => {
  const f = await fixture(t, 5);
  await f.refs[0].update({ status: 'deleted' }); await f.refs[1].update({ expiresAt: Timestamp.fromMillis(0) });
  await f.refs[2].update({ authorId: `${f.uid}-blocked` }); await f.refs[3].update({ authorId: `${f.uid}-erased` });
  await db.doc(`users/${f.uid}/blocked/${f.uid}-blocked`).set({});
  const marker = db.doc(`publicProfiles/${f.uid}-erased`); f.roots.push(marker); await marker.set({ accountStatus: 'deleted', schemaVersion: 1 });
  assert.deepEqual((await page(f.request(), db)).items.map(item => item.id), [f.refs[4].id]);
  const request = db.doc(`accountDeletionRequests/${f.uid}`); f.roots.push(request); await request.set({ status: 'pending' });
  await assert.rejects(page(f.request(), db), { code: 'failed-precondition' });
});

test('removing the page anchor bookmark does not lose the following saved page', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await page(f.request(), db);
  await db.doc(first.next).delete();
  const second = await page(f.request(first.next), db);
  assert.deepEqual(second.items.map(item => item.id), f.refs.slice(50).map(ref => ref.id));
  assert.equal(second.next, null);
});

test('a fully filtered first page keeps its continuation to available later bookmarks', { skip: !enabled }, async t => {
  const f = await fixture(t), batch = db.batch();
  for (const ref of f.refs.slice(0, 50)) batch.update(ref, { expiresAt: Timestamp.fromMillis(0) });
  await batch.commit();
  const first = await page(f.request(), db);
  assert.deepEqual(first.items, []); assert(first.next);
  const second = await page(f.request(first.next), db);
  assert.deepEqual(second.items.map(item => item.id), f.refs.slice(50).map(ref => ref.id));
  assert.equal(second.next, null);
});
