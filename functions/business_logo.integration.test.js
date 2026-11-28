import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { log } from 'node:console';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { updateBusinessLogoOperation as update, cleanupBusinessLogoOperation as clean, cleanupBusinessLogoBatch } from './business_logo.js';
import { logoDigest } from './business_logo_storage.js';
import { operationTestKey } from './test_helpers.js';
import { receiptMayBePurged } from './cleanup_operation_receipts.js';
import { accountPurgeStages } from './account_purge_policy.js';
import { planBusinessLogoOrphans, cleanupBusinessLogoOrphans } from './business_logo_orphans.js';
import { createBusinessLogoRuntime } from './business_logo_runtime.js';
import { runBusinessLogoMaintenance } from './business_logo_cleanup_adapter.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'business-logo-local') : null, db = app ? getFirestore(app) : null;
after(async () => { if (db) { await db.terminate(); await deleteApp(app); } });
const bytes = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#118877' } }).png().toBuffer();
async function fixture(t) {
  const uid = randomUUID(), now = new Date(), user = db.doc(`users/${uid}`), profile = db.doc(`publicProfiles/${uid}`), state = db.doc(`businessProfiles/${uid}/logoState/current`);
  await user.set({ nickname: 'Synthetic logo owner' }); await profile.set({ nickname: 'Synthetic logo owner' });
  await db.doc(`accountRoles/${uid}`).set({ role: 'business', level: 2 }); await db.doc(`businessProfiles/${uid}`).set({ status: 'active' });
  await user.collection('legal').doc('acceptance_2026_07_25').set({});
  const files = new Map(); let serial = 0, peak = 0, afterPut = null, failRemove = false, puts = 0;
  const storage = {
    files, get peak() { return peak; }, get puts() { return puts; }, set afterPut(v) { afterPut = v; }, set failRemove(v) { failRemove = v; },
    async inspect(owner, path) { assert.equal(owner, uid); return files.get(path) ?? null; },
    async put(owner, path, data, guard) { assert.equal(owner, uid); await guard(); const digest = logoDigest(data);
      if (files.has(path)) assert.equal(files.get(path).digest, digest); else { puts++; files.set(path, { generation: String(++serial), digest }); }
      peak = Math.max(peak, files.size); if (afterPut) await afterPut(); await guard(); return files.get(path); },
    async remove(owner, path, generation, guard) { assert.equal(owner, uid); await guard(); if (failRemove) throw Error('storage-unavailable');
      if (files.has(path)) assert.equal(files.get(path).generation, generation); files.delete(path); },
  };
  const request = (key = 'upload', mode = 'replace', avatar) => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' },
    data: { expectedUserId: uid, idempotencyKey: operationTestKey(key, now), mode, ...(mode === 'replace' ? { pngBase64: bytes.toString('base64') } : {}), ...(avatar ? { avatar } : {}) } });
  t.after(async () => { for (const c of ['users', 'publicProfiles', 'accountRoles', 'businessProfiles', 'bans', 'accountDeletionRequests']) await db.recursiveDelete(db.doc(`${c}/${uid}`));
    for (const r of (await db.collection('serverOperations').where('userId', '==', uid).get()).docs) await r.ref.delete(); });
  return { uid, now, user, profile, state, storage, request, options: { enabled: true, clock: () => now } };
}
test('publish, identical concurrent retries and subsequent replacement keep at most two objects and original seven-day receipts', { skip: !enabled }, async t => {
  const f = await fixture(t), req = f.request();
  const results = await Promise.all([update(req, db, f.storage, f.options), update(req, db, f.storage, f.options)]);
  assert.deepEqual(results[0], results[1]); assert.equal(f.storage.puts, 1); assert.equal(f.storage.files.size, 1);
  const first = results[0].path, profileTime = (await f.profile.get()).updateTime;
  await update(req, db, f.storage, f.options); assert(profileTime.isEqual((await f.profile.get()).updateTime));
  const second = await update(f.request('second'), db, f.storage, f.options); assert.notEqual(first, second.path);
  assert.equal(f.storage.files.size, 1); assert.equal(f.storage.peak, 2); assert.equal((await f.user.get()).get('businessLogoPath'), second.path);
  const receipts = await db.collection('serverOperations').where('userId', '==', f.uid).get(); assert.equal(receipts.size, 2);
  for (const r of receipts.docs) assert(receiptMayBePurged(r.data(), Timestamp.fromMillis(f.now.getTime() + 7 * 86400000)));
});
test('another payload cannot supersede an uncertain pending upload; restart resumes the same immutable object', { skip: !enabled }, async t => {
  const f = await fixture(t); f.storage.afterPut = async () => { throw Error('lost-storage-reply'); };
  await assert.rejects(update(f.request(), db, f.storage, f.options), /lost-storage-reply/); assert.equal(f.storage.files.size, 1); assert.equal((await f.user.get()).get('businessLogoPath'), undefined);
  await assert.rejects(update(f.request('other'), db, f.storage, f.options), e => e.code === 'already-exists');
  f.storage.afterPut = null; await update(f.request(), db, f.storage, f.options); assert.equal(f.storage.puts, 1); assert.equal((await f.state.get()).get('pending'), null);
});

test('lost acknowledgement after the Firestore commit replays the receipt without uploading or rolling back', { skip: !enabled }, async t => {
  const f = await fixture(t); let lose = true;
  const brokenReply = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async fn => {
      let published = false;
      const result = await target.runTransaction(tx => fn(new Proxy(tx, { get(real, method) {
        if (method === 'update') return (ref, data) => { if (ref.parent.id === 'serverOperations' && data.result?.status === 'complete') published = true; return real.update(ref, data); };
        return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
      } })));
      if (published && lose) { lose = false; throw Error('lost-commit-reply'); } return result;
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  await assert.rejects(update(f.request(), brokenReply, f.storage, f.options), /lost-commit-reply/);
  const current = (await f.user.get()).get('businessLogoPath'); assert(f.storage.files.has(current));
  const result = await update(f.request(), db, f.storage, f.options); assert.equal(result.path, current); assert.equal(f.storage.puts, 1);
});
test('cleanup failure keeps the new published logo and prevents a third object; retry drains the retired generation', { skip: !enabled }, async t => {
  const f = await fixture(t); await update(f.request(), db, f.storage, f.options); f.storage.failRemove = true;
  await assert.rejects(update(f.request('two'), db, f.storage, f.options), /storage-unavailable/);
  const current = (await f.user.get()).get('businessLogoPath'); assert(f.storage.files.has(current)); assert.equal(f.storage.files.size, 2);
  await assert.rejects(update(f.request('three'), db, f.storage, f.options), /storage-unavailable/); assert.equal(f.storage.peak, 2);
  f.storage.failRemove = false; await clean(db, f.storage, f.uid, f.options); assert.equal(f.storage.files.size, 1); assert(f.storage.files.has(current));
});
test('ban and account deletion during Storage I/O prevent publication; cleanup only removes the unpublished object', { skip: !enabled }, async t => {
  for (const kind of ['ban', 'deletion']) {
    const f = await fixture(t); f.storage.afterPut = async () => { await db.doc(`${kind === 'ban' ? 'bans' : 'accountDeletionRequests'}/${f.uid}`).set(kind === 'ban' ? { expiresAt: null } : { status: 'pending' }); };
    await assert.rejects(update(f.request(), db, f.storage, f.options)); assert.equal((await f.user.get()).get('businessLogoPath'), undefined);
    await clean(db, f.storage, f.uid, { ...f.options, clock: () => new Date(f.now.getTime() + 7 * 86400000) }); assert.equal(f.storage.files.size, 0);
  }
});
test('built-in avatar switch atomically removes both logo references and preserves other profile fields', { skip: !enabled }, async t => {
  const f = await fixture(t); await update(f.request(), db, f.storage, f.options);
  const avatar = { avatarId: 'fox', avatarBackgroundStart: 'teal', avatarBackgroundEnd: 'navy', avatarGradientDirection: 'horizontal' };
  await update(f.request('avatar', 'remove', avatar), db, f.storage, f.options);
  for (const ref of [f.user, f.profile]) { const d = await ref.get(); assert.equal(d.get('businessLogoPath'), undefined); assert.equal(d.get('avatarId'), 'fox'); assert.equal(d.get('nickname'), 'Synthetic logo owner'); }
  assert.equal(f.storage.files.size, 0);
});

test('retiring an unfinished account incarnation cannot resurrect an old request after cleanup', { skip: !enabled }, async t => {
  const f = await fixture(t); f.storage.afterPut = async () => { throw Error('lost-reply'); };
  await assert.rejects(update(f.request(), db, f.storage, f.options));
  await f.user.delete(); await f.user.set({ nickname: 'Replacement incarnation' });
  await clean(db, f.storage, f.uid, f.options); assert.equal(f.storage.files.size, 0);
  f.storage.afterPut = null; await assert.rejects(update(f.request(), db, f.storage, f.options), e => e.code === 'already-exists');
  assert.equal(f.storage.puts, 1);
});

test('published files present at account deletion keep the original account retention and purge ownership', { skip: !enabled }, async t => {
  const f = await fixture(t); await update(f.request(), db, f.storage, f.options); f.storage.failRemove = true;
  await assert.rejects(update(f.request('replacement'), db, f.storage, f.options)); f.storage.failRemove = false;
  await db.doc(`accountDeletionRequests/${f.uid}`).set({ userId: f.uid, status: 'pending' });
  assert.deepEqual(await clean(db, f.storage, f.uid, f.options), { status: 'account-purge' }); assert.equal(f.storage.files.size, 2);
  assert.equal((await f.state.get()).get('pending.phase'), 'published');
  assert.equal((await f.state.get()).get('cleanupAt'), undefined);
});
test('current-object or changed-generation cleanup fails closed; account purge already covers private state, receipts and original logo paths', { skip: !enabled }, async t => {
  const f = await fixture(t); await update(f.request(), db, f.storage, f.options); f.storage.failRemove = true;
  await assert.rejects(update(f.request('two'), db, f.storage, f.options)); f.storage.failRemove = false;
  const p = (await f.state.get()).get('pending'); f.storage.files.get(p.oldPath).generation = '999';
  await assert.rejects(clean(db, f.storage, f.uid, f.options), e => e.code === 'failed-precondition');
  await f.state.update({ 'pending.oldPath': (await f.user.get()).get('businessLogoPath') });
  await assert.rejects(clean(db, f.storage, f.uid, f.options), e => e.code === 'failed-precondition');
  const stages = accountPurgeStages(f.uid); assert(stages.some(s => s.direct === `businessProfiles/${f.uid}`));
  assert(stages.some(s => s.prefix === `businessLogos/${f.uid}/`)); assert(stages.some(s => s.collection === 'serverOperations' || s.query?.collection === 'serverOperations'));
});

test('Auth/App Check, foreign accounts, role loss and expired original receipts cannot publish or restore a logo', { skip: !enabled }, async t => {
  const f = await fixture(t);
  for (const req of [{ ...f.request(), auth: null }, { ...f.request(), app: null },
    { ...f.request(), data: { ...f.request().data, expectedUserId: 'foreign' } }]) await assert.rejects(update(req, db, f.storage, f.options));
  await db.doc(`accountRoles/${f.uid}`).update({ level: 1 }); await assert.rejects(update(f.request(), db, f.storage, f.options));
  await db.doc(`accountRoles/${f.uid}`).update({ level: 2 }); await update(f.request(), db, f.storage, f.options);
  const before = f.storage.puts; await assert.rejects(update(f.request(), db, f.storage, { ...f.options, clock: () => new Date(f.now.getTime() + 7 * 86400000) }));
  assert.equal(f.storage.puts, before);
});

test('bounded orphan plan protects current/pending logos, rejects changed plans and stops at account deletion', { skip: !enabled }, async t => {
  const f = await fixture(t); await update(f.request(), db, f.storage, f.options);
  const current = (await f.user.get()).get('businessLogoPath'), oldPath = `businessLogos/${f.uid}/logo-1.png`;
  f.storage.files.set(oldPath, { generation: '100', digest: 'legacy' });
  f.storage.list = async () => ({ rows: [...f.storage.files].map(([path, d]) => ({ path, generation: d.generation })), pageToken: null });
  const plan = await planBusinessLogoOrphans(db, f.storage, f.uid, { enabled: true }); assert.equal(plan.rows.length, 1); assert.equal(plan.rows[0].path, oldPath);
  await assert.rejects(cleanupBusinessLogoOrphans(db, f.storage, plan, 'wrong', { enabled: true }));
  await cleanupBusinessLogoOrphans(db, f.storage, plan, plan.digest, { enabled: true }); assert(f.storage.files.has(current)); assert.equal(f.storage.files.size, 1);
  await f.user.update({ nickname: 'Changed during review' }); await assert.rejects(cleanupBusinessLogoOrphans(db, f.storage, plan, plan.digest, { enabled: true }));
  await db.doc(`accountDeletionRequests/${f.uid}`).set({ status: 'pending' }); await assert.rejects(planBusinessLogoOrphans(db, f.storage, f.uid, { enabled: true }));
});

test('inactive maintenance discovers expired work in bounded pages and continues after a malformed row', { skip: !enabled }, async t => {
  assert.deepEqual(await cleanupBusinessLogoBatch(null, null), { status: 'disabled' });
  const f = await fixture(t); f.storage.afterPut = async () => { throw Error('abandoned'); };
  await assert.rejects(update(f.request(), db, f.storage, f.options));
  const late = () => new Date(f.now.getTime() + 7 * 86400000), at = Timestamp.fromDate(late());
  const broken = db.doc(`businessProfiles/a-${f.uid}/logoState/current`); await broken.set({ cleanupAt: at, pending: { phase: 'broken' } });
  t.after(() => db.recursiveDelete(db.doc(`businessProfiles/a-${f.uid}`)));
  let cursor = null, examined = 0, cleaned = 0, reviews = 0;
  for (let n = 0; n < 4; n++) {
    const page = await cleanupBusinessLogoBatch(db, f.storage, { enabled: true, clock: late, limit: 1, after: cursor });
    examined += page.examined; cleaned += page.cleaned; reviews += page.needsReview.length; cursor = page.after;
    if (!cursor) break;
  }
  assert.equal(examined, 2); assert.equal(cleaned, 1); assert.equal(reviews, 1); assert.equal(f.storage.files.size, 0);
});

test('measure actual SDK document operations for first publish, retry, replacement and avatar removal', { skip: !enabled }, async t => {
  const f = await fixture(t), stats = { reads: 0, writes: 0, attempts: 0 }, result = {};
  const measured = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return fn => target.runTransaction(async tx => {
      stats.attempts++;
      const tracked = new Proxy(tx, { get(real, method) {
        if (['get', 'getAll'].includes(method)) return async (...args) => { const value = await real[method](...args); stats.reads += Array.isArray(value) ? value.length : 1; return value; };
        if (['set', 'create', 'update', 'delete'].includes(method)) return (...args) => { stats.writes++; real[method](...args); return tracked; };
        return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
      } }); return fn(tracked);
    });
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  for (const [label, request] of [['first', f.request()], ['retry', f.request()], ['replacement', f.request('new')], ['remove', f.request('remove', 'remove')]]) {
    const before = f.storage.puts;
    await update(request, measured, f.storage, f.options);
    result[label] = { ...stats, storageObjectsWritten: f.storage.puts - before };
    for (const k of Object.keys(stats)) stats[k] = 0;
  }
  assert.equal(result.retry.writes, 0); assert.equal(result.retry.storageObjectsWritten, 0);
  assert.equal(f.storage.peak, 2);
  log('BUSINESS_LOGO_MEASURE ' + JSON.stringify({ ...result, pngBytes: bytes.length, requestJsonBytes: Buffer.byteLength(JSON.stringify(f.request().data)), peakObjects: f.storage.peak,
    scope: 'SDK document attempts and injected Storage writes; excludes GCS operations, index billing, wire encoding and cloud latency' }));
});


test('ten new uploads per rolling hour across devices; invalid image retries are terminal and removals remain available', { skip: !enabled }, async t => {
  const f = await fixture(t), bad = n => ({ ...f.request(`bad-${n}`), data: { ...f.request(`bad-${n}`).data, pngBase64: 'AQID' } });
  const failures = await Promise.allSettled(Array.from({ length: 10 }, (_, n) => update(bad(n), db, f.storage, f.options)));
  assert(failures.every(r => r.status === 'rejected' && r.reason.code === 'invalid-argument'));
  const quota = db.doc(`businessProfiles/${f.uid}/logoState/quota`);
  assert.equal((await quota.get()).get('attempts').length, 10);
  await assert.rejects(update(bad(0), db, f.storage, f.options), e => e.code === 'invalid-argument' && e.message === 'logo-image-rejected');
  await assert.rejects(update(f.request('eleven'), db, f.storage, f.options), e => e.code === 'resource-exhausted');
  assert.equal(f.storage.puts, 0);
  await update(f.request('remove', 'remove'), db, f.storage, f.options);
  assert.equal((await quota.get()).get('attempts').length, 10);
  await update(f.request('after-hour'), db, f.storage, { ...f.options, clock: () => new Date(f.now.getTime() + 3600000) });
  assert.equal((await quota.get()).get('attempts').length, 1);
});

test('runtime defaults off, validates control, fences a pause during upload and safely resumes the original request', { skip: !enabled }, async t => {
  assert.deepEqual(await runBusinessLogoMaintenance(null, () => { throw Error('must not create storage'); }), { status: 'disabled', examined: 0 });
  await assert.rejects(createBusinessLogoRuntime(null, null).update({}), e => e.code === 'failed-precondition');
  const f = await fixture(t), ref = db.doc('businessLogoMaintenance/current');
  t.after(() => ref.delete());
  const runtime = createBusinessLogoRuntime(db, f.storage, f.options);
  await assert.rejects(runtime.update(f.request()), e => e.code === 'failed-precondition');
  await ref.set({ schemaVersion: 1, mode: 'active', revision: 1 });
  f.storage.afterPut = async () => ref.update({ mode: 'paused', revision: 2 });
  await assert.rejects(runtime.update(f.request()), e => e.code === 'failed-precondition');
  assert.equal((await f.user.get()).get('businessLogoPath'), undefined);
  assert.equal((await runtime.maintenance()).status, 'idle');
  f.storage.afterPut = null; await ref.update({ mode: 'active', revision: 3 });
  await runtime.update(f.request()); assert.equal(f.storage.puts, 1);
  const before = (await ref.get()).updateTime;
  const empty = await runtime.maintenance(); assert.equal(empty.examined, 0);
  assert(before.isEqual((await ref.get()).updateTime));
});

test('worker checkpoint survives restart, excludes a concurrent lease and retains review after malformed work', { skip: !enabled }, async t => {
  const f = await fixture(t), ref = db.doc('businessLogoMaintenance/current');
  t.after(() => ref.delete());
  const badRoot = db.doc(`businessProfiles/a-${f.uid}`), bad = badRoot.collection('logoState').doc('current');
  t.after(() => db.recursiveDelete(badRoot));
  f.storage.afterPut = async () => { throw Error('storage reply lost'); };
  await assert.rejects(update(f.request(), db, f.storage, f.options));
  const late = () => new Date(f.now.getTime() + 7 * 86400000);
  await bad.set({ cleanupAt: Timestamp.fromDate(late()), pending: { phase: 'broken' } });
  await ref.set({ schemaVersion: 1, mode: 'active', revision: 1 });
  // Permit exactly one row, then expire the between-transaction soft budget.
  let tick = 0;
  const limited = createBusinessLogoRuntime(db, f.storage, { enabled: true, clock: late, monotonic: () => tick++ < 2 ? 0 : 5001 });
  const first = await limited.maintenance(); assert.equal(first.examined, 1); assert.equal(first.needsContinuation, true);
  assert((await ref.get()).get('after'));
  await ref.update({ owner: 'another', leaseUntil: Timestamp.fromMillis(late().getTime() + 120000) });
  assert.equal((await createBusinessLogoRuntime(db, f.storage, { enabled: true, clock: late }).maintenance()).status, 'idle');
  await ref.update({ leaseUntil: Timestamp.fromMillis(0) });
  const resumed = await createBusinessLogoRuntime(db, f.storage, { enabled: true, clock: late }).maintenance();
  assert.equal(resumed.status, 'checked'); assert.equal(f.storage.files.size, 0);
  assert.equal((await ref.get()).get('after'), null); assert.equal((await ref.get()).get('needsReview'), true);
});


test('lease loss during cleanup cannot delete an object or advance the old checkpoint', { skip: !enabled }, async t => {
  const f = await fixture(t), ref = db.doc('businessLogoMaintenance/current'); t.after(() => ref.delete());
  f.storage.afterPut = async () => { throw Error('reply lost'); };
  await assert.rejects(update(f.request(), db, f.storage, f.options));
  const late = () => new Date(f.now.getTime() + 7 * 86400000);
  await ref.set({ schemaVersion: 1, mode: 'active', revision: 1 });
  const inspect = f.storage.inspect;
  f.storage.inspect = async (...args) => { await ref.update({ owner: 'replacement-worker' }); return inspect(...args); };
  await assert.rejects(createBusinessLogoRuntime(db, f.storage, { enabled: true, clock: late }).maintenance(), e => e.code === 'aborted');
  assert.equal(f.storage.files.size, 1); assert.equal((await ref.get()).get('after'), undefined);
  assert.equal((await ref.get()).get('owner'), 'replacement-worker');
});
