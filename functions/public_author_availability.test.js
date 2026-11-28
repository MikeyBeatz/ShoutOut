import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPublicAuthorAvailability } from './public_author_availability.js';

test('author guards are deduplicated, field-masked and never read when empty', async () => {
  const db = { doc: path => ({ path }) }, calls = [];
  const reader = { getAll: async (...args) => {
    calls.push(args);
    return args.slice(0, -1).map(ref => ({ exists: false, get: () => undefined, ref }));
  } };
  assert.equal((await readPublicAuthorAvailability(reader, db, [])).readUnits, 0);
  assert.equal(calls.length, 0);
  const result = await readPublicAuthorAvailability(reader, db, Array(50).fill('author'));
  assert.deepEqual(calls[0].slice(0, -1).map(ref => ref.path), ['publicProfiles/author', 'accountDeletionRequests/author']);
  assert.deepEqual(calls[0].at(-1), { fieldMask: ['accountStatus'] });
  assert.equal(result.readUnits, 2); assert.equal(result.unavailable.size, 0);
});

test('pending, terminal and absent profiles have the same policy as public source reads', async () => {
  const db = { doc: path => ({ path }) };
  const reader = { getAll: async (...args) => args.slice(0, -1).map(({ path }) => ({
    exists: ['publicProfiles/deleted', 'accountDeletionRequests/pending'].includes(path),
    get: () => path === 'publicProfiles/deleted' ? 'deleted' : undefined,
  })) };
  const result = await readPublicAuthorAvailability(reader, db, ['legacy', 'pending', 'deleted', 'pending']);
  assert.deepEqual([...result.unavailable], ['pending', 'deleted']); assert.equal(result.readUnits, 6);
  for (const id of ['', '../other', null, 'x'.repeat(129)]) {
    await assert.rejects(readPublicAuthorAvailability({ getAll() { assert.fail('No invalid path read'); } }, db, [id]));
  }
});
