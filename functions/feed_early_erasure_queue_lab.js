// R6c experiment. No live wrapper, trigger, scheduler, Auth mutation or account
// purge integration. Generations map to equally named feedIndexLab fixtures.
import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { accountPurgeJobRef, accountRetentionMillis, samePurgeTime, validPurgeUid } from './account_purge_guard.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { createLabBlockIndex } from './feed_block_index_lab.js';
import { runAccountIndexErasureSlice } from './feed_account_retention_runner_lab.js';

export class EarlyErasureIdentityChanged extends Error {}
export class EarlyErasureLeaseLost extends Error {}
export class EarlyErasureNeedsReview extends Error {}
const idValid = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(id);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = time => [time.seconds, time.nanoseconds];
const emptyDigest = hash([]);
const leaseMillis = 120000, retryMillis = 60000;

export function createEarlyErasureQueueLab(db, auth, { namespace, clock = () => new Date(), beforeFinishCommit } = {}) {
  if (db?.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('early-erasure-emulator-only');
  }
  if (!idValid(namespace) || typeof auth?.getUser !== 'function' || typeof clock !== 'function' ||
      !(beforeFinishCommit === undefined || typeof beforeFinishCommit === 'function')) throw new Error('invalid-early-erasure-options');
  const base = db.doc(`feedErasureQueueLab/${namespace}`), jobs = base.collection('jobs');
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
        !samePurgeTime(data.retainUntil, deadline(identity)) || !['queued', 'working', 'complete', 'obsolete', 'needs-review'].includes(data.phase) ||
        !['inventory', 'processing'].includes(data.stage) || !(data.cursor === null || idValid(data.cursor)) ||
        !(data.activeGeneration === null || idValid(data.activeGeneration)) ||
        !(data.registryToken === null || data.registryToken === 'absent' || /^[a-f0-9]{64}$/.test(data.registryToken)) ||
        !/^[a-f0-9]{64}$/.test(data.digest) || ![data.version, data.targetCount, data.doneCount, data.seenWriters].every(n => Number.isSafeInteger(n) && n >= 0) ||
        data.doneCount > data.targetCount || data.seenWriters > data.targetCount || !(data.leaseToken === null || typeof data.leaseToken === 'string') ||
        (data.leaseToken === null) !== (data.leaseUntil === null) || !(data.leaseUntil === null || data.leaseUntil instanceof Timestamp) ||
        !(data.nextAttemptAt === null || data.nextAttemptAt instanceof Timestamp) || !(data.completedAt === null || data.completedAt instanceof Timestamp) ||
        data.phase === 'complete' && (data.doneCount !== data.targetCount || data.activeGeneration !== null || !data.completedAt || data.registryToken === null ||
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
      const [target, registration, index] = await tx.getAll(jobFor(identity).collection('targets').doc(generation),
        registry.doc(generation), db.doc(`feedIndexLab/${generation}`));
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
    if (checkpoint.exists && checkpoint.get('v') !== 1 || !(cursor === null || validPurgeUid(cursor))) throw new EarlyErasureNeedsReview('invalid-early-erasure-scan');
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
      tx.set(base, { v: 1, cursor: page.size === pageSize ? page.docs.at(-1).id : null }); return true;
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
      const indexes = page.size ? await tx.getAll(...page.docs.map(doc => db.doc(`feedIndexLab/${doc.id}`))) : [];
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
    const adapter = createLabBlockIndex(db, { namespace: generation, accountRetention: true });
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
    if (['obsolete', 'needs-review'].includes(initial.phase)) return { state: initial.phase };
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
        const slice = await runAccountIndexErasureSlice(identity, db, { ...sliceOptions, namespace: generation,
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
      if (data.phase === 'complete' && data.registryToken === snapshot.token && data.seenWriters !== snapshot.writers.length) {
        throw new EarlyErasureNeedsReview('incomplete-generation-proof');
      }
      return data.phase === 'complete' && data.registryToken === snapshot.token
        ? { valid: true, retainUntil: data.retainUntil, generations: data.targetCount, digest: data.digest }
        : { valid: false, reason: data.phase === 'complete' ? 'registry-changed' : 'incomplete' };
    });
  }
  return { base, jobFor, enqueue, recover, run, runNext, verify };
}
