// Real SDK operation counts on synthetic metadata projections. Not throughput,
// network wire bytes, billed index-entry reads or an end-to-end cloud benchmark.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createModerationQueueDatabase } from './moderation_queue.js';
import { getModerationCasePageOperation } from './moderation_queue_reader.js';
import { lifecycleTimes } from './content_lifecycle.js';
import { currentLegalPolicy } from './legal_policy.js';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'queue-measurements') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
function meter(database) {
  const stats = { readCalls: 0, reads: 0, emptyQueries: 0, returnedJsonBytes: 0, bodyDocuments: 0, writes: 0, attempts: 0 };
  const record = value => {
    stats.readCalls++;
    const docs = Array.isArray(value) ? value : value.docs ?? [value];
    stats.reads += Math.max(1, docs.length);
    if (!docs.length) stats.emptyQueries++;
    for (const d of docs) if (d.exists) {
      const data = d.data(); stats.returnedJsonBytes += Buffer.byteLength(JSON.stringify(data));
      if (data.content?.text !== undefined || data.text !== undefined) stats.bodyDocuments++;
    }
    return value;
  };
  const measured = new Proxy(database, { get(target, key) {
    if (key === 'runTransaction') return (operation, ...options) => target.runTransaction(async tx => {
      stats.attempts++;
      const tracked = new Proxy(tx, { get(real, method) {
        if (['get', 'getAll'].includes(method)) return async (...args) => record(await real[method](...args));
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => { stats.writes++; real[method](...args); return tracked; };
        return typeof real[method] === 'function' ? real[method].bind(real) : real[method];
      } });
      return operation(tracked);
    }, ...options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  return { measured, stats, reset() { for (const key of Object.keys(stats)) stats[key] = 0; } };
}
test('bounded queue cost for50/200/2000 cases excludes retained bodies from every page', { skip: !enabled }, async t => {
  for (const count of [50, 200, 2000]) {
    const nonce = randomUUID(), uid = 'staff_' + nonce, author = 'author_' + nonce, shoutId = 'shout_' + nonce, now = Timestamp.now();
    const sha = s => createHash('sha256').update(s).digest('hex'), refs = [];
    const cleanup = async () => {
      // These exact synthetic IDs have no unknown descendants. Batch cleanup
      // keeps this correctness probe fast; recursive per-document scans would
      // measure fixture disposal instead of the queue.
      for (let offset = 0; offset < refs.length; offset += 400) {
        const batch = db.batch(); for (const ref of refs.slice(offset, offset + 400)) batch.delete(ref);
        await batch.commit();
      }
      refs.length = 0;
    };
    t.after(cleanup);
    const keep = path => { const ref = db.doc(path); refs.push(ref); return ref; };
    await keep('users/' + uid).set({ nickname: 'Synthetic metadata staff' });
    await keep(`users/${uid}/legal/${currentLegalPolicy().acceptanceDocument}`).set({});
    await keep('accountRoles/' + uid).set({ level: 3, moderationScope: { countries: ['CZ'] } });
    await keep('shouts/' + shoutId).set({ authorId: author, createdAt: now, geohash: 'u3078dx',
      geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' } });
    const expiry = Timestamp.fromMillis(now.toMillis() + 86400000);
    await keep('contentLifecycleThreads/' + shoutId).set({ schemaVersion: 1, shoutId, sourceCreatedAt: now, plannedExpiresAt: expiry, archivedAt: now, ...lifecycleTimes(expiry) });
    await keep('moderationQueueControl/current').set({ schemaVersion: 1, revision: 1, mode: 'building', incarnation: sha(nonce) });
    const m = meter(db), q = createModerationQueueDatabase(m.measured, { enabled: true }), reports = [];
    // Archive fixture storage is outside the measured projection write phase.
    for (let offset = 0; offset < count; offset += 250) {
      const batch = db.batch();
      for (let n = offset; n < Math.min(count, offset + 250); n++) {
        const child = 'child' + n, key = sha(nonce + child), ref = keep('commentReports/reporter_' + shoutId + '_' + child);
        batch.set(keep('contentLifecycleArchive/' + key), { schemaVersion: 1, sourcePath: 'shouts/' + shoutId + '/comments/' + child,
          threadId: shoutId, threadCreatedAt: now, subjectUserIds: [author], content: { text: 'Synthetic body '.repeat(500) } });
        reports.push({ ref, data: { reporterId: 'reporter', shoutId, commentId: child, authorId: author, reason: 'Synthetic reason', status: 'open',
          createdAt: now, contentArchiveKey: key, shoutArchiveKey: key } });
        const caseId = sha('comment\n' + shoutId + '\n' + child);
        keep('moderationCases/' + caseId); keep('moderationCases/' + caseId + '/members/' + ref.id);
      }
      await batch.commit();
    }
    for (let offset = 0; offset < count; offset += 50) await q.runTransaction(tx => {
      for (const r of reports.slice(offset, offset + 50)) tx.create(r.ref, r.data);
    });
    const projection = { ...m.stats };
    assert.equal(projection.writes, count * 3);
    await db.doc('moderationQueueControl/current').update({ mode: 'active' }); m.reset();
    const request = cursor => ({ auth: { uid, token: { email: 'fixture@example.test', email_verified: true } }, app: { appId: 'fixture' },
      data: { expectedUserId: uid, category: 'comment', order: 'mostReported', area: { kind: 'all', value: '' }, ...(cursor ? { cursor } : {}) } });
    let cursor = null, seen = 0, requests = 0, responseJsonBytes = 0; const ids = new Set();
    do {
      const page = await getModerationCasePageOperation(request(cursor), m.measured, () => now.toDate());
      requests++; assert(page.items.length <= 50); seen += page.items.length;
      responseJsonBytes += Buffer.byteLength(JSON.stringify(page));
      for (const row of page.items) ids.add(row.caseId);
      cursor = page.cursor;
    } while (cursor);
    assert.equal(seen, count); assert.equal(ids.size, count); assert.equal(m.stats.bodyDocuments, 0); assert.equal(m.stats.writes, 0);
    log('MODERATION_QUEUE_EMULATOR_MEASUREMENT ' + JSON.stringify({ cases: count, requests, projection, pages: { ...m.stats }, responseJsonBytes,
      fixtureStorageExcluded: true, wireBytesMeasured: false, cloudUsersTested: 0 }));
    await cleanup();
  }
});
