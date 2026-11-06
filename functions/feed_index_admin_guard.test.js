import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedIndexControl, assertFeedAdminTarget, applyLegacyFeedAdminUpdates } from './feed_index_admin_guard.js';

const control = (mode, reader = null, writers = []) => ({ schemaVersion: 1, revision: 0, mode,
  readGenerationId: reader, writeGenerationIds: writers });

test('control contract distinguishes off, initial build, rebuild, active and paused', () => {
  for (const value of [control('off'), control('building', null, ['new']), control('building', 'old', ['old', 'new']),
    control('active', 'old', ['old']), control('active', 'new', ['old', 'new']), control('paused', null, ['old'])]) {
    assert.deepEqual(validateFeedIndexControl(value), value);
  }
  const input = control('active', 'old', ['old']), result = validateFeedIndexControl(input);
  result.writeGenerationIds.push('other'); assert.deepEqual(input.writeGenerationIds, ['old']);
});

test('malformed or contradictory control never becomes an implicit off state', () => {
  const off = control('off');
  for (const value of [undefined, null, [], {}, { ...off, schemaVersion: 2 }, { ...off, revision: -1 },
    { ...off, revision: 0.5 }, { ...off, extra: true }, { ...off, mode: 'unknown' }, { ...off, readGenerationId: undefined },
    { ...off, writeGenerationIds: 'new' }, control('off', null, ['old']), control('off', 'old', ['old']),
    control('active'), control('active', 'other', ['old']), control('active', 'old', ['old', 'old']),
    control('active', 'bad/name', ['bad/name']), control('building'), control('building', 'old', ['old']),
    control('paused'), control('paused', 'old', ['old'])]) assert.throws(() => validateFeedIndexControl(value), /invalid-feed-index-control/);
});

test('legacy Admin writes reject production before database access; empty DEV work does not access a database', async () => {
  const forbidden = { projectId: 'shoutout-production-a1b34', runTransaction() { assert.fail('must not access production'); } };
  assert.throws(() => assertFeedAdminTarget(forbidden), /feed-admin-dev-project-required/);
  await assert.rejects(applyLegacyFeedAdminUpdates(forbidden, []), /feed-admin-dev-project-required/);
  assert.deepEqual(await applyLegacyFeedAdminUpdates({ projectId: 'shoutout-dev-46c81' }, []), { updated: 0 });
});
