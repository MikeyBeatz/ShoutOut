import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Firestore,Timestamp} from 'firebase-admin/firestore';
import {legacyReportFixtures,legacyReportParent,planLegacyReportCleanup as plan,applyLegacyReportCleanup as apply} from '../tools/archive_report_cleanup.mjs';
import {planLifecycleInventory,readLifecycleInventoryPage} from './content_lifecycle_transition.js';
import {receiptMayBePurged} from './cleanup_operation_receipts.js';
import {operationRetryWindowMillis} from './operation_retention.js';
const enabled=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080';
async function fixture(t){
  const db=new Firestore({projectId:'shoutout-rules-test'}),control=db.doc('contentLifecycleControl/current');
  const protectedRefs=[db.doc(`shouts/${legacyReportParent}`),db.doc(`shouts/${legacyReportParent}/comments/control`),
    db.doc(`shouts/${legacyReportParent}/privateReplies/${legacyReportFixtures[2].child}`),
    db.doc('sanctions/protected-report-sanction'),db.doc('serverOperations/protected-report-receipt'),db.doc('accountDeletionRequests/protected-report-request')];
  const feed=db.doc('feedIndexControl/current'),gen=db.doc('feedIndexGenerations/report-cleanup');
  t.after(async()=>{
    for(const f of legacyReportFixtures)await db.recursiveDelete(db.doc(f.path));
    for(const r of [control,feed,gen,...protectedRefs])await db.recursiveDelete(r);
    for(const d of (await db.collection('serverOperations').where('result.kind','==','resolved-mvp-reports').get()).docs)await d.ref.delete();
    await db.terminate();
  });
  assert(!(await control.get()).exists);
  await control.create({schemaVersion:1,revision:1,mode:'active',captureFenceAt:Timestamp.now(),legacyRevision:0,compatibleWriterCommit:'a'.repeat(40)});
  await feed.create({schemaVersion:2,revision:1,mode:'active',readGenerationId:gen.id,writeGenerationIds:[gen.id],cardReadGenerationId:gen.id,cardWriteGenerationIds:[gen.id]});
  await gen.create({schemaVersion:1,v:2,readIdentity:1,accountRetention:true,cardProjection:1,cardReady:true});
  for(const ref of protectedRefs)await ref.create({synthetic:true,text:'Preserve this original',userId:'protected'});
  for(const f of legacyReportFixtures)await db.doc(f.path).create({status:'resolved',shoutId:legacyReportParent,
    reason:`MVP modbiz 926a31d2 ${f.kind}. Remove after verification.`,decision:{action:'resolved',actorId:'synthetic-moderator'},
    ...(f.kind==='comment'?{commentId:f.child}:f.kind==='privateReply'?{privateReplyId:f.child,text:'Original report snapshot'}:{})});
  return {db,control,protectedRefs,apply:(p,extra={})=>apply(db,p,{approvedDigest:p.digest,...extra})};
}
test('three reports commit together, preserve all sources/audit receipts, invalidate inventory and replay with seven-day proof',{skip:!enabled},async t=>{
  const f=await fixture(t),inventory=await planLifecycleInventory(f.db),p=await plan(f.db);
  const before=await f.db.getAll(...f.protectedRefs),out=await f.apply(p);
  assert.equal(out.removed,3);assert.equal(out.writes,5);assert.equal(out.legacyRevision,1);assert.equal(out.authMutations,0);
  const after=await f.db.getAll(...f.protectedRefs);for(let n=0;n<before.length;n++)assert(after[n].updateTime.isEqual(before[n].updateTime));
  assert((await f.db.getAll(...legacyReportFixtures.map(x=>f.db.doc(x.path)))).every(d=>!d.exists));
  await assert.rejects(readLifecycleInventoryPage(f.db,inventory),/drift/);
  assert.equal((await f.apply(p)).state,'already-applied');assert.equal((await f.control.get()).get('legacyRevision'),1);
  const receipt=(await f.db.doc(`serverOperations/archive_reports_${p.digest}`).get()).data();
  assert(!receiptMayBePurged(receipt,Timestamp.fromMillis(receipt.createdAt.toMillis()+operationRetryWindowMillis-1)));
  assert(receiptMayBePurged(receipt,receipt.expiresAt));
});
test('report drift, preserved source drift and unproven or nonresolved target stop without partial deletion',{skip:!enabled},async t=>{
  const f=await fixture(t),p=await plan(f.db),report=f.db.doc(legacyReportFixtures[0].path);
  await report.update({decision:{changed:true}});await assert.rejects(f.apply(p),/baseline-drift/);
  const p2=await plan(f.db);await f.protectedRefs[1].update({text:'Concurrent original change'});await assert.rejects(f.apply(p2),/baseline-drift/);
  await report.update({status:'open'});await assert.rejects(plan(f.db),/unproven-fixture/);
  await report.update({status:'resolved',reason:'Foreign report'});await assert.rejects(plan(f.db),/unproven-fixture/);
  assert((await f.db.getAll(...legacyReportFixtures.map(x=>f.db.doc(x.path)))).every(d=>d.exists));
  assert.equal((await f.control.get()).get('legacyRevision'),0);
});
test('injected failure rolls back reports, control and proof; unknown child prevents deletion',{skip:!enabled},async t=>{
  const f=await fixture(t),p=await plan(f.db);
  await assert.rejects(f.apply(p,{beforeCommit(){throw Error('injected-crash');}}),/injected-crash/);
  assert((await f.db.getAll(...legacyReportFixtures.map(x=>f.db.doc(x.path)))).every(d=>d.exists));
  assert.equal((await f.control.get()).get('legacyRevision'),0);assert(!(await f.db.doc(`serverOperations/archive_reports_${p.digest}`).get()).exists);
  await f.db.doc(`${legacyReportFixtures[0].path}/unknown/keep`).create({keep:true});await assert.rejects(f.apply(p),/descendants/);
});
test('concurrent cleanup has one commit; recreated report or missing receipt never authorizes retry',{skip:!enabled},async t=>{
  const f=await fixture(t),p=await plan(f.db);
  const results=await Promise.all([f.apply(p),f.apply(p)]);assert.deepEqual(results.map(x=>x.state).sort(),['already-applied','applied']);
  const ref=f.db.doc(legacyReportFixtures[0].path);await ref.create({newIncarnation:true});await assert.rejects(f.apply(p),/recreated/);await ref.delete();
  await f.db.doc(`serverOperations/archive_reports_${p.digest}`).delete();await assert.rejects(f.apply(p),/unproven-fixture/);
});
test('control drift, tampered digest and wrong project fail closed',{skip:!enabled},async t=>{
  const f=await fixture(t),p=await plan(f.db);
  await f.control.update({legacyRevision:1});await assert.rejects(f.apply(p),/baseline-drift/);
  await assert.rejects(f.apply({...p,digest:'a'.repeat(64)}),/invalid-plan/);
  await assert.rejects(plan({projectId:'shoutout-production-a1b34'}),/dev-required/);
});
