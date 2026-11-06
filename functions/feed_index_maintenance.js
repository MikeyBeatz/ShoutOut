import { runNormalIndexGc } from './feed_normal_gc.js';

// Resume an existing erasure ahead of new work. Between completed jobs share
// the single index slice with normal GC, so neither queue grows indefinitely.
export function indexMaintenance(db, queue, { clock = () => new Date(), normalGc = runNormalIndexGc } = {}) {
  const phaseRef = db.doc('feedIndexMaintenance/runtime');
  return async () => {
    const summary = { indexRecovered: 0, indexState: 'idle', indexSteps: 0, indexFailed: 0, indexNeedsReview: 0 };
    try {
      const recovery = await queue.recover({ pageSize: 50 }); summary.indexRecovered = recovery.queued;
      if (recovery.failed) summary.indexFailed++;
      const phase = await phaseRef.get();
      if (phase.exists && (phase.get('v') !== 1 || !['erasure', 'gc'].includes(phase.get('next')))) throw new Error('invalid-index-maintenance-phase');
      let result = await queue.runNext({ workingOnly: true, maxSteps: 32, maxMillis: 10000 });
      let kind = 'erasure';
      if (result.state === 'idle') {
        kind = phase.get('next') ?? 'erasure';
        result = kind === 'erasure' ? await queue.runNext({ maxSteps: 32, maxMillis: 10000 }) : await normalGc(db, { clock });
        if (result.state === 'idle') {
          kind = kind === 'erasure' ? 'gc' : 'erasure';
          result = kind === 'erasure' ? await queue.runNext({ maxSteps: 32, maxMillis: 10000 }) : await normalGc(db, { clock });
        }
      }
      summary.indexState = `${kind}:${result.state}`; summary.indexSteps = result.slice?.steps ?? result.steps ?? 0;
      summary.indexNeedsReview = result.state === 'needs-review' ? 1 : 0;
      await db.runTransaction(async tx => {
        const current = await tx.get(phaseRef);
        if (current.exists !== phase.exists || phase.exists && !current.updateTime.isEqual(phase.updateTime)) return;
        tx.set(phaseRef, { v: 1, next: kind === 'erasure' ? 'gc' : 'erasure' });
      });
    } catch { summary.indexFailed++; }
    return summary;
  };
}
