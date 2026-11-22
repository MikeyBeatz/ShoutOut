import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementLab,laboratoryPolicies,syntheticRows,simulate,reconcileAnchor} from './feed_movement_prototype.mjs';
const policy=laboratoryPolicies[0];
test('standing accuracy noise never starts another backend request',()=>{
  for(const p of laboratoryPolicies){const r=simulate({kind:'standing',radius:5000,policy:p});assert.equal(r.backendCalls,1);assert.equal(r.fixes,1201);assert.equal(r.publicationCutoffUnchanged,true);}
});
test('walking and train candidates remain bounded by cooldown and reduce per-fix requests',()=>{
  for(const kind of ['walk','train'])for(const p of laboratoryPolicies){const r=simulate({kind,radius:5000,policy:p});assert(r.backendCalls>1);assert(r.backendCalls<=Math.floor(r.durationMillis/p.minInterval)+1);assert(r.backendCalls<r.fixes/5);assert(r.visible<=50);assert(r.metadataCacheHits>0);}
});
test('spatial lower bounds return the same exact nearest page as an independent full sort',()=>{
  const rows=syntheticRows();
  for(const x of [-10000,0,5700,25000,49000])for(const radius of [1000,5000,50000]){
    const fix={x,y:400,at:0,accuracy:25},lab=new MovementLab(rows,{radius,policy});
    const expected=rows.map(r=>({...r,distance:Math.hypot(r.x-x,r.y-400)})).filter(r=>r.distance<=radius).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,50).map(r=>r.id);
    assert.deepEqual(lab.select(fix).map(r=>r.id),expected);
  }
});
test('new publications wait separately and geographic refresh never resets their cutoff',()=>{
  const rows=[{id:'old',x:200,y:0,createdAt:0,expiresAt:100000,version:1,text:'old'},{id:'new',x:250,y:0,createdAt:1000,expiresAt:100000,version:1,text:'new'}];
  const lab=new MovementLab(rows,{radius:1000,policy});lab.accept({x:0,y:0,at:0,accuracy:1});lab.accept({x:200,y:0,at:20000,accuracy:1});
  assert.deepEqual(lab.visible.map(r=>r.id),['old']);assert.equal(lab.pending({x:200,y:0,at:20000}),1);assert.equal(lab.cutoff,0);
});
test('out of range and expired cards disappear; missing fixes do not clear the committed list',()=>{
  const rows=[{id:'near',x:0,y:0,createdAt:0,expiresAt:15000,version:1,text:'expired'},{id:'far',x:2000,y:0,createdAt:0,expiresAt:100000,version:1,text:'far'}];
  const lab=new MovementLab(rows,{radius:1000,policy});lab.accept({x:0,y:0,at:0,accuracy:1});assert.deepEqual(lab.visible.map(r=>r.id),['near']);
  assert.equal(lab.accept({x:NaN,y:0,at:1000,accuracy:1}),false);assert.deepEqual(lab.visible.map(r=>r.id),['near']);
  lab.accept({x:2000,y:0,at:20000,accuracy:1});assert.deepEqual(lab.visible.map(r=>r.id),['far']);assert.equal(lab.accept({x:0,y:0,at:1000,accuracy:1}),false);
});
test('anchor survives insertion above it, and removal falls forward deterministically',()=>{
  const rows=ids=>ids.map(id=>({id})),anchor={id:'b',offset:17};
  assert.deepEqual(reconcileAnchor(rows(['a','b','c']),rows(['x','a','b','c']),anchor),{id:'b',index:2,offset:17});
  assert.deepEqual(reconcileAnchor(rows(['a','b','c']),rows(['x','c']),anchor),{id:'c',index:1,offset:0});
  assert.deepEqual(reconcileAnchor(rows(['a','b','c']),[],anchor),{id:null,index:-1,offset:0});
});
test('unchanged metadata and bodies are reused on later geographic requests',()=>{
  const lab=new MovementLab(syntheticRows(),{radius:5000,policy});lab.accept({x:0,y:0,at:0,accuracy:1});
  const first={...lab.stats};lab.accept({x:1000,y:0,at:20000,accuracy:1});lab.accept({x:0,y:0,at:40000,accuracy:1});
  const before={...lab.stats};lab.accept({x:1000,y:0,at:60000,accuracy:1});
  assert.equal(lab.stats.modeledBodyLoads,before.modeledBodyLoads);assert.equal(lab.stats.modeledMetadataBlockLoads,before.modeledMetadataBlockLoads);assert(lab.stats.metadataCacheHits>first.metadataCacheHits);
});
