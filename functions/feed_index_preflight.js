// Read-only validation of an explicitly supplied snapshot, not a live backfill.
import { createHash } from 'node:crypto';
import { canonical, encodedBytes, metadataOf, treeBuilder } from './feed_block_index.js';

export async function preflightFeedIndex(records, { now, maximum = 10000, errorLimit = 100, ...blockOptions } = {}) {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 10000 ||
      !Number.isSafeInteger(errorLimit) || errorLimit < 1 || errorLimit > 1000) throw new Error('invalid-index-preflight-options');
  const seen = new Set(), valid = [], errors = [], groups = new Map();
  let scanned = 0, errorCount = 0, probeRecords = 0, complete = true, expiredActive = 0, inactive = 0;
  const invalid = (id, reason) => { errorCount++; if (errors.length < errorLimit) errors.push({ id, reason }); };
  for await (const record of records) {
    if (scanned === maximum) { complete = false; probeRecords = 1; break; }
    scanned++;
    const id = typeof record?.id === 'string' ? record.id : null;
    try {
      if (!record?.data || typeof record.data !== 'object' || Array.isArray(record.data) ||
          (record.data.id !== undefined && record.data.id !== id)) throw new Error('invalid-source-envelope');
      if (seen.has(id)) throw new Error('duplicate-source-id');
      seen.add(id);
      // Existing client states; unknown states must be reviewed, not silently
      // dropped while the client might interpret them as active.
      if (!['active', 'expired', 'deleted'].includes(record.data.status)) throw new Error('unknown-source-status');
      for (const key of ['likesCount', 'dislikesCount']) {
        if (record.data[key] !== undefined && (!Number.isSafeInteger(record.data[key]) || record.data[key] < 0)) throw new Error('invalid-source-counter');
      }
      for (const key of ['businessSpotlight', 'businessHighlighted']) {
        if (record.data[key] !== undefined && typeof record.data[key] !== 'boolean') throw new Error('invalid-source-boolean');
      }
      const row = metadataOf({ ...record.data, id });
      valid.push(row);
      if (row.status !== 'active') { inactive++; continue; }
      if (row.expiresAt <= now) { expiredActive++; continue; }
      const cell = row.geohash.slice(0, 4);
      if (!groups.has(cell)) groups.set(cell, []);
      groups.get(cell).push(row);
    } catch (error) { invalid(id, error.message); }
  }
  const builder = treeBuilder(blockOptions);
  for (const [cell, rows] of groups) builder.build(rows, cell);
  const blockBytes = [...builder.writes.values()].map(encodedBytes);
  valid.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    state: !complete ? 'incomplete' : errorCount ? 'invalid' : 'valid', complete, activationReady: false,
    asOfMillis: now, scanned, probeRecords, errorCount, errors, errorsTruncated: errorCount > errors.length,
    validMetadata: valid.length, indexedMetadata: [...groups.values()].reduce((sum, rows) => sum + rows.length, 0),
    expiredActive, inactive, rootDocuments: groups.size, blockDocuments: builder.writes.size,
    maxBlockBytes: Math.max(0, ...blockBytes), totalBlockBytes: blockBytes.reduce((a, b) => a + b, 0),
    initialIndexWritesEstimate: 1 + groups.size + builder.writes.size,
    metadataDigest: createHash('sha256').update(canonical(valid)).digest('hex'),
  };
}
