import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restartDigest,validateRestartCleanup} from './feed_restart_cleanup.mjs';
function fixture(){
  const actors=[{uid:'personal',nickname:'Bright_Otter_182'},{uid:'business',nickname:'TestBusiness'}],runId='mvp-restart-123456789abc';
  const plan={project:'shoutout-dev-46c81',runId,createdAt:1000,expiresAt:86401000,actors,
    originals:Array.from({length:40},(_,i)=>({id:`original-${i}`,update:[1,0]})),requests:[{id:'pending',update:[1,0]}],
    incarnations:['feed-v1','feed-v2','feed-v3'].map(id=>({id,stamp:[1,0]})),rows:Array.from({length:50},(_,i)=>({
      id:`${runId}-${String(i+1).padStart(3,'0')}`,authorId:actors[i%2].uid,authorNickname:actors[i%2].nickname,
      title:`MVP restart 22.11. ${String(i+1).padStart(3,'0')}`,text:'Synthetic DEV restart check. Remove after verification.',
      location:{latitude:50.53+i*.00002,longitude:14.13},
    }))};return{phase:'seeded',plan,digest:restartDigest(plan)};
}
test('restart cleanup accepts only explicit immutable manifest and DEV',()=>{
  const state=fixture(),db={projectId:'shoutout-dev-46c81'};
  validateRestartCleanup(db,state);
  assert.throws(()=>validateRestartCleanup({projectId:'production'},state));
  assert.throws(()=>validateRestartCleanup(db,state,'0'.repeat(64)));
  state.plan.rows[0].id='someone-else';assert.throws(()=>validateRestartCleanup(db,state));
  state.digest=restartDigest(state.plan);assert.throws(()=>validateRestartCleanup(db,state));
});
test('restart cleanup rejects changed authors, titles and protected overlap even with recomputed digest',()=>{
  for(const change of [s=>s.plan.rows[0].authorId='foreign',s=>s.plan.rows[0].title='Other',s=>s.plan.originals[0].id=s.plan.rows[0].id]){
    const state=fixture();change(state);state.digest=restartDigest(state.plan);assert.throws(()=>validateRestartCleanup({projectId:state.plan.project},state));
  }
});
