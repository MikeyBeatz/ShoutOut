import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp,GeoPoint} from 'firebase-admin/firestore';
import {getFeedDeltaOperation} from './feed_delta.js';
import {newsFixture,meterNewsDatabase} from './feed_news_lab.js';
import {encodeGeohash} from './geohash.js';
import {Buffer} from 'node:buffer';
import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {log} from 'node:console';
import {feedRuntimeBlockCache} from './feed_runtime.js';
import {newsDetectionModel} from './feed_news_detection_model.js';
const enabled=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080';
const app=enabled?initializeApp({projectId:'shoutout-rules-test'},'feed-news-integration'):null,db=app?getFirestore(app):null;
after(async()=>{if(app){await db.terminate();await deleteApp(app);}});
test('news disabled rejects before database access',async()=>{
 await assert.rejects(getFeedDeltaOperation({auth:{uid:'actor',token:{email:'fixture@example.test',email_verified:true}},app:{appId:'fixture'},data:{format:'delta-v1',mode:'news',expectedUserId:'actor',checkpoint:'x'}},
 {projectId:'shoutout-dev-46c81'},{enabled:true,key:Buffer.alloc(32)}),error=>error.code==='failed-precondition'&&error.message==='Feed news is not enabled.');
});
test('first-publication fence handles delayed commit and excludes restored old sources and counter edits',{skip:!enabled},async t=>{
 const f=await newsFixture(db,t);await f.change(0,{status:'deleted'});
 const page=await f.page();assert(page.newsCheckpoint);
 const baseline=page.newsCheckpoint;assert.equal((await f.news(baseline)).count,0);
 await f.change(0,{status:'active'});await f.change(1,{likesCount:50});
 assert.equal((await f.news(baseline)).count,0);
 // Creation clock predates refresh, but atomic source/state commit is newer.
 await f.change(80,{createdAt:Timestamp.fromMillis(f.now-5000)},{create:true});
 assert.equal((await f.news(baseline)).count,1);
 const renewed=await f.page();assert.equal((await f.news(renewed.newsCheckpoint)).count,0);
});
test('count respects radius/category/promo/block/deleted-author policy without body reads',{skip:!enabled},async t=>{
 const f=await newsFixture(db,t),page=await f.page({category:'Dotaz'});
 await f.change(50,{}, {create:true});await f.change(51,{categories:['Pomoc']},{create:true});
 const location=new GeoPoint(49,15);await f.change(52,{location,geohash:encodeGeohash(location.latitude,location.longitude)},{create:true});
 await f.change(53,{businessSpotlight:true},{create:true});await f.change(54,{authorId:'erased-news-author'},{create:true});
 await db.doc('publicProfiles/erased-news-author').set({accountStatus:'deleted'});t.after(()=>db.doc('publicProfiles/erased-news-author').delete());
 const measured=meterNewsDatabase(db);f.database=measured.db;
 assert.equal((await f.news(page.newsCheckpoint)).count,1);assert.equal(measured.snapshot().sourceReads,0);assert.equal(measured.snapshot().writes,0);
 await f.profile.collection('blocked').doc(f.rows[0].authorId).set({});
 assert.equal((await f.news(page.newsCheckpoint)).count,0);
});
test('capped 99+ becomes exact after removals/expiration; preparation never exposes partial counts',{skip:!enabled},async t=>{
 const f=await newsFixture(db,t,0),page=await f.page();
 for(let i=0;i<102;i++)await f.change(i,{expiresAt:Timestamp.fromMillis(f.now+1000)},{create:true});
 let checkpoint=page.newsCheckpoint,result,steps=0;
 do{result=await f.step({mode:'news',checkpoint},{workNodes:2});if(result.state==='preparing'){assert.equal(result.count,undefined);checkpoint=result.checkpoint;}steps++;}while(result.state!=='ready'&&steps<100);
 assert.equal(result.count,100);assert.equal(result.capped,true);assert(steps>1);
 for(let i=0;i<3;i++)await f.change(i,null);
 assert.equal((await f.news(page.newsCheckpoint)).count,99);
 f.now+=1001;assert.equal((await f.news(page.newsCheckpoint)).count,0);
});
test('checkpoint scope, generation rollback, R5 and caller deletion are fenced',{skip:!enabled},async t=>{
 const f=await newsFixture(db,t),page=await f.page();
 await assert.rejects(f.step({mode:'news',checkpoint:page.newsCheckpoint+'x'}),e=>e.code==='invalid-argument');
 const foreign=f.request({mode:'news',checkpoint:page.newsCheckpoint});foreign.auth.uid='foreign';foreign.data.expectedUserId='foreign';
 await assert.rejects(getFeedDeltaOperation(foreign,db,{enabled:true,newsEnabled:true,key:f.key,clock:f.clock}),e=>e.code==='invalid-argument');
 await f.control.update({cardReadGenerationId:null});await assert.rejects(f.news(page.newsCheckpoint),e=>e.code==='failed-precondition');
});
test('R5 fences old baseline and pending account deletion blocks news',{skip:!enabled},async t=>{
 const f=await newsFixture(db,t),page=await f.page();
 const cell=f.rows[0].geohash.slice(0,4);
 await f.base.collection('cellRetention').doc(cell).set({v:1,version:1,phase:'ready'});
 await assert.rejects(f.news(page.newsCheckpoint),e=>e.code==='failed-precondition'&&e.details?.reason==='feed-session-expired');
 await f.base.collection('cellRetention').doc(cell).delete();
 const pending=db.doc(`accountDeletionRequests/${f.uid}`);await pending.set({});t.after(()=>pending.delete());
 await assert.rejects(f.news(page.newsCheckpoint),e=>e.code==='failed-precondition'&&e.message==='Account deletion is pending.');
});
test('publication racing the refresh snapshot belongs to the next count, not the loaded page',{skip:!enabled},async t=>{
 const f=await newsFixture(db,t);let published=false;
 f.database=new Proxy(db,{get(target,key){
  if(key==='runTransaction')return (run,...options)=>target.runTransaction(real=>run(new Proxy(real,{get(tx,method){
   if(method==='get')return async(...args)=>{const result=await tx.get(...args);
    if(!published&&result.docs?.some(doc=>doc.ref.path.startsWith(f.base.path+'/cells/'))){published=true;await f.change(80,{createdAt:Timestamp.fromMillis(f.now-10000)},{create:true});}
    return result;};return typeof tx[method]==='function'?tx[method].bind(tx):tx[method];}})),...options);
  return typeof target[key]==='function'?target[key].bind(target):target[key];
 }});
 const page=await f.page();assert(published);assert.equal(page.bodyPage.rows.length,50);
 assert(page.bodyPage.rows.every(row=>!row.id.endsWith('-000080')));
 assert.equal((await f.news(page.newsCheckpoint)).count,1);
});
test('measured news reads/writes/transfers and explicit quiet/busy detector model',{skip:!enabled},async()=>{
 const samples=[];
 for(const size of [50,200,2000]){
  const scope={callbacks:[],after(fn){this.callbacks.push(fn);}};
  try{
   const f=await newsFixture(db,scope,size),baseline=(await f.page()).newsCheckpoint,m=meterNewsDatabase(db);f.database=m.db;
   const check=async(label,cold=false)=>{if(cold)feedRuntimeBlockCache.clear();m.reset();f.transfer={requests:0,requestBytes:0,responseBytes:0,maxCheckpointBytes:0};const start=performance.now();let maxRetainedCandidates=0;
    const response=await f.news(baseline,{observeMetrics:metric=>{maxRetainedCandidates=Math.max(maxRetainedCandidates,metric.maxRetainedCandidates??0);}});const counts=m.snapshot();assert.equal(counts.sourceReads,0);assert.equal(counts.writes,0);
    assert(maxRetainedCandidates<=100);
    return {label,...counts,count:response.count,...f.transfer,maxRetainedCandidates,elapsedMillis:Math.round(performance.now()-start)};};
   const quiet=await check('quiet-cold',true),quietWarm=await check('quiet-warm');assert.equal(quiet.count,0);
   await f.change(0,{likesCount:1},{signal:true,db:m.db});const counters=await check('counter-only',true);assert.equal(counters.count,0);
   m.reset();await f.change(size,{}, {create:true,db:m.db});const publication=m.snapshot();assert.equal(publication.signalWrites,0);
   const one=await check('one-new-cold',true),oneWarm=await check('one-new-warm');assert.equal(one.count,1);assert(oneWarm.reads<=one.reads);
   m.reset();await f.change(size+1,{}, {create:true,signal:true,db:m.db});const publicationSignal=m.snapshot();assert.equal(publicationSignal.signalWrites,1);
   m.reset();await f.change(0,{likesCount:2},{signal:true,db:m.db});assert.equal(m.snapshot().signalWrites,0);
   samples.push({sources:size,quiet,quietWarm,counters,one,oneWarm,publication,publicationSignal});
  }finally{for(const fn of scope.callbacks.reverse())await fn();}
 }
 const traffic={quiet:[],one:[10000],burst:Array(100).fill(10000),steady:Array.from({length:100},(_,i)=>i*600)};
 const detection=Object.fromEntries(Object.entries(traffic).map(([name,publications])=>[name,{
  signal2s:newsDetectionModel({publications,signal:true,intervalMillis:2000}),
  batch5s:newsDetectionModel({publications,intervalMillis:5000}),batch15s:newsDetectionModel({publications,intervalMillis:15000})}]));
 assert.equal(detection.quiet.signal2s.probeRequests,0);assert.equal(detection.quiet.batch5s.probeRequests,12);
 assert.equal(detection.burst.signal2s.probeRequests,1);assert.equal(detection.burst.signal2s.signalListenerReadModel,101);
 const report={schema:1,scope:'Firestore emulator SDK operations plus explicit detector/fanout model; not cloud billing/load test',
  samples,detection,limits:['Baseline feed load and fixture setup excluded','bytes measures serialized SDK document JSON, not gRPC transfer','requestBytes/responseBytes measure callable-envelope JSON; HTTP headers/compression excluded','Listener reads are a document-change model, not measured billed reads','Client coalescing does not coalesce server signal writes or billed listener changes','Publication-only signal needs bounded fallback for removal/expiration/reconnect','No timing or infrastructure activated']};
 if(process.env.B4_NEWS_REPORT_PATH){const file=process.env.B4_NEWS_REPORT_PATH.replaceAll('\\','/');
  if(!/^build\/b4-news-[a-z0-9-]+\.json$/.test(file))throw new Error('news-benchmark-build-path-required');writeFileSync(file,JSON.stringify(report,null,2)+'\n');}
 log('B4_NEWS_MEASUREMENT '+JSON.stringify(report));
});
test('account deletion during a partial scan prevents issuing its continuation',{skip:!enabled},async t=>{
 const f=await newsFixture(db,t,200),page=await f.page();await f.change(250,{}, {create:true});
 const pending=db.doc(`accountDeletionRequests/${f.uid}`);t.after(()=>pending.delete());let erased=false;
 f.database=new Proxy(db,{get(target,key){
  if(key==='runTransaction')return async(...args)=>{const result=await target.runTransaction(...args);if(!erased&&result?.state==='preparing'){erased=true;await pending.set({});}return result;};
  return typeof target[key]==='function'?target[key].bind(target):target[key];
 }});
 await assert.rejects(f.news(page.newsCheckpoint,{workNodes:2}),e=>e.code==='failed-precondition'&&e.message==='Account deletion is pending.');assert(erased);
});
