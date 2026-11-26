// Shared, inactive content lifecycle. No host or scheduler is activated here.
import { createHash } from 'node:crypto';
import { Timestamp, FieldValue, GeoPoint } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { accountPurgeJobRef } from './account_purge_guard.js';

// Capture can precede reader/history activation. Maintenance has its own gate.
export const contentLifecycleConfiguration = Object.freeze({ enabled: false, captureEnabled: false });
export const lifecycleDay = 86400000;
export const lifecycleHistoryMillis = 7 * lifecycleDay;
export const lifecycleArchiveMillis = 60 * lifecycleDay;
export const lifecycleBinding = Symbol('content-lifecycle');
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const timeOrder = (a, b) => a instanceof Timestamp && b instanceof Timestamp &&
  (a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message, code = 'failed-precondition') => { throw new HttpsError(code, message); };
const clone = value => Array.isArray(value) ? value.map(clone) : value && Object.getPrototypeOf(value) === Object.prototype
  ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) : value;
const mutable = new Set(['status', 'likesCount', 'dislikesCount', 'savesCount', 'commentsCount', 'cardRevision',
  'updatedAt', 'contentArchiveKey', 'contentHash', 'publicUntil', 'historyUntil']);
const reportCollections = new Map([['reports', 'shout'], ['commentReports', 'comment'], ['privateReplyReports', 'privateReply']]);
export function lifecycleSource(path) {
  const p = path?.split('/') ?? [];
  if (p[0] !== 'shouts' || !id(p[1])) return null;
  if (p.length === 2) return { kind: 'shout', shoutId: p[1] };
  if (p.length === 4 && ['comments', 'privateReplies'].includes(p[2]) && id(p[3])) {
    return { kind: p[2] === 'comments' ? 'comment' : 'privateReply', shoutId: p[1], targetId: p[3] };
  }
  return null;
}
function normalized(value) {
  if (value instanceof Timestamp) return ['timestamp', value.seconds, value.nanoseconds];
  if (value instanceof GeoPoint) return ['point', value.latitude, value.longitude];
  if (Array.isArray(value)) return value.map(normalized);
  if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.keys(value).sort().map(k => [k, normalized(value[k])]));
  if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error('invalid-content-archive-value');
}
export function lifecycleBody(data) {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !mutable.has(k)));
}
export const lifecycleBodyHash = data => hash(normalized(lifecycleBody(data)));
function archiveIdentityKey(projectId, path, createdAt, bodyHash) {
  return hash([projectId, path, createdAt.seconds, createdAt.nanoseconds, bodyHash]);
}
export function lifecycleArchiveKey(projectId, path, data) {
  if (!(data?.createdAt instanceof Timestamp)) throw new Error('content-created-at-required');
  return archiveIdentityKey(projectId, path, data.createdAt, lifecycleBodyHash(data));
}
export function lifecycleTimes(expiresAt, removedAt = null) {
  if (!(expiresAt instanceof Timestamp) || removedAt !== null && !(removedAt instanceof Timestamp)) throw new Error('invalid-content-end');
  const end = Math.min(expiresAt.toMillis(), removedAt?.toMillis() ?? Infinity);
  return { publicUntil: Timestamp.fromMillis(end), historyUntil: Timestamp.fromMillis(end + lifecycleHistoryMillis),
    retainUntil: Timestamp.fromMillis(end + lifecycleHistoryMillis + lifecycleArchiveMillis) };
}
export function validateLifecycleThread(data, expectedId = null) {
  if (data?.schemaVersion !== 1 || !id(data.shoutId) || !(data.sourceCreatedAt instanceof Timestamp) ||
      expectedId !== null && data.shoutId !== expectedId ||
      !(data.plannedExpiresAt instanceof Timestamp) || !(data.archivedAt instanceof Timestamp) ||
      !(data.publicUntil instanceof Timestamp) || data.publicUntil.toMillis() > data.plannedExpiresAt.toMillis() ||
      data.publicUntil.toMillis() < data.sourceCreatedAt.toMillis() ||
      !(data.historyUntil instanceof Timestamp) || !(data.retainUntil instanceof Timestamp) ||
      data.historyUntil.toMillis() !== data.publicUntil.toMillis() + lifecycleHistoryMillis ||
      data.retainUntil.toMillis() !== data.historyUntil.toMillis() + lifecycleArchiveMillis ||
      !validLifecycleCapture(data)) fail('Invalid content lifecycle header.');
  return data;
}
function subjects(source, kind) {
  const uids = kind === 'privateReply' ? [source.authorId, source.recipientId] : [source.authorId];
  if (!uids.every(id) || kind === 'privateReply' && (uids[0] === uids[1] ||
      !Array.isArray(source.participants) || source.participants.length !== 2 || source.participants.some((v, i) => v !== uids[i]))) fail('Invalid archived content owner.');
  return uids;
}
// A transition copy is a later server observation, never a claim that the
// publication was archived originally. SDK times bind the actual incarnation.
function validLifecycleCapture(data) {
  if (data.captureMode === undefined || data.captureMode === 'atomic-write') {
    return data.migrationDigest === undefined && data.sourceUpdateTime === undefined;
  }
  return data.captureMode === 'transition' && digest(data.migrationDigest) &&
    timeOrder(data.sourceCreateTime, data.sourceUpdateTime) && timeOrder(data.sourceUpdateTime, data.archivedAt);
}
export function lifecycleArchiveRecord(path, source, thread, { sourceCreateTime, sourceUpdateTime, migrationDigest } = {}) {
  const kind = lifecycleSource(path);
  if (!kind || !(source.createdAt instanceof Timestamp) || !(thread.sourceCreatedAt instanceof Timestamp) ||
      thread.shoutId !== kind.shoutId || kind.kind === 'shout' && !thread.sourceCreatedAt.isEqual(source.createdAt) ||
      sourceCreateTime !== undefined && !(sourceCreateTime instanceof Timestamp)) {
    throw new Error('invalid-lifecycle-archive-source');
  }
  if (migrationDigest !== undefined && (!digest(migrationDigest) || !timeOrder(sourceCreateTime, sourceUpdateTime))) {
    throw new Error('invalid-lifecycle-migration-capture');
  }
  return { schemaVersion: 1, kind: kind.kind, sourcePath: path, threadId: kind.shoutId,
    threadCreatedAt: thread.sourceCreatedAt, sourceCreatedAt: source.createdAt,
    archivedAt: FieldValue.serverTimestamp(), ...(sourceCreateTime ? { sourceCreateTime } : {}),
    ...(migrationDigest ? { captureMode: 'transition', migrationDigest, sourceUpdateTime } : { captureMode: 'atomic-write' }),
    contentHash: lifecycleBodyHash(source), subjectUserIds: subjects(source, kind.kind), content: lifecycleBody(source), state: sourceState(source) };
}
export function validateLifecycleArchive(db, key, data) {
  const source = lifecycleSource(data?.sourcePath);
  const redacted = data?.redactedFromHash !== undefined;
  if (!source || data.schemaVersion !== 1 || data.kind !== source.kind || data.threadId !== source.shoutId ||
      !(data.sourceCreatedAt instanceof Timestamp) || !(data.archivedAt instanceof Timestamp) ||
      data.sourceCreateTime !== undefined && !(data.sourceCreateTime instanceof Timestamp) ||
      !(data.threadCreatedAt instanceof Timestamp) || !data.content || !validLifecycleCapture(data) ||
      (redacted ? archiveIdentityKey(db.projectId, data.sourcePath, data.sourceCreatedAt, data.redactedFromHash) :
        lifecycleArchiveKey(db.projectId, data.sourcePath, data.content)) !== key ||
      redacted && (source.kind !== 'comment' || !/^[a-f0-9]{64}$/.test(data.redactedFromHash) ||
        !(data.privacyRedactedAt instanceof Timestamp) || data.redactionKind !== 'account-reference' ||
        data.content.replyToCommentId !== undefined || data.content.replyToNickname !== undefined) ||
      lifecycleBodyHash(data.content) !== data.contentHash || !data.content.createdAt.isEqual(data.sourceCreatedAt) ||
      JSON.stringify(subjects(data.content, source.kind)) !== JSON.stringify(data.subjectUserIds)) fail('Invalid archived content identity.');
  return source;
}
export function lifecycleReferenceRedaction(before, after) {
  if (!before || !after || typeof before.replyToCommentId !== 'string' || after.replyToCommentId !== undefined || after.replyToNickname !== undefined) return false;
  const redacted = { ...lifecycleBody(before) };
  delete redacted.replyToCommentId; delete redacted.replyToNickname;
  const prefix = typeof before.replyToNickname === 'string' ? '@' + before.replyToNickname : null;
  if (typeof redacted.text !== 'string') return false;
  if (prefix && (redacted.text === prefix || redacted.text.startsWith(prefix + ' ') || redacted.text.startsWith(prefix + '\n'))) {
    redacted.text = redacted.text.slice(prefix.length).trimStart();
  }
  return lifecycleBodyHash(redacted) === lifecycleBodyHash(after);
}
export async function lifecycleSubjectDeadline(tx, db, uids, end, cache = new Map()) {
  let deadline = end.toMillis();
  const missing = [...new Set(uids)].filter(uid => !cache.has(uid));
  const snapshots = missing.length ? await tx.getAll(...missing.flatMap(uid => [db.doc(`accountDeletionRequests/${uid}`), db.doc(`publicProfiles/${uid}`)])) : [];
  for (let n = 0; n < missing.length; n++) {
    const request = snapshots[n * 2], profile = snapshots[n * 2 + 1];
    if (request.exists && (request.get('userId') !== missing[n] || request.get('status') !== 'pending')) fail('Ambiguous account retention.');
    const job = request.exists ? await tx.get(accountPurgeJobRef(db, {
      projectId: db.projectId, userId: missing[n], requestCreateTime: request.createTime,
    })) : null;
    cache.set(missing[n], [request, profile, job]);
  }
  let deleting = false;
  for (let n = 0; n < uids.length; n++) {
    const [request, profile, job] = cache.get(uids[n]);
    if (request.exists) {
      if (request.get('userId') !== uids[n]) fail('Ambiguous account retention.');
      deadline = Math.min(deadline, request.createTime.toMillis() + lifecycleArchiveMillis); deleting = true;
      if (job?.get('ingressClosedAt') != null) deadline = 0;
    } else if (profile.get('accountStatus') === 'deleted') { deadline = 0; deleting = true; }
  }
  return { retainUntil: Timestamp.fromMillis(deadline), deleting };
}
function applyPatch(before, patch) {
  const result = { ...before };
  for (const [key, value] of Object.entries(patch)) {
    if (key.includes('.')) throw new Error('unsupported-content-field-path');
    if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete result[key];
    else result[key] = value;
  }
  return result;
}
function sourceState(data) {
  return Object.fromEntries(['status', 'likesCount', 'dislikesCount', 'commentsCount', 'savesCount'].filter(k => data[k] !== undefined).map(k => [k, data[k]]));
}
export function lifecycleGeography(value) {
  const g = value?.geography;
  if (g?.schemaVersion !== 1 || typeof g.countryCode !== 'string' || !/^[A-Z]{2}$/.test(g.countryCode) ||
      g.subdivisionCode != null && (typeof g.subdivisionCode !== 'string' || !/^[A-Z]{2}-[A-Z0-9-]{1,8}$/.test(g.subdivisionCode))) return null;
  return { schemaVersion: 1, countryCode: g.countryCode, ...(g.subdivisionCode ? { subdivisionCode: g.subdivisionCode } : {}) };
}
export function lifecycleEnabled(db) { return db?.[lifecycleBinding]?.enabled === true; }
export function lifecycleReadsEnabled(db) { return db?.[lifecycleBinding]?.readsEnabled === true; }
export function lifecycleReportReadsEnabled(db, reportsOrSource) {
  if (lifecycleReadsEnabled(db)) return true;
  return lifecycleEnabled(db) && (reportsOrSource?.docs ?? [reportsOrSource]).some(d =>
    d?.get('contentArchiveKey') !== undefined || d?.get('accountArchiveId') !== undefined);
}
// Pausing ingress must not extend any already established retention deadline.
// Unknown/off control still fails closed; it is not an alternate activation.
export function lifecycleControlUsable(control, { allowPaused = false } = {}) {
  return control?.get('schemaVersion') === 1 && Number.isSafeInteger(control.get('revision')) &&
    control.get('revision') >= 1 && (control.get('mode') === 'active' || allowPaused && control.get('mode') === 'paused');
}

// Buffer SDK writes so the shared archive can complete all its reads first.
// The original operation, archive, receipts and projections still commit once.
// Disabled mode returns the identical database without extra reads or writes.
export function createContentLifecycleDatabase(db, { enabled = false, readsEnabled = enabled, clock = () => new Date(), writeBudget = 450 } = {}) {
  if (typeof enabled !== 'boolean' || typeof readsEnabled !== 'boolean' || readsEnabled && !enabled ||
      typeof clock !== 'function' || !Number.isInteger(writeBudget) || writeBudget < 1 || writeBudget > 450) throw new Error('invalid-content-lifecycle-options');
  if (!enabled) return db;
  assertFeedRuntimeTarget(db);
  const binding = Object.freeze({ enabled: true, readsEnabled, clock });
  return new Proxy(db, { get(target, key) {
    if (key === lifecycleBinding) return binding;
    if (key !== 'runTransaction') return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    return (operation, ...options) => target.runTransaction(async raw => {
      const writes = [], observed = new Map();
      const remember = result => {
        for (const doc of Array.isArray(result) ? result : result.docs ?? [result]) if (doc?.ref && lifecycleSource(doc.ref.path)) observed.set(doc.ref.path, doc);
        return result;
      };
      const tx = new Proxy(raw, { get(transaction, method) {
        if (['get', 'getAll'].includes(method)) return async (...args) => {
          if (writes.length) throw new Error('content-transaction-read-after-write');
          return remember(await transaction[method](...args));
        };
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => {
          writes.push({ method, args: args.map(clone) });
          if (writes.length > writeBudget) throw new Error('feed-transaction-write-budget-exceeded');
          return tx;
        };
        return typeof transaction[method] === 'function' ? transaction[method].bind(transaction) : transaction[method];
      } });
      const result = await operation(tx);
      const changes = new Map();
      for (const write of writes) {
        const path = write.args[0]?.path, source = lifecycleSource(path);
        if (!source) continue;
        if (!changes.has(path)) {
          const snapshot = observed.get(path) ?? await raw.get(write.args[0]);
          changes.set(path, { path, source, snapshot, before: snapshot.data() ?? null, after: snapshot.data() ?? null, last: write });
        }
        const change = changes.get(path), data = write.args[1]; change.last = write;
        change.after = write.method === 'delete' ? null : write.method === 'update' || write.method === 'set' && write.args[2]?.merge
          ? applyPatch(change.after ?? {}, data) : clone(data);
      }
      const reports = writes.filter(w => w.method === 'create' && w.args[0]?.path.split('/').length === 2 && reportCollections.has(w.args[0].parent.id));
      const allCopies = writes.filter(w => w.method === 'create' && w.args[0]?.parent.id === 'accountContentArchive');
      const copies = allCopies.filter(w => w.args[1]?.content?.contentArchiveKey);
      if (changes.size > 50) fail('The content lifecycle source batch exceeds 50.');
      for (const [path, c] of changes) {
        if (c.before && c.after && !c.before.contentPurged && !c.after.contentPurged &&
            c.before.contentArchiveKey === lifecycleArchiveKey(db.projectId, path, c.before) &&
            c.before.contentHash === lifecycleBodyHash(c.before) &&
            lifecycleBodyHash(c.before) === lifecycleBodyHash(c.after) && c.before.status === c.after.status) {
          // Ratings and counters do not duplicate the immutable body or need
          // archive/control reads. Final counters are captured on source drain.
          changes.delete(path);
        }
      }
      if (!changes.size && !reports.length && !allCopies.length) { for (const w of writes) raw[w.method](...w.args); return result; }
      const control = await raw.get(db.doc('contentLifecycleControl/current'));
      const createsBody = [...changes.values()].some(c => !c.before || c.after && !c.after.contentPurged &&
        lifecycleBodyHash(c.before) !== lifecycleBodyHash(c.after) && !lifecycleReferenceRedaction(c.before, c.after));
      if (!lifecycleControlUsable(control, { allowPaused: !createsBody })) fail('Content archive is not active.');
      const date = clock(); if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) throw new Error('invalid-content-clock');
      const now = Timestamp.fromDate(date), extra = [], threads = new Map(), subjectCache = new Map();
      const legacy = new Map(); let legacyDirty = false;
      const legacySource = snapshot => !readsEnabled && snapshot?.exists && snapshot.get('contentArchiveKey') === undefined &&
        snapshot.get('contentHash') === undefined &&
        timeOrder(control.get('captureFenceAt'), control.updateTime) && timeOrder(snapshot.createTime, control.get('captureFenceAt')) &&
        !snapshot.createTime.isEqual(control.get('captureFenceAt'));
      // Pre-cutover mutations change the inventory fence in the same commit.
      // They are never accepted as new content or as migration coverage.
      for (const [path, c] of changes) if (legacySource(c.snapshot)) {
        const frozen = c.source.kind === 'shout' && c.after?.schemaVersion === 1 && c.after.status === 'deleted' &&
          c.after.contentPurged === true && Object.keys(c.after).every(k => ['schemaVersion', 'status', 'contentPurged', 'authorId'].includes(k)) &&
          (c.after.authorId === undefined || c.after.authorId === c.before.authorId);
        if (frozen) {
          if (!id(c.before.authorId)) fail('The legacy purge author is unavailable.');
          const request = await raw.get(db.doc(`accountDeletionRequests/${c.before.authorId}`));
          if (!request.exists || request.get('status') !== 'pending' || request.get('userId') !== c.before.authorId ||
              now.toMillis() < request.createTime.toMillis() + lifecycleArchiveMillis) fail('The legacy account retention deadline has not passed.');
        } else if (c.after && (c.after.contentArchiveKey !== undefined || c.after.contentHash !== undefined ||
            !c.after.createdAt?.isEqual(c.before.createdAt) || c.after.authorId !== c.before.authorId || c.last.method === 'create')) {
          fail('The legacy source incarnation changed.');
        }
        legacy.set(path, c); changes.delete(path); legacyDirty = true;
      }
      for (const write of allCopies.filter(w => !copies.includes(w))) {
        const d = write.args[1], c = legacy.get(d?.sourcePath);
        if (!c || c.after !== null || !['comment', 'privateReply'].includes(c.source.kind) || d.kind !== c.source.kind ||
            d.schemaVersion !== 1 || d.sourceShoutId !== c.source.shoutId ||
            write.args[0].id !== hash([db.projectId, d.sourcePath, c.snapshot.createTime.seconds, c.snapshot.createTime.nanoseconds]) ||
            !d.sourceCreateTime?.isEqual(c.snapshot.createTime) || !d.sourceUpdateTime?.isEqual(c.snapshot.updateTime) ||
            hash(normalized(d.content)) !== hash(normalized(c.before)) || !subjects(c.before, c.source.kind).includes(d.retentionOwnerId) ||
            JSON.stringify(d.subjectUserIds) !== JSON.stringify(subjects(c.before, c.source.kind)) ||
            !timeOrder(d.requestCreateTime, now) || !d.retainUntil?.isEqual(Timestamp.fromMillis(d.requestCreateTime.toMillis() + lifecycleArchiveMillis))) {
          fail('Unbound account content requires a proven legacy source.');
        }
        const request = await raw.get(db.doc(`accountDeletionRequests/${d.retentionOwnerId}`));
        if (!request.exists || request.get('userId') !== d.retentionOwnerId || request.get('status') !== 'pending' ||
            !request.createTime.isEqual(d.requestCreateTime)) fail('The legacy account request changed.');
      }
      const readThread = async shoutId => {
        if (!threads.has(shoutId)) {
          const doc = await raw.get(db.doc(`contentLifecycleThreads/${shoutId}`));
          threads.set(shoutId, doc.exists ? validateLifecycleThread(doc.data(), shoutId) : null);
        }
        return threads.get(shoutId);
      };
      // Root closure precedes leaf planning: a single header shortens all child
      // deadlines without rewriting every comment/private reply.
      for (const c of changes.values()) if (c.source.kind === 'shout' && !c.before?.contentPurged && !c.after?.contentPurged) {
        const source = c.after ?? c.before; if (!source) continue;
        if (!(source.createdAt instanceof Timestamp) || !(source.expiresAt instanceof Timestamp) || !id(source.authorId)) fail('Invalid lifecycle Shout.');
        let header = await readThread(c.source.shoutId);
        if (!header) {
          if (c.before) fail('Content archive migration is required.');
          header = { schemaVersion: 1, shoutId: c.source.shoutId, sourceCreatedAt: source.createdAt,
            archivedAt: FieldValue.serverTimestamp(), plannedExpiresAt: source.expiresAt,
            geography: lifecycleGeography(source), ...lifecycleTimes(source.expiresAt), sourceDrainedAt: null,
            maintenanceState: 'pending', maintenancePhase: 'source', nextMaintenanceAt: lifecycleTimes(source.expiresAt).historyUntil };
          threads.set(c.source.shoutId, header); extra.push({ method: 'create', args: [db.doc(`contentLifecycleThreads/${c.source.shoutId}`), header] });
        } else {
          if (!c.before) fail('An archived content ID cannot be reused.');
          if (!header.sourceCreatedAt.isEqual(source.createdAt) || !header.plannedExpiresAt.isEqual(source.expiresAt)) fail('Content thread incarnation changed.');
          const geography = lifecycleGeography(source);
          if (JSON.stringify(header.geography) !== JSON.stringify(geography)) {
            header = { ...header, geography }; threads.set(c.source.shoutId, header);
            extra.push({ method: 'update', args: [db.doc(`contentLifecycleThreads/${c.source.shoutId}`), { geography }] });
          }
          const closes = !c.after || c.before?.status !== 'deleted' && c.after.status === 'deleted';
          if (closes && now.toMillis() < header.publicUntil.toMillis()) {
            if (now.toMillis() < header.sourceCreatedAt.toMillis()) fail('Content clock precedes publication.');
            const patch = lifecycleTimes(header.plannedExpiresAt, now);
            if (header.maintenancePhase === 'source') patch.nextMaintenanceAt = patch.historyUntil;
            header = { ...header, ...patch };
            threads.set(c.source.shoutId, header); extra.push({ method: 'update', args: [db.doc(`contentLifecycleThreads/${c.source.shoutId}`), patch] });
          }
        }
        if (c.after) Object.assign(c.after, { publicUntil: header.publicUntil, historyUntil: header.historyUntil });
      }
      for (const c of changes.values()) {
        if (c.before?.contentPurged || c.after?.contentPurged) continue;
        const source = c.after ?? c.before; if (!source) continue;
        const header = await readThread(c.source.shoutId); if (!header) fail('Content archive migration is required.');
        if (c.before && (c.before.contentArchiveKey !== lifecycleArchiveKey(db.projectId, c.path, c.before) ||
            c.before.contentHash !== lifecycleBodyHash(c.before))) fail('Content archive migration is required.');
        const owners = subjects(source, c.source.kind), deadline = await lifecycleSubjectDeadline(raw, db, owners, header.retainUntil, subjectCache);
        if (!c.before && deadline.deleting) fail('Deleted accounts cannot create archived content.');
        if (!c.before && now.toMillis() >= header.publicUntil.toMillis()) fail('Expired content cannot accept new bodies.');
        if (c.before && !source.createdAt?.isEqual(c.before.createdAt)) fail('Content source incarnation changed.');
        if (c.before && c.after && lifecycleBodyHash(c.before) !== lifecycleBodyHash(c.after) &&
            (now.toMillis() >= header.historyUntil.toMillis() || deadline.deleting) &&
            !lifecycleReferenceRedaction(c.before, c.after)) fail('Archived content cannot be changed.');
        if (c.before?.status === 'deleted' && c.after?.status === 'active') fail('Removed content cannot be republished.');
        const key = lifecycleArchiveKey(db.projectId, c.path, source), ref = db.doc(`contentLifecycleArchive/${key}`), old = await raw.get(ref);
        if (!old.exists && c.before && c.before.contentArchiveKey === key && deadline.retainUntil.toMillis() > now.toMillis()) fail('Archived content is missing.');
        if (!old.exists && c.before && !c.before.contentArchiveKey) fail('Content archive migration is required.');
        if (old.exists) validateLifecycleArchive(db, key, old.data());
        if (!c.before && old.exists) fail('An archived content ID cannot be reused.');
        if (deadline.retainUntil.toMillis() > now.toMillis()) {
          if (!old.exists) extra.push({ method: 'create', args: [ref, lifecycleArchiveRecord(c.path, source, header,
            c.snapshot.exists ? { sourceCreateTime: c.snapshot.createTime } : {})] });
          else if (!c.after || c.after.status !== c.before?.status) extra.push({ method: 'update', args: [ref, { state: sourceState(source) }] });
        } else if (!c.before || c.after && lifecycleBodyHash(c.after) !== lifecycleBodyHash(c.before) &&
            !lifecycleReferenceRedaction(c.before, c.after)) fail('Content retention already ended.');
        if (c.after) {
          Object.assign(c.after, { contentArchiveKey: key, contentHash: lifecycleBodyHash(source) });
          const patch = { contentArchiveKey: key, contentHash: c.after.contentHash,
            ...(c.source.kind === 'shout' ? { publicUntil: header.publicUntil, historyUntil: header.historyUntil } : {}) };
          Object.assign(c.last.args[1], patch);
        }
      }
      for (const write of reports) {
        const data = write.args[1], kind = reportCollections.get(write.args[0].parent.id);
        const path = `shouts/${data.shoutId}` + (kind === 'shout' ? '' : `/${kind === 'comment' ? 'comments' : 'privateReplies'}/${data.commentId ?? data.privateReplyId}`);
        const snapshot = observed.get(path) ?? await raw.get(db.doc(path));
        const source = changes.get(path)?.after ?? snapshot.data();
        if (!changes.has(path) && legacySource(snapshot)) {
          if (!id(data.reporterId) || data.reporterId === source.authorId || data.contentArchiveKey !== undefined ||
              data.shoutArchiveKey !== undefined || kind === 'privateReply' &&
              (data.reporterId !== source.recipientId || data.text !== source.text)) fail('Invalid legacy report evidence.');
          legacyDirty = true; continue;
        }
        if (!source?.contentArchiveKey) fail('Content archive migration is required.');
        const archive = await raw.get(db.doc(`contentLifecycleArchive/${source.contentArchiveKey}`));
        if (!archive.exists) fail('Reported archive is unavailable.');
        validateLifecycleArchive(db, archive.id, archive.data());
        if (archive.get('sourcePath') !== path || lifecycleArchiveKey(db.projectId, path, source) !== archive.id ||
            !id(data.reporterId) || data.reporterId === source.authorId ||
            kind === 'privateReply' && data.reporterId !== source.recipientId) fail('Invalid report evidence binding.');
        const header = await readThread(data.shoutId); if (!header) fail('Content header is unavailable.');
        const deadline = await lifecycleSubjectDeadline(raw, db, archive.get('subjectUserIds'), header.retainUntil, subjectCache);
        if (now.toMillis() >= deadline.retainUntil.toMillis()) fail('Reported content retention expired.');
        const parent = kind === 'shout' ? source : observed.get(`shouts/${data.shoutId}`)?.data() ??
          (await raw.get(db.doc(`shouts/${data.shoutId}`))).data();
        if (!parent?.contentArchiveKey || !header.sourceCreatedAt.isEqual(parent.createdAt)) fail('Reported parent is unavailable.');
        const parentArchive = kind === 'shout' ? archive : await raw.get(db.doc(`contentLifecycleArchive/${parent.contentArchiveKey}`));
        if (!parentArchive.exists) fail('Reported parent archive is unavailable.');
        validateLifecycleArchive(db, parentArchive.id, parentArchive.data());
        if (parentArchive.get('sourcePath') !== `shouts/${data.shoutId}` ||
            parentArchive.id !== lifecycleArchiveKey(db.projectId, `shouts/${data.shoutId}`, parent)) fail('Invalid report parent binding.');
        Object.assign(data, { contentArchiveKey: archive.id, shoutArchiveKey: parentArchive.id,
          moderationGeography: lifecycleGeography(parent), parentContextPurged: false, authorId: source.authorId });
        if (readsEnabled) delete data.text;
      }
      // Existing account jobs keep their journal/identity. Their body copies may
      // never outlive the shared content deadline; expired bodies are omitted.
      for (const write of copies) {
        const data = write.args[1], header = await readThread(data.sourceShoutId);
        if (!header) fail('Content header is unavailable.');
        const end = Timestamp.fromMillis(Math.min(data.retainUntil.toMillis(), header.retainUntil.toMillis()));
        Object.assign(data, { retainUntil: end, ordinaryRetainUntil: header.retainUntil,
          contentArchiveKey: data.content.contentArchiveKey, contentExpired: false });
        if (now.toMillis() >= end.toMillis()) { data.content = {}; data.contentExpired = true; }
      }
      if (legacyDirty) {
        const revision = control.get('legacyRevision');
        if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) fail('A legacy inventory fence is required.');
        extra.push({ method: 'update', args: [control.ref, { legacyRevision: revision + 1 }] });
      }
      if (writes.length + extra.length > writeBudget) throw new Error('feed-transaction-write-budget-exceeded');
      for (const w of [...extra, ...writes]) raw[w.method](...w.args);
      return result;
    }, ...options);
  } });
}
