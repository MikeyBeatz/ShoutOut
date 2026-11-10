import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { getOwnShoutsOperation as page, ownShoutRetentionMillis } from './get_own_shouts.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'own-pages-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
const now = 1794300000000, clock = () => new Date(now);
function request(uid, section = 'active', after = null) {
  return { auth: { uid, token: { email: 'own@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { expectedUserId: uid, section, after } };
}
async function fixture(t, count = 61) {
  const uid = randomUUID(), roots = [db.doc(`users/${uid}`)], refs = [], batch = db.batch();
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  batch.create(roots[0], { nickname: 'Owner' }); batch.create(roots[0].collection('legal').doc('acceptance_2026_07_25'), {});
  for (let i = 0; i < count; i++) {
    const ref = db.doc(`shouts/own-${uid}-${String(i).padStart(3, '0')}`); refs.push(ref); roots.push(ref);
    batch.create(ref, { authorId: uid, authorNickname: 'Owner', title: `Own ${i}`, text: 'Full body',
      categories: ['Dotaz'], status: 'active', createdAt: Timestamp.fromMillis(now - 10000 - i), expiresAt: Timestamp.fromMillis(now + 60000),
      likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0, internalFixture: 'Never return' });
    const foreign = db.doc(`shouts/foreign-${uid}-${i}`); roots.push(foreign);
    batch.create(foreign, { authorId: 'other', status: 'active', createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + 60000) });
  }
  await batch.commit(); return { uid, roots, refs };
}

test('own pages reject missing identity and foreign/invalid inputs before database access', async () => {
  const unreadable = new Proxy({ projectId: 'shoutout-dev-46c81' }, { get(t, k) { if (k === 'projectId') return t[k]; assert.fail('Unexpected database access'); } });
  await assert.rejects(page({}, unreadable), { code: 'unauthenticated' });
  const noApp = request('reader'); delete noApp.app;
  await assert.rejects(page(noApp, unreadable), { code: 'unauthenticated' });
  const unverified = request('reader'); unverified.auth.token.email_verified = false;
  await assert.rejects(page(unverified, unreadable), { code: 'permission-denied' });
  for (const change of [{ expectedUserId: 'other' }, { section: 'deleted' }, { authorId: 'other' },
    { point: { latitude: 100, longitude: 14 } }, { after: { userId: 'other', section: 'active', id: 'x', createdAt: [0, 0], expiresAt: [0, 0] } },
    { after: { userId: 'reader', section: 'expired', id: 'x', createdAt: [0, 0], expiresAt: [0, 0] } },
    { after: { userId: 'reader', section: 'active', id: 'x', createdAt: [1, 1000000000], expiresAt: [0, 0] } }]) {
    const input = request('reader'); Object.assign(input.data, change); await assert.rejects(page(input, unreadable), { code: 'invalid-argument' });
  }
});

test('own pages ignore the global recent window and return 50 then 11 in newest order without duplicates', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await page(request(f.uid), db, { clock }), next = await page(request(f.uid, 'active', first.next), db, { clock });
  assert.equal(first.items.length, 50); assert.equal(next.items.length, 11); assert.equal(next.next, null);
  assert.deepEqual([...first.items, ...next.items].map(i => i.id), f.refs.map(r => r.id));
  assert(first.items.every(i => i.data.authorId === f.uid && i.data.internalFixture === undefined));
  await f.refs[49].delete();
  assert.deepEqual((await page(request(f.uid, 'active', first.next), db, { clock })).items.map(i => i.id), next.items.map(i => i.id));
});

test('expiry uses server time and inclusive seven-day retention, even before status materialization', { skip: !enabled }, async t => {
  const f = await fixture(t, 7), batch = db.batch();
  const changes = [
    { expiresAt: Timestamp.fromMillis(now), status: 'active' },
    { createdAt: Timestamp.fromMillis(now - ownShoutRetentionMillis - 86400000), expiresAt: Timestamp.fromMillis(now - ownShoutRetentionMillis), status: 'expired' },
    { createdAt: Timestamp.fromMillis(now - ownShoutRetentionMillis - 86400000), expiresAt: Timestamp.fromMillis(now - ownShoutRetentionMillis - 1), status: 'expired' },
    { status: 'deleted' }, { contentPurged: true },
    { expiresAt: Timestamp.fromMillis(now - 1), status: 'expired' },
  ];
  changes.forEach((change, i) => batch.update(f.refs[i], change)); await batch.commit();
  assert.deepEqual((await page(request(f.uid), db, { clock })).items.map(i => i.id), [f.refs[6].id]);
  assert.deepEqual((await page(request(f.uid, 'expired'), db, { clock })).items.map(i => i.id), [f.refs[0].id, f.refs[5].id, f.refs[1].id]);
});

test('timestamp ties paginate precisely; a hidden source does not claim the end of a full page', { skip: !enabled }, async t => {
  const f = await fixture(t, 51), batch = db.batch();
  for (const ref of f.refs) batch.update(ref, { createdAt: new Timestamp(1794299999, 123456000), contentPurged: ref.id.endsWith('-050') });
  await batch.commit(); const first = await page(request(f.uid), db, { clock });
  assert.equal(first.items.length, 49); assert(first.next); assert.equal(first.next.createdAt[1], 123456000);
  const second = await page(request(f.uid, 'active', first.next), db, { clock }); assert.equal(second.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items].map(i => i.id)).size, 50);
});

test('account gates are checked again after the page query; a pending actor receives no body', { skip: !enabled }, async t => {
  const f = await fixture(t, 1), deletion = db.doc(`accountDeletionRequests/${f.uid}`); f.roots.push(deletion);
  let gates = 0;
  const guarded = new Proxy(db, { get(target, key) {
    if (key === 'getAll') return async (...args) => {
      if (++gates === 2) await deletion.set({ status: 'pending' });
      return target.getAll(...args);
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await assert.rejects(page(request(f.uid), guarded, { clock }), { code: 'failed-precondition' });
  assert.equal(gates, 2);
});

test('Business branch identity and counters survive owner paging without a location requirement', { skip: !enabled }, async t => {
  const f = await fixture(t, 1), role = db.doc(`accountRoles/${f.uid}`); f.roots.push(role);
  await role.set({ role: 'business', level: 2 });
  await f.refs[0].update({ authorNickname: 'Branch name', businessLocationId: 'branch', businessAuthorFormat: 'branch',
    location: new GeoPoint(50.08, 14.44), likesCount: 2, commentsCount: 3, savesCount: 4 });
  const without = (await page(request(f.uid), db, { clock })).items[0];
  assert.equal(without.data.authorNickname, 'Branch name'); assert.equal(without.data.businessLocationId, 'branch');
  assert.equal(without.distanceKm, 0); assert.equal(without.data.commentsCount, 3);
  const located = request(f.uid); located.data.point = { latitude: 50.09, longitude: 14.44 };
  const distance = (await page(located, db, { clock })).items[0].distanceKm;
  assert(distance > 1 && distance < 1.2);
});
