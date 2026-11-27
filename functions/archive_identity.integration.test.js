import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { createArchiveIdentityRuntime, observeArchiveIdentity } from './archive_identity.js';
import { getArchiveIdentityPageOperation } from './archive_identity_reader.js';
import { createContentLifecycleDatabase, lifecycleDay } from './content_lifecycle.js';
import { validatePurgeSelection, accountPurgeStages } from './account_purge_policy.js';
import { finalizeAccountDeletionOperation } from './finalize_account_deletion.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
async function fixture(t) {
  const db = new Firestore({ projectId: 'shoutout-rules-test' }), suffix = randomUUID().replaceAll('-', ''), refs = [];
  const uid = 'identity_' + suffix, admin = 'admin_' + suffix;
  let time = Date.now() + 5000;
  const clock = () => new Date(time), runtime = createArchiveIdentityRuntime(db, { enabled: true, key: Buffer.alloc(32, 9), clock });
  const track = ref => { refs.push(ref); return ref; };
  const request = who => ({ auth: { uid: who, token: { email: `${who}@example.cz`, email_verified: true, auth_time: Math.floor(time / 1000) } }, app: { appId: 'synthetic' } });
  for (const who of [uid, admin]) {
    await track(db.doc(`users/${who}`)).create({ nickname: who });
    await track(db.doc(`users/${who}/legal/acceptance_2026_07_25`)).set({ accepted: true });
    track(db.doc(`accountDeletionRequests/${who}`)); track(db.doc(`publicProfiles/${who}`)); track(db.doc(`archiveIdentityCurrent/${who}`));
  }
  const role = track(db.doc(`accountRoles/${admin}`)); await role.set({ level: 5 });
  const birth = time - 100000;
  time = Math.max(time, Date.now() + 5000);
  const auth = { async getUser(who) { return { uid: who, email: `${who}@example.cz`, emailVerified: true,
    metadata: { creationTime: new Date(birth).toISOString() } }; } };
  const observe = (who = uid, authSource = auth) => observeArchiveIdentity(request(who), runtime, authSource);
  const page = data => getArchiveIdentityPageOperation({ ...request(admin), data: { expectedUserId: admin, requestId: randomUUID(), caseReference: 'synthetic-case', ...data } }, runtime);
  t.after(async () => {
    for (const c of ['archiveIdentityBindings', 'archiveIdentityAccounts']) for (const who of [uid, admin]) {
      for (const doc of (await db.collection(c).where('userId', '==', who).get()).docs) await db.recursiveDelete(doc.ref);
    }
    await db.recursiveDelete(db.doc(`archiveIdentityAccess/${admin}`));
    for (const ref of refs) await db.recursiveDelete(ref);
    await db.terminate();
  });
  return { db, uid, admin, request, runtime, role, observe, page, clock, track, birth, auth, setTime: value => { time = value; } };
}

test('verified email and phone observations are sparse, idempotent, historical and incarnation scoped', { skip: !enabled }, async t => {
  const f = await fixture(t), first = await f.observe();
  assert(first.changed); assert.deepEqual(await f.observe(), { accountKey: first.accountKey, changed: false });
  let result = await f.page({ action: 'lookup', type: 'email', value: `${f.uid.toUpperCase()}@EXAMPLE.CZ` });
  assert.equal(result.items.length, 1); assert.equal(result.items[0].accountKey, first.accountKey);
  const phoneAuth = { async getUser() { return { uid: f.uid, email: `${f.uid}@example.cz`, emailVerified: true,
    phoneNumber: '+420123456789', metadata: { creationTime: new Date(f.birth).toISOString() } }; } };
  await f.observe(f.uid, phoneAuth);
  assert.equal((await f.page({ action: 'lookup', type: 'phone', value: '+420123456789' })).items[0].userId, f.uid);
  const a = await f.db.doc(`archiveIdentityAccounts/${first.accountKey}`).get();
  assert(!JSON.stringify(a.data()).includes('@'));
});

for (const level of [1, 2, 3, 4, 5, 6]) test(`archive lookup enforces current level ${level}`, { skip: !enabled }, async t => {
  const f = await fixture(t); await f.observe(); await f.role.set({ level });
  const run = () => f.page({ action: 'lookup', type: 'email', value: `${f.uid}@example.cz` });
  if (level < 5) await assert.rejects(run(), e => e.code === 'permission-denied'); else assert.equal((await run()).items.length, 1);
});

test('forged email, unverified Auth, old token and deletion cannot create identity bindings', { skip: !enabled }, async t => {
  const f = await fixture(t);
  for (const bad of [{ emailVerified: false }, { email: 'foreign@example.cz' }, { metadata: { creationTime: f.clock().toISOString() }, disabled: true }]) {
    await assert.rejects(f.observe(f.uid, { async getUser() { return { uid: f.uid, email: `${f.uid}@example.cz`, emailVerified: true,
      metadata: { creationTime: new Date(f.birth).toISOString() }, ...bad }; } }));
  }
  await f.db.doc(`accountDeletionRequests/${f.uid}`).set({ userId: f.uid, status: 'pending' });
  await assert.rejects(f.observe(), /deletion is pending/);
  assert((await f.db.collection('archiveIdentityAccounts').where('userId', '==', f.uid).get()).empty);
});

test('retention remains original request birth plus 60 days and audits cannot bypass role revocation', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.observe();
  const data = { action: 'lookup', type: 'email', value: `${f.uid}@example.cz`, requestId: randomUUID() };
  await f.page(data); await f.page(data);
  assert.equal((await f.db.collection(`archiveIdentityAccess/${f.admin}/accessAudits`).get()).size, 1);
  await f.role.set({ level: 4 }); await assert.rejects(f.page(data), e => e.code === 'permission-denied'); await f.role.set({ level: 5 });
  const deletion = f.db.doc(`accountDeletionRequests/${f.uid}`); await deletion.set({ userId: f.uid, status: 'pending' });
  const born = (await deletion.get()).createTime.toMillis();
  f.setTime(born + 60 * lifecycleDay - 1); assert.equal((await f.page(data)).items.length, 1);
  f.setTime(born + 60 * lifecycleDay); assert.equal((await f.page(data)).items.length, 0);
});

test('archived author binding, metadata-only pages and detail survive source deletion; private replies stay private', { skip: !enabled }, async t => {
  const f = await fixture(t), identity = await f.observe();
  const control = f.track(f.db.doc('contentLifecycleControl/current')); await control.set({ schemaVersion: 1, revision: 1, mode: 'active' });
  const db = createContentLifecycleDatabase(f.db, { enabled: true, identityRuntime: f.runtime, clock: f.clock });
  const root = f.track(f.db.doc(`shouts/${f.uid}`)), header = f.track(f.db.doc(`contentLifecycleThreads/${f.uid}`));
  await db.runTransaction(tx => tx.create(root, { authorId: f.uid, title: 'Not in metadata', text: 'Synthetic text',
    createdAt: Timestamp.fromDate(f.clock()), expiresAt: Timestamp.fromMillis(f.clock().getTime() + lifecycleDay), status: 'active' }));
  const saved = await root.get(), archive = f.track(f.db.doc(`contentLifecycleArchive/${saved.get('contentArchiveKey')}`));
  assert.equal((await archive.get()).get('authorAccountKey'), identity.accountKey);
  await root.delete();
  const page = await f.page({ action: 'shouts', accountKey: identity.accountKey });
  assert.equal(page.items.length, 1); assert(!JSON.stringify(page).includes('Synthetic text')); assert(!JSON.stringify(page).includes('Not in metadata'));
  const detail = await f.page({ action: 'detail', accountKey: identity.accountKey, archiveKey: archive.id });
  assert.equal(detail.items[0].content.text, 'Synthetic text');
  // Same storage and author still do not grant general private browsing.
  const privateRef = f.track(f.db.doc('contentLifecycleArchive/' + 'f'.repeat(64)));
  await privateRef.set({ kind: 'privateReply', authorAccountKey: identity.accountKey });
  await assert.rejects(f.page({ action: 'detail', accountKey: identity.accountKey, archiveKey: privateRef.id }), e => e.code === 'not-found');
  assert((await header.get()).exists);
});

test('purge selects only matching identity references and preserves existing stage positions', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.observe(); await f.page({ action: 'lookup', type: 'email', value: `${f.uid}@example.cz` });
  const stages = accountPurgeStages(f.uid, { archiveIdentityEnabled: true });
  const stage = stages.find(s => s.field === 'subjectUserIds' && s.collection === 'accessAudits');
  const doc = (await f.db.collectionGroup('accessAudits').where('subjectUserIds', 'array-contains', f.uid).get()).docs.find(d => d.ref.path.startsWith('archiveIdentityAccess/'));
  assert(validatePurgeSelection(doc, stage, f.uid)); assert(!validatePurgeSelection(doc, stage, 'foreign'));
});

test('more than 50 contact incarnations page by signed cursor; changed selection and oversized input fail', { skip: !enabled }, async t => {
  const f = await fixture(t), codec = f.runtime.codec, contactKey = codec.contact('email', `${f.uid}@example.cz`);
  const batch = f.db.batch(), now = Timestamp.fromDate(f.clock());
  for (let n = 0; n < 53; n++) {
    const userId = `${f.uid}_${n}`, born = f.birth - n, accountKey = codec.account(userId, born, now);
    const account = f.track(f.db.doc(`archiveIdentityAccounts/${accountKey}`));
    const binding = f.track(f.db.doc(`archiveIdentityBindings/${codec.digest('binding', contactKey, accountKey)}`));
    batch.create(account, { schemaVersion: 1, keyVersion: 'v1', userId, authCreatedAtMillis: born, profileCreateTime: now, observedAt: now });
    batch.create(binding, { schemaVersion: 1, keyVersion: 'v1', type: 'email', proof: 'admin-auth-verified-email', userId, accountKey, contactKey, observedAt: now });
  }
  await batch.commit();
  const query = { action: 'lookup', type: 'email', value: `${f.uid}@example.cz` }, first = await f.page(query);
  assert.equal(first.items.length, 50); assert(first.next);
  const last = await f.page({ ...query, cursor: first.next }); assert.equal(last.items.length, 3); assert.equal(last.next, null);
  assert.equal(new Set([...first.items, ...last.items].map(item => item.accountKey)).size, 53);
  for (const data of [{ ...query, value: 'other@example.cz', cursor: first.next }, { ...query, cursor: { ...first.next, id: '0'.repeat(64) } },
    { ...query, value: 'a'.repeat(321) }, { ...query, limit: 500 }]) await assert.rejects(f.page(data), e => e.code === 'invalid-argument');
});

test('a delayed Auth observation cannot resurrect a deleted profile and concurrent observation writes converge', { skip: !enabled }, async t => {
  const f = await fixture(t), results = await Promise.all([f.observe(), f.observe(), f.observe()]);
  assert(results.every(item => item.accountKey === results[0].accountKey));
  assert.equal((await f.db.collection('archiveIdentityBindings').where('userId', '==', f.uid).get()).size, 1);
  const profile = f.db.doc(`users/${f.uid}`);
  await assert.rejects(f.observe(f.uid, { async getUser() {
    await profile.delete();
    return { uid: f.uid, email: `${f.uid}@example.cz`, emailVerified: true, metadata: { creationTime: new Date(f.birth).toISOString() } };
  } }), /profile is incomplete/);
});

test('finalization binds the exact first server commit; removed/replaced requests never renew identity retention', { skip: !enabled }, async t => {
  const f = await fixture(t), identity = await f.observe(), request = { ...f.request(f.uid), data: { expectedUserId: f.uid } };
  const run = () => finalizeAccountDeletionOperation(request, f.db, f.clock, { identityRuntime: f.runtime });
  await run(); await run();
  const ref = f.db.doc(`accountDeletionRequests/${f.uid}`), birth = (await ref.get()).createTime;
  assert((await f.db.doc(`archiveIdentityAccounts/${identity.accountKey}`).get()).get('deletionRequestCreateTime').isEqual(birth));
  await ref.delete(); await assert.rejects(f.observe(), /identity is closed/);
  f.setTime(birth.toMillis() + 60 * lifecycleDay - 1);
  assert.equal((await f.page({ action: 'lookup', type: 'email', value: `${f.uid}@example.cz` })).items.length, 1);
  f.setTime(birth.toMillis() + 60 * lifecycleDay);
  assert.equal((await f.page({ action: 'lookup', type: 'email', value: `${f.uid}@example.cz` })).items.length, 0);
});

test('measured cold/warm observation and exact lookup avoid repeated writes and full scans', { skip: !enabled }, async t => {
  const f = await fixture(t), counts = { reads: 0, writes: 0, auth: 0 };
  const db = new Proxy(f.db, { get(target, key) {
    if (key === 'runTransaction') return work => target.runTransaction(async tx => {
      const measured = new Proxy(tx, { get(t, method) {
        if (['get', 'getAll'].includes(method)) return async (...args) => {
          const result = await t[method](...args);
          counts.reads += method === 'getAll' ? args.length : typeof result.size === 'number' ? Math.max(1, result.size) : 1;
          return result;
        };
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => { counts.writes++; t[method](...args); return measured; };
        return typeof t[method] === 'function' ? t[method].bind(t) : t[method];
      } });
      return work(measured);
    });
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  const runtime = { ...f.runtime, db }, auth = { async getUser(uid) { counts.auth++; return f.auth.getUser(uid); } };
  await observeArchiveIdentity(f.request(f.uid), runtime, auth);
  const cold = { ...counts }; Object.keys(counts).forEach(k => { counts[k] = 0; });
  await observeArchiveIdentity(f.request(f.uid), runtime, auth);
  const warm = { ...counts }; Object.keys(counts).forEach(k => { counts[k] = 0; });
  await getArchiveIdentityPageOperation({ ...f.request(f.admin), data: { action: 'lookup', expectedUserId: f.admin, requestId: randomUUID(),
    type: 'email', value: `${f.uid}@example.cz`, caseReference: 'synthetic-case' } }, runtime);
  assert.deepEqual(cold, { reads: 8, writes: 3, auth: 1 });
  assert.deepEqual(warm, { reads: 7, writes: 0, auth: 1 });
  assert.deepEqual(counts, { reads: 12, writes: 1, auth: 0 });
  log('ARCHIVE_IDENTITY_OPERATIONS ' + JSON.stringify({ cold, warm, lookup: counts }));
});

test('profile reincarnation separates even an equal Auth birth; a pre-recreation proof cannot attach', { skip: !enabled }, async t => {
  const f = await fixture(t), old = await f.observe(), profile = f.db.doc(`users/${f.uid}`);
  f.setTime(Date.now());
  await assert.rejects(f.observe(f.uid, { async getUser(uid) {
    await profile.delete(); await profile.create({ nickname: 'Synthetic replacement' });
    return f.auth.getUser(uid);
  } }), /observation is stale/);
  f.setTime(Date.now() + 5000);
  const next = await f.observe(); assert.notEqual(next.accountKey, old.accountKey);
  const lookup = await f.page({ action: 'lookup', type: 'email', value: `${f.uid}@example.cz` });
  assert.equal(lookup.items.length, 2);
  const control = f.track(f.db.doc('contentLifecycleControl/current')); await control.set({ schemaVersion: 1, revision: 1, mode: 'active' });
  const root = f.track(f.db.doc(`shouts/late_${f.uid}`)), header = f.track(f.db.doc(`contentLifecycleThreads/${root.id}`));
  const stale = createContentLifecycleDatabase(f.db, { enabled: true, clock: f.clock,
    identityRuntime: { ...f.runtime, expectedAuthor: { userId: f.uid, accountKey: old.accountKey } } });
  await assert.rejects(stale.runTransaction(tx => tx.create(root, { authorId: f.uid, text: 'Late request', title: 'Synthetic', status: 'active',
    createdAt: Timestamp.fromDate(f.clock()), expiresAt: Timestamp.fromMillis(f.clock().getTime() + lifecycleDay) })), /observed author incarnation changed/);
  assert(!(await root.get()).exists); assert(!(await header.get()).exists);
});
