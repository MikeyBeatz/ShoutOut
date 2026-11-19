// Internal B3 transition core. No callable, CLI, initialization or scheduler.
import { createHash } from 'node:crypto';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { canonical, clone, encodedBytes, metadataOf, verifyNode } from './feed_block_index.js';
import { createFeedGenerationStore } from './feed_runtime.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { generationContentIdentity, generationId, generationStamp, sameGenerationStamp, transitionRef } from './feed_generation_format.js';
import { feedSessionLifetimeMillis } from './feed_session_policy.js';
import { cellGrid } from './feed_block_index_store.js';

const phases = ['backfill', 'audit', 'auditing', 'ready', 'failed', 'active', 'rolled-back', 'aborted'];
const integer = n => Number.isSafeInteger(n) && n >= 0;
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const accumulator = () => ({ count: 0, xor: '0'.repeat(64), sum: '0'.repeat(64) });
function add(acc, row) {
  const n = BigInt(`0x${digest(row)}`), limit = 1n << 256n;
  acc.count++; acc.xor = (BigInt(`0x${acc.xor}`) ^ n).toString(16).padStart(64, '0');
  acc.sum = ((BigInt(`0x${acc.sum}`) + n) % limit).toString(16).padStart(64, '0');
}
function validateAccumulator(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'count,sum,xor' || !integer(value.count) ||
      ![value.xor, value.sum].every(n => typeof n === 'string' && /^[a-f0-9]{64}$/.test(n))) throw new Error('invalid-transition-audit');
}
function validateAudit(pin) {
  if (!pin || Object.keys(pin).sort().join(',') !== 'after,cutoff,frontier,index,part,readTime,rootAfter,rootsDone,source,sourceErasure,targetErasure' ||
      !(pin.readTime instanceof Timestamp) || !['source', 'index', 'done'].includes(pin.part) ||
      !Number.isSafeInteger(pin.cutoff) || pin.cutoff < -1 || !integer(pin.sourceErasure) || !integer(pin.targetErasure) ||
      typeof pin.rootsDone !== 'boolean' || !Array.isArray(pin.frontier) ||
      !(pin.after === null || typeof pin.after === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(pin.after)) ||
      !(pin.rootAfter === null || typeof pin.rootAfter === 'string' && /^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(pin.rootAfter)) ||
      pin.frontier.some(item => !item || !/^[a-f0-9]{64}$/.test(item.hash) || typeof item.path !== 'string' || typeof item.exact !== 'boolean') ||
      pin.part === 'done' && (!pin.rootsDone || pin.frontier.length)) throw new Error('invalid-transition-audit');
  validateAccumulator(pin.source); validateAccumulator(pin.index);
}
function validateJob(job, source, target) {
  if (!job || job.v !== 1 || job.source !== source || job.target !== target || !phases.includes(job.phase) ||
      !integer(job.version) || !integer(job.scanned) || !integer(job.controlRevision) || !integer(job.initialRevision) ||
      !Number.isInteger(job.batchSize) || job.batchSize < 1 || job.batchSize > 50 ||
      !(job.after === null || typeof job.after === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(job.after))) throw new Error('invalid-feed-transition');
  return job;
}

export function createFeedGenerationTransition(db, source, target, { clock = () => new Date(), batchSize = 50 } = {}) {
  assertFeedRuntimeTarget(db);
  if (!generationId(source) || !generationId(target) || source === target || typeof clock !== 'function' ||
      !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error('invalid-feed-transition-options');
  const controlRef = db.doc('feedIndexControl/current'), sourceRef = db.doc(`feedIndexGenerations/${source}`),
    targetRef = db.doc(`feedIndexGenerations/${target}`), jobRef = transitionRef(db, target);
  const now = () => { const n = clock()?.getTime(); if (!integer(n)) throw new Error('invalid-transition-clock'); return n; };
  const context = (tx, state, job, markers, profiles) => ({ transaction: tx, control: state, jobs: new Map([[target, job]]),
    markers, profiles: new Map(profiles.map(profile => [profile.id, profile])) });
  async function guard(tx, allowed = phases) {
    const [control, saved, from, to] = await tx.getAll(controlRef, jobRef, sourceRef, targetRef);
    const state = validateFeedIndexControl(control.data()), job = validateJob(saved.data(), source, target);
    for (const marker of [from, to]) {
      if (!marker.exists || marker.get('schemaVersion') !== 1 || marker.get('v') !== 1 || marker.get('accountRetention') !== true ||
          !integer(marker.get('erasureRevision') ?? 0) || !Number.isSafeInteger(marker.get('prunedThrough') ?? -1) ||
          (marker.get('prunedThrough') ?? -1) < -1) throw new Error('invalid-transition-generation');
    }
    if (!allowed.includes(job.phase) || !sameGenerationStamp(from, job.sourceIncarnation) ||
        !to.exists || !to.createTime.isEqual(saved.createTime) || generationContentIdentity(from.data()) ||
        !generationContentIdentity(to.data()) || state.revision !== job.controlRevision) throw new Error('stale-feed-transition');
    const building = ['backfill', 'audit', 'auditing', 'ready', 'failed'].includes(job.phase);
    const expected = job.phase === 'active' ? target : source;
    const writers = job.phase === 'aborted' ? [source] : [source, target];
    if (state.mode !== (building ? 'building' : 'active') || state.readGenerationId !== expected ||
        canonical(state.writeGenerationIds) !== canonical(writers) || building && to.get('transitionId') !== target) throw new Error('stale-feed-transition');
    return { state, saved, job, from, to, markers: new Map([[source, from], [target, to]]) };
  }
  function pinAlive(current) {
    const pin = current.job.audit;
    validateAudit(pin);
    if (now() >= pin.readTime.toMillis() + feedSessionLifetimeMillis) throw new Error('feed-transition-audit-expired');
    if ((current.from.get('erasureRevision') ?? 0) !== pin.sourceErasure || (current.to.get('erasureRevision') ?? 0) !== pin.targetErasure ||
        (current.to.get('prunedThrough') ?? -1) !== pin.cutoff || current.from.get('activeErasure') || current.to.get('activeErasure')) {
      throw new Error('feed-transition-audit-fence-changed');
    }
    return pin;
  }
  async function begin(expectedRevision, expectedSourceIncarnation = null) {
    if (!integer(expectedRevision)) throw new Error('expected-control-revision-required');
    const emulator = db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
    if (!emulator && !expectedSourceIncarnation) throw new Error('approved-source-incarnation-required');
    return db.runTransaction(async tx => {
      const [control, saved, from, to] = await tx.getAll(controlRef, jobRef, sourceRef, targetRef);
      if (expectedSourceIncarnation && !sameGenerationStamp(from, expectedSourceIncarnation)) throw new Error('feed-transition-start-conflict');
      if (saved.exists) {
        if (saved.get('initialRevision') !== expectedRevision) throw new Error('feed-transition-start-conflict');
        const existing = await guard(tx); return { phase: existing.job.phase, changed: false };
      }
      const state = validateFeedIndexControl(control.data());
      if (state.mode !== 'active' || state.readGenerationId !== source || canonical(state.writeGenerationIds) !== canonical([source]) ||
          state.revision !== expectedRevision || expectedRevision >= Number.MAX_SAFE_INTEGER || !from.exists || to.exists ||
          from.get('schemaVersion') !== 1 || from.get('v') !== 1 || from.get('accountRetention') !== true ||
          !integer(from.get('erasureRevision') ?? 0) || !Number.isSafeInteger(from.get('prunedThrough') ?? -1) ||
          (from.get('prunedThrough') ?? -1) < -1 || generationContentIdentity(from.data())) throw new Error('feed-transition-start-conflict');
      tx.create(targetRef, { schemaVersion: 1, v: 1, accountRetention: true, readIdentity: 1, erasureRevision: 0,
        prunedThrough: from.get('prunedThrough') ?? -1, transitionId: target });
      tx.create(jobRef, { v: 1, source, target, sourceIncarnation: generationStamp(from), initialRevision: expectedRevision,
        controlRevision: expectedRevision + 1, version: 0, phase: 'backfill', batchSize, after: null, scanned: 0 });
      tx.update(controlRef, { revision: expectedRevision + 1, mode: 'building', writeGenerationIds: [source, target] });
      return { phase: 'backfill', changed: true };
    });
  }
  async function step() {
    let attempted = null;
    try {
      return await db.runTransaction(async tx => {
        const current = await guard(tx, ['backfill']); attempted = current;
        let query = db.collection('shouts').where('status', '==', 'active').orderBy(FieldPath.documentId()).limit(current.job.batchSize);
        if (current.job.after) query = query.startAfter(current.job.after);
        const page = await tx.get(query);
        const authors = [...new Set(page.docs.map(doc => doc.get('authorId')))];
        const profiles = authors.length ? await tx.getAll(...authors.map(uid => db.doc(`publicProfiles/${uid}`))) : [];
        const deleted = new Set(profiles.filter(doc => doc.get('accountStatus') === 'deleted').map(doc => doc.id));
        const changes = page.docs.filter(doc => !deleted.has(doc.get('authorId'))).map(doc => ({ id: doc.id, before: doc.data(), after: doc.data() }));
        const store = createFeedGenerationStore(db, target, { contentIdentity: 'generation' });
        const plan = await store.prepareBatch(tx, changes, { reconcileBuilding: true, additionalWrites: 1,
          generationContext: context(tx, current.state, current.saved, current.markers, profiles) });
        plan.apply();
        const phase = page.size < current.job.batchSize ? 'audit' : 'backfill';
        tx.update(jobRef, { phase, version: current.job.version + 1, after: page.docs.at(-1)?.id ?? current.job.after,
          scanned: current.job.scanned + page.size });
        return { phase, scanned: page.size, nodeWrites: plan.nodeWrites, directoryWrites: plan.directoryWrites,
          historyWrites: plan.historyWrites, reads: plan.reads, checkpointWrites: 1, batchSize: current.job.batchSize };
      });
    } catch (error) {
      if (!attempted || !['lab-mutation-too-large', 'feed-transaction-write-budget-exceeded'].includes(error.message) || attempted.job.batchSize === 1) throw error;
      return db.runTransaction(async tx => {
        const current = await guard(tx, ['backfill']);
        if (current.job.version !== attempted.job.version) throw new Error('feed-transition-step-changed');
        const smaller = Math.max(1, Math.floor(current.job.batchSize / 2));
        tx.update(jobRef, { batchSize: smaller, version: current.job.version + 1 });
        return { phase: 'backfill', resized: true, batchSize: smaller, scanned: 0 };
      });
    }
  }
  async function beginAudit() {
    return db.runTransaction(async tx => {
      const current = await guard(tx, ['audit', 'auditing', 'ready', 'failed']);
      if (current.from.get('activeErasure') || current.to.get('activeErasure')) throw new Error('feed-transition-audit-fence-changed');
      const audit = { part: 'source', after: null, rootAfter: null, rootsDone: false, frontier: [],
        readTime: current.saved.readTime, sourceErasure: current.from.get('erasureRevision') ?? 0,
        targetErasure: current.to.get('erasureRevision') ?? 0, cutoff: current.to.get('prunedThrough') ?? -1,
        source: accumulator(), index: accumulator() };
      tx.update(jobRef, { phase: 'auditing', audit, version: current.job.version + 1 }); return { phase: 'auditing' };
    });
  }
  async function auditStep() {
    const current = await db.runTransaction(tx => guard(tx, ['auditing']), { readOnly: true });
    const pin = pinAlive(current), audit = { ...pin, frontier: clone(pin.frontier), source: { ...pin.source }, index: { ...pin.index } };
    validateAccumulator(audit.source); validateAccumulator(audit.index);
    const metrics = { sourceReads: 0, profileReads: 0, rootReads: 0, nodeReads: 0 };
    await db.runTransaction(async tx => {
      if (audit.part === 'source') {
        let query = db.collection('shouts').where('status', '==', 'active').orderBy(FieldPath.documentId()).limit(current.job.batchSize);
        if (audit.after) query = query.startAfter(audit.after);
        const page = await tx.get(query); metrics.sourceReads += Math.max(1, page.size);
        const authors = [...new Set(page.docs.map(doc => doc.get('authorId')))];
        const profiles = authors.length ? await tx.getAll(...authors.map(uid => db.doc(`publicProfiles/${uid}`))) : []; metrics.profileReads += profiles.length;
        const deleted = new Set(profiles.filter(doc => doc.get('accountStatus') === 'deleted').map(doc => doc.id));
        for (const doc of page.docs) {
          if (deleted.has(doc.get('authorId'))) continue;
          const row = metadataOf({ ...doc.data(), id: doc.id }, { contentIdentity: true });
          if (row.expiresAt > audit.cutoff) add(audit.source, row);
        }
        audit.after = page.docs.at(-1)?.id ?? audit.after;
        if (page.size < current.job.batchSize) { audit.part = 'index'; audit.after = null; }
      } else if (audit.part === 'index') {
        if (!audit.frontier.length && !audit.rootsDone) {
          let query = targetRef.collection('cells').orderBy(FieldPath.documentId()).limit(current.job.batchSize);
          if (audit.rootAfter) query = query.startAfter(audit.rootAfter);
          const page = await tx.get(query); metrics.rootReads += Math.max(1, page.size);
          for (const doc of page.docs) {
            const grid = cellGrid(doc.id);
            if (!/^[a-f0-9]{64}$/.test(doc.get('hash')) || doc.get('v') !== 1 || !integer(doc.get('revision')) || doc.get('revision') < 1 ||
                !Number.isFinite(doc.get('minExpiry')) || doc.get('latCell') !== grid.latCell || doc.get('lonCell') !== grid.lonCell) throw new Error('invalid-transition-root');
            audit.frontier.push({ hash: doc.get('hash'), path: doc.id, exact: false, minExpiry: doc.get('minExpiry') });
          }
          audit.rootAfter = page.docs.at(-1)?.id ?? audit.rootAfter; audit.rootsDone = page.size < current.job.batchSize;
        }
        for (let steps = 0; steps < 32 && audit.frontier.length; steps++) {
          const item = audit.frontier.pop(), doc = await tx.get(targetRef.collection('nodes').doc(item.hash)); metrics.nodeReads++;
          const node = verifyNode(item.hash, doc.data());
          if (item.exact ? node.path !== item.path : !node.path.startsWith(item.path)) throw new Error('invalid-transition-root');
          if (item.exact ? canonical(node.summary) !== canonical(item.summary) : node.summary.minExpiry !== item.minExpiry) throw new Error('invalid-transition-root');
          if (node.kind === 'leaf') {
            for (const row of node.rows) if (row.expiresAt > audit.cutoff) add(audit.index, row);
          } else for (const child of Object.values(node.children)) {
            const summary = { ...child }; delete summary.hash; delete summary.path;
            audit.frontier.push({ hash: child.hash, path: child.path, exact: true, summary });
          }
        }
        if (!audit.frontier.length && audit.rootsDone) audit.part = 'done';
      } else throw new Error('invalid-transition-audit');
    }, { readOnly: true, readTime: pin.readTime });
    if (encodedBytes(audit) > 262144) throw new Error('transition-checkpoint-too-large');
    return db.runTransaction(async tx => {
      const fresh = await guard(tx, ['auditing']); pinAlive(fresh);
      if (fresh.job.version !== current.job.version) throw new Error('feed-transition-step-changed');
      const phase = audit.part === 'done' ? canonical(audit.source) === canonical(audit.index) ? 'ready' : 'failed' : 'auditing';
      tx.update(jobRef, { phase, audit, version: fresh.job.version + 1 }); return { phase, metrics, source: audit.source, index: audit.index };
    });
  }
  async function activate() {
    return db.runTransaction(async tx => {
      const current = await guard(tx, ['ready', 'active']);
      if (current.job.phase === 'active') return { phase: 'active', changed: false };
      const pin = pinAlive(current);
      if (pin.part !== 'done' || canonical(pin.source) !== canonical(pin.index)) throw new Error('feed-transition-coverage-required');
      if (current.state.revision >= Number.MAX_SAFE_INTEGER) throw new Error('invalid-transition-revision');
      tx.update(controlRef, { revision: current.state.revision + 1, mode: 'active', readGenerationId: target });
      tx.update(targetRef, { transitionId: FieldValue.delete() });
      tx.update(jobRef, { phase: 'active', controlRevision: current.state.revision + 1, after: null, version: current.job.version + 1 });
      return { phase: 'active', changed: true };
    });
  }
  async function rollback() {
    return db.runTransaction(async tx => {
      const current = await guard(tx, ['active', 'rolled-back']);
      if (current.job.phase === 'rolled-back') return { phase: 'rolled-back', changed: false };
      if (current.state.revision >= Number.MAX_SAFE_INTEGER) throw new Error('invalid-transition-revision');
      tx.update(controlRef, { revision: current.state.revision + 1, mode: 'active', readGenerationId: source });
      tx.update(jobRef, { phase: 'rolled-back', controlRevision: current.state.revision + 1, after: null, version: current.job.version + 1 });
      return { phase: 'rolled-back', changed: true };
    });
  }
  async function abort() {
    return db.runTransaction(async tx => {
      const current = await guard(tx, ['backfill', 'audit', 'auditing', 'ready', 'failed', 'aborted']);
      if (current.job.phase === 'aborted') return { phase: 'aborted', changed: false };
      if (current.state.revision >= Number.MAX_SAFE_INTEGER) throw new Error('invalid-transition-revision');
      tx.update(controlRef, { revision: current.state.revision + 1, mode: 'active', writeGenerationIds: [source] });
      tx.update(targetRef, { transitionId: FieldValue.delete() });
      tx.update(jobRef, { phase: 'aborted', controlRevision: current.state.revision + 1, after: null, version: current.job.version + 1 });
      return { phase: 'aborted', changed: true };
    });
  }
  async function resume() {
    return db.runTransaction(async tx => {
      const current = await guard(tx, ['rolled-back']);
      if (current.state.revision >= Number.MAX_SAFE_INTEGER) throw new Error('invalid-transition-revision');
      tx.update(controlRef, { revision: current.state.revision + 1, mode: 'building' });
      tx.update(targetRef, { transitionId: target });
      tx.update(jobRef, { phase: 'audit', controlRevision: current.state.revision + 1, audit: FieldValue.delete(), version: current.job.version + 1 });
      return { phase: 'audit' };
    });
  }
  return Object.freeze({ begin, step, beginAudit, auditStep, activate, rollback, resume, abort, jobRef });
}
