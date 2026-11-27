// One approved DEV exception. No recursive deletion, seeding or inferred dates.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Timestamp,FieldPath} from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import {canonical} from '../functions/feed_block_index.js';
import {createFeedRuntime} from '../functions/feed_runtime.js';
import {operationRetryWindowMillis} from '../functions/operation_retention.js';
import {assertLifecycleTransitionRelease} from './content_lifecycle_transition.mjs';
import {inspectTransitionRelease} from './feed_generation_transition.mjs';
import {feedAdminDatabase} from './feed_admin_database.mjs';

export const legacyArchiveRoots=Object.freeze([
  '1598dfc9f1955190670fd25fe2485dc830d473c2e9aa73f94ac5081cba4244e7',
  '1b311a4c980bcd343ad1a5337274aa49e07c8d93acf7b6b76dc195c8cb6b34b1',
  '3e9b9eec52ecf775aa47b8d418dda888e6afe82ebaec6f5a912fb93d142f44f7',
  '5e1d6e642a6e8a93bf0f80a29be3b9a5568d5b33db75394b5ad7573b807d2105',
  '81c63a7efbdc089072a6deae497b133f8d7293f4624a82b92dca386360a03ff0',
  '99354ec09f2dbd3f0fbcd5c61013fb4078990aa5ac73299a482706efb3e8ff61',
  'c3d23b6cddac99cbb92092e9612bedc51667abbb91a2fc7e307f106df6d9f5f5',
  'mvp_delete_82492300eb2643b5b751bd598d0782c8',
  'mvp_rating_negative_20261031','mvp_rating_regular_20261031','mvp_shout_delete_20261031_business',
]);
const project='shoutout-dev-46c81',root=resolve(import.meta.dirname,'..');
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const stamp=t=>t instanceof Timestamp?[t.seconds,t.nanoseconds]:null;
const row=doc=>({path:doc.ref.path,born:stamp(doc.createTime),updated:stamp(doc.updateTime),hash:hash(doc.data())});
const fail=code=>{throw new Error(`archive-legacy-${code}`);};
function target(db){
  if(db.projectId!==project&&!(db.projectId==='shoutout-rules-test'&&process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080'))fail('dev-required');
}
async function noCollections(db){
  for(const id of legacyArchiveRoots)if((await db.doc(`shouts/${id}`).listCollections()).length)fail('descendants-present');
}
async function inspect(tx,db){
  const control=await tx.get(db.doc('contentLifecycleControl/current'));
  if(control.exists)fail('pre-capture-only');
  const feed=await tx.get(db.doc('feedIndexControl/current'));
  if(!feed.exists)fail('feed-required');
  const ids=feed.get('writeGenerationIds');
  if(!Array.isArray(ids)||!ids.length||ids.length>4||ids.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(id)))fail('feed-required');
  const generations=await tx.getAll(...ids.map(id=>db.doc(`feedIndexGenerations/${id}`)));
  if(generations.some(doc=>!doc.exists))fail('generation-required');
  const roots=await tx.getAll(...legacyArchiveRoots.map(id=>db.doc(`shouts/${id}`)));
  for(const doc of roots){
    if(!doc.exists||doc.get('status')!=='deleted'||typeof doc.get('title')!=='string'||!doc.get('title').startsWith('MVP')||
        doc.get('contentArchiveKey')!==undefined||doc.get('contentPurged')===true)fail('source-unproven');
    for(const name of ['comments','privateReplies','saves','reactions'])if(!(await tx.get(doc.ref.collection(name).limit(1))).empty)fail('descendants-present');
  }
  for(const [name,key]of [['serverOperations','shoutId'],['reports','shoutId'],['commentReports','shoutId'],['privateReplyReports','shoutId'],
    ['sanctions','sourceContentId'],['sanctions','contentSnapshot.shoutId']]){
    if(!(await tx.get(db.collection(name).where(key,'in',legacyArchiveRoots).limit(1))).empty)fail('related-evidence-present');
  }
  // Complete bounded baseline, including the original pending request. Only
  // hashes and SDK versions leave RAM; new/different records stop the batch.
  const protectedRows=[];
  for(const name of ['shouts','comments','privateReplies','accountDeletionRequests']){
    const query=['comments','privateReplies'].includes(name)?db.collectionGroup(name):db.collection(name);
    const page=await tx.get(query.orderBy(FieldPath.documentId()).limit(201));
    if(page.size>200||protectedRows.length+page.size>200)fail('baseline-budget');
    protectedRows.push(...page.docs.filter(doc=>!legacyArchiveRoots.some(id=>doc.ref.path===`shouts/${id}`)).map(row));
  }
  return {roots,baseline:{feed:row(feed),generations:generations.map(row),sources:roots.map(row),protected:protectedRows}};
}
export async function planLegacyArchiveCleanup(db){
  target(db);await noCollections(db);
  return db.runTransaction(async tx=>{
    const {baseline}=await inspect(tx,db);
    const plan={v:1,kind:'approved-legacy-archive-cleanup',projectId:db.projectId,...baseline};
    return {...plan,digest:hash(plan)};
  },{readOnly:true});
}
export function validateLegacyArchiveCleanup(plan,projectId,approvedDigest){
  const {digest,...value}=plan??{};
  if(typeof approvedDigest!=='string'||!/^[a-f0-9]{64}$/.test(approvedDigest)||digest!==approvedDigest||hash(value)!==digest||
    value.v!==1||value.kind!=='approved-legacy-archive-cleanup'||value.projectId!==projectId||
    Object.keys(value).sort().join(',')!=='feed,generations,kind,projectId,protected,sources,v'||
    !Array.isArray(value.sources)||canonical(value.sources.map(s=>s.path))!==canonical(legacyArchiveRoots.map(id=>`shouts/${id}`))||
    !Array.isArray(value.generations)||!Array.isArray(value.protected)||value.protected.length>200)fail('invalid-plan');
  return value;
}
export async function applyLegacyArchiveCleanup(db,plan,{approvedDigest,indexWriter,clock=()=>new Date()}={}){
  target(db);const value=validateLegacyArchiveCleanup(plan,db.projectId,approvedDigest);
  if(typeof indexWriter?.prepareBatch!=='function')fail('index-writer-required');
  await noCollections(db);
  return db.runTransaction(async tx=>{
    const receipt=db.doc(`serverOperations/archive_legacy_${plan.digest}`),prior=await tx.get(receipt);
    if(prior.exists){
      if(prior.get('action')!=='cleanupLegacyArchiveFixtures'||prior.get('fingerprint')!==plan.digest||
          prior.get('actorKind')!=='operator'||prior.get('userId')!=='dev-archive-operator')fail('receipt-drift');
      const absent=await tx.getAll(...legacyArchiveRoots.map(id=>db.doc(`shouts/${id}`)));
      if(absent.some(doc=>doc.exists))fail('source-recreated');
      return {state:'already-applied',removed:0,receiptPreserved:true};
    }
    const current=await inspect(tx,db);
    const expected={feed:value.feed,generations:value.generations,sources:value.sources,protected:value.protected};
    if(canonical(current.baseline)!==canonical(expected))fail('baseline-drift');
    const now=Timestamp.fromDate(clock());
    const index=await indexWriter.prepareBatch(tx,current.roots.map(doc=>({id:doc.id,before:doc.data(),after:null})),{additionalWrites:1});
    if(typeof index?.apply!=='function')fail('index-plan-required');
    index.apply();for(const doc of current.roots)tx.delete(doc.ref);
    tx.create(receipt,{action:'cleanupLegacyArchiveFixtures',actorKind:'operator',userId:'dev-archive-operator',
      fingerprint:plan.digest,keyVersion:1,createdAt:now,expiresAt:Timestamp.fromMillis(now.toMillis()+operationRetryWindowMillis),
      result:{removed:legacyArchiveRoots.length}});
    return {state:'applied',removed:legacyArchiveRoots.length,protected:current.baseline.protected.length,authMutations:0};
  });
}
function local(path){const full=resolve(root,path??''),rel=relative(root,full);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail('workspace-file-required');return full;}
export function parseLegacyArchiveCleanup(argv){
  const [action,...rest]=argv,options={};
  if(!['plan','apply'].includes(action)||rest.length%2)fail('explicit-action');
  const allowed=action==='plan'?['--project','--output']:['--project','--plan','--approved-digest','--confirm-project','--ci-run'];
  for(let n=0;n<rest.length;n+=2){if(!allowed.includes(rest[n])||!rest[n+1]||rest[n+1].startsWith('--')||Object.hasOwn(options,rest[n]))fail('invalid-options');options[rest[n]]=rest[n+1];}
  if(options['--project']!==project)fail('explicit-dev-required');
  local(options[action==='plan'?'--output':'--plan']);
  if(action==='apply'&&(options['--confirm-project']!==project||!/^\d+$/.test(options['--ci-run']??'')||!/^[a-f0-9]{64}$/.test(options['--approved-digest']??'')))fail('explicit-ci-and-digest-required');
  return {action,options};
}
export async function main(argv,{openDatabase=feedAdminDatabase,inspectRelease=inspectTransitionRelease}={}){
  delete process.env.DEBUG;const {action,options}=parseLegacyArchiveCleanup(argv);
  const plan=action==='apply'?JSON.parse(readFileSync(local(options['--plan']),'utf8')):null;
  if(plan){validateLegacyArchiveCleanup(plan,project,options['--approved-digest']);assertLifecycleTransitionRelease(project,inspectRelease(options));}
  const db=await openDatabase(project);
  try{
    if(action==='plan'){
      const prepared=await planLegacyArchiveCleanup(db),file=local(options['--output']);mkdirSync(dirname(file),{recursive:true});
      writeFileSync(file,JSON.stringify(prepared,null,2)+'\n',{flag:'wx'});return {projectId:project,file,digest:prepared.digest,writes:0};
    }
    const rt=createFeedRuntime(db,{getUser(){fail('auth-forbidden');}},{contentLifecycleEnabled:false,contentCaptureEnabled:false,contentMaintenanceEnabled:false});
    return await applyLegacyArchiveCleanup(rt.database,plan,{approvedDigest:options['--approved-digest'],indexWriter:rt.indexWriter});
  }finally{await db.terminate();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result)))
  .catch(error=>{console.error(/^archive-legacy-/.test(error.message)?error.message:'archive-legacy-command-failed');process.exitCode=1;});
