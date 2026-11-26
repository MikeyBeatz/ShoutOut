// Exact SDK times, never application timestamps or a replacement live parent.
import { Timestamp } from 'firebase-admin/firestore';

export const lifecycleTimeAtOrBefore = (a, b) => a instanceof Timestamp && b instanceof Timestamp &&
  (a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);

export function validLegacyReportBinding(report) {
  const proof = report.get('legacyEvidenceBinding');
  return proof && Object.getPrototypeOf(proof) === Object.prototype &&
    Object.keys(proof).sort().join(',') === 'migrationDigest,reportCreateTime,schemaVersion' &&
    proof.schemaVersion === 1 && typeof proof.migrationDigest === 'string' && /^[a-f0-9]{64}$/.test(proof.migrationDigest) &&
    proof.reportCreateTime instanceof Timestamp && proof.reportCreateTime.isEqual(report.createTime);
}

export function reportArchiveVersionProven(archive, report, legacyTransition = false) {
  if (!archive?.exists || !report?.exists) return false;
  const data = archive.data();
  // Ordinary reports were bound atomically. An unbound old report cannot pick
  // an arbitrary earlier copy: it might have been superseded before reporting.
  if (!legacyTransition) return lifecycleTimeAtOrBefore(data.archivedAt, report.createTime) &&
    lifecycleTimeAtOrBefore(archive.createTime, report.createTime);
  return data.captureMode === 'transition' &&
    lifecycleTimeAtOrBefore(report.createTime, data.archivedAt) &&
    lifecycleTimeAtOrBefore(report.createTime, archive.createTime) &&
    lifecycleTimeAtOrBefore(data.sourceCreateTime, data.sourceUpdateTime) &&
    lifecycleTimeAtOrBefore(data.sourceUpdateTime, report.createTime);
}

export function reportArchivePairProven(archive, parent, report) {
  if (!reportArchiveVersionProven(archive, report, true) || !reportArchiveVersionProven(parent, report, true)) return false;
  // Both transition copies must name their original SDK source incarnation.
  return lifecycleTimeAtOrBefore(parent.get('sourceCreateTime'), archive.get('sourceCreateTime'));
}
