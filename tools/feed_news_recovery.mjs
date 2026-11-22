import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareNewsControlChange, validateNewsControl } from '../functions/feed_news_signals.js';
import { assertNewsOriginals, assertNewsRelease, validateNewsPlan, newsProject } from './feed_news_activation.mjs';
import { inspectTransitionRelease } from './feed_generation_transition.mjs';
import { feedAdminDatabase } from './feed_admin_database.mjs';

const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const same = (a,b) => canonical(a) === canonical(b);
const stamp = time => [time.seconds,time.nanoseconds];
const transitions = Object.freeze([Object.freeze({ revision:5,mode:'paused' }),Object.freeze({ revision:6,mode:'active' })]);
function target(db) {
  if (db.projectId !== newsProject && !(db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) throw Error('news-recovery-dev-required');
}
export function validateNewsRecovery(plan, project, approved = plan?.digest) {
  const { digest,...data } = plan ?? {};
  if (digest !== approved || hash(data) !== digest || plan.v !== 1 || plan.kind !== 'news-recovery' || plan.projectId !== project ||
      !same(plan.transitions,transitions) || plan.initial?.revision !== 4 || plan.initial.mode !== 'active' ||
      plan.initial.generation !== 'feed-v3' || !Array.isArray(plan.newsUpdate) || plan.newsUpdate.length !== 2 ||
      !plan.newsUpdate.every(Number.isSafeInteger)) throw Error('news-recovery-approved-plan-required');
  validateNewsControl(plan.initial);
  validateNewsPlan(plan.original,project);
  if (!same(plan.initial.incarnation,plan.original.incarnation) || !same(plan.feedControl,{...plan.original.feedControl,revision:plan.original.feedControl.revision+1})) throw Error('news-recovery-generation-drift');
}
export async function planNewsRecovery(db, original, approvedOriginal = original?.digest) {
  target(db); validateNewsPlan(original,db.projectId,approvedOriginal);
  if (db.projectId === newsProject && (original.originals.length !== 38 || original.requests.length !== 1)) throw Error('news-recovery-original-scope');
  const data = await db.runTransaction(async tx => {
    await assertNewsOriginals(tx,db,original);
    const [feed,news,marker] = await tx.getAll(db.doc('feedIndexControl/current'),db.doc('feedNewsControl/current'),db.doc('feedIndexGenerations/feed-v3'));
    if (!marker.exists || !news.exists || !same(stamp(marker.createTime),original.incarnation)) throw Error('news-recovery-generation-drift');
    return { v:1,kind:'news-recovery',projectId:db.projectId,original,feedControl:feed.data(),initial:news.data(),newsUpdate:stamp(news.updateTime),transitions };
  },{readOnly:true});
  const plan={...data,digest:hash(data)};validateNewsRecovery(plan,db.projectId);return plan;
}
export async function applyNewsRecovery(db,plan,revision,approved=plan?.digest) {
  target(db); validateNewsRecovery(plan,db.projectId,approved);
  const transition=plan.transitions.find(t=>t.revision===revision);
  if(!transition)throw Error('news-recovery-explicit-revision-required');
  return db.runTransaction(async tx=>{
    await assertNewsOriginals(tx,db,plan.original);
    const [feed,news,marker]=await tx.getAll(db.doc('feedIndexControl/current'),db.doc('feedNewsControl/current'),db.doc('feedIndexGenerations/feed-v3'));
    if(!marker.exists||!same(feed.data(),plan.feedControl)||!same(stamp(marker.createTime),plan.initial.incarnation))throw Error('news-recovery-generation-drift');
    const desired={...plan.initial,...transition};
    if(same(news.data(),desired))return {...transition,replay:true,writes:0};
    const previous=revision===5?plan.initial:{...plan.initial,...plan.transitions[0]};
    if(!same(news.data(),previous)||revision===5&&!same(stamp(news.updateTime),plan.newsUpdate))throw Error('news-recovery-control-drift');
    const change=await prepareNewsControlChange(tx,db,desired);change.apply();return {...transition,replay:false,writes:change.writes};
  });
}
const root=resolve(import.meta.dirname,'..');
function inside(path) {
  const file=resolve(root,path),rel=relative(root,file);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('news-recovery-workspace-required');return file;
}
export async function main(argv,{openDatabase=feedAdminDatabase,inspectRelease=inspectTransitionRelease}={}) {
  delete process.env.DEBUG;
  const [action,...args]=argv,o={},allowed=['--project','--plan','--original-plan','--original-digest','--approved-digest','--confirm-project','--ci-run','--revision'];
  if(!['plan','status','transition'].includes(action))throw Error('news-recovery-explicit-action-required');
  for(let i=0;i<args.length;i+=2){if(!allowed.includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(o,args[i]))throw Error('news-recovery-invalid-options');o[args[i]]=args[i+1];}
  if(o['--project']!==newsProject||!o['--plan'])throw Error('news-recovery-explicit-dev-required');
  const file=inside(o['--plan']);
  if(action==='transition') {
    if(o['--confirm-project']!==newsProject||!/^\d+$/.test(o['--ci-run']??'')||!/^[a-f0-9]{64}$/.test(o['--approved-digest']??'')||!['5','6'].includes(o['--revision']))throw Error('news-recovery-explicit-approval-required');
    assertNewsRelease(newsProject,inspectRelease(o));
  }
  if(action==='plan'&&(!o['--original-plan']||!/^[a-f0-9]{64}$/.test(o['--original-digest']??'')))throw Error('news-recovery-original-plan-required');
  const original=action==='plan'?JSON.parse(readFileSync(inside(o['--original-plan']),'utf8')):null;
  const plan=action==='plan'?null:JSON.parse(readFileSync(file,'utf8'));
  if(plan)validateNewsRecovery(plan,newsProject,action==='transition'?o['--approved-digest']:plan.digest);
  const db=await openDatabase(newsProject);
  try {
    if(db.projectId!==newsProject)throw Error('news-recovery-project-mismatch');
    if(action==='plan') {
      const result=await planNewsRecovery(db,original,o['--original-digest']);writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
      return {digest:result.digest,transitions:result.transitions,cloudWrites:0};
    }
    if(action==='status')return {originals:await assertNewsOriginals(db,db,plan.original),control:(await db.doc('feedNewsControl/current').get()).data(),cloudWrites:0};
    return await applyNewsRecovery(db,plan,Number(o['--revision']),o['--approved-digest']);
  } finally { await db.terminate(); }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2))
  .then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{
    process.stderr.write(JSON.stringify({error:/^(news-|feed-|card-)/.test(error.message??'')?error.message:'news-recovery-failed'})+'\n');process.exitCode=1;
  });
