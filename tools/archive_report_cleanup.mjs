// Approved exception for three resolved synthetic reports; never a retention API.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Timestamp,FieldPath} from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import {canonical} from '../functions/feed_block_index.js';
import {lifecycleControlUsable} from '../functions/content_lifecycle.js';
import {operationRetryWindowMillis} from '../functions/operation_retention.js';
import {assertLifecycleTransitionRelease} from './content_lifecycle_transition.mjs';
import {inspectTransitionRelease} from './feed_generation_transition.mjs';
import {feedAdminDatabase} from './feed_admin_database.mjs';

export const legacyReportParent='99bd5d1915148c82993c3c1eca32ba6a497523ab923762750c5db0c6e9c7304d';
const comment='e3890ee74e86a14cc708510abfc0e6b36eb317203ecea391757d2a9d85b57ab8';
const reply='8dee0e3cc945f9d32df03a024207dd9700e29fb0aa536743fc6de15805dde510';
export const legacyReportFixtures=Object.freeze([
  Object.freeze({path:`reports/it_business_${legacyReportParent}`,kind:'shout'}),
  Object.freeze({path:`commentReports/it_moderator_${legacyReportParent}_${comment}`,kind:'comment',child:comment}),
  Object.freeze({path:`privateReplyReports/mvp_modbiz_f794f930926a31d2_${legacyReportParent}_${reply}`,kind:'privateReply',child:reply}),
]);
const project='shoutout-dev-46c81',root=resolve(import.meta.dirname,'..');
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const stamp=t=>t instanceof Timestamp?[t.seconds,t.nanoseconds]:null;
const row=d=>({path:d.ref.path,born:stamp(d.createTime),updated:stamp(d.updateTime),hash:hash(d.data())});
const fail=code=>{throw Error(`archive-reports-${code}`);};
function target(db){if(db.projectId!==project&&!(db.projectId==='shoutout-rules-test'&&process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080'))fail('dev-required');}
async function noChildren(db){for(const f of legacyReportFixtures)if((await db.doc(f.path).listCollections()).length)fail('report-descendants-present');}
async function inspect(tx,db){
  const control=await tx.get(db.doc('contentLifecycleControl/current'));
  if(!lifecycleControlUsable(control,{allowPaused:true})||!(control.get('captureFenceAt') instanceof Timestamp)||
    !/^[a-f0-9]{40}$/.test(control.get('compatibleWriterCommit')??'')||!Number.isSafeInteger(control.get('legacyRevision'))||
    control.get('legacyRevision')<0||control.get('legacyRevision')>=Number.MAX_SAFE_INTEGER)fail('capture-fence-required');
  const reports=await tx.getAll(...legacyReportFixtures.map(f=>db.doc(f.path)));
  for(let n=0;n<reports.length;n++){
    const d=reports[n],f=legacyReportFixtures[n];
    if(!d.exists||d.get('status')!=='resolved'||d.get('shoutId')!==legacyReportParent||
      d.get('reason')!==`MVP modbiz 926a31d2 ${f.kind}. Remove after verification.`||
      f.kind==='comment'&&d.get('commentId')!==f.child||f.kind==='privateReply'&&d.get('privateReplyId')!==f.child||
      d.get('contentArchiveKey')!==undefined)fail('unproven-fixture');
  }
  // Full bounded hash/SDK baseline. Texts, contacts and credentials stay in RAM.
  // Query reads also fence concurrent changes or insertions before the commit.
  const protectedRows=[];
  for(const name of ['shouts','comments','privateReplies','reports','commentReports','privateReplyReports',
    'sanctions','serverOperations','accountDeletionRequests','contentLifecycleArchive','contentLifecycleThreads']){
    const q=['comments','privateReplies'].includes(name)?db.collectionGroup(name):db.collection(name);
    const page=await tx.get(q.orderBy(FieldPath.documentId()).limit(201));
    if(page.size>200||protectedRows.length+page.size>500)fail('baseline-budget');
    protectedRows.push(...page.docs.filter(d=>!legacyReportFixtures.some(f=>f.path===d.ref.path)).map(row));
  }
  if(!protectedRows.some(r=>r.path===`shouts/${legacyReportParent}`))fail('parent-required');
  return {control,reports,baseline:{control:row(control),reports:reports.map(row),protected:protectedRows}};
}
export async function planLegacyReportCleanup(db){
  target(db);await noChildren(db);
  return db.runTransaction(async tx=>{
    const {baseline}=await inspect(tx,db),p={v:1,kind:'approved-resolved-mvp-reports-cleanup',projectId:db.projectId,...baseline};
    return {...p,digest:hash(p)};
  },{readOnly:true});
}
export function validateLegacyReportCleanup(plan,projectId,approvedDigest){
  const {digest,...p}=plan??{};
  if(!/^[a-f0-9]{64}$/.test(approvedDigest??'')||digest!==approvedDigest||hash(p)!==digest||p.v!==1||
    p.kind!=='approved-resolved-mvp-reports-cleanup'||p.projectId!==projectId||
    Object.keys(p).sort().join(',')!=='control,kind,projectId,protected,reports,v'||!Array.isArray(p.reports)||
    canonical(p.reports.map(r=>r.path))!==canonical(legacyReportFixtures.map(f=>f.path))||
    !Array.isArray(p.protected)||p.protected.length>500)fail('invalid-plan');
  return p;
}
export async function applyLegacyReportCleanup(db,plan,{approvedDigest,clock=()=>new Date(),beforeCommit}={}){
  target(db);const p=validateLegacyReportCleanup(plan,db.projectId,approvedDigest);await noChildren(db);
  return db.runTransaction(async tx=>{
    const receipt=db.doc(`serverOperations/archive_reports_${plan.digest}`),prior=await tx.get(receipt);
    if(prior.exists){
      if(prior.get('action')!=='cleanupLegacyArchiveFixtures'||prior.get('actorKind')!=='operator'||
        prior.get('userId')!=='dev-archive-operator'||prior.get('fingerprint')!==plan.digest||
        prior.get('result.kind')!=='resolved-mvp-reports'||prior.get('result.removed')!==3)fail('receipt-drift');
      if((await tx.getAll(...legacyReportFixtures.map(f=>db.doc(f.path)))).some(d=>d.exists))fail('report-recreated');
      return {state:'already-applied',removed:0,receiptPreserved:true};
    }
    const {control,reports,baseline}=await inspect(tx,db);
    if(canonical(baseline)!==canonical({control:p.control,reports:p.reports,protected:p.protected}))fail('baseline-drift');
    const now=Timestamp.fromDate(clock());
    for(const d of reports)tx.delete(d.ref);
    // Invalidate every inventory/audit made before this legacy deletion.
    tx.update(control.ref,{legacyRevision:control.get('legacyRevision')+1});
    tx.create(receipt,{action:'cleanupLegacyArchiveFixtures',actorKind:'operator',userId:'dev-archive-operator',
      fingerprint:plan.digest,keyVersion:1,createdAt:now,expiresAt:Timestamp.fromMillis(now.toMillis()+operationRetryWindowMillis),
      result:{kind:'resolved-mvp-reports',removed:3}});
    if(beforeCommit)await beforeCommit();
    return {state:'applied',removed:3,writes:5,protected:p.protected.length,legacyRevision:control.get('legacyRevision')+1,authMutations:0};
  });
}
function local(path){const full=resolve(root,path??''),rel=relative(root,full);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail('workspace-file-required');return full;}
export function parseLegacyReportCleanup(argv){
  const [action,...rest]=argv,o={};if(!['plan','apply'].includes(action)||rest.length%2)fail('explicit-action');
  const allowed=action==='plan'?['--project','--output']:['--project','--plan','--approved-digest','--confirm-project','--ci-run'];
  for(let n=0;n<rest.length;n+=2){if(!allowed.includes(rest[n])||!rest[n+1]||rest[n+1].startsWith('--')||Object.hasOwn(o,rest[n]))fail('invalid-options');o[rest[n]]=rest[n+1];}
  if(o['--project']!==project)fail('explicit-dev-required');local(o[action==='plan'?'--output':'--plan']);
  if(action==='apply'&&(o['--confirm-project']!==project||!/^\d+$/.test(o['--ci-run']??'')||!/^[a-f0-9]{64}$/.test(o['--approved-digest']??'')))fail('explicit-ci-and-digest-required');
  return {action,options:o};
}
export async function main(argv,{openDatabase=feedAdminDatabase,inspectRelease=inspectTransitionRelease}={}){
  delete process.env.DEBUG;const {action,options:o}=parseLegacyReportCleanup(argv);
  const plan=action==='apply'?JSON.parse(readFileSync(local(o['--plan']),'utf8')):null;
  if(plan){validateLegacyReportCleanup(plan,project,o['--approved-digest']);assertLifecycleTransitionRelease(project,inspectRelease(o));}
  const db=await openDatabase(project);
  try{
    if(action==='plan'){
      const p=await planLegacyReportCleanup(db),file=local(o['--output']);mkdirSync(dirname(file),{recursive:true});
      writeFileSync(file,JSON.stringify(p,null,2)+'\n',{flag:'wx'});return {projectId:project,file,digest:p.digest,writes:0};
    }
    return await applyLegacyReportCleanup(db,plan,{approvedDigest:o['--approved-digest']});
  }finally{await db.terminate();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(x=>console.log(JSON.stringify(x)))
  .catch(e=>{console.error(/^archive-reports-/.test(e.message)?e.message:'archive-reports-command-failed');process.exitCode=1;});
