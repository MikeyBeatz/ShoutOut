import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { lifecycleTimes, lifecycleDay, lifecycleArchiveKey, lifecycleReferenceRedaction,
  createContentLifecycleDatabase, lifecycleBinding, lifecycleGeography, lifecycleControlUsable } from './content_lifecycle.js';
import { runContentLifecycleMaintenance } from './content_lifecycle_maintenance.js';

test('ordinary and Business deadlines are public end plus seven plus sixty days, without report extensions', () => {
  const born = 1795520000000;
  for (const [hours, totalDays] of [[24, 68], [168, 74]]) {
    const times = lifecycleTimes(Timestamp.fromMillis(born + hours * 3600000));
    assert.equal(times.retainUntil.toMillis(), born + totalDays * lifecycleDay);
    assert.equal(times.historyUntil.toMillis(), times.publicUntil.toMillis() + 7 * lifecycleDay);
  }
  const manual = lifecycleTimes(Timestamp.fromMillis(born + lifecycleDay), Timestamp.fromMillis(born + 3 * 3600000));
  assert.equal(manual.retainUntil.toMillis(), born + 3 * 3600000 + 67 * lifecycleDay);
  const late = lifecycleTimes(Timestamp.fromMillis(born + lifecycleDay), Timestamp.fromMillis(born + 2 * lifecycleDay));
  assert.equal(late.retainUntil.toMillis(), born + 68 * lifecycleDay);
});

test('disabled lifecycle preserves the exact database and performs no maintenance reads', async () => {
  const raw = new Proxy({}, { get(_target, key) {
    if (key === lifecycleBinding) return undefined;
    assert.fail(`Unexpected database access: ${String(key)}`);
  } });
  assert.equal(createContentLifecycleDatabase(raw), raw);
  assert.deepEqual(await runContentLifecycleMaintenance(raw), { state: 'disabled', steps: 0, deleted: 0 });
});

test('immutable identity ignores counters while preserving text, birth and project boundaries', () => {
  const data = { authorId: 'author', text: 'Original', createdAt: new Timestamp(1795520000, 123456789) };
  const key = lifecycleArchiveKey('project', 'shouts/root/comments/child', data);
  assert.equal(key, lifecycleArchiveKey('project', 'shouts/root/comments/child', { ...data, likesCount: 9, cardRevision: 4 }));
  assert.notEqual(key, lifecycleArchiveKey('other', 'shouts/root/comments/child', data));
  assert.notEqual(key, lifecycleArchiveKey('project', 'shouts/root/comments/child', { ...data, text: 'Changed' }));
  assert.notEqual(key, lifecycleArchiveKey('project', 'shouts/root/comments/child', { ...data, createdAt: new Timestamp(1795520000, 123456790) }));
});

test('the post-history redaction exception accepts only removal of the automatic reference and prefix', () => {
  const before = { authorId: 'foreign', createdAt: Timestamp.fromMillis(1), text: '@Original Keep this', replyToCommentId: 'original', replyToNickname: 'Original' };
  const after = { authorId: 'foreign', createdAt: before.createdAt, text: 'Keep this' };
  assert(lifecycleReferenceRedaction(before, after));
  assert(!lifecycleReferenceRedaction(before, { ...after, text: 'Arbitrary rewrite' }));
  assert(!lifecycleReferenceRedaction(before, { ...after, authorId: 'replacement' }));
  assert(!lifecycleReferenceRedaction(before, { ...after, replyToCommentId: 'other' }));
});

test('country-only moderation scope survives the evidence projection without extra location fields', () => {
  assert.deepEqual(lifecycleGeography({ geography: { schemaVersion: 1, countryCode: 'CZ' } }), { schemaVersion: 1, countryCode: 'CZ' });
  assert.deepEqual(lifecycleGeography({ geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42', location: 'drop' } }),
    { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' });
});

test('only valid active or explicitly allowed paused controls authorize retention work', () => {
  const snapshot = data => ({ get: field => data[field] });
  for (const mode of ['off', 'unknown', null]) assert(!lifecycleControlUsable(snapshot({ schemaVersion: 1, revision: 1, mode }), { allowPaused: true }));
  const paused = snapshot({ schemaVersion: 1, revision: 2, mode: 'paused' });
  assert(!lifecycleControlUsable(paused)); assert(lifecycleControlUsable(paused, { allowPaused: true }));
  assert(lifecycleControlUsable(snapshot({ schemaVersion: 1, revision: 1, mode: 'active' })));
  for (const revision of [undefined, 0, -1, 1.5, '1']) {
    assert(!lifecycleControlUsable(snapshot({ schemaVersion: 1, revision, mode: 'paused' }), { allowPaused: true }));
  }
});
