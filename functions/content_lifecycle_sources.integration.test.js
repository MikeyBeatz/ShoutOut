import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { createContentLifecycleDatabase, lifecycleDay } from './content_lifecycle.js';
import { getLifecycleSourcePageOperation as page } from './content_lifecycle_sources.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const request = (uid, view, extra = {}) => ({ auth: { uid, token: { email: 'synthetic@example.test', email_verified: true } },
  app: { appId: 'synthetic' }, data: { expectedUserId: uid, view, ...extra } });
async function fixture(t, count = 2) {
  const raw = new Firestore({ projectId: 'shoutout-rules-test' }), uid = `life_${randomUUID()}`, author = `other_${randomUUID()}`;
  const now = Date.now(), clock = () => new Date(now), refs = [], roots = [];
  const db = createContentLifecycleDatabase(raw, { enabled: true, clock });
  const add = async (path, data) => { const ref = raw.doc(path); roots.push(ref); await ref.set(data); return ref; };
  t.after(async () => {
    for (const ref of roots) await raw.recursiveDelete(ref);
    for (const ref of refs) {
      await raw.recursiveDelete(ref); await raw.doc(`contentLifecycleThreads/${ref.id}`).delete();
      for (const archive of (await raw.collection('contentLifecycleArchive').where('threadId', '==', ref.id).get()).docs) await raw.recursiveDelete(archive.ref);
    }
    await raw.terminate();
  });
  await add('contentLifecycleControl/current', { schemaVersion: 1, revision: 1, mode: 'active' });
  await add(`users/${uid}`, { nickname: 'Synthetic' }); await add(`users/${uid}/legal/acceptance_2026_07_25`, {});
  for (let offset = 0; offset < count; offset += 50) await db.runTransaction(tx => {
    for (let n = offset; n < Math.min(count, offset + 50); n++) {
      const ref = raw.doc(`shouts/${uid}_${String(n).padStart(3, '0')}`); refs.push(ref);
      tx.create(ref, { authorId: n % 2 ? author : uid, authorNickname: 'Synthetic', title: `Synthetic ${n}`, text: 'Synthetic source',
        categories: ['Dotaz'], status: 'active', createdAt: Timestamp.fromMillis(now - n), expiresAt: Timestamp.fromMillis(now + lifecycleDay),
        likesCount: 0, dislikesCount: 0, savesCount: 0, commentsCount: 0, businessHighlighted: true,
        location: new GeoPoint(50.53, 14.13), geography: { schemaVersion: 1, countryCode: n % 2 ? 'DE' : 'CZ', subdivisionCode: n % 2 ? 'DE-BE' : 'CZ-42' }, internalSecret: 'never-return' });
    }
  });
  const load = (view, extra = {}, options = {}) => page(request(uid, view, extra), raw, { enabled: true, clock, ...options });
  return { raw, db, uid, author, refs, roots, now, clock, add, load };
}

test('source reader remains disabled and rejects unknown/private views, foreign cursors and authentication failures before source IO', async () => {
  const unreadable = new Proxy({ projectId: 'shoutout-dev-46c81' }, { get(target, key) { if (key === 'projectId') return target[key]; assert.fail('Unexpected IO'); } });
  await assert.rejects(page(request('owner', 'home'), unreadable), { code: 'failed-precondition' });
  for (const extra of [{ view: 'privateReplies' }, { authorId: 'foreign' }, { expectedUserId: 'foreign' }, { after: { v: 1 } },
    { point: { latitude: 91, longitude: 0 } }, { countryCode: 'CZ' }, { arbitraryArchive: 'key' }]) {
    await assert.rejects(page(request('owner', 'home', extra), unreadable, { enabled: true }), { code: 'invalid-argument' });
  }
  const missingApp = request('owner', 'home'); delete missingApp.app;
  await assert.rejects(page(missingApp, unreadable, { enabled: true }), { code: 'unauthenticated' });
});

test('profile/home/business pages authorize their view, allowlist bodies and retain fifty-row scan boundaries', { skip: !enabled }, async t => {
  const f = await fixture(t, 120), first = await f.load('home'), second = await f.load('home', { after: first.next }), third = await f.load('home', { after: second.next });
  assert.deepEqual([first.items.length, second.items.length, third.items.length], [50, 50, 20]); assert.equal(third.next, null);
  assert.deepEqual([...first.items, ...second.items, ...third.items].map(i => i.id), f.refs.map(r => r.id));
  assert(first.items.every(i => i.data.internalSecret === undefined && i.data.contentArchiveKey === undefined && i.data.location === undefined));
  const profile = await f.load('profile', { authorId: f.author }); assert.equal(profile.items.length, 50); assert(profile.items.every(i => i.data.authorId === f.author));
  const business = await f.load('business'); assert.equal(business.items.length, 50); assert(business.items.every(i => i.data.authorId === f.uid));
  for (const input of [{ view: 'profile', authorId: f.author }, { view: 'business' }, { expectedUserId: f.author }]) {
    await assert.rejects(page(request(f.uid, 'home', { after: first.next, ...input }), f.raw, { enabled: true, clock: f.clock }), { code: 'invalid-argument' });
  }
});

test('deleted own promotion stays read-only for seven days; foreign deleted/expired content and deleted authors do not leak', { skip: !enabled }, async t => {
  const f = await fixture(t, 4);
  await f.db.runTransaction(async tx => { await tx.getAll(f.refs[0], f.refs[1]); tx.update(f.refs[0], { status: 'deleted' }); tx.update(f.refs[1], { status: 'deleted' }); });
  const own = await f.load('business'); assert(own.items.some(i => i.id === f.refs[0].id && i.data.readOnlyHistory));
  assert(!(await f.load('profile', { authorId: f.author })).items.some(i => i.id === f.refs[1].id));
  await f.add(`accountDeletionRequests/${f.author}`, { userId: f.author, status: 'pending' });
  assert((await f.load('profile', { authorId: f.author })).items.length === 0);
  await f.raw.doc(`accountDeletionRequests/${f.author}`).delete();
  await f.add(`publicProfiles/${f.author}`, { accountStatus: 'deleted' });
  assert((await f.load('profile', { authorId: f.author })).items.length === 0);
  const history = await f.load('business', {}, { clock: () => new Date(f.now + 7 * lifecycleDay) });
  assert(!history.items.some(i => i.id === f.refs[0].id));
  assert.equal((await f.load('home', {}, { clock: () => new Date(f.now + lifecycleDay) })).items.length, 0);
});

test('missing comment parents produce an empty non-final page, not an error or an unbounded refill', { skip: !enabled }, async t => {
  const f = await fixture(t, 1);
  const batch = f.raw.batch();
  for (let n = 0; n < 50; n++) {
    const root = f.raw.doc(`shouts/missing_${f.uid}_${n}`); f.roots.push(root);
    batch.create(root.collection('comments').doc('same-id'), { authorId: f.uid, text: 'Unavailable parent', createdAt: Timestamp.fromMillis(f.now + 1000 - n) });
  }
  await batch.commit();
  await f.db.runTransaction(tx => tx.create(f.refs[0].collection('comments').doc('valid'), { authorId: f.uid, text: 'Preserved own comment', createdAt: Timestamp.fromMillis(f.now) }));
  const first = await f.load('comments'); assert.equal(first.items.length, 0); assert(first.next);
  const last = await f.load('comments', { after: first.next }); assert.equal(last.items.length, 1); assert.equal(last.items[0].comment.text, 'Preserved own comment');
  assert.equal(last.next, null); assert.equal(last.items[0].comment.authorId, undefined);
  await f.refs[0].collection('comments').doc('valid').delete(); assert.equal((await f.load('comments', { after: first.next })).items.length, 0);
});

test('staff selection checks the current role and explicit region even for empty pages; preview distance does not grant geographic access', { skip: !enabled }, async t => {
  const f = await fixture(t, 4), role = await f.add(`accountRoles/${f.uid}`, { level: 3, moderationScope: { countries: ['CZ'] } });
  const selected = await f.load('staff', { countryCode: 'CZ', point: { latitude: 50.53, longitude: 14.13 } });
  assert.equal(selected.items.length, 2); assert(selected.items.every(i => i.distanceKm === 0));
  await assert.rejects(f.load('staff'), { code: 'permission-denied' });
  await assert.rejects(f.load('staff', { countryCode: 'DE' }), { code: 'permission-denied' });
  await role.update({ level: 2 }); await assert.rejects(f.load('staff', { countryCode: 'CZ', after: selected.next }), { code: 'permission-denied' });
  await role.set({ level: 5 }); assert.equal((await f.load('staff')).items.length, 4);
});

test('the final clock check removes a source that expires while the page is being assembled', { skip: !enabled }, async t => {
  const f = await fixture(t, 1); let calls = 0;
  const result = await f.load('home', {}, { clock: () => new Date(++calls >= 4 ? f.now + lifecycleDay : f.now) });
  assert.equal(result.items.length, 0);
  await f.add(`bans/${f.uid}`, {}); await assert.rejects(f.load('home'), { code: 'permission-denied' });
});

test('a fifty-source page batches dependency reads, reuses actor eligibility and performs no writes', { skip: !enabled }, async t => {
  const f = await fixture(t, 50), counts = { documents: 0, calls: 0 };
  const measured = new Proxy(f.raw, { get(target, key) {
    if (key !== 'runTransaction') return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    return callback => target.runTransaction(tx => callback(new Proxy(tx, { get(transaction, method) {
      if (['get', 'getAll'].includes(method)) return async (...args) => {
        const result = await transaction[method](...args); counts.calls++;
        counts.documents += Array.isArray(result) ? result.length : result.docs ? Math.max(1, result.size) : 1;
        return result;
      };
      if (['create', 'set', 'update', 'delete'].includes(method)) return () => assert.fail('A source list must not mutate');
      return typeof transaction[method] === 'function' ? transaction[method].bind(transaction) : transaction[method];
    } })));
  } });
  const result = await page(request(f.uid, 'home'), measured, { enabled: true, clock: f.clock });
  assert.equal(result.items.length, 50); assert.deepEqual(counts, { documents: 108, calls: 4 });
});

test('non-source collection-group records fail closed without leaking a private path cursor', { skip: !enabled }, async t => {
  const f = await fixture(t, 1);
  await f.add(`unrelated/${f.uid}/comments/not-a-source`, { authorId: f.uid, text: 'Not a Shout comment', createdAt: Timestamp.fromMillis(f.now) });
  await assert.rejects(f.load('comments'), { code: 'data-loss' });
});

test('a bound comment cannot be adopted by a later parent incarnation', { skip: !enabled }, async t => {
  const f = await fixture(t, 1);
  await f.db.runTransaction(tx => tx.create(f.refs[0].collection('comments').doc('older-than-parent'), {
    authorId: f.uid, text: 'Synthetic invalid birth', createdAt: Timestamp.fromMillis(f.now - 1),
  }));
  await assert.rejects(f.load('comments'), { code: 'data-loss' });
});
