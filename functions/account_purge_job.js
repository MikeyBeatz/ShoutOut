import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { accountPurgeJobRef, validateAccountPurgeJob, readAccountPurgeGuard, samePurgeTime,
  AccountPurgeNeedsReview, AccountPurgeLeaseLost, AccountPurgeRequestChanged, AccountPurgeConflict } from './account_purge_guard.js';
import { accountPurgeStages, queryAccountPurgeStage, validatePurgeSelection, purgeSourceIdentity,
  accountPurgeLinks, purgeScrubPatch } from './account_purge_policy.js';
import { purgeTreeFrame, stepAccountPurgeTree } from './account_purge_tree.js';
import { createPurgeDocumentPager } from './account_purge_pager.js';
import { purgeActivity } from './account_purge_activity.js';
import { stepAccountPurgeStorage } from './account_purge_storage.js';
import { purgedShoutContext } from './shout_context.js';
export { purgedShoutContext } from './shout_context.js';

const marker = { schemaVersion: 1, accountStatus: 'deleted' };
const keyValid = key => typeof key === 'string' && key.length >= 3 && key.length <= 24 && key === key.toLowerCase() &&
  /^[\p{L}0-9]+([-_][\p{L}0-9]+)*$/u.test(key);

export async function runAccountPurgeJob(identity, db, auth, {
  pageSize, leaseMillis, retryDelayMillis, clock = () => new Date(),
  pager = null, bucket = null, beforeCommit = null, storageStep = stepAccountPurgeStorage, indexWriter = null,
} = {}) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      ![leaseMillis, retryDelayMillis].every(n => Number.isSafeInteger(n) && n > 0) || typeof clock !== 'function') {
    throw new Error('invalid-account-purge-options');
  }
  const jobRef = accountPurgeJobRef(db, identity), requestRef = db.doc(`accountDeletionRequests/${identity.userId}`),
    mainRef = db.doc(`accountDeletionJobs/${jobRef.id}`), profileRef = db.doc(`publicProfiles/${identity.userId}`),
    userRef = db.doc(`users/${identity.userId}`), stages = accountPurgeStages(identity.userId), token = randomUUID();
  const now = () => { const date = clock(); if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) throw new Error('invalid-purge-clock'); return Timestamp.fromDate(date); };
  const header = await jobRef.get();
  if (!header.exists) return { state: 'purged', examined: 0 };
  validateAccountPurgeJob(header.data(), identity, stages.length);
  if (['needs-review', 'obsolete'].includes(header.get('phase'))) return { state: header.get('phase'), examined: 0 };
  if (header.get('retainUntil').toMillis() > now().toMillis() || header.get('nextAttemptAt')?.toMillis() > now().toMillis()) return { state: 'deferred', examined: 0 };
  // An Auth outage is never proof of deletion. Never delete an Auth account here.
  try { await auth.getUser(identity.userId); return { state: 'auth-still-exists', examined: 0 }; }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  const claim = await db.runTransaction(async transaction => {
    const [snapshot, request, main, user, profile] = await transaction.getAll(jobRef, requestRef, mainRef, userRef, profileRef);
    if (!snapshot.exists) return 'purged';
    const job = snapshot.data(), time = now(); validateAccountPurgeJob(job, identity, stages.length);
    if (!request.exists || request.get('status') !== 'pending' || request.get('userId') !== identity.userId ||
        !samePurgeTime(request.createTime, identity.requestCreateTime)) return 'obsolete';
    if (job.leaseUntil?.toMillis() > time.toMillis() || main.get('leaseUntil')?.toMillis() > time.toMillis()) return 'busy';
    if (job.retainUntil.toMillis() > time.toMillis() || job.nextAttemptAt?.toMillis() > time.toMillis()) return 'deferred';
    if (['needs-review', 'obsolete'].includes(job.phase)) return job.phase;
    const key = job.reservationKey ?? main.get('reservationKey') ?? user.get('nicknameLower');
    if (!keyValid(key)) throw new AccountPurgeNeedsReview('purge-reservation-identity-unavailable');
    transaction.update(jobRef, { phase: 'purging', reservationKey: key, leaseToken: token,
      leaseUntil: Timestamp.fromMillis(time.toMillis() + leaseMillis), updatedAt: time,
      deletedCount: job.deletedCount + (job.ingressClosedAt === null && user.exists ? 1 : 0),
      ...(job.ingressClosedAt === null ? { ingressClosedAt: time } : {}) });
    if (!request.get('authDeletionConfirmedAt')) transaction.update(requestRef, { authDeletionConfirmedAt: time });
    if (job.ingressClosedAt === null) {
      if (!profile.exists || profile.get('schemaVersion') !== 1 || profile.get('accountStatus') !== 'deleted' || Object.keys(profile.data()).length !== 2) {
        transaction.set(profileRef, marker);
      }
      // Install once: retries must never recreate preferences after their drain.
      if (user.exists) transaction.delete(userRef, { lastUpdateTime: user.updateTime });
      transaction.set(userRef.collection('settings').doc('notifications'), { replies: false, reactions: false,
        privateReplies: false, followedProfiles: false, nearbyShouts: false });
      if (main.exists) transaction.update(mainRef, { retentionPurgeStartedAt: time, leaseToken: null, leaseUntil: null, nextAttemptAt: null, updatedAt: time });
    }
    return 'claimed';
  });
  if (claim !== 'claimed') return { state: claim, examined: 0 };
  const documentPager = pager ?? createPurgeDocumentPager(db);
  const guard = transaction => readAccountPurgeGuard(transaction, db, identity, jobRef, token, clock, stages.length);
  const commitProgress = async (version, patch, mutation = null) => db.runTransaction(async transaction => {
    const current = await guard(transaction);
    if (current.job.version !== version) throw new AccountPurgeLeaseLost();
    if (mutation) await mutation(transaction, current);
    transaction.update(jobRef, { ...(Object.hasOwn(patch, 'stage') ? { stageCursor: null } : {}), ...patch, version: version + 1, updatedAt: current.now });
  });
  let examined = 0;
  try {
    while (examined < pageSize) {
      const { job } = await db.runTransaction(guard), stage = stages[job.stage];
      if (!stage) {
        const nicknameRef = db.doc(`nicknames/${job.reservationKey}`);
        for (const ref of [jobRef, requestRef, mainRef, profileRef, nicknameRef, userRef]) {
          if ((await ref.listCollections()).length) throw new AccountPurgeNeedsReview('unexpected-final-purge-descendants');
        }
        await db.runTransaction(async transaction => {
          const current = await guard(transaction), [reservation, main, user] = await transaction.getAll(nicknameRef, mainRef, userRef);
          if (current.job.version !== job.version || current.job.selected || current.job.pendingFile) throw new AccountPurgeLeaseLost();
          if (user.exists) throw new AccountPurgeNeedsReview('private-profile-recreated-during-purge');
          if (reservation.get('uid') === identity.userId) transaction.delete(nicknameRef, { lastUpdateTime: reservation.updateTime });
          if (main.exists) transaction.delete(mainRef, { lastUpdateTime: main.updateTime });
          transaction.delete(requestRef, { lastUpdateTime: current.request.updateTime });
          transaction.delete(jobRef);
        });
        return { state: 'purged', examined, deleted: job.deletedCount, scrubbed: job.scrubbedCount, storage: job.storageCount };
      }
      if (stage.action === 'storage') {
        if (!storageStep) throw new AccountPurgeNeedsReview('purge-storage-adapter-unavailable');
        const result = await storageStep({ db, identity, bucket, jobRef, guard, stage, beforeCommit });
        if (result.complete) await commitProgress(job.version, { stage: job.stage + 1 });
        examined++; continue;
      }
      if (!job.selected) {
        let query = stage.direct ? null : queryAccountPurgeStage(db, stage, identity.userId);
        if (stage.action === 'freeze') {
          query = query.orderBy(FieldPath.documentId());
          if (job.stageCursor) query = query.startAfter(db.doc(job.stageCursor));
        }
        const source = stage.direct ? await db.doc(stage.direct).get() : (await query.get()).docs[0];
        if (!source && !stage.direct) { await commitProgress(job.version, { stage: job.stage + 1 }); examined++; continue; }
        if (source.exists && !validatePurgeSelection(source, stage, identity.userId)) throw new AccountPurgeNeedsReview('invalid-purge-selection');
        if (stage.action === 'freeze') {
          await commitProgress(job.version, { stageCursor: source.ref.path, scrubbedCount: job.scrubbedCount + 1 }, async transaction => {
            const fresh = await transaction.get(source.ref);
            if (!fresh.exists || !samePurgeTime(fresh.createTime, source.createTime) || !validatePurgeSelection(fresh, stage, identity.userId)) {
              throw new AccountPurgeNeedsReview('purge-freeze-target-replaced');
            }
            const operationId = createHash('sha256').update(JSON.stringify(['accountPurge', jobRef.id, job.version])).digest('hex');
            const plan = await indexWriter?.prepare(transaction, fresh.id, fresh.data(), null, { operationId }); plan?.apply();
            transaction.set(source.ref, { ...purgedShoutContext, authorId: identity.userId });
          });
          examined++; continue;
        }
        const selected = { path: source.ref.path, createTime: source.createTime ?? null, link: 0,
          source: ['archive', 'comment', 'privateReply', 'shout', 'report'].includes(stage.action) ? purgeSourceIdentity(source, stage.action) : null };
        if (stage.action === 'scrub' || stage.action === 'evidence') {
          await commitProgress(job.version, { scrubbedCount: job.scrubbedCount + 1 }, async transaction => {
            const fresh = await transaction.get(source.ref);
            if (!fresh.exists || !samePurgeTime(fresh.createTime, source.createTime) || !validatePurgeSelection(fresh, stage, identity.userId)) throw new AccountPurgeNeedsReview('purge-scrub-replaced');
            transaction.update(source.ref, purgeScrubPatch(fresh.data(), stage.action === 'evidence' ? 'copiedReport' : 'scrub', stage.field));
          });
        } else {
          await commitProgress(job.version, { selected, stack: [purgeTreeFrame(selected.path)] });
        }
        examined++; continue;
      }
      const selected = job.selected, links = selected.source ? accountPurgeLinks(selected.source) : [];
      if (selected.link < links.length) {
        const link = links[selected.link];
        let query = link.direct ? null : link.group ? db.collectionGroup(link.collection) : db.collection(link.collection);
        for (const [field, value, operator] of link.filters ?? []) query = query.where(field, operator ?? '==', value);
        const source = link.direct ? await db.doc(link.direct).get() : (await query.limit(1).get()).docs[0];
        if (!source?.exists) {
          await commitProgress(job.version, { selected: { ...selected, link: selected.link + 1 } }); examined++; continue;
        }
        if ((await source.ref.listCollections()).length) throw new AccountPurgeNeedsReview('unexpected-linked-evidence-descendants');
        if (beforeCommit) await beforeCommit({ path: source.ref.path, operation: link.action });
        await commitProgress(job.version, {
          ...(link.direct ? { selected: { ...selected, link: selected.link + 1 } } : {}),
          [link.action === 'delete' ? 'deletedCount' : 'scrubbedCount']: job[link.action === 'delete' ? 'deletedCount' : 'scrubbedCount'] + 1,
        }, async transaction => {
          const root = await transaction.get(db.doc(selected.path)), fresh = await transaction.get(source.ref);
          if (!root.exists || !samePurgeTime(root.createTime, selected.createTime) || !validatePurgeSelection(root, stage, identity.userId)) {
            throw new AccountPurgeNeedsReview('purge-linked-root-replaced');
          }
          if (selected.source?.archived && ['comment', 'privateReply'].includes(selected.source.kind)) {
            const livePath = `shouts/${selected.source.shoutId}/${selected.source.kind === 'comment' ? 'comments' : 'privateReplies'}/${selected.source.childId}`;
            const live = await transaction.get(db.doc(livePath));
            if (live.exists && !samePurgeTime(live.createTime, selected.source.originalCreateTime)) {
              throw new AccountPurgeNeedsReview('archived-source-recreated-before-linked-purge');
            }
          }
          if (!fresh.exists || !samePurgeTime(fresh.updateTime, source.updateTime)) throw new AccountPurgeConflict('purge-linked-evidence-changed');
          if (link.action === 'delete') transaction.delete(source.ref, { lastUpdateTime: fresh.updateTime });
          else transaction.update(source.ref, purgeScrubPatch(fresh.data(), link.action, null, link));
        });
        examined++; continue;
      }
      if (stage.action === 'shout' || ['save', 'reaction', 'comment'].includes(stage.action)) {
        // Counter-bearing roots need their source mutation in the same journal transaction.
        // Children drain first for comments; votes/saves are leaf-only by the write protocol.
        if (stage.action !== 'comment' || job.stack.at(-1).path === selected.path &&
            job.stack.at(-1).collections !== null && job.stack.at(-1).collectionIndex === job.stack.at(-1).collections.length) {
          if (stage.action !== 'comment' && (await db.doc(selected.path).listCollections()).length && stage.action !== 'shout') {
            throw new AccountPurgeNeedsReview('unexpected-activity-descendants');
          }
          if (beforeCommit) await beforeCommit({ path: selected.path, operation: stage.action });
          const keepContext = stage.action === 'shout' && (await db.doc(selected.path).listCollections()).length > 0;
          await commitProgress(job.version, { selected: null, stack: [],
            ...(stage.direct ? { stage: job.stage + 1 } : {}),
            [keepContext ? 'scrubbedCount' : 'deletedCount']: job[keepContext ? 'scrubbedCount' : 'deletedCount'] + 1,
          }, async transaction => {
            const root = await transaction.get(db.doc(selected.path));
            if (!root.exists || !samePurgeTime(root.createTime, selected.createTime) || !validatePurgeSelection(root, stage, identity.userId)) throw new AccountPurgeNeedsReview('purge-root-replaced');
            if (['save', 'reaction'].includes(stage.action)) await purgeActivity(transaction, root, stage.action, identity.userId,
              { indexWriter, operationId: createHash('sha256').update(JSON.stringify(['accountPurge', jobRef.id, job.version])).digest('hex') });
            if (stage.action === 'comment') {
              const parent = await transaction.get(root.ref.parent.parent), count = parent.get('commentsCount') ?? 0;
              if (parent.exists && parent.get('contentPurged') !== true) {
                const before = (a, b) => a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds < b.nanoseconds;
                if (before(root.createTime, parent.createTime)) {
                  if (!before(root.updateTime, parent.createTime)) throw new AccountPurgeNeedsReview('ambiguous-purge-comment-parent');
                } else {
                  if (!Number.isSafeInteger(count) || count < 1) throw new AccountPurgeNeedsReview('invalid-purge-comment-count');
                  transaction.update(parent.ref, { commentsCount: count - 1 });
                }
              }
            }
            const plan = stage.action === 'shout' ? await indexWriter?.prepare(transaction, root.id, root.data(), null,
              { operationId: createHash('sha256').update(JSON.stringify(['accountPurge', jobRef.id, job.version])).digest('hex') }) : null;
            plan?.apply();
            if (keepContext) transaction.set(root.ref, purgedShoutContext);
            else transaction.delete(root.ref, { lastUpdateTime: root.updateTime });
          });
          examined++; continue;
        }
      }
      await stepAccountPurgeTree(db, { pager: documentPager, guard, jobRef, beforeCommit,
        validateSelection: snapshot => validatePurgeSelection(snapshot, stage, identity.userId) });
      // Fixed UID roots are traversed once even when their own document is absent.
      if (stage.direct && !(await jobRef.get()).get('selected')) {
        const latest = await db.runTransaction(guard); await commitProgress(latest.job.version, { stage: job.stage + 1 });
      }
      examined++;
    }
    await db.runTransaction(async transaction => {
      const { now: time } = await guard(transaction);
      transaction.update(jobRef, { leaseToken: null, leaseUntil: null, nextAttemptAt: Timestamp.fromMillis(time.toMillis() + retryDelayMillis), updatedAt: time });
    });
    return { state: 'purging', examined };
  } catch (error) {
    if (error instanceof AccountPurgeLeaseLost) return { state: 'lease-lost', examined };
    const permanent = error instanceof AccountPurgeNeedsReview || error instanceof AccountPurgeRequestChanged || [3, 7, 9, 403, 412].includes(error?.code);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(jobRef);
      if (!snapshot.exists || snapshot.get('leaseToken') !== token) return;
      const time = now();
      transaction.update(jobRef, { leaseToken: null, leaseUntil: null, phase: error instanceof AccountPurgeRequestChanged ? 'obsolete' : permanent ? 'needs-review' : 'purging',
        nextAttemptAt: permanent ? null : Timestamp.fromMillis(time.toMillis() + retryDelayMillis), lastErrorCode: 'purge-processing-failed', updatedAt: time });
    });
    if (permanent) return { state: error instanceof AccountPurgeRequestChanged ? 'obsolete' : 'needs-review', examined };
    throw error;
  } finally { if (!pager) await documentPager.close(); }
}
