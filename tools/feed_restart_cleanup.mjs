// Scoped cleanup of the existing 22 November restart manifest. No seeding.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical} from '../functions/feed_block_index.js';
import {createFeedRuntime} from '../functions/feed_runtime.js';
import {readBucketId,readKey,readContentHash,validateReadBlock} from '../functions/read_sync_blocks.js';
import {assertNewsOriginals,assertNewsRelease,newsProject} from './feed_news_activation.mjs';
import {inspectTransitionRelease} from './feed_generation_transition.mjs';
import {feedAdminDatabase} from './feed_admin_database.mjs';
const stamp=t=>[t.seconds,t.nanoseconds];
export const restartDigest=plan=>createHash('sha256').update(canonical(plan)).digest('hex');
export function validateRestartCleanup(db,state,approved=state.digest){
  assert(db.projectId===newsProject||db.projectId==='shoutout-rules-test'&&process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080','restart-cleanup-dev-required');
  const p=state.plan;
  assert.equal(state.digest,approved,'restart-cleanup-approved-digest');assert.equal(restartDigest(p),approved,'restart-cleanup-plan-drift');
  assert.equal(p.project,db.projectId);assert(/^mvp-restart-[a-f0-9]{12}$/.test(p.runId));
  assert.deepEqual(p.actors.map(a=>a.nickname),['Bright_Otter_182','TestBusiness']);
  assert(p.actors.every(a=>typeof a.uid==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(a.uid)));
  assert.equal(new Set(p.actors.map(a=>a.uid)).size,2);
  assert.equal(p.expiresAt,p.createdAt+86400000);assert(Number.isSafeInteger(p.createdAt)&&p.createdAt>0);
  assert.equal(p.rows.length,50);assert(['seeded','cleaning','cleaned'].includes(state.phase));
  if(db.projectId===newsProject){assert.equal(p.originals.length,40);assert.equal(p.requests.length,1);assert.equal(p.incarnations.length,3);}
  p.rows.forEach((row,i)=>{
    assert.equal(row.id,`${p.runId}-${String(i+1).padStart(3,'0')}`);
    assert.equal(row.authorId,p.actors[i%2].uid);assert.equal(row.authorNickname,p.actors[i%2].nickname);
    assert.equal(row.title,`MVP restart 22.11. ${String(i+1).padStart(3,'0')}`);
    assert.equal(row.text,'Synthetic DEV restart check. Remove after verification.');
    assert.deepEqual(row.location,{latitude:50.53+i*.00002,longitude:14.13});
    assert(!p.originals.some(old=>old.id===row.id));
  });
}
async function fence(tx,db,p){
  await assertNewsOriginals(tx,db,p);
  const refs=[db.doc('feedIndexControl/current'),...p.incarnations.map(row=>db.doc(`feedIndexGenerations/${row.id}`))];
  const docs=await tx.getAll(...refs);assert.deepEqual(docs[0].data(),p.control,'restart-cleanup-control-drift');
  docs.slice(1).forEach((doc,i)=>{assert(doc.exists);assert.deepEqual(stamp(doc.createTime),p.incarnations[i].stamp,'restart-cleanup-incarnation-drift');});
}
async function sourcePlan(tx,db,p,row){
  const ref=db.doc(`shouts/${row.id}`),doc=await tx.get(ref),actors=new Set(p.actors.map(a=>a.uid));
  if(doc.exists){
    for(const key of ['title','text','authorId','authorNickname'])assert.equal(doc.get(key),row[key],'restart-cleanup-foreign-source');
    assert.equal(doc.get('createdAt').toMillis(),p.createdAt);assert.equal(doc.get('expiresAt').toMillis(),p.expiresAt);
    assert.equal(doc.get('location').latitude,row.location.latitude);assert.equal(doc.get('location').longitude,row.location.longitude);
  }
  const children=[];
  for(const name of ['comments','privateReplies','saves','reactions']){
    const rows=await tx.get(ref.collection(name).limit(3));
    if(['comments','privateReplies'].includes(name))assert(rows.empty,'restart-cleanup-conversation-present');
    else{assert(rows.size<=2);for(const child of rows.docs){assert(actors.has(child.id),'restart-cleanup-foreign-interaction');children.push(child);}}
  }
  const receipts=await tx.get(db.collection('serverOperations').where('shoutId','==',row.id).limit(41));
  assert(receipts.size<=40);assert(receipts.docs.every(d=>actors.has(d.get('userId'))),'restart-cleanup-foreign-operation');
  // Receipts retain their own seven-day lifecycle, including after fixture removal.
  const alerts=await tx.getAll(...p.actors.flatMap(a=>['like','dislike'].map(kind=>db.doc(`users/${a.uid}/notifications/reaction_${kind}_${row.id}`))));
  children.push(...alerts.filter(d=>d.exists));return{doc,children};
}
async function removeReads(db,p,actor){
  return db.runTransaction(async tx=>{
    await fence(tx,db,p);
    const meta=db.doc(`users/${actor.uid}/readState/current`),prior=await tx.get(meta),revision=(prior.get('revision')??0)+1;
    assert(Number.isSafeInteger(revision)&&revision>0);
    const nodes=new Map(),changed=new Map();let removed=0;
    for(const row of p.rows){
      const contentHash=readContentHash(row.title,row.text),key=readKey(row.id,contentHash),day=Math.floor(p.expiresAt/86400000);
      const bits=[...key].map(c=>parseInt(c,16).toString(2).padStart(4,'0')).join('');let prefix='',required=false;
      for(;;){
        const id=readBucketId(day,prefix);
        if(!nodes.has(id)){assert(nodes.size<100,'restart-cleanup-read-budget');nodes.set(id,(await tx.get(db.doc(`users/${actor.uid}/readBuckets/${id}`))).data()??null);}
        const node=nodes.get(id);if(!node){assert(!required);break;}validateReadBlock(node,day,prefix);
        if(node.kind==='branch'){prefix+=bits[prefix.length];required=true;continue;}
        const entry=node.entries[key];if(entry){
          assert.equal(entry.shoutId,row.id);assert.equal(entry.contentHash,contentHash);assert.equal(entry.expiresAt,p.expiresAt);
          const entries={...node.entries};delete entries[key];const next={...node,revision,entries};validateReadBlock(next,day,prefix);
          nodes.set(id,next);changed.set(id,next);removed++;
        }break;
      }
    }
    for(const[id,node]of changed)tx.set(db.doc(`users/${actor.uid}/readBuckets/${id}`),node);
    if(changed.size)tx.set(meta,{v:1,revision});return removed;
  });
}
export async function cleanupRestart(db,state,{dryRun=false,approvedDigest=state.digest}={}){
  validateRestartCleanup(db,state,approvedDigest);const p=state.plan;
  // Check every fixture before the first mutation, then recheck each batch.
  let candidates=0;
  for(const row of p.rows){
    const names=await db.doc(`shouts/${row.id}`).listCollections();
    assert(names.every(c=>['comments','privateReplies','saves','reactions'].includes(c.id)),'restart-cleanup-unexpected-descendants');
  }
  await db.runTransaction(async tx=>{candidates=0;await fence(tx,db,p);for(const row of p.rows)candidates+=Number((await sourcePlan(tx,db,p,row)).doc.exists);},{readOnly:true});
  if(dryRun)return{candidates,cloudWrites:0,originalsPreserved:p.originals.length,requestsPreserved:p.requests.length};
  const runtime=createFeedRuntime(db,{getUser(){throw Error('restart-cleanup-auth-forbidden');}},{newsRuntimeEnabled:true});let removed=0;
  for(let i=0;i<p.rows.length;i+=10){
    removed+=await runtime.database.runTransaction(async tx=>{
      await fence(tx,db,p);const plans=[];for(const row of p.rows.slice(i,i+10))plans.push(await sourcePlan(tx,db,p,row));
      const children=plans.flatMap(plan=>plan.children),changes=plans.filter(plan=>plan.doc.exists).map(plan=>({id:plan.doc.id,before:plan.doc.data(),after:null}));
      const index=await runtime.indexWriter.prepareBatch(tx,changes,{additionalWrites:children.length});
      index.apply();for(const plan of plans)if(plan.doc.exists)tx.delete(plan.doc.ref);for(const child of children)tx.delete(child.ref);return changes.length;
    });
  }
  let readKeys=0;for(const actor of p.actors)readKeys+=await removeReads(db,p,actor);
  await assertNewsOriginals(db,db,p);return{removed,readKeys,originalsPreserved:p.originals.length,requestsPreserved:p.requests.length,authMutations:0};
}
export async function main(argv){
  delete process.env.DEBUG;
  const[action,...args]=argv,o={};assert(['dry-run','cleanup'].includes(action),'restart-cleanup-explicit-action');
  for(let i=0;i<args.length;i+=2){assert(['--project','--state','--approved-digest','--confirm-project','--ci-run'].includes(args[i])&&args[i+1]&&!Object.hasOwn(o,args[i]));o[args[i]]=args[i+1];}
  assert.equal(o['--project'],newsProject);const file=resolve(o['--state']??''),rel=relative(process.cwd(),file);
  assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel),'restart-cleanup-workspace-state');
  const state=JSON.parse(readFileSync(file,'utf8'));
  if(action==='cleanup'){
    assert.equal(o['--confirm-project'],newsProject);
    assert(/^[a-f0-9]{64}$/.test(o['--approved-digest']??''),'restart-cleanup-explicit-digest');
    assert(/^\d+$/.test(o['--ci-run']??''),'restart-cleanup-explicit-ci');
    assertNewsRelease(newsProject,inspectTransitionRelease(o));
  }
  const db=await feedAdminDatabase(newsProject);
  try{
    const result=await cleanupRestart(db,state,{dryRun:action==='dry-run',approvedDigest:o['--approved-digest']});
    if(action==='cleanup')writeFileSync(file,JSON.stringify({...state,phase:'cleaned',cleanup:result},null,2)+'\n');
    return result;
  }finally{await db.terminate();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2))
  .then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('restart-cleanup-failed-see-local-checks');process.exitCode=1;});
