import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { expireDueShouts as expire, runAccountMaintenanceTick as tick } from './shout_expiration.js';
import { runAccountShoutHidingJob as accountRun } from './account_deletion_job.js';
const enabled=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080';
const app=enabled?initializeApp({projectId:'shoutout-rules-test'},'expiration-tests'):null,db=app?getFirestore(app):null,roots=[];
after(async()=>{if(db){for(const root of roots)await db.recursiveDelete(root);await db.terminate();await deleteApp(app);}});
async function fixture(){const base=db.doc(`expirationScopes/${randomUUID()}`);roots.push(base);let millis=Date.now()+100;
 const scoped={projectId:db.projectId,collection:name=>base.collection(name),doc:path=>base.collection(path.split('/')[0]).doc(path.split('/')[1]),runTransaction:db.runTransaction.bind(db)};
 const clock=()=>new Date(millis),past=()=>Timestamp.fromMillis(millis-1000),options={clock,maxCandidates:2};
 const add=async(id,data={})=>{const ref=base.collection('shouts').doc(id);await ref.set({authorId:'fixture',status:'active',expiresAt:past(),text:'Preserve all text',...data});return ref;};
 return {base,scoped,clock,past,options,add,advance:ms=>{millis+=ms;}};
}
test('expiration preserves all content/children and changes only due active statuses, including exact cutoff',{skip:!enabled},async()=>{
 const f=await fixture(),past=await f.add('past'),exact=await f.add('exact',{expiresAt:Timestamp.fromDate(f.clock())}),future=await f.add('future',{expiresAt:Timestamp.fromMillis(f.clock().getTime()+1000)}),deleted=await f.add('deleted',{status:'deleted'});
 const child=past.collection('comments').doc('child');await child.set({text:'Keep this child'});const before=(await past.get()).data(),childBefore=await child.get();
 const result=await expire(f.scoped,{...f.options,maxCandidates:50});assert.equal(result.expired,2);
 assert.deepEqual((await past.get()).data(),{...before,status:'expired'});assert.equal((await exact.get()).data().status,'expired');
 assert.equal((await future.get()).data().status,'active');assert.equal((await deleted.get()).data().status,'deleted');assert.ok((await child.get()).updateTime.isEqual(childBefore.updateTime));
 assert.equal((await expire(f.scoped,f.options)).scanned,0);
});
test('bounded batches drain a backlog and concurrent ticks never duplicate a transition',{skip:!enabled},async()=>{
 const f=await fixture();for(let i=0;i<5;i++)await f.add('s'+i);
 const results=await Promise.all([expire(f.scoped,f.options),expire(f.scoped,f.options)]);assert(results.every(r=>r.scanned<=2));assert.equal(results.reduce((n,r)=>n+r.expired,0),2);
 assert.equal((await expire(f.scoped,f.options)).expired,2);assert.equal((await expire(f.scoped,f.options)).expired,1);assert.equal((await expire(f.scoped,f.options)).scanned,0);
});
test('extension, manual deletion and disappearance between selection and commit cannot be overwritten',{skip:!enabled},async()=>{
 const f=await fixture(),extended=await f.add('extended'),removed=await f.add('removed'),hidden=await f.add('hidden');
 const result=await expire(f.scoped,{...f.options,maxCandidates:50,beforeTransaction:async ref=>{
  if(ref.id==='extended')await ref.update({expiresAt:Timestamp.fromMillis(f.clock().getTime()+5000)});
  if(ref.id==='removed')await ref.delete();if(ref.id==='hidden')await ref.update({status:'deleted'});
 }});
 assert.equal(result.expired,0);assert.equal(result.skipped,3);assert.equal((await extended.get()).data().status,'active');assert.equal((await removed.get()).exists,false);assert.equal((await hidden.get()).data().status,'deleted');
});
test('optional spatial-index composition rolls back with the status and is not repeated after success',{skip:!enabled},async()=>{
 const f=await fixture(),source=await f.add('indexed'),audit=f.base.collection('index').doc('indexed');let fail=true;
 const indexWriter={async prepare(transaction,id,before,after,{operationId}){
  assert.equal(id,'indexed');assert.equal(before.status,'active');assert.equal(after.status,'expired');assert.equal(operationId.length,64);
  const existing=await transaction.get(audit);return {apply(){transaction.set(audit,{count:(existing.data()?.count??0)+1});if(fail)throw new Error('index-failed');}};
 }};
 await assert.rejects(expire(f.scoped,{...f.options,indexWriter}),/index-failed/);assert.equal((await source.get()).data().status,'active');assert.equal((await audit.get()).exists,false);
 fail=false;assert.equal((await expire(f.scoped,{...f.options,indexWriter})).expired,1);assert.equal((await audit.get()).data().count,1);
 assert.equal((await expire(f.scoped,{...f.options,indexWriter})).scanned,0);
});
test('malformed non-timestamp deadlines are not interpreted as due dates',{skip:!enabled},async()=>{
 const f=await fixture();for(const [id,value]of [['number',1],['string','bad'],['null',null],['negative',Timestamp.fromMillis(-1)]])await f.add(id,{expiresAt:value});
 assert.equal((await expire(f.scoped,{...f.options,maxCandidates:50})).expired,0);
 assert.equal((await f.base.collection('shouts').get()).docs.every(d=>d.data().status==='active'),true);
});
test('maintenance reuses idle account ticks and never runs a second full page beside an account job',{skip:!enabled},async()=>{
 const f=await fixture(),source=await f.add('waiting'),uid=randomUUID(),request=f.scoped.doc(`accountDeletionRequests/${uid}`);await request.set({userId:uid,status:'pending'});
 const identity={projectId:db.projectId,userId:uid,requestCreateTime:(await request.get()).createTime};
 const options={clock:f.clock,pageSize:2,maxJobs:1,leaseMillis:60000,retryDelayMillis:1000,authWaitMillis:86400000,shoutExpirationEnabled:true};
 await accountRun(identity,f.scoped,{getUser:async()=>({uid})},options);f.advance(1000);
 const busy=await tick(f.scoped,{getUser:async()=>({uid})},options);assert.equal(busy.scanned,1);assert.equal(busy.expirationScanned,0);assert.equal((await source.get()).data().status,'active');
 const idle=await tick(f.scoped,{getUser(){assert.fail('no due account');}},options);assert.equal(idle.scanned,0);assert.equal(idle.expirationChanged,1);
});
