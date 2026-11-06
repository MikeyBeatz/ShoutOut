import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planEmptyFeedBootstrap as plan, initializeEmptyFeedBootstrap as initialize,
  activateEmptyFeedBootstrap as activate, setBootstrappedReaderPaused as pause } from './feed_empty_bootstrap.js';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'feed-bootstrap-tests') : null;
const db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t) {
  const generation = `start-${randomUUID().slice(0, 8)}`, roots = [db.doc('feedIndexControl/current'),
    db.doc('feedIndexMaintenance/bootstrap'), db.doc(`feedIndexGenerations/${generation}`)];
  for (const ref of roots) assert.equal((await ref.get()).exists, false);
  t.after(async () => { for (const ref of roots) await db.recursiveDelete(ref); });
  const source = db.doc(`shouts/${randomUUID()}`); roots.push(source);
  await source.set({ status: 'expired', title: 'Historical content must stay unchanged' });
  const before = await source.get(), p = await plan(db, generation);
  return { p, roots, source, before, args: { approvedDigest: p.digest, writerCommit: 'a'.repeat(40) }, control: roots[0], receipt: roots[1], marker: roots[2] };
}

test('empty initial installation is atomic, repeatable and preserves expired source documents', { skip: !enabled }, async t => {
  const f = await fixture(t);
  assert.deepEqual(await initialize(db, f.p, f.args), { state: 'initialized', changed: true });
  const control = await f.control.get(), receipt = await f.receipt.get();
  assert(control.createTime.isEqual(receipt.createTime)); assert.equal(control.get('mode'), 'off');
  assert.deepEqual(await initialize(db, f.p, f.args), { state: 'initialized', changed: false });
  await activate(db, f.p, f.args); // Lost acknowledgement: retry must not install twice.
  const active = await f.control.get(), marker = await f.marker.get();
  assert(marker.createTime.isEqual((await f.receipt.collection('activation').doc('current').get()).createTime));
  assert.deepEqual(await activate(db, f.p, f.args), { state: 'active', changed: false });
  assert((await f.control.get()).updateTime.isEqual(active.updateTime));
  assert.deepEqual((await f.source.get()).data(), f.before.data());
  assert((await f.source.get()).updateTime.isEqual(f.before.updateTime));
});

test('an active source appearing after planning or initialization blocks installation without copying or hiding it', { skip: !enabled }, async t => {
  const f = await fixture(t); await f.source.update({ status: 'active' });
  await assert.rejects(initialize(db, f.p, f.args), /active-source-present/);
  assert.equal((await f.control.get()).exists, false);
  await assert.rejects(plan(db, f.p.generationId), /active-source-present/);
  await f.source.update({ status: 'expired' }); await initialize(db, f.p, f.args);
  await f.source.update({ status: 'active' }); const before = await f.source.get();
  await assert.rejects(activate(db, f.p, f.args), /active-source-present/);
  assert.equal((await f.marker.get()).exists, false); assert.equal((await f.control.get()).get('mode'), 'off');
  assert((await f.source.get()).updateTime.isEqual(before.updateTime));
});

test('wrong approval, project, foreign records and replaced incarnations never authorize activation', { skip: !enabled }, async t => {
  const f = await fixture(t);
  await assert.rejects(initialize(db, f.p, { approvedDigest: 'b'.repeat(64) }), /invalid-approved/);
  await assert.rejects(initialize(db, { ...f.p, projectId: 'shoutout-production-a1b34' }, f.args), /invalid-approved/);
  await assert.rejects(activate(db, f.p, f.args), /ownership-conflict/);
  await initialize(db, f.p, f.args);
  const original = (await f.control.get()).data(); await f.control.delete(); await f.control.set(original);
  await assert.rejects(activate(db, f.p, f.args), /ownership-conflict/);
  assert.equal((await f.marker.get()).exists, false);
});

test('reader pause and resume retain the writer and generation; repeated pause changes nothing', { skip: !enabled }, async t => {
  const f = await fixture(t); await initialize(db, f.p, f.args); await activate(db, f.p, f.args);
  const marker = await f.marker.get();
  assert.equal((await pause(db, f.p, { ...f.args, paused: true })).state, 'paused');
  const stopped = await f.control.get(); assert.equal(stopped.get('readGenerationId'), null);
  assert.deepEqual(stopped.get('writeGenerationIds'), [f.p.generationId]);
  assert.equal((await pause(db, f.p, { ...f.args, paused: true })).changed, false);
  assert((await f.control.get()).updateTime.isEqual(stopped.updateTime));
  await pause(db, f.p, { ...f.args, paused: false });
  assert.equal((await f.control.get()).get('readGenerationId'), f.p.generationId);
  assert((await f.marker.get()).updateTime.isEqual(marker.updateTime));
});

test('a source writer racing activation observes either off or the new generation in its transaction', { skip: !enabled }, async t => {
  const f = await fixture(t); await initialize(db, f.p, f.args);
  let reached, release, attempt = 0;
  const read = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const writer = db.runTransaction(async tx => {
    const control = await tx.get(f.control); attempt++;
    if (attempt === 1) { reached(); await gate; }
    tx.update(f.source, { status: 'active', observedGeneration: control.get('readGenerationId') });
  }, { optimistic: true });
  await read;
  // Do not deadlock on pessimistic emulator document locks: activation races
  // concurrently, then the source writer releases its initial snapshot.
  const activating = activate(db, f.p, f.args); release();
  const results = await Promise.allSettled([writer, activating]);
  assert.equal(results[0].status, 'fulfilled');
  const control = await f.control.get(), source = await f.source.get();
  if (control.get('mode') === 'active') assert.equal(source.get('observedGeneration'), f.p.generationId);
  else { assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /active-source-present/); }
});
