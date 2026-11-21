// Emulator-only fixtures/operation metering; never in the runtime import graph.
import {randomBytes,randomUUID} from 'node:crypto';
import {Timestamp,GeoPoint} from 'firebase-admin/firestore';
import {treeBuilder,metadataOf} from './feed_block_index.js';
import {cellGrid} from './feed_block_index_store.js';
import {publicCardState} from './feed_card_state.js';
import {createFeedRuntime,feedRuntimeBlockCache} from './feed_runtime.js';
import {getFeedDeltaOperation} from './feed_delta.js';
import {encodeGeohash} from './geohash.js';
import {Buffer} from 'node:buffer';
export function meterNewsDatabase(raw){
 const empty=()=>({reads:0,queries:0,writes:0,sourceReads:0,bytes:0,attempts:0,signalWrites:0});let metric=empty();
 const note=arg=>{const docs=Array.isArray(arg)?arg:arg.docs??[arg];metric.reads+=Math.max(1,docs.length);
  for(const doc of docs){if(doc.ref?.path.startsWith('shouts/'))metric.sourceReads++;metric.bytes+=Buffer.byteLength(JSON.stringify(doc.data?.()??null));}};
 const db=new Proxy(raw,{get(target,key){
  if(key==='runTransaction')return (run,...options)=>target.runTransaction(async real=>{metric.attempts++;
   const tx=new Proxy(real,{get(value,method){if(['get','getAll'].includes(method))return async(...args)=>{if(method==='get'&&!args[0]?.path)metric.queries++;const result=await value[method](...args);note(result);return result;};
    if(['set','update','create','delete'].includes(method))return(...args)=>{metric.writes++;if(args[0]?.path.includes('/publicationSignalLab/')||args[0]?.path.includes('/publicationHeads/'))metric.signalWrites++;value[method](...args);return tx;};return typeof value[method]==='function'?value[method].bind(value):value[method];}});
   return run(tx);
  },...options);
  if(key==='getAll')return async(...args)=>{const result=await target.getAll(...args);note(result);return result;};
  return typeof target[key]==='function'?target[key].bind(target):target[key];
 }});
 return {db,reset(){metric=empty();},snapshot:()=>({...metric})};
}
export async function newsFixture(db,t,count=50){
 if(db.projectId!=='shoutout-rules-test'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw new Error('news-lab-emulator-only');
 const uid=randomUUID(),generation='news-'+uid.slice(0,8),base=db.doc(`feedIndexGenerations/${generation}`),profile=db.doc(`users/${uid}`),control=db.doc('feedIndexControl/current');
 const point={latitude:50.08,longitude:14.44},key=randomBytes(32),originalIds=[],started=Date.now();
 const f={uid,generation,base,profile,control,point,key,now:started+10,rows:[],clock:()=>new Date(f.now)};
 f.row=(index,extra={})=>{const location=new GeoPoint(point.latitude+index/100000,point.longitude);
  return {id:`${uid}-${String(index).padStart(6,'0')}`,authorId:uid+'-writer',authorNickname:'News writer',title:`News ${index}`,text:'Synthetic news fixture.',
   location,geohash:encodeGeohash(location.latitude,location.longitude),status:'active',createdAt:Timestamp.fromMillis(started-1000),expiresAt:Timestamp.fromMillis(started+86400000),
   categories:['Dotaz'],likesCount:0,dislikesCount:0,commentsCount:0,savesCount:0,...extra};};
 f.rows=Array.from({length:count},(_,i)=>f.row(i));const builder=treeBuilder({cardProjection:true}),writes=[];
 for(const row of f.rows){originalIds.push(row.id);writes.push([db.doc(`shouts/${row.id}`),row],[base.collection('publicStates').doc(row.id),publicCardState(row.id,row)]);}
 for(const cell of new Set(f.rows.map(r=>r.geohash.slice(0,4)))){
  const root=builder.build(f.rows.filter(r=>r.geohash.startsWith(cell)).map(r=>metadataOf(r,{contentIdentity:true,cardProjection:true})),cell);
  writes.push([base.collection('cells').doc(cell),{v:1,hash:root.hash,minExpiry:root.minExpiry,revision:1,...cellGrid(cell)}]);
 }
 writes.push(...[...builder.writes].map(([hash,node])=>[base.collection('nodes').doc(hash),node]),
  [base,{v:2,schemaVersion:1,accountRetention:true,cardProjection:1,readIdentity:1,cardReady:true,erasureRevision:0,prunedThrough:-1}],
  [control,{schemaVersion:2,revision:1,mode:'active',readGenerationId:generation,writeGenerationIds:[generation],cardReadGenerationId:generation,cardWriteGenerationIds:[generation]}],
  [profile,{nickname:'News actor'}],[profile.collection('legal').doc('acceptance_2026_07_25'),{}]);
 for(let i=0;i<writes.length;i+=450){const batch=db.batch();writes.slice(i,i+450).forEach(([ref,data])=>batch.set(ref,data));await batch.commit();}
 t.after(async()=>{for(let i=0;i<originalIds.length;i+=450){const batch=db.batch();originalIds.slice(i,i+450).forEach(id=>batch.delete(db.doc(`shouts/${id}`)));await batch.commit();}
  await db.recursiveDelete(base);await db.recursiveDelete(profile);await control.delete();feedRuntimeBlockCache.clear();});
 f.request=data=>({auth:{uid,token:{email:'fixture@example.test',email_verified:true}},app:{appId:'news-emulator-fixture'},data:{format:'delta-v1',expectedUserId:uid,...data}});
 f.database=db;f.transfer={requests:0,requestBytes:0,responseBytes:0,maxCheckpointBytes:0};
 f.step=async(data,options={})=>{const request=f.request(data);const result=await getFeedDeltaOperation(request,f.database,{enabled:true,newsEnabled:true,key,clock:f.clock,...options});
  f.transfer.requests++;f.transfer.requestBytes+=Buffer.byteLength(JSON.stringify({data:request.data}));f.transfer.responseBytes+=Buffer.byteLength(JSON.stringify({result}));
  f.transfer.maxCheckpointBytes=Math.max(f.transfer.maxCheckpointBytes,Buffer.byteLength(result.checkpoint??''));return result;};
 f.page=async(context={})=>{let cursor;for(let n=0;n<32;n++){const result=await f.step(cursor?{cursor,cold:false}:{context:{point,radiusKm:50,order:'nearest',category:null,...context},cold:false});
  if(result.state==='ready')return result;cursor=result.next;}throw new Error('news-fixture-page-budget');};
 f.news=async(checkpoint,options={})=>{for(let n=0;n<64;n++){const result=await f.step({mode:'news',checkpoint},options);if(result.state==='ready')return result;checkpoint=result.checkpoint;}throw new Error('news-fixture-work-budget');};
 f.change=async(index,patch,{create=false,db:database=db,signal=false}={})=>{
  const row=f.rows[index]??f.row(index),ref=database.doc(`shouts/${row.id}`);if(create&&!originalIds.includes(row.id))originalIds.push(row.id);
  const runtime=createFeedRuntime(database,{getUser(){throw new Error('news-fixture-auth-forbidden');}},{cardStateEnabled:true});
  await runtime.database.runTransaction(async tx=>{const source=await tx.get(ref),before=source.exists?source.data():null;
   const after=patch===null?null:{...(before??row),...patch};
   const plan=await runtime.indexWriter.prepare(tx,row.id,before,after);
   const signalRef=base.collection('publicationSignalLab').doc((after??row).geohash.slice(0,4));
   const prior=signal&&!before&&after?await tx.get(signalRef):null;
   plan.apply();if(after)tx.set(ref,after);else tx.delete(ref);
   if(prior)tx.set(signalRef,{revision:(prior.get('revision')??0)+1});
  });return row.id;
 };
 return f;
}
