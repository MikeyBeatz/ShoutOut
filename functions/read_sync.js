// Prepared internal B2 operations. Deliberately not imported by any live entry point.
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { feedCursorCodec } from './feed_cursor.js';
import { planReadBlocks, readContentHash, readKey, readRetentionMillis, validReadId, validateReadBlock } from './read_sync_blocks.js';

const fail = (code, message) => { throw new HttpsError(code, message); };
const plain = x => x && typeof x === 'object' && !Array.isArray(x);
const bucketId = id => typeof id === 'string' && /^d[0-9]{1,10}_r[01]{0,256}$/.test(id);
const revision = snapshot => {
  if (!snapshot.exists) return 0;
  const data = snapshot.data();
  if (Object.keys(data).sort().join(',') !== 'revision,v' || data.v !== 1 ||
      !Number.isSafeInteger(data.revision) || data.revision < 1) throw new Error('invalid-read-revision');
  return data.revision;
};
function inputOf(request, fields) {
  const { uid } = requireCallableIdentity(request), data = request.data;
  if (!plain(data) || data.expectedUserId !== uid || !validReadId(uid) ||
      Object.keys(data).some(k => !['expectedUserId', ...fields].includes(k))) fail('invalid-argument', 'Invalid read state request.');
  return { uid, data };
}

export async function syncReadBatchOperation(request, db, { clock = () => new Date(), beforeCommit, onMetrics, access } = {}) {
  assertFeedRuntimeTarget(db);
  const { uid, data } = inputOf(request, ['items']);
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 32 || data.items.some(row => !plain(row) ||
      Object.keys(row).sort().join(',') !== 'contentHash,expiresAt,shoutId' || !validReadId(row.shoutId) ||
      !/^[a-f0-9]{64}$/.test(row.contentHash) || !Number.isSafeInteger(row.expiresAt) || row.expiresAt < 0) ||
      new Set(data.items.map(r => readKey(r.shoutId, r.contentHash))).size !== data.items.length) fail('invalid-argument', 'Invalid read batch.');
  const admission = access ? await access.admit(request, 'upload') : null;
  const user = db.doc(`users/${uid}`), metaRef = user.collection('readState').doc('current');
  return db.runTransaction(async tx => {
    const now = clock();
    await requireEligibleActor({ request, db, reader: tx, now });
    if (access) await access.guard(tx, admission);
    const sources = await tx.getAll(...data.items.map(row => db.doc(`shouts/${row.shoutId}`)));
    const authors = [...new Set(sources.map(s => s.get('authorId')).filter(validReadId))];
    const authorDocs = authors.length ? await tx.getAll(...authors.map(id => db.doc(`publicProfiles/${id}`))) : [];
    const deleted = new Set(authorDocs.filter(d => d.get('accountStatus') === 'deleted').map(d => d.id));
    const blocked = await tx.get(user.collection('blocked').limit(200));
    const blocks = new Set(blocked.docs.map(d => d.id)), rows = [], outcomes = [];
    for (const [i, row] of data.items.entries()) {
      const source = sources[i], d = source.data(), expiresAt = d?.expiresAt instanceof Timestamp ? d.expiresAt.toMillis() : -1;
      const available = source.exists && ['active', 'expired'].includes(d.status) && d.contentPurged !== true &&
        validReadId(d.authorId) && !deleted.has(d.authorId) && !blocks.has(d.authorId) && typeof d.title === 'string' && typeof d.text === 'string';
      const accepted = available && expiresAt === row.expiresAt && now.getTime() < expiresAt + readRetentionMillis &&
        readContentHash(d.title, d.text) === row.contentHash;
      // Never turn private/hidden/deleted content into a hash-guessing oracle.
      // Unavailable and missing sources have the same result for every hash.
      const obsolete = now.getTime() >= row.expiresAt + readRetentionMillis ||
        available && (expiresAt !== row.expiresAt || readContentHash(d.title, d.text) !== row.contentHash);
      outcomes.push({ ...row, status: accepted ? 'accepted' : obsolete ? 'obsolete' : 'deferred' });
      if (accepted) rows.push({ ...row, retainUntil: expiresAt + readRetentionMillis, confirmedAt: now.getTime() });
    }
    const meta = await tx.get(metaRef), oldRevision = revision(meta);
    let plan;
    try { plan = await planReadBlocks(rows, async id => (await tx.get(user.collection('readBuckets').doc(id))).data(), { revision: oldRevision + 1 }); }
    catch (error) {
      if (error.message === 'read-block-work-budget') throw new HttpsError('resource-exhausted', 'Read batch requires a smaller work slice.', { reason: 'read-sync-work-budget' });
      throw error;
    }
    if (beforeCommit) await beforeCommit({ tx, outcomes });
    for (const [id, node] of plan.writes) tx.set(user.collection('readBuckets').doc(id), node);
    if (plan.writes.size) tx.set(metaRef, { v: 1, revision: oldRevision + 1 });
    onMetrics?.({ accountReads: 5, sourceReads: sources.length, authorReads: authors.length, blockedReads: Math.max(1, blocked.size),
      metadataReads: 1, blockReads: plan.reads, writes: plan.writes.size + (plan.writes.size ? 1 : 0) });
    return { version: 1, revision: oldRevision + (plan.writes.size ? 1 : 0), items: outcomes };
  });
}

// Whole snapshot is paginated, not silently capped. Historical reads let later
// B3 pin read state without placing private history in the signed cursor.
export async function getReadStatePageOperation(request, db, { key, clock = () => new Date(), pageSize = 8, afterRead, access } = {}) {
  assertFeedRuntimeTarget(db);
  const { uid, data } = inputOf(request, ['cursor', 'knownRevision']);
  if (!(data.cursor == null || typeof data.cursor === 'string') ||
      !(data.knownRevision == null || Number.isSafeInteger(data.knownRevision) && data.knownRevision >= 0) ||
      data.cursor && data.knownRevision !== undefined || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 32) fail('invalid-argument', 'Invalid read page.');
  const codec = feedCursorCodec({ key, maximumBytes: 4096 }), scope = () => ({ uid, project: db.projectId, now: clock().getTime() });
  let pinned = null;
  if (data.cursor) {
    try { pinned = codec.decode(data.cursor, scope()); } catch { throw new HttpsError('failed-precondition', 'Read snapshot expired or invalid.', { reason: 'read-sync-snapshot-expired' }); }
    if (pinned.context?.kind !== 'read-sync-v1' || !Number.isSafeInteger(pinned.context.revision) ||
        !Number.isSafeInteger(pinned.context.fromRevision) || pinned.context.fromRevision < 0 ||
        !Number.isSafeInteger(pinned.position.afterRevision) || pinned.position.afterRevision < 1 ||
        !bucketId(pinned.position.after)) fail('invalid-argument', 'Invalid read cursor.');
  }
  const admission = access ? await access.admit(request, 'download') : await requireEligibleActor({ request, db, now: clock() });
  const user = db.doc(`users/${uid}`);
  const result = await db.runTransaction(async tx => {
    const meta = await tx.get(user.collection('readState').doc('current'));
    if (pinned && revision(meta) !== pinned.context.revision) throw new Error('inconsistent-read-snapshot');
    const fromRevision = pinned?.context.fromRevision ?? data.knownRevision ?? 0;
    if (fromRevision > revision(meta)) fail('failed-precondition', 'Read revision is unavailable.');
    if (!pinned && data.knownRevision === revision(meta)) return { version: 1, revision: revision(meta), items: [], next: null, unchanged: true };
    let q = user.collection('readBuckets');
    q = fromRevision > 0 ? q.where('revision', '>', fromRevision).orderBy('revision').orderBy(FieldPath.documentId()) : q.orderBy(FieldPath.documentId());
    q = q.limit(pageSize);
    if (pinned) q = fromRevision > 0 ? q.startAfter(pinned.position.afterRevision, pinned.position.after) : q.startAfter(pinned.position.after);
    const page = await tx.get(q), records = [];
    for (const doc of page.docs) {
      const node = doc.data();
      if (!bucketId(doc.id) || doc.id !== `d${node.day}_r${node.prefix}`) throw new Error('invalid-read-bucket-id');
      validateReadBlock(node, node.day, node.prefix);
      if (node.kind === 'leaf') records.push(...Object.values(node.entries).filter(row => clock().getTime() < row.retainUntil));
    }
    const token = pinned ? data.cursor : codec.start({ ...scope(),
      readTime: { seconds: page.readTime.seconds, nanoseconds: page.readTime.nanoseconds },
      context: { kind: 'read-sync-v1', revision: revision(meta), fromRevision }, now: clock().getTime() });
    return { version: 1, revision: revision(meta), items: records,
      next: page.size === pageSize ? codec.advance(token, { after: page.docs.at(-1).id, afterRevision: page.docs.at(-1).get('revision') }, scope()) : null };
  }, { readOnly: true, ...(pinned ? { readTime: new Timestamp(pinned.readTime.seconds, pinned.readTime.nanoseconds) } : {}) });
  if (afterRead) await afterRead();
  if (access) await access.confirm(request, admission);
  else await requireEligibleActor({ request, db, now: clock() });
  // A delayed reply cannot keep an expired snapshot alive.
  if (data.cursor) try { codec.decode(data.cursor, scope()); } catch { throw new HttpsError('failed-precondition', 'Read snapshot expired.', { reason: 'read-sync-snapshot-expired' }); }
  return result;
}
