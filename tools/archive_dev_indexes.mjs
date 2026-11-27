// Selective DEV index executor. No TTL, deletion or whole-file Firebase deploy.
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical} from '../functions/feed_block_index.js';
import {lifecycleIndexMaps,lifecycleCompositeIndexes,planLifecycleIndexes} from './content_lifecycle_index_plan.mjs';
import {archiveIdentityCompositeIndexes,planArchiveIdentityIndexes} from './archive_identity_index_plan.mjs';
import {assertLifecycleTransitionRelease} from './content_lifecycle_transition.mjs';
import {inspectTransitionRelease} from './feed_generation_transition.mjs';
const project='shoutout-dev-46c81',base=`projects/${project}/databases/(default)/collectionGroups`,root=resolve(import.meta.dirname,'..');
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const fail=code=>{throw Error(`archive-index-${code}`);};
export async function collectArchiveIndexPlan(call){
  const snapshots={};
  for(const [collection,field]of [...lifecycleIndexMaps,['accessAudits','subjectUserIds']]){
    const path=`${collection}/fields/${field}`;snapshots[path]={status:200,data:await call('GET',`${base}/${path}`)};
  }
  for(const collection of new Set([...lifecycleCompositeIndexes,...archiveIdentityCompositeIndexes].map(i=>i.collection))){
    let token=null;const indexes=[];
    for(let page=0;;page++){
      if(page>=100)fail('inventory-budget');
      const value=await call('GET',`${base}/${collection}/indexes`,null,token?{pageToken:token}:{});
      for(const item of value.indexes??[]){
        if(typeof item.name!=='string'||!item.name.startsWith(base+'/'))fail('foreign-index');
        if(item.name.startsWith(`${base}/${collection}/indexes/`))indexes.push(item);
      }
      token=value.nextPageToken;if(!token)break;
    }
    snapshots[`${collection}/indexes`]={status:200,data:{indexes}};
  }
  const lifecycle=planLifecycleIndexes(project,snapshots),identity=planArchiveIdentityIndexes(project,snapshots);
  const value={v:1,projectId:project,changesTTL:false,lifecycle,identity};return {...value,digest:hash(value)};
}
export function validateArchiveIndexPlan(plan,digest){
  const {digest:saved,...value}=plan??{};
  if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest)||saved!==digest||hash(value)!==digest||
      value.v!==1||value.projectId!==project||value.changesTTL!==false||
      value.lifecycle?.changesTTL!==false||value.identity?.changesTTL!==false)fail('invalid-plan');
  const actions=[...(value.lifecycle.actions??[]),...(value.identity.actions??[])];
  const catalogSize=lifecycleIndexMaps.length+lifecycleCompositeIndexes.length+archiveIdentityCompositeIndexes.length+1;
  if(actions.length>catalogSize||new Set(actions.map(a=>a.method+':'+a.resource+(a.method==='POST'?':'+hash(a.body):''))).size!==actions.length||actions.some(action=>
    !['POST','PATCH'].includes(action.method)||!action.resource?.startsWith(base+'/')||
    action.method==='PATCH'&&(action.updateMask!=='indexConfig'||Object.keys(action.body??{}).sort().join(',')!=='indexConfig,name')||
    action.method==='POST'&&(Object.keys(action.body??{}).sort().join(',')!=='fields,queryScope')))fail('invalid-actions');
  for(const action of actions){
    if(action.method==='POST'){
      if(![...lifecycleCompositeIndexes,...archiveIdentityCompositeIndexes].some(({collection,...spec})=>
        action.resource===`${base}/${collection}/indexes`&&canonical(action.body)===canonical(spec)))fail('unapproved-composite');
    }else if(lifecycleIndexMaps.some(([collection,field])=>action.resource===`${base}/${collection}/fields/${field}`)){
      if(canonical(action.body)!==canonical({name:action.resource,indexConfig:{indexes:[]}}))fail('unapproved-exemption');
    }else{
      if(action.resource!==`${base}/accessAudits/fields/subjectUserIds`||!Array.isArray(action.before?.indexes))fail('unapproved-field');
      const indexes=action.before.indexes.map(index=>({queryScope:index.queryScope,fields:index.fields}));
      indexes.push({queryScope:'COLLECTION_GROUP',fields:[{fieldPath:'subjectUserIds',arrayConfig:'CONTAINS'}]});
      if(canonical(action.body)!==canonical({name:action.resource,indexConfig:{indexes}}))fail('audit-index-replacement');
    }
  }
  return actions;
}
export async function applyArchiveIndexPlan(plan,{approvedDigest,call}={}){
  const approved=validateArchiveIndexPlan(plan,approvedDigest),current=await collectArchiveIndexPlan(call);
  const remaining=[...current.lifecycle.actions,...current.identity.actions];
  // Reconstruct desired operations with the same pure planners. Completed
  // actions disappear on restart; a new/different action never gets authority.
  if(remaining.some(action=>!approved.some(old=>canonical(old)===canonical(action))))fail('snapshot-drift');
  const operations=[];
  for(const action of remaining){
    const result=await call(action.method,action.resource,action.body,action.method==='PATCH'?{updateMask:'indexConfig'}:{});
    if(result?.name)operations.push(result.name);
  }
  return {projectId:project,submitted:remaining.length,operations,changesTTL:false};
}
async function transport(){
  const require=createRequire(resolve(root,'tools/package.json')),cli=require('firebase-tools/lib/auth.js');
  const account=cli.getGlobalDefaultAccount();if(!account?.tokens?.refresh_token)fail('existing-auth-required');
  const token=await cli.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  return async(method,path,body=null,params={})=>{
    if(!path.startsWith(base+'/'))fail('explicit-dev-path-required');
    const url=new URL(`https://firestore.googleapis.com/v1/${path}`);for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
    const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)fail(`http-${response.status}`);return response.json();
  };
}
function local(path){const full=resolve(root,path??''),rel=relative(root,full);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail('workspace-file-required');return full;}
export async function main(argv,{connect=transport,inspectRelease=inspectTransitionRelease}={}){
  delete process.env.DEBUG;const [action,...args]=argv,o={};if(!['plan','apply'].includes(action)||args.length%2)fail('explicit-action');
  const allowed=action==='plan'?['--project','--output']:['--project','--plan','--approved-digest','--confirm-project','--ci-run'];
  for(let n=0;n<args.length;n+=2){if(!allowed.includes(args[n])||!args[n+1]||args[n+1].startsWith('--')||Object.hasOwn(o,args[n]))fail('invalid-options');o[args[n]]=args[n+1];}
  if(o['--project']!==project)fail('explicit-dev-required');
  if(action==='apply'){
    if(o['--confirm-project']!==project||!/^\d+$/.test(o['--ci-run']??''))fail('explicit-ci-required');
    const plan=JSON.parse(readFileSync(local(o['--plan']),'utf8'));validateArchiveIndexPlan(plan,o['--approved-digest']);
    assertLifecycleTransitionRelease(project,inspectRelease(o));return applyArchiveIndexPlan(plan,{approvedDigest:o['--approved-digest'],call:await connect()});
  }
  const file=local(o['--output']),plan=await collectArchiveIndexPlan(await connect());mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});return {projectId:project,file,digest:plan.digest,actions:plan.lifecycle.actions.length+plan.identity.actions.length,writes:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result)))
  .catch(error=>{console.error(/^archive-index-/.test(error.message)?error.message:'archive-index-command-failed');process.exitCode=1;});
