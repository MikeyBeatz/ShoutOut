import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonical} from '../functions/feed_block_index.js';
import {lifecycleIndexMaps} from './content_lifecycle_index_plan.mjs';
import {collectArchiveIndexPlan,applyArchiveIndexPlan,validateArchiveIndexPlan,main} from './archive_dev_indexes.mjs';
const base='projects/shoutout-dev-46c81/databases/(default)/collectionGroups';
function fake(){
  const fields=new Map(),indexes=[],writes=[];
  for(const [collection,field]of [...lifecycleIndexMaps,['accessAudits','subjectUserIds']]){
    const name=`${base}/${collection}/fields/${field}`;
    fields.set(name,{name,ttlConfig:{state:'DISABLED'},indexConfig:{usesAncestorConfig:true,indexes:[
      {queryScope:'COLLECTION',fields:[{fieldPath:field,order:'ASCENDING'}],state:'READY'}]}});
  }
  const call=async(method,path,body)=>{
    if(method==='GET')return structuredClone(fields.get(path)??{indexes});
    writes.push({method,path,body});
    if(method==='PATCH')fields.set(path,{...fields.get(path),indexConfig:{...body.indexConfig,indexes:body.indexConfig.indexes.map(i=>({...i,state:'READY'}))}});
    else indexes.push({name:path+'/'+indexes.length,state:'READY',...body,fields:[...body.fields,{fieldPath:'__name__',order:body.fields.at(-1).order}]});
    return {name:'projects/shoutout-dev-46c81/databases/(default)/operations/test-'+writes.length};
  };
  return {fields,indexes,writes,call};
}
function resign(plan){delete plan.digest;plan.digest=createHash('sha256').update(canonical(plan)).digest('hex');return plan;}
test('exact eighteen operations preserve TTL and unrelated definitions; completion and lost response resume safely',async()=>{
  const f=fake(),p=await collectArchiveIndexPlan(f.call);assert.equal(validateArchiveIndexPlan(p,p.digest).length,18);
  let fail=true;
  const call=async(...args)=>{const result=await f.call(...args);if(args[0]==='PATCH'&&fail){fail=false;throw Error('lost-response');}return result;};
  await assert.rejects(applyArchiveIndexPlan(p,{approvedDigest:p.digest,call}),/lost-response/);
  assert.equal((await applyArchiveIndexPlan(p,{approvedDigest:p.digest,call:f.call})).submitted,17);
  assert.equal((await applyArchiveIndexPlan(p,{approvedDigest:p.digest,call:f.call})).submitted,0);
  assert.equal(f.writes.length,18);
  for(const field of f.fields.values())assert.deepEqual(field.ttlConfig,{state:'DISABLED'});
  const audit=f.fields.get(`${base}/accessAudits/fields/subjectUserIds`);assert.equal(audit.indexConfig.indexes.length,2);
});
test('unapproved changes, foreign inventory, digest and project mismatch cannot reach a mutation',async()=>{
  const f=fake(),p=await collectArchiveIndexPlan(f.call);
  const changed=structuredClone(p);changed.lifecycle.actions[0].body.indexConfig.indexes=[{queryScope:'COLLECTION_GROUP'}];resign(changed);
  assert.throws(()=>validateArchiveIndexPlan(changed,changed.digest),/unapproved-exemption/);
  await assert.rejects(applyArchiveIndexPlan(p,{approvedDigest:'a'.repeat(64),call:f.call}),/invalid-plan/);
  f.indexes.push({name:'projects/other/databases/(default)/collectionGroups/shouts/indexes/foreign'});
  await assert.rejects(applyArchiveIndexPlan(p,{approvedDigest:p.digest,call:f.call}),/foreign-index/);
  await assert.rejects(main(['apply','--project','production'],{connect(){assert.fail('network');}}),/explicit-dev/);
  assert.equal(f.writes.length,0);
});
