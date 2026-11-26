import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContentLifecycleMaintenance, contentLifecycleMaintenanceConfiguration } from './content_lifecycle_runtime.js';
import { createFeedRuntime } from './feed_runtime.js';
import { runAccountMaintenanceTick } from './shout_expiration.js';

test('maintenance is independently off, with no control reads or timer and no implicit archive activation', () => {
  const db = new Proxy({}, { get() { assert.fail('Disabled maintenance touched the database'); } });
  assert.equal(contentLifecycleMaintenanceConfiguration.enabled, false);
  assert.equal(createContentLifecycleMaintenance(db, null), null);
  const runtime = createFeedRuntime(db, null, { enabled: false });
  assert.equal(runtime.contentMaintenance, null);
  assert.throws(() => createContentLifecycleMaintenance(db, null, { enabled: 'true' }), /invalid-lifecycle-maintenance-enabled/);
  assert.throws(() => createFeedRuntime({}, null, { enabled: false, contentMaintenanceEnabled: true }), /invalid-feed-runtime-enabled/);
});

test('the combined tick rejects invalid allocations before any database access', async () => {
  const db = new Proxy({}, { get() { assert.fail('Invalid allocation touched the database'); } });
  for (const pageSize of [undefined, 0, 1, 51, 2.5]) {
    await assert.rejects(runAccountMaintenanceTick(db, null, { pageSize, maxJobs: 1, contentMaintenance: async () => ({}) }), /invalid-content-maintenance/);
  }
  await assert.rejects(runAccountMaintenanceTick(db, null, { pageSize: 50, maxJobs: 2, contentMaintenance: async () => ({}) }), /invalid-content-maintenance/);
  await assert.rejects(runAccountMaintenanceTick(db, null, { contentMaintenance: {} }), /invalid-content-maintenance/);
});
