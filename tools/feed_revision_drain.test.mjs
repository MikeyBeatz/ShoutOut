import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyB4RevisionDrain,b4WriterFunctions} from './feed_revision_drain.mjs';
function fixture(){
  const before=b4WriterFunctions.map(name=>({name,state:'ACTIVE',revision:name+'-old',service:'projects/shoutout-dev-46c81/locations/europe-west3/services/'+name.toLowerCase(),memory:'256Mi',max:1,min:0,concurrency:1,timeout:15}));
  const after=before.map(f=>({...f,revision:f.name+'-new'}));
  const services=after.map(f=>({name:f.service,latestReadyRevision:f.revision,trafficStatuses:[{revision:f.revision,percent:100}]}));
  const revisions=Object.fromEntries(before.map(f=>[f.name.toLowerCase(),[{name:f.revision,conditions:[{type:'Active',state:'CONDITION_FAILED',revisionReason:'RETIRED'}]}]]));
  return {before,after,services,revisions};
}
test('drain requires server-reported retired infrastructure, new traffic and unchanged resources',()=>{
  const f=fixture();assert.equal(verifyB4RevisionDrain('shoutout-dev-46c81',f.before,f.after,f.services,f.revisions).functions.length,10);
  for(const modify of [f=>{f.services[0].trafficStatuses[0].percent=99;},f=>{f.revisions.createshout[0].conditions[0].state='CONDITION_SUCCEEDED';},f=>{f.revisions.createshout=[];},f=>{f.after[0].max=2;},f=>{f.after[0].revision=f.before[0].revision;}]){
    const bad=fixture();modify(bad);assert.throws(()=>verifyB4RevisionDrain('shoutout-dev-46c81',bad.before,bad.after,bad.services,bad.revisions));
  }
  assert.throws(()=>verifyB4RevisionDrain('shoutout-production-a1b34',f.before,f.after,f.services,f.revisions));
});
