import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { lifecycleArchiveRecord, lifecycleArchiveKey, validateLifecycleArchive, validateLifecycleThread, lifecycleTimes } from './content_lifecycle.js';
import { planLifecycleSourceAdoption, applyLifecycleSourceAdoption, validateLifecycleAdoptionPlan } from './content_lifecycle_adoption.js';

test('transition provenance binds SDK incarnation and observation times without claiming publication capture', () => {
  const born = Timestamp.fromMillis(1000), create = Timestamp.fromMillis(2000), update = Timestamp.fromMillis(3000), captured = Timestamp.fromMillis(4000);
  const source = { createdAt: born, authorId: 'author', title: 'Stored', text: 'Original' };
  const thread = { schemaVersion: 1, shoutId: 'root', sourceCreatedAt: born, plannedExpiresAt: Timestamp.fromMillis(5000),
    ...lifecycleTimes(Timestamp.fromMillis(5000)), archivedAt: captured };
  const record = { ...lifecycleArchiveRecord('shouts/root', source, thread, { sourceCreateTime: create, sourceUpdateTime: update, migrationDigest: 'a'.repeat(64) }), archivedAt: captured };
  const key = lifecycleArchiveKey('shoutout-dev-46c81', 'shouts/root', source), db = { projectId: 'shoutout-dev-46c81' };
  assert.equal(record.captureMode, 'transition'); assert.equal(record.content.createdAt, born);
  assert.equal(validateLifecycleArchive(db, key, record).kind, 'shout');
  for (const patch of [{ sourceUpdateTime: Timestamp.fromMillis(1999) }, { archivedAt: Timestamp.fromMillis(2999) },
    { migrationDigest: 'x' }, { captureMode: 'atomic-write' }, { captureMode: 'invented' }]) {
    assert.throws(() => validateLifecycleArchive(db, key, { ...record, ...patch }), /Invalid archived content identity/);
  }
  const migratedThread = { ...thread, captureMode: 'transition', sourceCreateTime: create, sourceUpdateTime: update, migrationDigest: 'a'.repeat(64) };
  assert.equal(validateLifecycleThread(migratedThread), migratedThread);
  assert.throws(() => validateLifecycleThread({ ...migratedThread, sourceUpdateTime: Timestamp.fromMillis(5000) }), /Invalid content lifecycle header/);
});

test('adoption rejects malformed selection and unapproved writes before database access', async () => {
  const db = new Proxy({ projectId: 'shoutout-dev-46c81' }, { get(target, key) {
    if (key === 'projectId') return target.projectId;
    assert.fail(`Unexpected IO: ${String(key)}`);
  } });
  for (const paths of [[], ['users/uid'], [null], ['shouts/a', 'shouts/a'], Array.from({ length: 51 }, (_, n) => `shouts/s${n}`)]) {
    await assert.rejects(planLifecycleSourceAdoption(db, paths), /invalid-lifecycle-adoption-paths/);
  }
  await assert.rejects(applyLifecycleSourceAdoption(db, {}), /approved-digest-required/);
  assert.throws(() => validateLifecycleAdoptionPlan({ digest: 'a'.repeat(64) }, db.projectId), /invalid-lifecycle-adoption-plan/);
});
