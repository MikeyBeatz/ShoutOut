// Prepared adapter only; no Scheduler/callable/trigger export or live import.
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { runRetentionMaintenance } from './retention_cleanup.js';

export const retentionRuntimePolicy = Object.freeze({ enabled: false, completedCooldownMillis: 86400000,
  pageSize: 50, maxPages: 10, maxMillis: 10000 });
function readControl(snapshot) {
  const data = snapshot.data();
  if (!snapshot.exists || !data || Object.keys(data).sort().join(',') !== 'mode,revision,v' || data.v !== 1 ||
      !Number.isSafeInteger(data.revision) || data.revision < 1 || !['off', 'active', 'paused'].includes(data.mode)) return { mode: 'off', reason: 'missing-or-invalid-control' };
  return { mode: data.mode, revision: data.revision, updateTime: snapshot.updateTime };
}
export function createRetentionRuntime(db, { enabled = false, clock = () => new Date(),
  elapsedClock, childProbe, beforeCommit, afterAdmission, pageSize = 50, maxPages = 10, maxMillis = 10000,
} = {}) {
  assertFeedRuntimeTarget(db);
  if (typeof enabled !== 'boolean' || typeof clock !== 'function' ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10 ||
      !Number.isInteger(maxMillis) || maxMillis < 1 || maxMillis > 10000 ||
      [elapsedClock, beforeCommit, afterAdmission].some(fn => fn !== undefined && typeof fn !== 'function')) throw new Error('invalid-retention-runtime-options');
  return Object.freeze({
    async run() {
      if (!enabled) return { state: 'disabled', controlReads: 0, reason: 'local-switch-off' };
      const control = db.doc('maintenanceState/retentionControl'), admission = readControl(await control.get());
      if (admission.mode !== 'active') return { state: admission.mode, controlReads: 1, reason: admission.reason ?? 'control-mode' };
      if (afterAdmission) await afterAdmission();
      const transactionGuard = async tx => {
        const current = readControl(await tx.get(control));
        if (current.mode !== 'active' || current.revision !== admission.revision ||
            !current.updateTime.isEqual(admission.updateTime)) throw new Error('retention-control-changed');
      };
      const options = { clock, pageSize, maxPages, maxMillis, transactionGuard,
        completedCooldownMillis: retentionRuntimePolicy.completedCooldownMillis,
        ...(elapsedClock ? { elapsedClock } : {}), ...(childProbe ? { childProbe } : {}),
        ...(beforeCommit ? { beforeCommit } : {}) };
      const phases = await runRetentionMaintenance(db, { reads: options, receipts: options });
      return { state: Object.values(phases).some(r => ['failed', 'lease-lost'].includes(r.state)) ? 'interrupted' : 'checked', controlReads: 1, phases };
    },
  });
}
