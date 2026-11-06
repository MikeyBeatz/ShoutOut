import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';

const off = { schemaVersion: 1, revision: 0, mode: 'off', readGenerationId: null, writeGenerationIds: [] };
const hash = data => createHash('sha256').update(canonical(data)).digest('hex');
const same = (a, b) => a?.isEqual(b) === true;
const refs = db => ({ control: db.doc('feedIndexControl/current'), receipt: db.doc('feedIndexMaintenance/bootstrap'),
  activation: db.doc('feedIndexMaintenance/bootstrap/activation/current'),
  generations: db.collection('feedIndexGenerations'), active: db.collection('shouts').where('status', '==', 'active').limit(1) });
function checkPlan(db, plan, approvedDigest) {
  assertFeedRuntimeTarget(db);
  const { digest, ...data } = plan ?? {};
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest) || digest !== approvedDigest || digest !== hash(data) || data.v !== 1 || data.projectId !== db.projectId || data.kind !== 'empty-feed-start' ||
      Object.keys(data).sort().join(',') !== 'generationId,kind,projectId,v' ||
      typeof data.generationId !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(data.generationId)) throw new Error('invalid-approved-feed-bootstrap-plan');
  return refs(db);
}
export async function planEmptyFeedBootstrap(db, generationId) {
  assertFeedRuntimeTarget(db);
  if (typeof generationId !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(generationId)) throw new Error('invalid-bootstrap-generation');
  const r = refs(db);
  await db.runTransaction(async tx => {
    const [control, receipt, generations, active] = await Promise.all([tx.get(r.control), tx.get(r.receipt), tx.get(r.generations.limit(1)), tx.get(r.active)]);
    if (control.exists || receipt.exists || !generations.empty) throw new Error('feed-bootstrap-already-configured');
    if (!active.empty) throw new Error('feed-bootstrap-active-source-present');
  }, { readOnly: true });
  const data = { v: 1, kind: 'empty-feed-start', projectId: db.projectId, generationId };
  return { ...data, digest: hash(data) };
}

// Phase one precedes writer deployment: existing callables still work while
// direct writes are closed by the managed-control Rules condition.
export async function initializeEmptyFeedBootstrap(db, plan, { approvedDigest } = {}) {
  const r = checkPlan(db, plan, approvedDigest);
  return db.runTransaction(async tx => {
    const [control, receipt, generations, active] = await Promise.all([tx.get(r.control), tx.get(r.receipt), tx.get(r.generations.limit(1)), tx.get(r.active)]);
    if (receipt.exists) {
      if (receipt.get('v') !== 1 || !['initialized', 'active', 'paused'].includes(receipt.get('stage')) ||
          receipt.get('digest') !== plan.digest || receipt.get('generationId') !== plan.generationId ||
          !same(control.createTime, receipt.createTime)) throw new Error('feed-bootstrap-ownership-conflict');
      validateFeedIndexControl(control.data());
      return { state: receipt.get('stage'), changed: false };
    }
    if (control.exists || !generations.empty) throw new Error('feed-bootstrap-already-configured');
    if (!active.empty) throw new Error('feed-bootstrap-active-source-present');
    tx.create(r.control, off);
    tx.create(r.receipt, { v: 1, digest: plan.digest, generationId: plan.generationId, stage: 'initialized' });
    return { state: 'initialized', changed: true };
  });
}

// The operator must first verify all live writer revisions and direct-write
// denial. The CLI checks exact successful CI/commit; it does not replace that
// live cutover verification. Never copy or hide existing source Shouts here.
export async function activateEmptyFeedBootstrap(db, plan, { approvedDigest, writerCommit } = {}) {
  const r = checkPlan(db, plan, approvedDigest), generation = r.generations.doc(plan.generationId);
  if (!/^[a-f0-9]{40}$/.test(writerCommit ?? '')) throw new Error('verified-writer-commit-required');
  return db.runTransaction(async tx => {
    const [control, receipt, marker, seal, generations, active] = await Promise.all([
      tx.get(r.control), tx.get(r.receipt), tx.get(generation), tx.get(r.activation), tx.get(r.generations.limit(1)), tx.get(r.active),
    ]);
    if (!control.exists || !receipt.exists || receipt.get('v') !== 1 || receipt.get('digest') !== plan.digest ||
        receipt.get('generationId') !== plan.generationId || !same(control.createTime, receipt.createTime)) throw new Error('feed-bootstrap-ownership-conflict');
    const state = validateFeedIndexControl(control.data());
    if (receipt.get('stage') === 'active' && marker.get('bootstrapDigest') === plan.digest &&
        seal.get('digest') === plan.digest && same(marker.createTime, seal.createTime) && state.mode === 'active' &&
        state.readGenerationId === plan.generationId && canonical(state.writeGenerationIds) === canonical([plan.generationId])) {
      return { state: 'active', changed: false };
    }
    if (receipt.get('stage') !== 'initialized' || canonical(state) !== canonical(off) || marker.exists || seal.exists || !generations.empty) throw new Error('feed-bootstrap-state-conflict');
    if (!active.empty) throw new Error('feed-bootstrap-active-source-present');
    tx.create(generation, { schemaVersion: 1, v: 1, accountRetention: true, erasureRevision: 0, prunedThrough: -1, bootstrapDigest: plan.digest });
    tx.create(r.activation, { v: 1, digest: plan.digest, generationId: plan.generationId, writerCommit });
    tx.update(r.control, { revision: 1, mode: 'active', readGenerationId: plan.generationId, writeGenerationIds: [plan.generationId] });
    tx.update(r.receipt, { stage: 'active', activatedAt: FieldValue.serverTimestamp(), writerCommit });
    return { state: 'active', changed: true };
  });
}

// Safe reader rollback keeps the writer/generation/retention maintenance on.
// It never deletes a generation or returns a legacy writer over live index data.
export async function setBootstrappedReaderPaused(db, plan, { approvedDigest, paused } = {}) {
  const r = checkPlan(db, plan, approvedDigest);
  if (typeof paused !== 'boolean') throw new Error('invalid-bootstrap-pause');
  return db.runTransaction(async tx => {
    const [control, receipt, marker, seal] = await tx.getAll(r.control, r.receipt, r.generations.doc(plan.generationId), r.activation);
    if (receipt.get('digest') !== plan.digest || marker.get('bootstrapDigest') !== plan.digest ||
        seal.get('digest') !== plan.digest || !same(marker.createTime, seal.createTime)) throw new Error('feed-bootstrap-ownership-conflict');
    const state = validateFeedIndexControl(control.data());
    if (!['active', 'paused'].includes(state.mode) || canonical(state.writeGenerationIds) !== canonical([plan.generationId]) ||
        state.readGenerationId !== (state.mode === 'active' ? plan.generationId : null)) throw new Error('feed-bootstrap-state-conflict');
    const desired = paused ? 'paused' : 'active';
    if (state.mode === desired) return { state: desired, changed: false };
    if (state.revision >= Number.MAX_SAFE_INTEGER) throw new Error('invalid-bootstrap-revision');
    tx.update(r.control, { revision: state.revision + 1, mode: desired, readGenerationId: paused ? null : plan.generationId });
    tx.update(r.receipt, { stage: desired });
    return { state: desired, changed: true };
  });
}
