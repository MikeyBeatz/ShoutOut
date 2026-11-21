import { createHash } from 'node:crypto';
import { canonical } from './feed_block_index.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { generationId, generationStamp, sameGenerationStamp } from './feed_generation_format.js';
import { createCardBackfill } from './feed_card_backfill.js';

const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function validateCardTransitionPlan(plan, projectId, approved = plan?.digest) {
  const { digest: saved, ...data } = plan ?? {};
  const keys = 'batchSize,controlRevision,kind,projectId,sourceGenerationId,sourceIncarnation,targetGenerationId,v,writeGenerationIds,writeIncarnations';
  if (Object.keys(data).sort().join(',') !== keys || !/^[a-f0-9]{64}$/.test(saved ?? '') || saved !== approved || digest(data) !== saved ||
      data.v !== 1 || data.kind !== 'feed-card-state-transition' || data.projectId !== projectId ||
      !generationId(data.sourceGenerationId) || !generationId(data.targetGenerationId) || data.sourceGenerationId === data.targetGenerationId ||
      !Number.isSafeInteger(data.controlRevision) || data.controlRevision < 0 || data.controlRevision >= Number.MAX_SAFE_INTEGER || data.batchSize !== 50 ||
      !Array.isArray(data.writeGenerationIds) || data.writeGenerationIds.some(id => !generationId(id)) ||
      new Set(data.writeGenerationIds).size !== data.writeGenerationIds.length || !data.writeGenerationIds.includes(data.sourceGenerationId) || data.writeGenerationIds.includes(data.targetGenerationId) ||
      !Array.isArray(data.sourceIncarnation) || data.sourceIncarnation.length !== 2 || data.sourceIncarnation.some(n => !Number.isSafeInteger(n) || n < 0) || data.sourceIncarnation[1] >= 1000000000) throw new Error('invalid-card-transition-plan');
  if (!data.writeIncarnations || Object.keys(data.writeIncarnations).sort().join(',') !== [...data.writeGenerationIds].sort().join(',') ||
      Object.values(data.writeIncarnations).some(s => !Array.isArray(s) || s.length !== 2 || s.some(n => !Number.isSafeInteger(n) || n < 0) || s[1] >= 1000000000) ||
      canonical(data.writeIncarnations[data.sourceGenerationId]) !== canonical(data.sourceIncarnation)) throw new Error('invalid-card-transition-plan');
  return data;
}
export async function planCardTransition(db, target) {
  assertFeedRuntimeTarget(db);
  if (!generationId(target)) throw new Error('invalid-card-transition-generation');
  return db.runTransaction(async tx => {
    const control = await tx.get(db.doc('feedIndexControl/current')), state = validateFeedIndexControl(control.data());
    const source = state.readGenerationId;
    if (state.mode !== 'active' || !source || source === target || (state.cardWriteGenerationIds ?? []).length) throw new Error('card-transition-plan-conflict');
    const [from, to, job] = await tx.getAll(db.doc(`feedIndexGenerations/${source}`), db.doc(`feedIndexGenerations/${target}`), db.doc(`feedIndexMaintenance/cardBackfills/jobs/${target}`));
    if (!from.exists || from.get('v') !== 1 || from.get('schemaVersion') !== 1 || from.get('readIdentity') !== 1 || from.get('accountRetention') !== true || to.exists || job.exists) throw new Error('card-transition-plan-conflict');
    const writers = await tx.getAll(...state.writeGenerationIds.map(id => db.doc(`feedIndexGenerations/${id}`)));
    if (writers.some(doc => !doc.exists || doc.get('v') !== 1 || doc.get('schemaVersion') !== 1 || doc.get('accountRetention') !== true)) throw new Error('card-transition-plan-conflict');
    const data = { v: 1, kind: 'feed-card-state-transition', projectId: db.projectId, sourceGenerationId: source, targetGenerationId: target,
      sourceIncarnation: generationStamp(from), controlRevision: state.revision, writeGenerationIds: state.writeGenerationIds,
      writeIncarnations: Object.fromEntries(writers.map(doc => [doc.id, generationStamp(doc)])), batchSize: 50 };
    const plan = { ...data, digest: digest(data) }; validateCardTransitionPlan(plan, db.projectId); return plan;
  }, { readOnly: true });
}
function core(db, plan, options) {
  const p = validateCardTransitionPlan(plan, db.projectId);
  return createCardBackfill(db, p.sourceGenerationId, p.targetGenerationId, { ...options, planDigest: plan.digest, sourceIncarnation: p.sourceIncarnation, writeIncarnations: p.writeIncarnations });
}
export async function cardTransitionStatus(db, plan, options = {}) {
  assertFeedRuntimeTarget(db); const p = validateCardTransitionPlan(plan, db.projectId);
  const stored = await db.doc(`feedIndexMaintenance/cardBackfills/jobs/${p.targetGenerationId}`).get();
  if (!stored.exists) {
    const current = await planCardTransition(db, p.targetGenerationId);
    if (current.digest !== plan.digest) throw new Error('card-transition-plan-drift');
    return { projectId: db.projectId, digest: plan.digest, phase: 'not-started', source: p.sourceGenerationId, target: p.targetGenerationId, writes: 0 };
  }
  const current = await core(db, plan, options).inspect();
  if (current.data.initialRevision !== p.controlRevision || canonical(current.data.initialWriters) !== canonical(p.writeGenerationIds) || !sameGenerationStamp(current.from, p.sourceIncarnation)) throw new Error('card-transition-plan-ownership-conflict');
  return { projectId: db.projectId, digest: plan.digest, phase: current.data.phase, version: current.data.version, scanned: current.data.scanned,
    batchSize: current.data.batchSize, auditPart: current.data.audit?.part ?? null, control: current.state, writes: 0 };
}
export async function runCardTransitionStep(db, plan, action, { approvedDigest, compatibleWriters = false, clock } = {}) {
  assertFeedRuntimeTarget(db); const p = validateCardTransitionPlan(plan, db.projectId, approvedDigest);
  if (!compatibleWriters || typeof approvedDigest !== 'string') throw new Error('card-transition-approved-compatible-writers-required');
  const methods = { start: 'begin', backfill: 'step', 'begin-audit': 'beginAudit', audit: 'auditStep', activate: 'activate', rollback: 'rollback', resume: 'resume', abort: 'abort' };
  if (!Object.hasOwn(methods, action)) throw new Error('invalid-card-transition-action');
  await cardTransitionStatus(db, plan, { clock });
  const worker = core(db, plan, { clock });
  return { action, projectId: db.projectId, digest: plan.digest, ...(action === 'start' ? await worker.begin(p.controlRevision) : await worker[methods[action]]()) };
}
