// Prepared adapter for the existing worker. Enabling archive ingress alone
// does not schedule maintenance. No new host, timer, or live activation.
import { lifecycleEnabled } from './content_lifecycle.js';
import { runContentLifecycleMaintenance } from './content_lifecycle_maintenance.js';

export const contentLifecycleMaintenanceConfiguration = Object.freeze({ enabled: false });

export function createContentLifecycleMaintenance(db, indexWriter, {
  enabled = contentLifecycleMaintenanceConfiguration.enabled,
  clock = () => new Date(), workClock = () => globalThis.performance.now(), pager = null,
} = {}) {
  if (typeof enabled !== 'boolean') throw new Error('invalid-lifecycle-maintenance-enabled');
  if (!enabled) return null; // No IO, including control reads, in the old path.
  if (!lifecycleEnabled(db) || typeof indexWriter?.prepare !== 'function' ||
      typeof clock !== 'function' || typeof workClock !== 'function') throw new Error('lifecycle-maintenance-runtime-required');
  return async ({ maxWork }) => {
    if (!Number.isInteger(maxWork) || maxWork < 1 || maxWork > 50) throw new Error('invalid-lifecycle-work-allocation');
    const summary = { lifecycleState: 'failed', lifecycleSteps: 0, lifecycleWorkUnits: 0,
      lifecycleDeleted: 0, lifecycleFailed: 0, lifecycleNeedsReview: 0 };
    try {
      const result = await runContentLifecycleMaintenance(db, { maxSteps: 32, maxWork, maxElapsedMillis: 10000,
        retryDelayMillis: 60000, clock, workClock, pager, indexWriter });
      summary.lifecycleState = result.state;
      summary.lifecycleSteps = result.steps;
      summary.lifecycleWorkUnits = result.workUnits ?? 0;
      summary.lifecycleDeleted = result.deleted;
      summary.lifecycleNeedsReview = Number(result.state === 'needs-review');
    } catch {
      // A network error may follow a successful commit. The durable cursor is
      // authoritative on the next invocation; never log content/UID/error text.
      summary.lifecycleFailed = 1;
    }
    return summary;
  };
}
