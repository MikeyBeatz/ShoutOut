import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { cleanupBusinessLogoBatch, updateBusinessLogoOperation } from './business_logo.js';

// Prepared only. Neither this module nor the host joins an active deployment.
export const businessLogoConfiguration = Object.freeze({ enabled: false });
export const businessLogoCallableOptions = Object.freeze({
  region: 'europe-west3', enforceAppCheck: true, minInstances: 0,
  maxInstances: 1, concurrency: 1, memory: '256MiB', timeoutSeconds: 15,
});
export const businessLogoCleanupBounds = Object.freeze({ maximum: 50, softMillis: 5000, leaseMillis: 120000 });

export function createBusinessLogoRuntime(db, storage, { enabled = false, clock = () => new Date(), monotonic = () => performance.now(), newOwner = randomUUID } = {}) {
  if (typeof enabled !== 'boolean') throw Error('invalid-business-logo-runtime-option');
  const control = () => db.doc('businessLogoMaintenance/current');
  const target = () => {
    if (db.projectId !== 'shoutout-dev-46c81' &&
        !(db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) throw Error('business-logo-dev-target-required');
  };
  return {
    async update(request) {
      if (!enabled) return updateBusinessLogoOperation(request, db, storage);
      target();
      const state = await control().get();
      if (state.get('mode') !== 'active' || state.get('schemaVersion') !== 1 || !Number.isSafeInteger(state.get('revision')) || state.get('revision') < 1) {
        return updateBusinessLogoOperation(request, db, storage);
      }
      const revision = state.get('revision');
      return updateBusinessLogoOperation(request, db, storage, { enabled: true, clock,
        guardTransaction: async tx => {
          const row = await tx.get(control());
          if (row.get('mode') !== 'active' || row.get('revision') !== revision || row.get('schemaVersion') !== 1) throw new HttpsError('failed-precondition', 'logo-control-changed');
        },
      });
    },
    async maintenance() {
      if (!enabled) return { status: 'disabled', examined: 0 };
      target();
      const ref = control(), owner = newOwner(), start = monotonic();
      const initial = await ref.get();
      if (!initial.exists || ['off', 'paused'].includes(initial.get('mode'))) return { status: 'idle', examined: 0 };
      if (initial.get('schemaVersion') !== 1 || initial.get('mode') !== 'active' ||
          !Number.isSafeInteger(initial.get('revision')) || initial.get('revision') < 1) throw Error('invalid-logo-maintenance-control');
      // Idle path: one control read + one empty bounded query, no lease writes.
      const due = await db.collectionGroup('logoState').where('cleanupAt', '<=', Timestamp.fromDate(clock())).limit(1).get();
      if (due.empty) return { status: 'checked', examined: 0, cleaned: 0, needsReview: false, needsContinuation: false };
      const acquired = await db.runTransaction(async tx => {
        const row = await tx.get(ref), now = clock().getTime();
        if (!row.exists || ['off', 'paused'].includes(row.get('mode'))) return null;
        if (row.get('schemaVersion') !== 1 || row.get('mode') !== 'active' ||
            !Number.isSafeInteger(row.get('revision')) || row.get('revision') < 1) throw Error('invalid-logo-maintenance-control');
        const until = row.get('leaseUntil');
        if (until !== undefined && !(until instanceof Timestamp)) throw Error('invalid-logo-maintenance-lease');
        if (until?.toMillis() > now) return null;
        tx.update(ref, { owner, leaseUntil: Timestamp.fromMillis(now + businessLogoCleanupBounds.leaseMillis) });
        return { revision: row.get('revision'), after: row.get('after') ?? null };
      });
      if (!acquired) return { status: 'idle', examined: 0 };
      let after = acquired.after, examined = 0, cleaned = 0, reviews = 0, interrupted = false;
      // Persist after every bounded row. A cold worker can continue without an
      // account inventory; a crash repeats safe exact-account cleanup.
      try {
        while (examined < businessLogoCleanupBounds.maximum && monotonic() - start < businessLogoCleanupBounds.softMillis) {
          const before = await ref.get();
          if (before.get('mode') !== 'active' || before.get('revision') !== acquired.revision ||
              before.get('owner') !== owner || before.get('leaseUntil').toMillis() <= clock().getTime()) { interrupted = true; break; }
          const guardTransaction = async tx => {
            const row = await tx.get(ref);
            if (row.get('mode') !== 'active' || row.get('revision') !== acquired.revision || row.get('owner') !== owner ||
                !(row.get('leaseUntil') instanceof Timestamp) || row.get('leaseUntil').toMillis() <= clock().getTime()) throw new HttpsError('aborted', 'logo-maintenance-lease-lost');
          };
          const page = await cleanupBusinessLogoBatch(db, storage, { enabled: true, clock, limit: 1, after, guardTransaction });
          const saved = await db.runTransaction(async tx => {
            const row = await tx.get(ref);
            if (row.get('mode') !== 'active' || row.get('revision') !== acquired.revision || row.get('owner') !== owner ||
                row.get('leaseUntil').toMillis() <= clock().getTime()) return false;
            tx.update(ref, { after: page.after, needsReview: row.get('needsReview') === true || page.needsReview.length > 0 });
            return true;
          });
          if (!saved) { interrupted = true; break; }
          examined += page.examined; cleaned += page.cleaned; reviews += page.needsReview.length;
          after = page.after;
          if (!after) break;
        }
      } finally {
        await db.runTransaction(async tx => {
          const row = await tx.get(ref);
          if (row.get('owner') === owner) tx.update(ref, { owner: null, leaseUntil: Timestamp.fromMillis(0) });
        });
      }
      return { status: interrupted ? 'interrupted' : 'checked', examined, cleaned, needsReview: initial.get('needsReview') === true || reviews > 0, needsContinuation: after !== null };
    },
  };
}
