import {test} from 'node:test';
import assert from 'node:assert/strict';
import {metadataOf,treeBuilder} from './feed_block_index.js';
import {scanFeedNews} from './feed_news_scan.js';
import {encodeGeohash} from './geohash.js';
import {Timestamp} from 'firebase-admin/firestore';
import {newsDetectionModel} from './feed_news_detection_model.js';
const geohash=encodeGeohash(50.08,14.44);
const row=(i,extra={})=>({id:`fixture-${i}`,authorId:'writer',status:'active',geohash,location:{latitude:50.08,longitude:14.44},
 title:`Fixture ${i}`,text:'text',authorNickname:'Writer',createdAt:Timestamp.fromMillis(1000),expiresAt:Timestamp.fromMillis(100000),categories:['Dotaz'],likesCount:0,dislikesCount:0,commentsCount:0,savesCount:0,...extra});
function trees(before,after){const builder=treeBuilder({cardProjection:true});
 const root=rows=>rows.length?[builder.build(rows.map(r=>metadataOf(r,{contentIdentity:true,cardProjection:true})),geohash.slice(0,4))]:[];
 return {before:root(before),current:root(after),load:hash=>builder.writes.get(hash)};
}
test('unchanged hash skips every metadata/body read',async()=>{
 const view=trees([row(1)],[row(1)]);let loads=0;
 const result=await scanFeedNews({...view,load:()=>{loads++;assert.fail('unchanged');},accept:()=>assert.fail(),eligible:()=>true});
 assert.equal(result.rows.length,0);assert.equal(loads,0);assert.equal(result.metrics.skippedHashes,1);
});
test('bounded continuation finds first publications and never returns a partial count',async()=>{
 const old=Array.from({length:200},(_,i)=>row(i)),added=Array.from({length:80},(_,i)=>row(200+i));
 const view=trees(old,[...old,...added]);let position,result,steps=0;
 do{result=await scanFeedNews({...view,position,budget:2,eligible:()=>true,accept:rows=>rows.filter(r=>Number(r.id.split('-')[1])>=200)});
  assert(result.metrics.nodeLoads<=2);if(result.state==='preparing'){assert.equal(result.rows,undefined);position=result.position;}steps++;
 }while(result.state!=='ready'&&steps<1000);
 assert.equal(result.rows.length,80);assert(steps>1);assert.equal(result.capped,false);
});
test('100 is a bounded proof for 99+; eligibility is applied before saturation',async()=>{
 const view=trees([],Array.from({length:2000},(_,i)=>row(i)));
 let position,result;
 do{result=await scanFeedNews({...view,position,eligible:r=>Number(r.id.split('-')[1])%2===0,accept:rows=>rows});position=result.position;}while(result.state!=='ready');
 assert.equal(result.rows.length,100);assert.equal(result.capped,true);assert.equal(new Set(result.rows.map(r=>r.id)).size,100);
});
test('same IDs/counter-only edits and old restored sources are rejected by first-publication proof',async()=>{
 const view=trees([row(1)],[row(1,{likesCount:10}),row(2),row(3)]);
 const result=await scanFeedNews({...view,eligible:()=>true,accept:rows=>rows.filter(r=>r.id==='fixture-3')});
 assert.deepEqual(result.rows.map(r=>r.id),['fixture-3']);
});
test('detector model counts signal fanout despite local coalescing and conservatively handles boundary events',()=>{
 const burst=newsDetectionModel({publications:Array(100).fill(1000),signal:true,intervalMillis:2000});
 assert.equal(burst.probeRequests,1);assert.equal(burst.signalListenerReadModel,101);assert.equal(burst.signalDocumentWrites,100);
 assert.equal(newsDetectionModel({publications:[0,2000],signal:true,intervalMillis:2000}).probeRequests,2);
 assert.equal(newsDetectionModel({publications:[],intervalMillis:5000}).probeRequests,12);
 assert.throws(()=>newsDetectionModel({publications:[2,1],intervalMillis:5000}));
});
