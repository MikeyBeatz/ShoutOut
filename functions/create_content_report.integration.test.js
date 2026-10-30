import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createContentReportOperation as create } from './create_content_report.js';

const enabled=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080';
const app=enabled?initializeApp({projectId:'shoutout-rules-test'},'content-report-tests'):null;
const db=app?getFirestore(app):null;
after(async()=>{if(app){await db.terminate();await deleteApp(app);}});
const now=new Date('2026-10-29T12:00:00Z');
const at=(ms=0)=>()=>new Date(now.getTime()+ms);
const collection={shout:'reports',comment:'commentReports',privateReply:'privateReplyReports'};
async function actor(){const uid=randomUUID();await db.doc(`users/${uid}`).set({nickname:'Reporter'});await db.doc(`users/${uid}/legal/acceptance_2026_07_25`).set({});return uid;}
async function fixture(targetType='shout'){
  const uid=await actor(),owner=randomUUID(),shoutId=randomUUID(),targetId=targetType==='shout'?undefined:randomUUID();
  const data={idempotencyKey:'first',expectedUserId:uid,targetType,shoutId,reason:'Spam',...(targetId?{targetId}:{})};
  const request={auth:{uid,token:{email:'reporter@example.test',email_verified:true}},app:{appId:'web'},data};
  const shoutRef=db.doc(`shouts/${shoutId}`);
  await shoutRef.set({authorId:owner,status:'deleted',likesCount:3,dislikesCount:2,commentsCount:7,savesCount:4});
  const targetRef=targetType==='shout'?shoutRef:shoutRef.collection(targetType==='comment'?'comments':'privateReplies').doc(targetId);
  if(targetType!=='shout')await targetRef.set({authorId:owner,text:'Canonical text',...(targetType==='privateReply'?{recipientId:uid}:{})});
  const reportId=`${uid}_${shoutId}${targetId?`_${targetId}`:''}`;
  return {uid,owner,request,shoutRef,targetRef,reportRef:db.doc(`${collection[targetType]}/${reportId}`),
    clearanceRef:db.doc(`moderationClearances/${targetType}_${shoutId}${targetId?`_${targetId}`:''}`)};
}
const receiptRef=r=>db.doc(`serverOperations/${createHash('sha256').update(`${r.auth.uid}\ncreateContentReport\n${r.data.idempotencyKey}`).digest('hex')}`);
const rateRef=f=>db.doc(`rateLimits/${f.uid}/actions/report`);
const change=(r,data)=>({...r,data:{...r.data,...data}});
async function unchanged(f){assert.equal((await f.reportRef.get()).exists,false);assert.equal((await rateRef(f).get()).exists,false);assert.equal((await receiptRef(f.request).get()).exists,false);}

test('all three report types preserve deterministic IDs, moderation schema, trusted snapshots and parent counters', {skip:!enabled},async()=>{
  for(const type of Object.keys(collection)){
    const f=await fixture(type),parent=(await f.shoutRef.get()).data();
    assert.deepEqual(await create(f.request,db,at()),{reportId:f.reportRef.id});
    const report=(await f.reportRef.get()).data();
    assert.deepEqual(report,{reporterId:f.uid,shoutId:f.shoutRef.id,reason:'Spam',createdAt:Timestamp.fromDate(now),status:'open',
      ...(type==='comment'?{commentId:f.targetRef.id}:{}),
      ...(type==='privateReply'?{privateReplyId:f.targetRef.id,authorId:f.owner,text:'Canonical text',priority:'high'}:{})});
    assert.deepEqual((await f.shoutRef.get()).data(),parent);
    const receipt=(await receiptRef(f.request).get()).data();
    assert.equal(receipt.createdAt.toMillis(),now.getTime());assert.equal(receipt.reportId,f.reportRef.id);
    assert.equal(receipt.text,undefined);assert.equal(receipt.reason,undefined);assert.equal(receipt.authorId,undefined);
    const rate=(await rateRef(f).get()).data();assert.equal(rate.count,1);assert.equal(rate.lastEventId,f.reportRef.id);
    assert.equal(rate.lastAt.toMillis(),now.getTime());
  }
});

test('self reports, absent targets, private senders and outsiders cannot create partial reports', {skip:!enabled},async()=>{
  for(const type of Object.keys(collection)){
    for(const mode of ['missing','self',...(type==='privateReply'?['outsider']:[])]){
      const f=await fixture(type);
      if(mode==='missing')await f.targetRef.delete();
      else await f.targetRef.update(mode==='self'?{authorId:f.uid}:{recipientId:'someone-else'});
      await assert.rejects(create(f.request,db,at()),e=>['not-found','permission-denied'].includes(e.code));await unchanged(f);
    }
  }
});

test('an existing clearance blocks each target type while restrictions and retained targets keep current policy', {skip:!enabled},async()=>{
  for(const type of Object.keys(collection)){
    const f=await fixture(type);await f.clearanceRef.set({});
    await assert.rejects(create(f.request,db,at()),e=>e.code==='failed-precondition');await unchanged(f);
    await f.clearanceRef.delete();
    await db.doc(`contentRestrictions/${f.uid}`).set({expiresAt:Timestamp.fromDate(new Date(now.getTime()+86400000))});
    await create(f.request,db,at());assert.equal((await f.reportRef.get()).exists,true);
  }
});

test('retry stays historical after moderation; another reason/key cannot overwrite a report or consume its limit', {skip:!enabled},async()=>{
  const f=await fixture('privateReply');await create(f.request,db,at());
  await f.reportRef.update({status:'closed',resolution:'contentApproved'});await f.clearanceRef.set({});
  await f.targetRef.delete();
  assert.deepEqual(await create(f.request,db,at(60000)),{reportId:f.reportRef.id});
  assert.equal((await f.reportRef.get()).data().status,'closed');assert.equal((await rateRef(f).get()).data().count,1);
  await assert.rejects(create(change(f.request,{reason:'Changed'}),db,at(60000)),e=>e.code==='already-exists');
  await db.doc(`bans/${f.uid}`).set({});
  await assert.rejects(create(f.request,db,at(60000)),e=>e.code==='permission-denied');
  const g=await fixture();await create(g.request,db,at());
  await assert.rejects(create(change(g.request,{idempotencyKey:'second',reason:'Changed'}),db,at(60000)),e=>e.code==='already-exists');
  assert.equal((await g.reportRef.get()).data().reason,'Spam');assert.equal((await rateRef(g).get()).data().count,1);
  assert.equal((await receiptRef(change(g.request,{idempotencyKey:'second'})).get()).exists,false);
});

test('concurrent same-key and distinct-key duplicates create one report and charge one report event', {skip:!enabled},async()=>{
  for(const keys of [['first','first','first'],['first','second']]){
    const f=await fixture('comment');const results=await Promise.allSettled(keys.map(k=>create(change(f.request,{idempotencyKey:k}),db,at())));
    const rejected=results.filter(x=>x.status==='rejected').map(x=>({code:x.reason.code,message:x.reason.message}));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,keys[0]===keys[1]?keys.length:1,
      `Unexpected concurrent results: ${JSON.stringify(rejected)}`);
    for(const r of results.filter(x=>x.status==='rejected'))assert.equal(r.reason.code,'already-exists');
    assert.equal((await rateRef(f).get()).data().count,1);assert.equal((await f.reportRef.get()).exists,true);
  }
});

test('different reporters remain independent; different targets by one reporter share the report/bug-report bucket', {skip:!enabled},async()=>{
  const f=await fixture(),other=await actor();
  await Promise.all([create(f.request,db,at()),create({...f.request,auth:{...f.request.auth,uid:other},data:{...f.request.data,expectedUserId:other}},db,at())]);
  const target=randomUUID();await db.doc(`shouts/${target}`).set({authorId:f.owner});
  const next=change(f.request,{shoutId:target,idempotencyKey:'next'});
  await assert.rejects(create(next,db,at(59999)),e=>e.code==='resource-exhausted');
  await create(next,db,at(60000));assert.equal((await rateRef(f).get()).data().count,2);
  await rateRef(f).set({lastAt:Timestamp.fromDate(now),lastEventId:'bug_existing',windowStartedAt:Timestamp.fromDate(now),count:20});
  const third=randomUUID();await db.doc(`shouts/${third}`).set({authorId:f.owner});
  const last=change(f.request,{shoutId:third,idempotencyKey:'last'});
  await assert.rejects(create(last,db,at(60000)),e=>e.code==='resource-exhausted');
  await create(last,db,at(86400000));assert.equal((await rateRef(f).get()).data().count,1);
});

test('invalid accounts, damaged target snapshots and malformed limits leave no partial writes', {skip:!enabled},async()=>{
  for(const mode of ['ban','deletion','legal','profile','target','privateText','rate']){
    const f=await fixture(mode==='privateText'?'privateReply':'shout');
    if(mode==='ban')await db.doc(`bans/${f.uid}`).set({});
    if(mode==='deletion')await db.doc(`accountDeletionRequests/${f.uid}`).set({});
    if(mode==='legal')await db.doc(`users/${f.uid}/legal/acceptance_2026_07_25`).delete();
    if(mode==='profile')await db.doc(`users/${f.uid}`).delete();
    if(mode==='target')await f.targetRef.update({authorId:42});
    if(mode==='privateText')await f.targetRef.update({text:42});
    if(mode==='rate')await rateRef(f).set({count:'broken'});
    await assert.rejects(create(f.request,db,at()));
    assert.equal((await f.reportRef.get()).exists,false);assert.equal((await receiptRef(f.request).get()).exists,false);
    if(mode==='rate')assert.deepEqual((await rateRef(f).get()).data(),{count:'broken'});
    else assert.equal((await rateRef(f).get()).exists,false);
  }
});
