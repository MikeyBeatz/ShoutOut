import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { labIndexBinding } from './feed_index_paths.js';
import { beginIndexGc } from './feed_index_gc_store.js';
import { encodeGeohash } from './geohash.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'gc-checkpoint-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t) {
  const namespace = `gcc-${randomUUID().slice(0, 8)}`, lab = createLabBlockIndex(db, { namespace });
  t.after(() => db.recursiveDelete(lab.base));
  const location = { latitude: 50.08, longitude: 14.44 }, now = Date.now(), geohash = encodeGeohash(location.latitude, location.longitude);
  const rows = Array.from({ length: 40 }, (_, i) => ({ id: `fixture-${i}`, authorId: 'fixture-author', status: 'active', location, geohash,
    createdAt: now - 1000, expiresAt: now + 86400000, categories: ['Dotaz'], likesCount: 0, dislikesCount: 0 }));
  await lab.seed(rows);
  for (let i = 1; i <= 12; i++) await lab.mutate(rows[0].id, { ...rows[0], likesCount: i });
  return { lab, rows, cell: geohash.slice(0, 4), start: options => beginIndexGc(db, labIndexBinding(db, namespace), geohash.slice(0, 4),
    { testTimeAdvanceMillis: 3600001, ...options }) };
}

test('normal index GC resumes after every tiny step without persisting source/node bodies', { skip: !enabled }, async t => {
  const f = await fixture(t); let checkpoint = null, result;
  for (let i = 0; i < 200; i++) {
    const gc = await f.start({ checkpoint }); result = await gc.step({ reads: 3, deletes: 1 }); checkpoint = gc.checkpoint();
    assert(!JSON.stringify(checkpoint).includes('fixture-author')); assert(!JSON.stringify(checkpoint).includes('likesCount'));
    if (result.state === 'done') break;
  }
  assert.equal(result.state, 'done');
  assert.equal((await f.lab.base.collection('retiredRoots').get()).size, 0);
  const audit = await f.lab.audit(); assert(audit.valid); assert.equal(audit.activeMetadata, 40); assert.equal(audit.historicalNodes, 0);
});

test('checkpoint corruption or a changed root cannot authorize deletion', { skip: !enabled }, async t => {
  const f = await fixture(t), gc = await f.start(); await gc.step({ reads: 1, deletes: 1 });
  const checkpoint = gc.checkpoint(), before = (await f.lab.base.collection('nodes').get()).size;
  await assert.rejects(f.start({ checkpoint: { ...checkpoint, phase: 'sweep' } }), /invalid-gc-checkpoint/);
  await f.lab.mutate(f.rows[0].id, { ...f.rows[0], likesCount: 13 });
  await assert.rejects(f.start({ checkpoint }), /index-gc-root-changed/);
  assert((await f.lab.base.collection('nodes').get()).size >= before); assert((await f.lab.audit()).valid);
});

test('an expired worker lease is checked inside each destructive GC transaction', { skip: !enabled }, async t => {
  const f = await fixture(t); let allowed = true;
  const gc = await f.start({ transactionGuard: async () => { if (!allowed) throw new Error('index-gc-lease-lost'); } });
  const before = (await f.lab.base.collection('nodes').get()).size;
  await assert.rejects((async () => {
    for (let i = 0; i < 100; i++) await gc.step({ reads: 32, deletes: 16 }, { beforeDelete() { allowed = false; } });
  })(), /index-gc-lease-lost/);
  assert.equal((await f.lab.base.collection('nodes').get()).size, before); assert((await f.lab.audit()).valid);
});

test('a recreated generation rejects a checkpoint from its previous incarnation', { skip: !enabled }, async t => {
  const f = await fixture(t), gc = await f.start(); await gc.step({ reads: 1, deletes: 1 }); const checkpoint = gc.checkpoint();
  const marker = (await f.lab.base.get()).data(); await f.lab.base.delete(); await f.lab.base.set(marker);
  await assert.rejects(f.start({ checkpoint }), /index-gc-generation-changed/);
});
