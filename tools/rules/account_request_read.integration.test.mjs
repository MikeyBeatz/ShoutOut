import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDocFromServer, onSnapshot, runTransaction } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

let env, app, db, proxy;
const sockets = new Set(), roots = [];
const delayMs = 250; // Lab latency only; no product retry/delay/limit is added.

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  // Delay the client's server responses, including its existing Watch stream.
  // Admin commits bypass this proxy, just as a callable can finish before the
  // client listener receives its update. Raw TCP supports both HTTP and gRPC.
  proxy = net.createServer(socket => {
    const upstream = net.connect(8080, '127.0.0.1');
    sockets.add(socket); sockets.add(upstream);
    socket.pipe(upstream);
    upstream.on('data', chunk => setTimeout(() => {
      if (!socket.destroyed) socket.write(chunk);
    }, delayMs));
    upstream.on('end', () => setTimeout(() => socket.end(), delayMs));
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => {
      upstream.destroy(); sockets.delete(socket); sockets.delete(upstream);
    });
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  env = await initializeTestEnvironment({ projectId: 'shoutout-rules-test', firestore: {
    host: '127.0.0.1', port: proxy.address().port,
    rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
  app = initializeApp({ projectId: 'shoutout-rules-test' }, 'account-request-read');
  db = getFirestore(app);
});

after(async () => {
  if (env) await env.cleanup();
  if (db) { for (const ref of roots) await ref.delete(); await db.terminate(); }
  if (app) await deleteApp(app);
  for (const socket of sockets) socket.destroy();
  if (proxy) await new Promise(resolve => proxy.close(resolve));
});

test('a committed deletion request is readable transactionally before its Watch update arrives', { timeout: 30000 }, async () => {
  for (let i = 0; i < 3; i++) {
    const uid = randomUUID(), client = env.authenticatedContext(uid).firestore();
    const ref = doc(client, `accountDeletionRequests/${uid}`), admin = db.doc(ref.path);
    roots.push(admin);
    assert.equal((await runTransaction(client, tx => tx.get(ref), { maxAttempts: 1 })).exists(), false);
    let stop;
    try {
      await new Promise((resolve, reject) => {
        stop = onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
          if (!snapshot.metadata.fromCache) resolve();
        }, reject);
      });
      await admin.set({ userId: uid, status: 'pending', requestedAt: Timestamp.now(),
        retainUntil: Timestamp.fromMillis(Date.now() + 60 * 86400000) });
      // This is the old implementation: fromCache=false still does not prove
      // that a just-completed external write is included in an active target.
      const stale = await getDocFromServer(ref);
      assert.equal(stale.exists(), false);
      assert.equal(stale.metadata.fromCache, false);
      assert.equal(stale.metadata.hasPendingWrites, false);
      const before = await admin.get();
      const committed = await runTransaction(client, tx => tx.get(ref), { maxAttempts: 1 });
      assert.equal(committed.exists(), true);
      assert.equal(committed.data().userId, uid);
      assert.equal(committed.data().status, 'pending');
      assert.equal(committed.metadata.fromCache, false);
      assert.equal(committed.metadata.hasPendingWrites, false);
      const after = await admin.get();
      assert.ok(after.updateTime.isEqual(before.updateTime));
      assert.ok(after.createTime.isEqual(before.createTime));
      assert.deepEqual(after.data(), before.data());
    } finally { stop?.(); }
  }
});

test('transactional request confirmation does not bypass owner-only read access', async () => {
  const uid = randomUUID(), admin = db.doc(`accountDeletionRequests/${uid}`);
  roots.push(admin); await admin.set({ userId: uid, status: 'pending' });
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('other')]) {
    const client = context.firestore(), ref = doc(client, admin.path);
    await assertFails(runTransaction(client, tx => tx.get(ref), { maxAttempts: 1 }));
  }
});
