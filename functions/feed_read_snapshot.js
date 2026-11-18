// B3 internal read-only adapter. Pins private B2 lookups to the spatial snapshot;
// never downloads an account's entire reading history or writes a session.
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { readBucketId, readKey, validateReadBlock } from './read_sync_blocks.js';

export async function captureFeedReadRevision(db, uid, time) {
  return db.runTransaction(async tx => {
    const meta = await tx.get(db.doc(`users/${uid}/readState/current`));
    const revision = meta.exists ? meta.get('revision') : 0;
    if (meta.exists && meta.get('v') !== 1 || !Number.isSafeInteger(revision) || revision < 0) {
      throw new HttpsError('data-loss', 'Invalid feed reading state.');
    }
    return revision;
  }, { readOnly: true, readTime: new Timestamp(time.seconds, time.nanoseconds) });
}

export function feedReadClassifier(db, uid, snapshot, { maxBlockReads, cache: sharedCache = null }) {
  if (!Number.isSafeInteger(maxBlockReads) || maxBlockReads < 1 ||
      !Number.isSafeInteger(snapshot.context.readRevision) || snapshot.context.readRevision < 0) {
    throw new Error('invalid-feed-read-options');
  }
  const cache = new Map(), readIds = new Set();
  const metrics = { readBlockReads: 0, readBlockRequests: 0, readBlockCacheHits: 0, readRowsClassified: 0 };
  const readTime = new Timestamp(snapshot.readTime.seconds, snapshot.readTime.nanoseconds);
  const cacheKey = id => JSON.stringify(['feed-read-v1', db.projectId, uid, snapshot.readTime, id]);
  let queued = [];
  function fetchBlock(id) {
    if (++metrics.readBlockReads > maxBlockReads) {
      throw new HttpsError('resource-exhausted', 'Feed reading work budget exceeded.', { reason: 'feed-read-work-budget' });
    }
    return new Promise((resolve, reject) => {
      queued.push({ id, resolve, reject });
      if (queued.length !== 1) return;
      Promise.resolve().then(async () => {
        const batch = queued; queued = [];
        try {
          metrics.readBlockRequests++;
          const docs = await db.runTransaction(tx => tx.getAll(...batch.map(item => db.doc(`users/${uid}/readBuckets/${item.id}`))),
            { readOnly: true, readTime });
          batch.forEach((item, i) => item.resolve(docs[i].data() ?? null));
        } catch (error) { batch.forEach(item => item.reject(error)); }
      });
    });
  }
  async function classify(rows) {
    const work = rows.map(row => {
      if (!/^[a-f0-9]{64}$/.test(row.contentHash ?? '')) {
        throw new HttpsError('failed-precondition', 'Feed reading identity is missing.');
      }
      const key = readKey(row.id, row.contentHash);
      return { row, key, day: Math.floor(row.expiresAt / 86400000), prefix: '', required: false,
        path: [...key].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('') };
    });
    metrics.readRowsClassified += rows.length;
    if (snapshot.context.readRevision === 0) return;
    while (work.length) {
      const missing = new Map();
      for (const item of work) {
        const id = readBucketId(item.day, item.prefix);
        if (!cache.has(id)) missing.set(id, item);
      }
      if (missing.size) {
        const entries = [...missing];
        const values = await Promise.all(entries.map(async ([id]) => {
          if (!sharedCache) return fetchBlock(id);
          const result = await sharedCache.load(cacheKey(id), () => fetchBlock(id));
          if (result.hit) metrics.readBlockCacheHits++;
          return result.node;
        }));
        for (let i = 0; i < values.length; i++) {
          const [id, item] = entries[i], data = values[i];
          if (data) {
            validateReadBlock(data, item.day, item.prefix);
            if (data.revision > snapshot.context.readRevision) throw new HttpsError('data-loss', 'Inconsistent feed reading snapshot.');
          }
          cache.set(id, data ?? null);
        }
      }
      for (let i = work.length - 1; i >= 0; i--) {
        const item = work[i], node = cache.get(readBucketId(item.day, item.prefix));
        if (!node && item.required) throw new HttpsError('data-loss', 'Incomplete feed reading snapshot.');
        if (node?.kind === 'branch') {
          item.prefix += item.path[item.prefix.length]; item.required = true; continue;
        }
        const record = node?.entries[item.key];
        if (record && record.expiresAt === item.row.expiresAt && record.retainUntil > snapshot.context.now &&
            record.confirmedAt <= snapshot.context.now) readIds.add(item.row.id);
        work.splice(i, 1);
      }
    }
  }
  return { classify, readIds, metrics };
}
