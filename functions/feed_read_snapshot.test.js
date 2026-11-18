import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockCache } from './feed_block_index_store.js';
import { feedReadClassifier } from './feed_read_snapshot.js';
import { readContentHash, readKey, readRetentionMillis } from './read_sync_blocks.js';

test('private feed cache reuses only the same project/user/readTime and remains bounded', async t => {
  const cache = blockCache({ maxBytes: 65536, maxEntries: 2 }); t.after(() => cache.clear());
  const now = Date.now(), row = { id: 'one', expiresAt: now + 86400000, contentHash: readContentHash('Title', 'Text') };
  const record = { shoutId: row.id, expiresAt: row.expiresAt, retainUntil: row.expiresAt + readRetentionMillis,
    contentHash: row.contentHash, confirmedAt: now - 1 };
  const block = { v: 1, revision: 1, day: Math.floor(row.expiresAt / 86400000), prefix: '', kind: 'leaf',
    entries: { [readKey(row.id, row.contentHash)]: record } };
  const db = { projectId: 'project-a', doc: path => ({ path }), runTransaction: operation => operation({
    getAll: async (...refs) => refs.map(ref => ({ data: () => ref.path.includes('/alice/') ? block : undefined })),
  }) };
  const snapshot = { context: { now, readRevision: 1 }, readTime: { seconds: Math.floor(now / 1000), nanoseconds: 0 } };
  const lookup = async (uid, time = snapshot.readTime, database = db) => {
    const classifier = feedReadClassifier(database, uid, { ...snapshot, readTime: time }, { maxBlockReads: 10, cache });
    await classifier.classify([row]); return classifier;
  };
  assert((await lookup('alice')).readIds.has(row.id));
  assert.equal((await lookup('alice')).metrics.readBlockReads, 0);
  const bob = await lookup('bob'); assert.equal(bob.readIds.size, 0); assert.equal(bob.metrics.readBlockReads, 1);
  assert.equal((await lookup('alice', { ...snapshot.readTime, seconds: snapshot.readTime.seconds + 1 })).metrics.readBlockReads, 1);
  assert.equal((await lookup('alice', snapshot.readTime, { ...db, projectId: 'project-b' })).metrics.readBlockReads, 1);
  assert(cache.size <= 2); assert(cache.bytes <= 65536);
});
