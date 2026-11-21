import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planNewsActivation, applyNewsTransition, assertNewsOriginals, validateNewsPlan } from '../tools/feed_news_activation.mjs';
const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const app = enabled ? initializeApp({ projectId: 'shoutout-rules-test' }, 'news-activation') : null, db = app ? getFirestore(app) : null;
after(async () => { if (app) { await db.terminate(); await deleteApp(app); } });
async function fixture(t) {
  const control = db.doc('feedIndexControl/current'), marker = db.doc('feedIndexGenerations/feed-v3');
  const original = db.doc('shouts/news-activation-original'), request = db.doc('accountDeletionRequests/news-activation-original');
  t.after(async () => { for (const ref of [control, marker, original, request, db.doc('feedNewsControl/current')]) await db.recursiveDelete(ref); });
  await control.create({ schemaVersion: 2, revision: 11, mode: 'active', readGenerationId: 'feed-v3', writeGenerationIds: ['feed-v3'], cardReadGenerationId: 'feed-v3', cardWriteGenerationIds: ['feed-v3'] });
  await marker.create({ schemaVersion: 1, v: 2, cardReady: true, cardProjection: 1, accountRetention: true, readIdentity: 1, erasureRevision: 0, prunedThrough: -1 });
  await original.create({ keep: true }); await request.create({ keep: true });
  return { control, marker, original, request, plan: await planNewsActivation(db, { expectedSources: 1 }) };
}
const drain = { projectId: 'shoutout-dev-46c81', validated: true, functions: [{ function: 'createShout' }, { function: 'getFeedPage' }] };
test('guarded bootstrap, lost response replay, pause/reactivation and final safe pause preserve originals', { skip: !enabled }, async t => {
  const f = await fixture(t), ref = db.doc('feedIndexGenerations/feed-v3/publicationHeads/_control');
  assert.equal((await applyNewsTransition(db, f.plan, 1)).writes, 3);
  const head = await ref.get();
  assert.equal((await applyNewsTransition(db, f.plan, 1)).replay, true); assert((await ref.get()).updateTime.isEqual(head.updateTime));
  await assert.rejects(applyNewsTransition(db, f.plan, 2), /drain-required/);
  const both = await Promise.all([applyNewsTransition(db, f.plan, 2, { drain }), applyNewsTransition(db, f.plan, 2, { drain })]);
  assert.equal(both.filter(x => !x.replay).length, 1);
  for (const revision of [3, 4, 5]) await applyNewsTransition(db, f.plan, revision);
  assert.equal((await db.doc('feedNewsControl/current').get()).get('mode'), 'paused');
  assert.equal(await assertNewsOriginals(db, db, f.plan), 2);
  await assert.rejects(applyNewsTransition(db, f.plan, 1), /transition-conflict/);
});
test('operator rejects source/control drift, plan tampering and marker reincarnation without partial bootstrap', { skip: !enabled }, async t => {
  const f = await fixture(t);
  assert.throws(() => validateNewsPlan({ ...f.plan, generation: 'feed-v2' }, db.projectId), /approved-plan/);
  await f.original.update({ keep: false }); await assert.rejects(applyNewsTransition(db, f.plan, 1), /original-data-drift/);
  f.plan = await planNewsActivation(db, { expectedSources: 1 });
  await f.control.update({ revision: 12 }); await assert.rejects(applyNewsTransition(db, f.plan, 1), /generation-drift/);
  f.plan = await planNewsActivation(db, { expectedSources: 1 });
  const body = (await f.marker.get()).data(); await f.marker.delete(); await f.marker.create(body);
  await assert.rejects(applyNewsTransition(db, f.plan, 1), /generation-drift/);
  assert.equal((await db.doc('feedNewsControl/current').get()).exists, false);
  assert.equal((await f.marker.collection('publicationHeads').get()).size, 0);
});
