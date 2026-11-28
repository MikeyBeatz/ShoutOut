// Disabled transaction projection. No trigger, scheduler, public read or write.
import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { lifecycleBodyHash } from './content_lifecycle.js';
import { moderationQueueDeploymentProfile } from './moderation_queue_deployment.js';

export const moderationQueueConfiguration = Object.freeze({ enabled: moderationQueueDeploymentProfile().enabled });
export const moderationQueueBinding = Symbol('moderation-queue-binding');
export const moderationDecisionBatch = Symbol('moderation-decision-batch');
export const moderationReportCollections = Object.freeze({ reports: 'shout', commentReports: 'comment', privateReplyReports: 'privateReply' });
export const moderationQueuePageSize = 50;
export const moderationQueueWriteBudget = 450;
const order = fields => Object.freeze(fields.map(Object.freeze));
// One contract for actual SDK orders and the selective composite-index plan.
export const moderationQueueOrders = Object.freeze({
  mostReported: order([['pendingCount', 'desc'], ['lastAt', 'desc'], ['__name__', 'asc']]),
  newest: order([['lastAt', 'desc'], ['__name__', 'asc']]),
  oldest: order([['lastAt', 'asc'], ['__name__', 'asc']]),
});
const hash = value => createHash('sha256').update(value).digest('hex');
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = text => { throw new HttpsError('failed-precondition', text); };
const pending = data => data && ['open', 'escalated'].includes(data.status);
const clone = value => Array.isArray(value) ? value.map(clone) : value && Object.getPrototypeOf(value) === Object.prototype
  ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) : value;

export function moderationReportTarget(path, data) {
  const parts = path.split('/'), type = moderationReportCollections[parts[0]];
  if (parts.length !== 2 || !type || !id(data?.shoutId)) fail('moderation-report-target-invalid');
  const targetId = type === 'shout' ? data.shoutId : data[type === 'comment' ? 'commentId' : 'privateReplyId'];
  if (!id(targetId) || !id(data.reporterId) || parts[1] !== `${data.reporterId}_${data.shoutId}${type === 'shout' ? '' : `_${targetId}`}` ||
      typeof data.reason !== 'string' || !data.reason || [...data.reason].length > 500 ||
      !(data.createdAt instanceof Timestamp) || !['open', 'escalated', 'resolved'].includes(data.status)) fail('moderation-report-target-invalid');
  return { type, shoutId: data.shoutId, targetId, caseId: hash(`${type}\n${data.shoutId}\n${targetId}`) };
}

export function validateModerationQueueControl(data, { reading = false } = {}) {
  if (data?.schemaVersion !== 1 || !digest(data.incarnation) || !Number.isSafeInteger(data.revision) || data.revision < 1 ||
      !['building', 'active', 'paused'].includes(data.mode) || reading && data.mode !== 'active') fail('moderation-queue-unavailable');
  return data;
}

export function moderationFilterToken(level, category = 'all', area = { kind: 'all', value: '' }) {
  if (![3, 4].includes(level) || !['all', 'shout', 'comment', 'privateReply'].includes(category) ||
      !area || !['all', 'country', 'subdivision', 'geohash'].includes(area.kind) || typeof area.value !== 'string' ||
      area.kind === 'all' && area.value !== '' || area.kind === 'country' && !/^[A-Z]{2}$/.test(area.value) ||
      area.kind === 'subdivision' && !/^[A-Z]{2}-[A-Z0-9-]{1,8}$/.test(area.value) ||
      area.kind === 'geohash' && !/^[0123456789bcdefghjkmnpqrstuvwxyz]{1,7}$/.test(area.value)) {
    throw new HttpsError('invalid-argument', 'Invalid moderation filter.');
  }
  return `${level}:${category}:${area.kind}:${area.value}`;
}

function areas(geography, geohash) {
  const result = [{ kind: 'all', value: '' }];
  if (geography?.schemaVersion === 1 && /^[A-Z]{2}$/.test(geography.countryCode ?? '')) {
    result.push({ kind: 'country', value: geography.countryCode });
    if (/^[A-Z]{2}-[A-Z0-9-]{1,8}$/.test(geography.subdivisionCode ?? '')) result.push({ kind: 'subdivision', value: geography.subdivisionCode });
  }
  if (/^[0123456789bcdefghjkmnpqrstuvwxyz]{7}$/.test(geohash ?? '')) {
    for (let n = 1; n <= 7; n++) result.push({ kind: 'geohash', value: geohash.slice(0, n) });
  }
  return result;
}

function member(path, data, sourceCreateTime, evidenceIdentity) {
  moderationReportTarget(path, data);
  return { reportPath: path, status: data.status, createdAt: data.createdAt, sourceCreateTime: sourceCreateTime ?? null,
    reportIncarnation: data.moderationQueueIncarnation, evidenceIdentity };
}
function sameStamp(a, b) { return a === null && b === null || a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b); }
const compare = (a, b) => a.createdAt.seconds - b.createdAt.seconds || a.createdAt.nanoseconds - b.createdAt.nanoseconds || (a.reportPath < b.reportPath ? -1 : a.reportPath > b.reportPath ? 1 : 0);
function validMember(data, target) {
  if (!data || !pending(data) || !(data.createdAt instanceof Timestamp) || !digest(data.reportIncarnation) || !digest(data.evidenceIdentity) ||
      data.sourceCreateTime !== null && !(data.sourceCreateTime instanceof Timestamp) || typeof data.reportPath !== 'string') fail('moderation-queue-member-invalid');
  const p = data.reportPath.split('/');
  if (p.length !== 2 || moderationReportCollections[p[0]] !== target.type) fail('moderation-queue-member-invalid');
  return data;
}

export function validateModerationCase(data, caseId = null) {
  if (data?.schemaVersion !== 1 || !id(data.shoutId) || !id(data.targetId) || !Object.values(moderationReportCollections).includes(data.type) ||
      caseId !== null && hash(`${data.type}\n${data.shoutId}\n${data.targetId}`) !== caseId || !digest(data.incarnation) ||
      !Number.isSafeInteger(data.revision) || data.revision < 1 ||
      ![data.openCount, data.escalatedCount, data.pendingCount].every(n => Number.isSafeInteger(n) && n >= 0) ||
      data.pendingCount !== data.openCount + data.escalatedCount || !(data.firstAt instanceof Timestamp) || !(data.lastAt instanceof Timestamp) ||
      !digest(data.evidenceIdentity) || typeof data.audited !== 'boolean' || !Array.isArray(data.filterTokens) || !data.filterTokens.every(v => typeof v === 'string')) fail('moderation-case-invalid');
  return data;
}

/** Must be the innermost database adapter, so it sees the archive's final writes.
 * A disabled adapter returns the exact input object and performs zero reads.
 * Direct/batch writes deliberately are not advertised as an alternative writer.
 */
export function createModerationQueueDatabase(db, { enabled = moderationQueueConfiguration.enabled, writeBudget = moderationQueueWriteBudget } = {}) {
  if (typeof enabled !== 'boolean' || !Number.isInteger(writeBudget) || writeBudget < 1 || writeBudget > 450) throw new Error('invalid-moderation-queue-options');
  if (!enabled) return db;
  if (db[moderationQueueBinding]) return db;
  assertFeedRuntimeTarget(db);
  return new Proxy(db, { get(target, key) {
    if (key === moderationQueueBinding) return Object.freeze({ enabled: true });
    if (key !== 'runTransaction') return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    return (operation, ...options) => target.runTransaction(async raw => {
      const observed = new Map(), writes = [];
      let exceeded = false;
      const remember = result => {
        for (const doc of Array.isArray(result) ? result : result.docs ?? [result]) if (doc?.ref) observed.set(doc.ref.path, doc);
        return result;
      };
      // Reuse snapshots only inside this one SDK transaction. No process cache
      // may outlive a role, retention or source-incarnation change.
      const read = async ref => observed.get(ref.path) ?? remember(await raw.get(ref));
      const tx = new Proxy(raw, { get(transaction, method) {
        if (['get', 'getAll'].includes(method)) return async (...args) => {
          if (writes.length) throw new Error('moderation-queue-read-after-write');
          const value = await transaction[method](...args);
          const masked = args.some(a => a && Object.hasOwn(a, 'fieldMask'));
          return !masked && (method === 'getAll' || typeof args[0]?.path === 'string') ? remember(value) : value;
        };
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => {
          if (writes.length >= writeBudget) { exceeded = true; throw new Error('feed-transaction-write-budget-exceeded'); }
          writes.push({ method, args: args.map(clone) }); return tx;
        };
        return typeof transaction[method] === 'function' ? transaction[method].bind(transaction) : transaction[method];
      } });
      const result = await operation(tx);
      if (exceeded) throw new Error('feed-transaction-write-budget-exceeded');
      const preload = async refs => {
        const missing = [...new Map(refs.filter(r => !observed.has(r.path)).map(r => [r.path, r])).values()];
        if (missing.length) remember(await raw.getAll(...missing));
      };
      const touched = writes.map(w => w.args[0]).filter(ref => ref?.path?.split('/').length === 2 &&
        Object.hasOwn(moderationReportCollections, ref.parent.id));
      if (new Set(touched.map(r => r.path)).size > 50) fail('moderation-report-batch-exceeds-50');
      await preload(touched);
      const changed = new Map();
      for (const write of writes) {
        const ref = write.args[0], parts = ref?.path?.split('/') ?? [];
        if (parts.length !== 2 || !Object.hasOwn(moderationReportCollections, parts[0])) continue;
        if (!changed.has(ref.path)) {
          const before = await read(ref);
          changed.set(ref.path, { ref, before, after: before.data() ?? null, last: write });
        }
        const c = changed.get(ref.path), data = write.args[1]; c.last = write;
        c.after = write.method === 'delete' ? null : write.method === 'update' || write.method === 'set' && write.args[2]?.merge
          ? { ...c.after, ...data } : data;
      }
      if (changed.size > 50) fail('moderation-report-batch-exceeds-50');
      const extra = [];
      if (changed.size) {
        const control = validateModerationQueueControl((await read(db.doc('moderationQueueControl/current'))).data());
        const cases = new Map();
        for (const c of changed.values()) {
          if (!pending(c.before.data()) && !pending(c.after)) continue;
          const target = moderationReportTarget(c.ref.path, c.after ?? c.before.data());
          if (c.before.exists && c.after && moderationReportTarget(c.ref.path, c.before.data()).caseId !== target.caseId) fail('moderation-report-target-changed');
          if (!cases.has(target.caseId)) cases.set(target.caseId, { target, changes: [] });
          cases.get(target.caseId).changes.push(c);
        }
        await preload([...cases.values()].flatMap(({ target, changes }) => [
          db.doc(`moderationCases/${target.caseId}`),
          ...changes.map(c => db.doc(`moderationCases/${target.caseId}/members/${c.ref.id}`)),
        ]));
        await preload([...cases.values()].filter(({ target }) => !observed.get(`moderationCases/${target.caseId}`).exists).flatMap(({ target, changes }) => [
          db.doc(`shouts/${target.shoutId}`),
          ...(changes.some(c => pending(c.after) && !digest(c.after.contentArchiveKey) && !digest(c.after.accountArchiveId)) ? [
            db.doc(`shouts/${target.shoutId}${target.type === 'shout' ? '' : `/${target.type === 'comment' ? 'comments' : 'privateReplies'}/${target.targetId}`}`),
          ] : []),
        ]));
        for (const { target, changes } of cases.values()) {
          const ref = db.doc(`moderationCases/${target.caseId}`), oldDoc = await read(ref);
          const old = oldDoc.exists ? validateModerationCase(oldDoc.data(), target.caseId) : null;
          const capability = tx[moderationDecisionBatch];
          const allowedDecision = capability?.caseId === target.caseId && capability.jobId === old?.activeDecision;
          const deleting = changes.every(c => c.after === null);
          const retirementPatch = write => {
            if (write.method !== 'update') return false;
            const fields = write.args[1], entries = Object.entries(fields);
            const removes = value => value?.isEqual?.(FieldValue.delete()) === true;
            const context = fields.parentContextPurged === true && fields.moderationGeography === null && removes(fields.shoutArchiveKey);
            return entries.length > 0 && entries.every(([key, value]) =>
              ['resolvedBy', 'escalatedBy'].includes(key) && removes(value) ||
              context && ['parentContextPurged', 'moderationGeography', 'shoutArchiveKey'].includes(key));
          };
          const retiring = changes.every(c => c.after === null ||
            writes.filter(w => w.args[0]?.path === c.ref.path).every(retirementPatch));
          const retiringContext = retiring && changes.some(c => c.after?.parentContextPurged === true);
          if (old?.activeDecision && !allowedDecision && !retiring) fail('moderation-case-decision-in-progress');
          const changedMembers = new Map(), removed = new Set();
          let evidenceIdentity = old?.evidenceIdentity ?? null;
          let openCount = old?.openCount ?? 0, escalatedCount = old?.escalatedCount ?? 0;
          for (const c of changes) {
            const memberRef = ref.collection('members').doc(c.ref.id);
            const saved = await read(memberRef), before = saved.exists ? validMember(saved.data(), target) : null;
            if (before && (before.reportPath !== c.ref.path || !c.before.exists ||
                c.before.get('moderationQueueIncarnation') !== before.reportIncarnation ||
                before.sourceCreateTime !== null && !sameStamp(before.sourceCreateTime, c.before.createTime))) fail('moderation-report-incarnation-changed');
            if (before && pending(c.after) && (!sameStamp(before.createdAt, c.after.createdAt) ||
                digest(c.after.contentArchiveKey) && hash(`content:${c.after.contentArchiveKey}`) !== before.evidenceIdentity ||
                digest(c.after.accountArchiveId) && hash(`account:${c.after.accountArchiveId}`) !== before.evidenceIdentity)) fail('moderation-report-evidence-changed');
            if (!before && pending(c.before.data()) && control.mode !== 'building') fail('moderation-queue-coverage-missing');
            if (old?.activeDecision && !pending(c.before.data()) && pending(c.after)) fail('moderation-case-decision-in-progress');
            if (before) { if (before.status === 'open') openCount--; else escalatedCount--; }
            if (pending(c.after)) {
              const nonce = before?.reportIncarnation ?? hash(randomUUID());
              if (before && c.after.moderationQueueIncarnation !== nonce) fail('moderation-report-incarnation-changed');
              c.after.moderationQueueIncarnation = nonce;
              c.last.args[1].moderationQueueIncarnation = nonce;
              let proof = before?.evidenceIdentity;
              if (!proof) {
                if (digest(c.after.contentArchiveKey)) proof = hash(`content:${c.after.contentArchiveKey}`);
                else if (digest(c.after.accountArchiveId)) proof = hash(`account:${c.after.accountArchiveId}`);
                else {
                  const sourcePath = `shouts/${target.shoutId}${target.type === 'shout' ? '' : `/${target.type === 'comment' ? 'comments' : 'privateReplies'}/${target.targetId}`}`;
                  const source = await read(db.doc(sourcePath));
                  if (!source.exists || !(source.get('createdAt') instanceof Timestamp) || c.before.exists &&
                      source.createTime.toMillis() > c.before.createTime.toMillis()) fail('moderation-report-evidence-unproven');
                  proof = hash(`legacy:${sourcePath}:${source.createTime.seconds}:${source.createTime.nanoseconds}:${lifecycleBodyHash(source.data())}`);
                }
              }
              if (evidenceIdentity && evidenceIdentity !== proof) fail('moderation-report-evidence-conflict');
              evidenceIdentity = proof;
              const next = member(c.ref.path, c.after, c.before.createTime ?? null, proof);
              changedMembers.set(c.ref.path, next);
              if (next.status === 'open') openCount++; else escalatedCount++;
              extra.push({ method: 'set', args: [memberRef, next] });
            } else { removed.add(c.ref.path); if (saved.exists) extra.push({ method: 'delete', args: [memberRef] }); }
          }
          if (openCount < 0 || escalatedCount < 0) fail('moderation-queue-counter-invalid');
          const count = openCount + escalatedCount;
          if (!count && (!old?.activeDecision || deleting && !allowedDecision)) {
            if (old) extra.push({ method: 'delete', args: [ref] });
            if (old?.activeDecision && !writes.some(w => w.args[0]?.path === `moderationCaseDecisions/${old.activeDecision}`)) extra.push({ method: 'delete', args: [db.doc(`moderationCaseDecisions/${old.activeDecision}`)] });
            continue;
          }
          const boundary = async descending => {
            const cached = old && { createdAt: descending ? old.lastAt : old.firstAt, reportPath: descending ? old.representativePath : old.firstReportPath };
            const candidates = [...changedMembers.values()];
            if (cached && !removed.has(cached.reportPath) && !changedMembers.has(cached.reportPath)) candidates.push(cached);
            if (old && cached && removed.has(cached.reportPath)) {
              const rows = await raw.get(ref.collection('members').orderBy('createdAt', descending ? 'desc' : 'asc').orderBy(FieldPath.documentId(), descending ? 'desc' : 'asc').limit(changes.length + 1));
              for (const row of rows.docs) if (!removed.has(row.get('reportPath')) && !changedMembers.has(row.get('reportPath'))) candidates.push(validMember(row.data(), target));
            }
            candidates.sort(compare);
            const selected = descending ? candidates.at(-1) : candidates[0];
            if (count && !selected) fail('moderation-queue-boundary-missing');
            return selected ?? cached;
          };
          const first = await boundary(false), last = await boundary(true);
          let geography = old?.geography ?? null, geohash = old?.geohash ?? null;
          const newestChange = changes.find(c => c.ref.path === last.reportPath && pending(c.after));
          if (!old || newestChange) {
            const report = newestChange?.after ?? (await read(db.doc(last.reportPath))).data();
            const parent = await read(db.doc(`shouts/${target.shoutId}`));
            geography = report?.parentContextPurged ? null : report?.moderationGeography ?? parent.get('geography') ?? null;
            geohash = report?.parentContextPurged ? null : parent.get('geohash') ?? null;
            if (!geohash && digest(report?.shoutArchiveKey)) {
              const archived = await read(db.doc(`contentLifecycleArchive/${report.shoutArchiveKey}`));
              if (archived.get('sourcePath') === `shouts/${target.shoutId}`) geohash = archived.get('content.geohash') ?? null;
            }
          }
          const filterTokens = [];
          for (const level of count ? openCount ? [3, 4] : [4] : []) for (const category of ['all', target.type]) for (const area of areas(geography, geohash)) filterTokens.push(moderationFilterToken(level, category, area));
          // A later report of the same target may reuse its deterministic ID
          // and timestamp. A completed/deleted case must still get a new identity.
          const incarnation = old?.incarnation ?? hash(`${control.incarnation}\n${randomUUID()}`);
          const cancelDecision = old?.activeDecision && (deleting || retiringContext) && !allowedDecision;
          if (cancelDecision && !writes.some(w => w.args[0]?.path === `moderationCaseDecisions/${old.activeDecision}`)) {
            extra.push({ method: 'delete', args: [db.doc(`moderationCaseDecisions/${old.activeDecision}`)] });
          }
          extra.push({ method: 'set', args: [ref, {
            schemaVersion: 1, ...target, incarnation, evidenceIdentity, audited: false, revision: (old?.revision ?? 0) + 1,
            openCount, escalatedCount, pendingCount: count, firstAt: first.createdAt, lastAt: last.createdAt,
            firstReportPath: first.reportPath, representativePath: last.reportPath, geography, geohash, filterTokens,
            ...(old?.activeDecision && !cancelDecision ? { activeDecision: old.activeDecision } : {}),
            ...(old?.appliedEffect ? { appliedEffect: old.appliedEffect } : {}),
            ...(allowedDecision && capability.casePatch ? capability.casePatch : {}),
          }] });
        }
      }
      // Account purge may delete a journal earlier than its ordinary7days.
      // Release its lock atomically, preserving only an already applied effect
      // tied to the still-retained case. Never recreate a purged case.
      for (const write of writes.filter(w => w.method === 'delete' && w.args[0]?.parent.id === 'moderationCaseDecisions')) {
        const job = await read(write.args[0]);
        if (!digest(job.get('caseId'))) continue;
        const ref = db.doc(`moderationCases/${job.get('caseId')}`);
        if ([...writes, ...extra].some(w => w.args[0]?.path === ref.path)) continue;
        const c = await read(ref);
        if (c.exists && c.get('activeDecision') === job.id && c.get('incarnation') === job.get('caseIncarnation')) {
          extra.push(c.get('pendingCount') ? { method: 'update', args: [ref, { activeDecision: FieldValue.delete(), revision: c.get('revision') + 1 }] } : { method: 'delete', args: [ref] });
        }
      }
      if (writes.length + extra.length > writeBudget) throw new Error('feed-transaction-write-budget-exceeded');
      // The domain callback may also write the case (decision lock/progress).
      // Refuse collisions rather than silently overwriting either transaction.
      if (extra.some(e => writes.some(w => w.args[0]?.path === e.args[0]?.path))) fail('moderation-projection-write-collision');
      for (const write of [...writes, ...extra]) raw[write.method](...write.args);
      return result;
    }, ...options);
  } });
}

// The decision runner attaches a server-only capability to its transaction.
// It is never selected by request fields, client report IDs or a flag in data.
export async function readPendingModerationReports(tx, db, input, legacyQuery) {
  const batch = tx[moderationDecisionBatch];
  if (!batch) return tx.get(legacyQuery);
  if (batch.targetType !== input.targetType || batch.shoutId !== input.shoutId || batch.targetId !== (input.targetId ?? input.shoutId) ||
      JSON.stringify(batch.docs.map(d => d.id).sort()) !== JSON.stringify([...input.reportIds].sort())) fail('moderation-decision-batch-mismatch');
  return { docs: batch.docs, size: batch.docs.length, empty: batch.docs.length === 0 };
}
