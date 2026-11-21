// Pure evidence validation. Never changes traffic, revisions or services.
export const b4WriterFunctions = ['createShout','deleteShout','toggleShoutReaction','prepareAccountDeletion','createComment','deleteComment','toggleShoutSave','getFeedPage','accountDeletionRequestCreatedDev','resumeAccountDeletionJobsDev'];
export function verifyB4RevisionDrain(projectId, before, after, services, revisions) {
  if(projectId!=='shoutout-dev-46c81') throw new Error('b4-drain-dev-required');
  const result=[];
  for(const name of b4WriterFunctions){
    const old=before.find(f=>f.name===name), current=after.find(f=>f.name===name);
    if(!old||!current||current.state!=='ACTIVE'||old.revision===current.revision||current.memory!==old.memory||current.max!==old.max||current.min!==old.min||current.concurrency!==old.concurrency||current.timeout!==old.timeout)throw new Error('b4-drain-function-mismatch');
    const serviceName=current.service?.split('/').at(-1), service=services.find(s=>s.name?.split('/').at(-1)===serviceName);
    const traffic=service?.trafficStatuses;
    if(!service||service.reconciling||service.latestReadyRevision?.split('/').at(-1)!==current.revision||!Array.isArray(traffic)||traffic.length!==1||traffic[0].percent!==100||traffic[0].revision?.split('/').at(-1)!==current.revision||traffic[0].tag)throw new Error('b4-drain-traffic-not-settled');
    const oldRevisions=revisions[serviceName]?.filter(r=>r.name.split('/').at(-1)!==current.revision);
    if(!oldRevisions?.some(r=>r.name.split('/').at(-1)===old.revision))throw new Error('b4-drain-old-revision-missing');
    for(const revision of oldRevisions){
      const active=revision.conditions?.find(c=>c.type==='Active');
      if(active?.state!=='CONDITION_FAILED'||active.revisionReason!=='RETIRED')throw new Error('b4-drain-old-infrastructure-not-retired');
    }
    result.push({function:name,currentRevision:current.revision,previousRevision:old.revision,retiredRevisions:oldRevisions.length});
  }
  return {projectId,validated:true,functions:result,proof:'100% new revision traffic and Cloud Run RETIRED infrastructure for every previous revision; no conclusion from missing metrics or elapsed timeout'};
}
