// Private operator core. No import-time initialization, live wrapper or scheduler.
import { createHash } from 'node:crypto';
import { canonical } from './feed_block_index.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { generationId, generationStamp, sameGenerationStamp, generationContentIdentity, transitionRef } from './feed_generation_format.js';
import { createFeedGenerationTransition } from './feed_generation_transition.js';

const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const stamp = value => Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger) &&
  value[0] >= 0 && value[1] >= 0 && value[1] < 1000000000;
export function validateTransitionPlan(plan, projectId, approvedDigest = plan?.digest) {
  const { digest, ...value } = plan ?? {};
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest) || digest !== approvedDigest || hash(value) !== digest ||
      Object.keys(value).sort().join(',') !== 'batchSize,controlRevision,kind,projectId,sourceGenerationId,sourceIncarnation,targetGenerationId,v' ||
      value.v !== 1 || value.kind !== 'feed-content-identity-transition' || value.projectId !== projectId ||
      !generationId(value.sourceGenerationId) || !generationId(value.targetGenerationId) || value.sourceGenerationId === value.targetGenerationId ||
      !stamp(value.sourceIncarnation) || !Number.isSafeInteger(value.controlRevision) || value.controlRevision < 0 ||
      value.controlRevision >= Number.MAX_SAFE_INTEGER || value.batchSize !== 50) throw new Error('invalid-approved-feed-transition-plan');
  return value;
}
export async function planFeedTransition(db, targetGenerationId) {
  assertFeedRuntimeTarget(db);
  if (!generationId(targetGenerationId)) throw new Error('invalid-transition-generation');
  return db.runTransaction(async tx => {
    const control = await tx.get(db.doc('feedIndexControl/current')), state = validateFeedIndexControl(control.data());
    const sourceGenerationId = state.readGenerationId;
    if (state.mode !== 'active' || canonical(state.writeGenerationIds) !== canonical([sourceGenerationId]) ||
        sourceGenerationId === targetGenerationId) throw new Error('feed-transition-plan-state-conflict');
    const [source, target, job] = await tx.getAll(db.doc(`feedIndexGenerations/${sourceGenerationId}`),
      db.doc(`feedIndexGenerations/${targetGenerationId}`), transitionRef(db, targetGenerationId));
    if (!source.exists || source.get('schemaVersion') !== 1 || source.get('v') !== 1 || source.get('accountRetention') !== true ||
        generationContentIdentity(source.data()) || target.exists || job.exists) throw new Error('feed-transition-plan-state-conflict');
    const value = { v: 1, kind: 'feed-content-identity-transition', projectId: db.projectId, sourceGenerationId,
      targetGenerationId, sourceIncarnation: generationStamp(source), controlRevision: state.revision, batchSize: 50 };
    const plan = { ...value, digest: hash(value) }; validateTransitionPlan(plan, db.projectId); return plan;
  }, { readOnly: true });
}
export async function transitionStatus(db, plan) {
  assertFeedRuntimeTarget(db); const value = validateTransitionPlan(plan, db.projectId);
  return db.runTransaction(async tx => {
    const [control, source, target, saved] = await tx.getAll(db.doc('feedIndexControl/current'),
      db.doc(`feedIndexGenerations/${value.sourceGenerationId}`), db.doc(`feedIndexGenerations/${value.targetGenerationId}`),
      transitionRef(db, value.targetGenerationId));
    if (!sameGenerationStamp(source, value.sourceIncarnation)) throw new Error('feed-transition-source-incarnation-changed');
    if (saved.exists && (saved.get('initialRevision') !== value.controlRevision || saved.get('source') !== value.sourceGenerationId ||
        saved.get('target') !== value.targetGenerationId || !sameGenerationStamp(source, saved.get('sourceIncarnation')) ||
        !target.exists || !target.createTime.isEqual(saved.createTime))) throw new Error('feed-transition-plan-ownership-conflict');
    return { projectId: db.projectId, digest: plan.digest, control: validateFeedIndexControl(control.data()),
      sourceGenerationId: value.sourceGenerationId, targetGenerationId: value.targetGenerationId,
      targetExists: target.exists, phase: saved.get('phase') ?? 'not-started', version: saved.get('version') ?? null,
      scanned: saved.get('scanned') ?? 0, batchSize: saved.get('batchSize') ?? value.batchSize,
      auditPart: saved.get('audit.part') ?? null, sourceCount: saved.get('audit.source.count') ?? null,
      indexCount: saved.get('audit.index.count') ?? null };
  }, { readOnly: true });
}
// One bounded core step per invocation. The checkpoint is committed atomically
// by the existing core; a process restart or lost acknowledgement needs no reset.
export async function runFeedTransitionStep(db, plan, action, { approvedDigest, compatibleWriters = false } = {}) {
  assertFeedRuntimeTarget(db);
  if (typeof approvedDigest !== 'string') throw new Error('feed-transition-approved-digest-required');
  const value = validateTransitionPlan(plan, db.projectId, approvedDigest);
  if (!compatibleWriters) throw new Error('feed-compatible-writer-release-required');
  const methods = { start: 'begin', backfill: 'step', 'begin-audit': 'beginAudit', audit: 'auditStep',
    activate: 'activate', rollback: 'rollback', resume: 'resume', abort: 'abort' };
  if (!Object.hasOwn(methods, action)) throw new Error('invalid-feed-transition-action');
  await transitionStatus(db, plan);
  const core = createFeedGenerationTransition(db, value.sourceGenerationId, value.targetGenerationId, { batchSize: value.batchSize });
  const result = action === 'start' ? await core.begin(value.controlRevision, value.sourceIncarnation) : await core[methods[action]]();
  return { action, projectId: db.projectId, digest: plan.digest, ...result };
}
