// Emulator-only transition prototype. Live SDK mutations deliberately reject.
// A future operator needs the separately reviewed release/drain/digest gates.
import { createHash } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { moderationQueueBinding, moderationReportCollections, moderationReportTarget, validateModerationCase, validateModerationQueueControl } from './moderation_queue.js';
const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
const fail = reason => { throw new Error(reason); };
function laboratory(db) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || !db[moderationQueueBinding]?.enabled) fail('moderation-transition-emulator-only');
}
const collections = Object.keys(moderationReportCollections);
const boundary = (a, b) => a.createdAt.seconds - b.createdAt.seconds || a.createdAt.nanoseconds - b.createdAt.nanoseconds ||
  (a.reportPath < b.reportPath ? -1 : a.reportPath > b.reportPath ? 1 : 0);
const auditReset = { caseId: null, caseRevision: null, afterMemberId: null, openCount: 0, escalatedCount: 0, first: null, last: null };
export function moderationQueueTransitionPlan({ projectId, sourceCommit, incarnation }) {
  if (projectId !== 'shoutout-rules-test' || !/^[a-f0-9]{40}$/.test(sourceCommit) || !/^[a-f0-9]{64}$/.test(incarnation)) fail('invalid-moderation-transition-plan');
  const body = { schemaVersion: 1, kind: 'moderation-queue-install', projectId, sourceCommit, incarnation, pageSize: 50, writeBudget: 450 };
  return Object.freeze({ ...body, digest: hash(body) });
}
function checkedPlan(db, plan) {
  laboratory(db);
  const expected = moderationQueueTransitionPlan({ projectId: plan?.projectId, sourceCommit: plan?.sourceCommit, incarnation: plan?.incarnation });
  if (canonical(plan) !== canonical(expected) || plan.projectId !== db.projectId) fail('moderation-transition-plan-drift');
  return plan;
}
export async function beginModerationQueueTransition(db, plan) {
  checkedPlan(db, plan);
  return db.runTransaction(async tx => {
    const controlRef = db.doc('moderationQueueControl/current'), jobRef = db.doc(`moderationQueueMigrations/${plan.digest}`);
    const [control, job] = await tx.getAll(controlRef, jobRef);
    if (job.exists) {
      if (job.get('planDigest') !== plan.digest || control.get('incarnation') !== plan.incarnation) fail('moderation-transition-replaced');
      return job.data();
    }
    if (control.exists) fail('moderation-queue-already-installed');
    const state = { schemaVersion: 1, planDigest: plan.digest, incarnation: plan.incarnation, phase: 'adopt', collectionIndex: 0,
      afterId: null, inspected: 0, adopted: 0, ...auditReset };
    tx.create(controlRef, { schemaVersion: 1, revision: 1, incarnation: plan.incarnation, mode: 'building', planDigest: plan.digest });
    tx.create(jobRef, state); return state;
  });
}
/** One <=50 source/member step. Every cursor advances in the same transaction
 * as adoption or audit; a lost reply can only repeat a committed checkpoint.
 */
export async function stepModerationQueueTransition(db, plan) {
  checkedPlan(db, plan);
  return db.runTransaction(async tx => {
    const controlRef = db.doc('moderationQueueControl/current'), jobRef = db.doc(`moderationQueueMigrations/${plan.digest}`);
    const [controlDoc, jobDoc] = await tx.getAll(controlRef, jobRef), control = validateModerationQueueControl(controlDoc.data()), job = jobDoc.data();
    if (control.incarnation !== plan.incarnation || !job || job.planDigest !== plan.digest) fail('moderation-transition-replaced');
    if (control.mode === 'active' && job.phase === 'active') return job;
    if (control.mode !== 'building') fail('moderation-transition-replaced');
    if (job.phase === 'ready') {
      const dirty = await tx.get(db.collection('moderationCases').where('audited', '==', false).limit(1));
      if (dirty.empty) return job;
      tx.update(jobRef, { phase: 'audit' }); return { ...job, phase: 'audit' };
    }
    if (job.phase === 'adopt') {
      let query = db.collection(collections[job.collectionIndex]).orderBy(FieldPath.documentId());
      if (job.afterId) query = query.startAfter(job.afterId);
      const rows = await tx.get(query.limit(50));
      const pending = rows.docs.filter(d => ['open', 'escalated'].includes(d.get('status')));
      for (const row of pending) moderationReportTarget(row.ref.path, row.data());
      const complete = rows.size < 50, nextIndex = job.collectionIndex + (complete ? 1 : 0);
      const patch = { inspected: job.inspected + rows.size, adopted: job.adopted + pending.length,
        afterId: complete ? null : rows.docs.at(-1).id, collectionIndex: nextIndex,
        ...(nextIndex === collections.length ? { phase: 'audit', afterId: null } : {}) };
      for (const row of pending) tx.update(row.ref, { moderationQueueVersion: 1 });
      tx.update(jobRef, patch); return { ...job, ...patch };
    }
    if (job.phase !== 'audit') fail('invalid-moderation-transition-phase');
    if (!job.caseId) {
      const first = await tx.get(db.collection('moderationCases').where('audited', '==', false).orderBy(FieldPath.documentId()).limit(1));
      if (first.empty) { tx.update(jobRef, { phase: 'ready' }); return { ...job, phase: 'ready' }; }
      const c = validateModerationCase(first.docs[0].data(), first.docs[0].id);
      if (c.activeDecision) fail('moderation-transition-active-decision');
      const patch = { ...auditReset, caseId: first.docs[0].id, caseRevision: c.revision };
      tx.update(jobRef, patch); return { ...job, ...patch };
    }
    const caseRef = db.doc(`moderationCases/${job.caseId}`), current = await tx.get(caseRef);
    if (!current.exists || current.get('revision') !== job.caseRevision) {
      const patch = { ...auditReset };
      tx.update(jobRef, patch); return { ...job, ...patch };
    }
    const c = validateModerationCase(current.data(), job.caseId);
    let query = caseRef.collection('members').orderBy(FieldPath.documentId());
    if (job.afterMemberId) query = query.startAfter(job.afterMemberId);
    const rows = await tx.get(query.limit(50));
    const reports = rows.size ? await tx.getAll(...rows.docs.map(m => db.doc(m.get('reportPath')))) : [];
    let openCount = job.openCount, escalatedCount = job.escalatedCount, first = job.first, last = job.last;
    for (let i = 0; i < reports.length; i++) {
      const r = reports[i], m = rows.docs[i];
      if (!r.exists || moderationReportTarget(r.ref.path, r.data()).caseId !== job.caseId ||
          r.get('moderationQueueIncarnation') !== m.get('reportIncarnation') || r.get('status') !== m.get('status') ||
          !r.get('createdAt').isEqual(m.get('createdAt')) ||
          c.evidenceIdentity !== m.get('evidenceIdentity')) fail('moderation-transition-member-drift');
      const candidate = { createdAt: r.get('createdAt'), reportPath: r.ref.path };
      if (!first || boundary(candidate, first) < 0) first = candidate;
      if (!last || boundary(candidate, last) > 0) last = candidate;
      if (r.get('status') === 'open') openCount++; else escalatedCount++;
    }
    if (rows.size < 50) {
      if (openCount !== c.openCount || escalatedCount !== c.escalatedCount || openCount + escalatedCount !== c.pendingCount) fail('moderation-transition-counter-drift');
      if (!first || !last || !first.createdAt.isEqual(c.firstAt) || first.reportPath !== c.firstReportPath ||
          !last.createdAt.isEqual(c.lastAt) || last.reportPath !== c.representativePath) fail('moderation-transition-boundary-drift');
      tx.update(caseRef, { audited: true });
      const patch = { ...auditReset };
      tx.update(jobRef, patch); return { ...job, ...patch };
    }
    const patch = { afterMemberId: rows.docs.at(-1).id, openCount, escalatedCount, first, last };
    tx.update(jobRef, patch); return { ...job, ...patch };
  });
}
export async function activateModerationQueueTransition(db, plan) {
  checkedPlan(db, plan);
  return db.runTransaction(async tx => {
    const controlRef = db.doc('moderationQueueControl/current'), jobRef = db.doc(`moderationQueueMigrations/${plan.digest}`);
    const [control, job] = await tx.getAll(controlRef, jobRef);
    if (control.get('mode') === 'active' && control.get('incarnation') === plan.incarnation && job.get('phase') === 'active') return { mode: 'active', incarnation: plan.incarnation };
    const dirty = await tx.get(db.collection('moderationCases').where('audited', '==', false).limit(1));
    if (control.get('mode') !== 'building' || control.get('incarnation') !== plan.incarnation ||
        job.get('phase') !== 'ready' || !dirty.empty) fail('moderation-transition-not-ready');
    tx.update(controlRef, { mode: 'active', revision: control.get('revision') + 1 });
    tx.update(jobRef, { phase: 'active' }); return { mode: 'active', incarnation: plan.incarnation };
  });
}
