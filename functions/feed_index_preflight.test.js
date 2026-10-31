import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflightFeedIndex as inspect } from './feed_index_preflight.js';
import { encodeGeohash } from './create_shout.js';
import { clone } from './feed_block_index.js';
const location = { latitude: 50.08, longitude: 14.44 };
const row = (id, extra = {}) => ({ id, data: { authorId: 'author', status: 'active', location,
  geohash: encodeGeohash(location.latitude, location.longitude), createdAt: 100, expiresAt: 10000,
  likesCount: 0, dislikesCount: 0, categories: ['Dotaz'], ...extra } });

test('migration preflight validates the entire supplied snapshot without changing data or exposing bodies', async () => {
  const input = [row('active', { title: 'Private fixture title', text: 'Do not copy report' }), row('expired', { expiresAt: 500 }), row('deleted', { status: 'deleted' })];
  const before = clone(input), result = await inspect(input, { now: 500 });
  assert.deepEqual(input, before); assert.equal(result.state, 'valid'); assert.equal(result.activationReady, false);
  assert.equal(result.indexedMetadata, 1); assert.equal(result.expiredActive, 1); assert.equal(result.inactive, 1);
  assert.equal(result.rootDocuments, 1); assert.equal(result.blockDocuments, 1); assert.equal(result.initialIndexWritesEstimate, 3);
  assert(!JSON.stringify(result).includes('Private fixture title'));
  const changedBody = clone(input); changedBody[0].data.text = 'Changed';
  assert.equal((await inspect(changedBody, { now: 500 })).metadataDigest, result.metadataDigest);
  assert.equal((await inspect([...input].reverse(), { now: 500 })).metadataDigest, result.metadataDigest);
});
test('invalid and duplicate legacy metadata are reported instead of silently skipping records', async () => {
  const rows = [row('valid'), row('valid'), row('unknown', { status: 'legacy-maybe-active' }),
    row('point', { location: { latitude: 0, longitude: 0 } }), row('counter', { likesCount: null }),
    row('boolean', { businessSpotlight: 'true' }), row('envelope', { id: 'different' }), row('a/b')];
  const result = await inspect(rows, { now: 500, errorLimit: 2 });
  assert.equal(result.state, 'invalid'); assert.equal(result.errorCount, 7);
  assert.equal(result.errors.length, 2); assert(result.errorsTruncated); assert.equal(result.scanned, 8);
});
test('preflight work cap never claims a partial dataset is valid or ready', async () => {
  let consumed = 0;
  async function* source() { for (let i = 0; i < 5; i++) { consumed++; yield row(`r-${i}`); } }
  const result = await inspect(source(), { now: 500, maximum: 2 });
  assert.equal(result.state, 'incomplete'); assert.equal(result.scanned, 2); assert.equal(result.probeRecords, 1);
  assert.equal(consumed, 3); assert.equal(result.activationReady, false);
  assert.equal((await inspect([row('a'), row('b')], { now: 500, maximum: 2 })).state, 'valid');
});
