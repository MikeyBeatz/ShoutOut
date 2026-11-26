// Metadata-only legacy binding. This is not evidence of a reported body version.
import { Timestamp } from 'firebase-admin/firestore';

const atOrBefore = (a, b) => a instanceof Timestamp && b instanceof Timestamp &&
  (a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
export function validAccountLifecycleBinding(data) {
  const b = data?.lifecycleAccountBinding;
  return Boolean(b && Object.getPrototypeOf(b) === Object.prototype &&
    Object.keys(b).sort().join(',') === 'archiveCreateTime,migrationDigest,parentCreateTime,parentCreatedAt,schemaVersion,threadCreateTime' &&
    b.schemaVersion === 1 && typeof b.migrationDigest === 'string' && /^[a-f0-9]{64}$/.test(b.migrationDigest) &&
    [b.archiveCreateTime, b.parentCreateTime, b.parentCreatedAt, b.threadCreateTime].every(v => v instanceof Timestamp) &&
    atOrBefore(b.parentCreateTime, data.sourceCreateTime) && atOrBefore(data.sourceCreateTime, data.sourceUpdateTime) &&
    atOrBefore(data.sourceUpdateTime, b.archiveCreateTime));
}
