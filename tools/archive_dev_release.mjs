// Reproducible release materialization. No deploy, secret, database or acceptance.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {archiveDevDeploymentPhase,archiveDeploymentProfile} from '../functions/archive_deployment.js';
import {archiveLegalRulesCandidate} from './rules/archive_legal_candidate.mjs';
import {archiveWebConfig} from './web_environment.mjs';
import {prepareFunctionArtifact} from './function_artifact.mjs';

export const archiveDevProject='shoutout-dev-46c81';
export const archiveFunctionGroups=Object.freeze({
  content:{entry:'content.js',names:['createShout','createComment','createPrivateReply','toggleShoutReaction','toggleCommentReaction',
    'toggleShoutSave','createContentReport','deleteComment','deletePrivateReply','removeReportedPrivateReply','decideContentReports',
    'removeReportedPublicContent','sanctionContent','revokeSanction','reviewBusinessApplication','getArchivedCommentReportTarget',
    'deleteShout','prepareAccountDeletion','finalizeAccountDeletion','getOwnShouts','getSavedShouts','getFeedPage','cleanupOperationReceipts',
    'observeArchiveIdentity','getArchiveIdentityPage','getLifecycleSourcePage','getLifecycleReportEvidence']},
  reads:{entry:'read_sync_host.js',names:['syncReadBatch','getReadStatePage']},
  accounts:{entry:'account_deletion_dev.js',names:['accountDeletionRequestCreatedDev','resumeAccountDeletionJobsDev']},
});
export function archiveReleaseConfiguration(config,rules,phase){
  if(!['capture','active','rollback'].includes(phase)||config?.firebase?.projectId!==archiveDevProject||config.hostingSite!==archiveDevProject)throw Error('archive-release-explicit-dev-required');
  const profile=archiveDeploymentProfile({GCLOUD_PROJECT:archiveDevProject},phase);
  const web=archiveWebConfig(structuredClone(config),phase);
  let candidate=archiveLegalRulesCandidate(rules,{archiveDisclosureEnabled:true,version:'2026-11-27'});
  const needle='return false; // content-lifecycle-gate: local preparation only';
  if(candidate.split(needle).length!==2)throw Error('archive-release-rules-gate-drift');
  if(profile.reader)candidate=candidate.replace(needle,'return true; // content-lifecycle-gate: approved DEV archive reader');
  return {phase,profile,web,rules:candidate};
}
export function prepareArchiveDevRelease(root,phase=archiveDevDeploymentPhase){
  if(phase!==archiveDevDeploymentPhase&&!(archiveDevDeploymentPhase==='active'&&phase==='rollback'))throw Error('archive-release-committed-phase-required');
  const prepared=archiveReleaseConfiguration(JSON.parse(readFileSync(resolve(root,'config/dev.json'),'utf8')),
    readFileSync(resolve(root,'firestore.rules'),'utf8'),phase);
  const target=resolve(root,`build/archive-release-${phase}`);mkdirSync(target,{recursive:true});
  const rules=resolve(target,'firestore.rules');writeFileSync(rules,prepared.rules);
  const config=resolve(target,'app-config.json');writeFileSync(config,JSON.stringify(prepared.web,null,2)+'\n');
  const functions={};
  for(const [group,definition]of Object.entries(archiveFunctionGroups)){
    const artifact=prepareFunctionArtifact(root,`functions-archive-${phase}-${group}`,definition.entry);
    const envName=`.env.${archiveDevProject}`;writeFileSync(resolve(artifact.target,envName),`SHOUTOUT_ARCHIVE_RELEASE_PHASE=${phase}\n`);
    const hashes=Object.fromEntries([...artifact.files,'package.json','package-lock.json',envName].map(name=>[name,
      createHash('sha256').update(readFileSync(resolve(artifact.target,name))).digest('hex')]));
    functions[group]={source:artifact.target,names:definition.names,hashes};
  }
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  const manifest={projectId:archiveDevProject,phase,sourceCommit:git(['rev-parse','HEAD']),dirty:git(['status','--porcelain','--untracked-files=all'])!=='',
    profile:prepared.profile,rulesSha256:createHash('sha256').update(prepared.rules).digest('hex'),
    configSha256:createHash('sha256').update(readFileSync(config)).digest('hex'),functions};
  writeFileSync(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {target,rules,config,manifest};
}
