// Shared queue/proof engine. No scheduler or Auth mutations.
import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { accountPurgeJobRef, accountRetentionMillis, samePurgeTime, validPurgeUid,
  AccountPurgeNeedsReview, AccountPurgeConflict } from './account_purge_guard.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';

import { runAccountIndexErasureSliceStore } from './feed_account_retention_runner.js';

export class EarlyErasureIdentityChanged extends Error {}
export class EarlyErasureLeaseLost extends Error {}
export class EarlyErasureNeedsReview extends Error {}
const idValid = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(id);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = time => [time.seconds, time.nanoseconds];
const emptyDigest = hash([]);
const leaseMillis = 120000, retryMillis = 60000;

export function createEarlyErasureQueueStore(db, auth, { binding, clock = () => new Date(), beforeFinishCommit, transactionGuard } = {}) {
  if (!binding || typeof binding.indexFor !== 'function' || typeof binding.createIndex !== 'function' || typeof auth?.getUser !== 'function' || typeof clock !== 'function' ||
      !(beforeFinishCommit === undefined || typeof beforeFinishCommit === 'function') ||
      !(transactionGuard === undefined || typeof transactionGuard === 'function')) throw new Error('invalid-early-erasure-options');
  const base = binding.base, jobs = base.collection('jobs');
  const controlRef = db.doc('feedIndexControl/current'), registry = db.collection('feedIndexGenerations');
  const jobFor = identity => jobs.doc(accountPurgeJobRef(db, identity).id);
  const now = () => {
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime()) || date.getTime() < 0) throw new Error('invalid-early-erasure-clock');
    return Timestamp.fromDate(date);
  };
  const deadline = identity => Timestamp.fromMillis(identity.requestCreateTime.toMillis() + accountRetentionMillis);
  const identityFor = doc => ({ projectId: db.projectId, userId: doc.get('userId'), requestCreateTime: doc.get('requestCreateTime') });
  async function missingAuth(uid) {
    try { await auth.getUser(uid); return false; }
    catch (error) { if (error?.code === 'auth/user-not-found') return true; throw error; }
  }
  async function eligible(tx, identity) {
    if (transactionGuard) await transactionGuard(tx);
    jobFor(identity); const time = now();
    const [request, profile] = await tx.getAll(db.doc(`accountDeletionRequests/${identity.userId}`), db.doc(`publicProfiles/${identity.userId}`));
    if (!request.exists || !samePurgeTime(request.createTime, identity.requestCreateTime) ||
        request.get('userId') !== identity.userId || request.get('status') !== 'pending') throw new EarlyErasureIdentityChanged();
    const confirmed = request.get('authDeletionConfirmedAt');
    if (!(confirmed instanceof Timestamp) || confirmed.toMillis() < request.createTime.toMillis() || confirmed.toMillis() > time.toMillis() ||
        profile.get('schemaVersion') !== 1 || profile.get('accountStatus') !== 'deleted' || Object.keys(profile.data() ?? {}).length !== 2) {
      throw new EarlyErasureNeedsReview('early-erasure-confirmation-or-marker-unavailable');
    }
    return time;
  }
  async function control(tx) {
    const doc = await tx.get(controlRef), data = doc.exists ? validateFeedIndexControl(doc.data()) : null;
    return { token: doc.exists ? hash([stamp(doc.createTime), stamp(doc.updateTime)]) : 'absent', writers: data?.writeGenerationIds ?? [] };
  }
  function validateJob(data, identity) {
    if (!data || data.v !== 1 || data.userId !== identity.userId || !samePurgeTime(data.requestCreateTime, identity.requestCreateTime) ||
        !samePurgeTime(data.retainUntil, deadline(identity)) || !['queued', 'working', 'complete', 'finalizing', 'obsolete', 'needs-review'].includes(data.phase) ||
        !['inventory', 'processing'].includes(data.stage) || !(data.cursor === null || idValid(data.cursor)) ||
        !(data.activeGeneration === null || idValid(data.activeGeneration)) ||
        !(data.registryToken === null || data.registryToken === 'absent' || /^[a-f0-9]{64}$/.test(data.registryToken)) ||
        !/^[a-f0-9]{64}$/.test(data.digest) || ![data.version, data.targetCount, data.doneCount, data.seenWriters].every(n => Number.isSafeInteger(n) && n >= 0) ||
        data.doneCount > data.targetCount || data.seenWriters > data.targetCount || !(data.leaseToken === null || typeof data.leaseToken === 'string') ||
        (data.leaseToken === null) !== (data.leaseUntil === null) || !(data.leaseUntil === null || data.leaseUntil instanceof Timestamp) ||
        !(data.nextAttemptAt === null || data.nextAttemptAt instanceof Timestamp) || !(data.completedAt === null || data.completedAt instanceof Timestamp) ||
        ['complete', 'finalizing'].includes(data.phase) && (data.doneCount !== data.targetCount || data.activeGeneration !== null || !data.completedAt || data.registryToken === null ||
          data.leaseToken !== null || data.nextAttemptAt !== null || data.stage !== 'processing' || data.cursor !== null)) {
      throw new EarlyErasureNeedsReview('invalid-early-erasure-job');
    }
  }
  function validateTarget(data) {
    if (!data || data.v !== 1 || !(data.registrationCreateTime instanceof Timestamp) || !(data.indexCreateTime instanceof Timestamp) ||
        !(data.epoch === 'absent' || /^[a-f0-9]{64}$/.test(data.epoch)) || typeof data.complete !== 'boolean' ||
        !(data.completedAt === null || data.completedAt instanceof Timestamp) || data.complete !== (data.completedAt !== null)) {
      throw new EarlyErasureNeedsReview('invalid-early-erasure-target');
    }
    return data;
  }
  async function guard(tx, identity, token, generation = null) {
    const time = await eligible(tx, identity), doc = await tx.get(jobFor(identity)), data = doc.data(); validateJob(data, identity);
    if (data.phase !== 'working' || !token || data.leaseToken !== token || data.leaseUntil?.toMillis() <= time.toMillis() ||
        generation !== null && data.activeGeneration !== generation) throw new EarlyErasureLeaseLost();
    if (generation !== null) {
      const registrationRef = registry.doc(generation), indexRef = binding.indexFor(generation);
      const [target, registration, separateIndex] = await tx.getAll(jobFor(identity).collection('targets').doc(generation),
        registrationRef, ...(indexRef.path === registrationRef.path ? [] : [indexRef]));
      const index = separateIndex ?? registration;
      const expected = validateTarget(target.data());
      if (expected.complete || !registration.exists || !index.exists || registration.get('schemaVersion') !== 1 ||
          !samePurgeTime(registration.createTime, expected.registrationCreateTime) || !samePurgeTime(index.createTime, expected.indexCreateTime) ||
          index.get('v') !== 1 || index.get('accountRetention') !== true) throw new EarlyErasureNeedsReview('early-erasure-generation-replaced');
    }
    return { time, data, ref: doc.ref };
  }
  const freshJob = (identity, time) => ({ v: 1, userId: identity.userId, requestCreateTime: identity.requestCreateTime,
    retainUntil: deadline(identity), phase: 'queued', stage: 'inventory', cursor: null, activeGeneration: null,
    registryToken: null, digest: emptyDigest, targetCount: 0, doneCount: 0, seenWriters: 0, version: 0,
    leaseToken: null, leaseUntil: null, nextAttemptAt: time, completedAt: null, lastError: null });

  async function enqueue(identity) {
    const ref = jobFor(identity);
    // Missing confirmation/marker is not permission to manufacture either.
    await db.runTransaction(tx => eligible(tx, identity));
    if (!await missingAuth(identity.userId)) return { state: 'auth-still-exists' };
    return db.runTransaction(async tx => {
      const time = await eligible(tx, identity), doc = await tx.get(ref), snapshot = await control(tx);
      if (!doc.exists) { tx.create(ref, freshJob(identity, time)); return { state: 'queued' }; }
      const data = doc.data(); validateJob(data, identity);
      if (data.phase === 'complete' && data.registryToken !== snapshot.token) {
        tx.update(ref, { phase: 'queued', stage: 'inventory', cursor: null, registryToken: null,
          completedAt: null, nextAttemptAt: time, version: data.version + 1 }); return { state: 'queued' };
      }
      return { state: data.phase };
    });
  }

  async function recover({ pageSize = 50 } = {}) {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error('invalid-early-erasure-page');
    const checkpoint = await base.get(), cursor = checkpoint.get('cursor') ?? null;
    const purgeRevision = checkpoint.get('purgeRevision') ?? 0;
    if (checkpoint.exists && checkpoint.get('v') !== 1 || !(cursor === null || validPurgeUid(cursor)) ||
        !Number.isSafeInteger(purgeRevision) || purgeRevision < 0) throw new EarlyErasureNeedsReview('invalid-early-erasure-scan');
    let query = db.collection('accountDeletionRequests').orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);
    const page = await query.limit(pageSize).get(), result = { scanned: page.size, queued: 0, skipped: 0, ineligible: 0, failed: 0, checkpointAdvanced: false };
    for (const request of page.docs) {
      if (!validPurgeUid(request.id) || request.get('status') !== 'pending' || request.get('userId') !== request.id) { result.skipped++; continue; }
      try {
        const response = await enqueue({ projectId: db.projectId, userId: request.id, requestCreateTime: request.createTime });
        if (response.state === 'queued') result.queued++; else result.skipped++;
      } catch (error) {
        if (error instanceof EarlyErasureIdentityChanged || error instanceof EarlyErasureNeedsReview) { result.skipped++; result.ineligible++; }
        else result.failed++;
      }
    }
    // Auth outages do not advance recovery past work which could not be checked.
    if (!result.failed) result.checkpointAdvanced = await db.runTransaction(async tx => {
      const current = await tx.get(base);
      if (checkpoint.exists !== current.exists || checkpoint.exists && !checkpoint.updateTime.isEqual(current.updateTime)) return false;
      tx.set(base, { v: 1, cursor: page.size === pageSize ? page.docs.at(-1).id : null }, { merge: true }); return true;
    });
    return result;
  }

  async function inventory(identity, token) {
    return db.runTransaction(async tx => {
      const { data, ref } = await guard(tx, identity, token), snapshot = await control(tx);
      const reset = data.registryToken !== snapshot.token;
      if (data.activeGeneration !== null) throw new EarlyErasureNeedsReview('inventory-during-active-erasure');
      let query = registry.orderBy(FieldPath.documentId());
      if (!reset && data.cursor) query = query.startAfter(data.cursor);
      const page = await tx.get(query.limit(50));
      if (snapshot.token === 'absent' && !page.empty) throw new EarlyErasureNeedsReview('uncontrolled-index-generations');
      if (page.docs.some(doc => !idValid(doc.id) || doc.get('schemaVersion') !== 1)) throw new EarlyErasureNeedsReview('invalid-index-generation');
      const targets = page.docs.map(doc => ref.collection('targets').doc(doc.id));
      const previous = targets.length ? await tx.getAll(...targets) : [];
      // Runtime registration and generation marker share a document. Reuse the
      // inventory snapshot instead of billing a second read of every marker.
      const colocated = page.docs.every(doc => binding.indexFor(doc.id).path === doc.ref.path);
      const indexes = colocated ? page.docs : page.size ? await tx.getAll(...page.docs.map(doc => binding.indexFor(doc.id))) : [];
      let targetCount = reset ? 0 : data.targetCount, doneCount = reset ? 0 : data.doneCount,
        seenWriters = reset ? 0 : data.seenWriters, digest = reset ? emptyDigest : data.digest;
      const prepared = page.docs.map((doc, i) => {
        const index = indexes[i];
        if (!index.exists || index.get('v') !== 1 || index.get('accountRetention') !== true) throw new EarlyErasureNeedsReview('index-generation-unavailable');
        const old = previous[i].exists ? validateTarget(previous[i].data()) : null;
        const complete = Boolean(old?.complete && samePurgeTime(old.registrationCreateTime, doc.createTime) && samePurgeTime(old.indexCreateTime, index.createTime));
        targetCount++; if (complete) doneCount++; if (snapshot.writers.includes(doc.id)) seenWriters++;
        digest = hash([digest, doc.id, stamp(doc.createTime), stamp(index.createTime)]);
        return { v: 1, epoch: snapshot.token, registrationCreateTime: doc.createTime, indexCreateTime: index.createTime,
          complete, completedAt: complete ? old.completedAt : null };
      });
      const more = page.size === 50;
      if (!more && seenWriters !== snapshot.writers.length) throw new EarlyErasureNeedsReview('unregistered-control-generation');
      prepared.forEach((value, i) => tx.set(targets[i], value));
      tx.update(ref, { registryToken: snapshot.token, stage: more ? 'inventory' : 'processing',
        cursor: more ? page.docs.at(-1).id : null, digest, targetCount, doneCount, seenWriters, version: data.version + 1 });
      return { state: 'inventory', generations: page.size };
    });
  }

  async function selectTarget(identity, token) {
    return db.runTransaction(async tx => {
      const { data, ref, time } = await guard(tx, identity, token), snapshot = await control(tx);
      if (data.registryToken !== snapshot.token) {
        tx.update(ref, { stage: 'inventory', cursor: null, registryToken: null, version: data.version + 1 });
        return { state: 'inventory' };
      }
      if (data.cursor !== null || data.seenWriters !== snapshot.writers.length) throw new EarlyErasureNeedsReview('incomplete-generation-inventory');
      const candidates = await tx.get(ref.collection('targets').where('epoch', '==', data.registryToken).where('complete', '==', false)
        .orderBy(FieldPath.documentId()).limit(1));
      const next = candidates.docs[0];
      if (!next) {
        if (data.doneCount !== data.targetCount) throw new EarlyErasureNeedsReview('incomplete-early-erasure-targets');
        tx.update(ref, { phase: 'complete', leaseToken: null, leaseUntil: null, nextAttemptAt: null,
          completedAt: time, version: data.version + 1 }); return { state: 'complete' };
      }
      validateTarget(next.data());
      tx.update(ref, { activeGeneration: next.id, version: data.version + 1 });
      return { state: 'selected', generation: next.id };
    });
  }

  async function finishTarget(identity, token, generation) {
    const adapter = binding.createIndex(db, generation);
    return db.runTransaction(async tx => {
      const { data, ref, time } = await guard(tx, identity, token, generation);
      const plan = await adapter.prepareAccountIndexFinish(tx, identity, { clock, guard: inner => guard(inner, identity, token, generation) });
      if (beforeFinishCommit) await beforeFinishCommit();
      plan.apply();
      tx.update(ref.collection('targets').doc(generation), { complete: true, completedAt: time });
      tx.update(ref, { activeGeneration: null, doneCount: data.doneCount + 1, version: data.version + 1 });
      return { state: 'generation-complete', generation };
    });
  }

  async function release(identity, token, patch = {}) {
    return db.runTransaction(async tx => {
      const ref = jobFor(identity), doc = await tx.get(ref);
      if (doc.get('leaseToken') !== token) return false;
      const data = doc.data(); validateJob(data, identity);
      tx.update(ref, { leaseToken: null, leaseUntil: null, nextAttemptAt: Timestamp.fromMillis(now().toMillis() + retryMillis),
        version: data.version + 1, ...patch }); return true;
    });
  }

  async function run(identity, sliceOptions = {}) {
    const ref = jobFor(identity), header = await ref.get();
    if (!header.exists) return { state: 'missing' };
    const initial = header.data(); validateJob(initial, identity);
    if (initial.phase === 'complete') {
      const proof = await verify(identity);
      return { state: proof.valid ? 'complete' : 'stale-proof', proof };
    }
    if (['finalizing', 'obsolete', 'needs-review'].includes(initial.phase)) return { state: initial.phase };
    const time = now();
    if (initial.leaseUntil?.toMillis() > time.toMillis()) return { state: 'busy' };
    if (initial.nextAttemptAt?.toMillis() > time.toMillis()) return { state: 'deferred' };
    if (!await missingAuth(identity.userId)) {
      await db.runTransaction(async tx => {
        const doc = await tx.get(ref), data = doc.data(); validateJob(data, identity);
        if (data.leaseUntil?.toMillis() > now().toMillis() || !['queued', 'working'].includes(data.phase)) return;
        tx.update(ref, { phase: 'needs-review', leaseToken: null, leaseUntil: null, nextAttemptAt: null,
          lastError: 'auth-still-exists', version: data.version + 1 });
      });
      return { state: 'auth-still-exists' };
    }
    const token = randomUUID();
    let claim;
    try { claim = await db.runTransaction(async tx => {
      const date = await eligible(tx, identity), doc = await tx.get(ref), data = doc.data(); validateJob(data, identity);
      if (!['queued', 'working'].includes(data.phase)) return data.phase;
      if (data.leaseUntil?.toMillis() > date.toMillis()) return 'busy';
      if (data.nextAttemptAt?.toMillis() > date.toMillis()) return 'deferred';
      tx.update(ref, { phase: 'working', leaseToken: token, leaseUntil: Timestamp.fromMillis(date.toMillis() + leaseMillis),
        nextAttemptAt: Timestamp.fromMillis(date.toMillis() + leaseMillis), lastError: null, version: data.version + 1 }); return 'claimed';
    }); } catch (error) {
      if (error instanceof EarlyErasureIdentityChanged || error instanceof EarlyErasureNeedsReview) await db.runTransaction(async tx => {
        const doc = await tx.get(ref), data = doc.data(); validateJob(data, identity);
        if (data.leaseUntil?.toMillis() > now().toMillis() || !['queued', 'working'].includes(data.phase)) return;
        tx.update(ref, { phase: error instanceof EarlyErasureIdentityChanged ? 'obsolete' : 'needs-review',
          leaseToken: null, leaseUntil: null, nextAttemptAt: null, lastError: 'claim-identity-unavailable', version: data.version + 1 });
      });
      throw error;
    }
    if (claim !== 'claimed') return { state: claim };
    try {
      let current = (await ref.get()).data(); validateJob(current, identity);
      let result;
      if (current.activeGeneration !== null) {
        const generation = current.activeGeneration;
        const slice = await runAccountIndexErasureSliceStore(identity, db, { ...sliceOptions, createIndex: measured => binding.createIndex(measured, generation),
          clock, guard: tx => guard(tx, identity, token, generation) });
        result = slice.state === 'complete' ? { ...await finishTarget(identity, token, generation), slice } : { state: 'yielded', generation, slice };
      } else if (current.stage === 'inventory') result = await inventory(identity, token);
      else result = await selectTarget(identity, token);
      if (result.state !== 'complete') await release(identity, token);
      return result;
    } catch (error) {
      const cause = error.cause ?? error, busy = cause.message === 'index-erasure-busy';
      const review = cause instanceof EarlyErasureNeedsReview || /invalid-|erasure-verification|index-path|index-retention/.test(cause.message ?? '');
      const obsolete = cause instanceof EarlyErasureIdentityChanged;
      await release(identity, token, obsolete ? { phase: 'obsolete', nextAttemptAt: null, lastError: 'identity-changed' } :
        review ? { phase: 'needs-review', nextAttemptAt: null, lastError: 'index-erasure-needs-review' } :
          { ...(busy ? { phase: 'queued' } : {}), lastError: cause instanceof EarlyErasureLeaseLost ? 'lease-lost' : 'index-erasure-retry' });
      throw error;
    }
  }

  async function runNext(sliceOptions) {
    const time = now();
    for (const phase of ['working', 'queued']) {
      const page = await jobs.where('phase', '==', phase).where('retainUntil', '>=', Timestamp.fromMillis(0))
        .where('nextAttemptAt', '<=', time).orderBy('retainUntil').orderBy('nextAttemptAt').orderBy(FieldPath.documentId()).limit(1).get();
      if (!page.empty) {
        const selected = page.docs[0], identity = identityFor(selected);
        if (jobFor(identity).id !== selected.id) throw new EarlyErasureNeedsReview('invalid-early-erasure-job-key');
        return { jobId: selected.id, ...await run(identity, sliceOptions) };
      }
    }
    return { state: 'idle' };
  }

  async function verify(identity) {
    return db.runTransaction(async tx => {
      await eligible(tx, identity);
      const doc = await tx.get(jobFor(identity)), snapshot = await control(tx);
      if (!doc.exists) return { valid: false, reason: 'missing' };
      const data = doc.data(); validateJob(data, identity);
      if (['complete', 'finalizing'].includes(data.phase) && data.registryToken === snapshot.token && data.seenWriters !== snapshot.writers.length) {
        throw new EarlyErasureNeedsReview('incomplete-generation-proof');
      }
      return ['complete', 'finalizing'].includes(data.phase) && data.registryToken === snapshot.token
        ? { valid: true, retainUntil: data.retainUntil, generations: data.targetCount, digest: data.digest }
        : { valid: false, reason: data.phase === 'complete' ? 'registry-changed' : 'incomplete' };
    });
  }

  function purgeCoordinator() {
    // The account worker supplies its actual transacted lease guard. The
    // independent early queue guard alone must never authorize final deletion.
    async function context(tx, identity, outerGuard) {
      if (typeof outerGuard !== 'function') throw new AccountPurgeNeedsReview('index-purge-guard-required');
      const owner = await outerGuard(tx), time = await eligible(tx, identity);
      if (!owner?.job || owner.job.phase !== 'purging' || owner.job.userId !== identity.userId ||
          !samePurgeTime(owner.job.requestCreateTime, identity.requestCreateTime) ||
          !samePurgeTime(owner.job.retainUntil, deadline(identity)) || typeof owner.job.leaseToken !== 'string' || !owner.job.leaseToken ||
          !(owner.job.leaseUntil instanceof Timestamp) || owner.job.leaseUntil.toMillis() <= time.toMillis() || time.toMillis() < deadline(identity).toMillis()) {
        throw new AccountPurgeNeedsReview('invalid-index-purge-context');
      }
      const ref = jobFor(identity), doc = await tx.get(ref), snapshot = await control(tx);
      const data = doc.exists ? doc.data() : null;
      if (data) validateJob(data, identity);
      return { ref, doc, data, snapshot, time };
    }
    const currentProof = ({ data, snapshot }) => data && ['complete', 'finalizing'].includes(data.phase) &&
      data.registryToken === snapshot.token && data.seenWriters === snapshot.writers.length;
    function mapped(error) {
      const cause = error.cause ?? error;
      if (cause instanceof EarlyErasureNeedsReview || cause instanceof EarlyErasureIdentityChanged || /invalid-|incomplete-/.test(cause.message ?? '')) {
        return new AccountPurgeNeedsReview(cause.message || 'invalid-index-purge-proof');
      }
      return cause;
    }
    async function step(identity, { guard: outerGuard, limit } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('invalid-index-purge-limit');
      try {
        const prepared = await db.runTransaction(async tx => {
          const ctx = await context(tx, identity, outerGuard), { data, ref, snapshot, time } = ctx;
          if (data && ['obsolete', 'needs-review'].includes(data.phase)) throw new AccountPurgeNeedsReview('index-erasure-not-eligible');
          if (currentProof(ctx)) {
            if (data.phase === 'complete') tx.update(ref, { phase: 'finalizing', version: data.version + 1 });
            return true;
          }
          // A new generation may appear between cleanup pages. Re-open the
          // queue before touching more targets; missing per-target proof then
          // causes safe reprocessing, never optimistic certification.
          if (data?.phase === 'finalizing') tx.update(ref, { phase: 'queued', stage: 'inventory', cursor: null,
            registryToken: null, completedAt: null, nextAttemptAt: time, version: data.version + 1 });
          if (data && data.registryToken === snapshot.token && ['complete', 'finalizing'].includes(data.phase)) {
            throw new AccountPurgeNeedsReview('incomplete-index-purge-proof');
          }
          return false;
        });
        if (!prepared) {
          const linked = createEarlyErasureQueueStore(db, auth, { binding, clock, beforeFinishCommit, transactionGuard: outerGuard });
          await linked.enqueue(identity);
          await linked.run(identity);
          return { state: 'waiting', examined: 1 };
        }
        const collections = await jobFor(identity).listCollections();
        if (collections.some(collection => collection.id !== 'targets')) throw new AccountPurgeNeedsReview('unexpected-index-proof-descendants');
        return await db.runTransaction(async tx => {
          const ctx = await context(tx, identity, outerGuard);
          if (!currentProof(ctx) || ctx.data.phase !== 'finalizing') throw new AccountPurgeConflict('index-proof-changed');
          const page = await tx.get(ctx.ref.collection('targets').orderBy(FieldPath.documentId()).limit(limit));
          const children = await Promise.all(page.docs.map(doc => doc.ref.listCollections()));
          if (children.some(collections => collections.length)) throw new AccountPurgeNeedsReview('unexpected-index-target-descendants');
          page.docs.forEach(doc => validateTarget(doc.data()));
          await outerGuard(tx); // Recheck ownership/time after auxiliary RPCs.
          page.docs.forEach(doc => tx.delete(doc.ref, { lastUpdateTime: doc.updateTime }));
          if (!page.empty) tx.update(ctx.ref, { version: ctx.data.version + 1 });
          return { state: page.empty ? 'ready' : 'waiting', examined: page.size };
        });
      } catch (error) { throw mapped(error); }
    }
    async function prepareFinish(tx, identity, { guard: outerGuard } = {}) {
      try {
        const ctx = await context(tx, identity, outerGuard);
        if (!currentProof(ctx) || ctx.data.phase !== 'finalizing') throw new AccountPurgeConflict('index-proof-changed');
        const pending = await tx.get(ctx.ref.collection('targets').limit(1));
        if (!pending.empty) throw new AccountPurgeNeedsReview('index-proof-cleanup-incomplete');
        const checkpoint = await tx.get(base), cursor = checkpoint.get('cursor') ?? null;
        const purgeRevision = checkpoint.get('purgeRevision') ?? 0;
        if (checkpoint.exists && checkpoint.get('v') !== 1 || !(cursor === null || validPurgeUid(cursor)) ||
            !Number.isSafeInteger(purgeRevision) || purgeRevision < 0 || purgeRevision >= Number.MAX_SAFE_INTEGER) {
          throw new AccountPurgeNeedsReview('invalid-index-recovery-checkpoint');
        }
        let applied = false;
        return { apply() {
          if (applied) throw new Error('index-purge-plan-already-applied'); applied = true;
          tx.delete(ctx.ref, { lastUpdateTime: ctx.doc.updateTime });
          // Fence scans that captured a request before this final transaction.
          // A cursor must not reintroduce the retired UID after its deletion.
          tx.set(base, { v: 1, cursor: cursor === identity.userId ? null : cursor, purgeRevision: FieldValue.increment(1) }, { merge: true });
        } };
      } catch (error) { throw mapped(error); }
    }
    return { step, prepareFinish };
  }
  return { base, jobFor, enqueue, recover, run, runNext, verify, purgeCoordinator };
}
