// Deadline identity and optional pre-migration body provenance. A v1 marker
// remains deadline-only; later metadata must never manufacture v2 provenance.
import { Timestamp } from 'firebase-admin/firestore';
import { lifecycleBodyHash } from './content_lifecycle.js';

const atOrBefore = (a, b) => a instanceof Timestamp && b instanceof Timestamp &&
  (a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
export function validAccountLifecycleBinding(data) {
  const b = data?.lifecycleAccountBinding;
  const expected = b?.schemaVersion === 2 ?
    'archiveCreateTime,bodyHash,migrationDigest,originalArchiveUpdateTime,parentArchiveCreateTime,parentArchiveKey,parentCreateTime,parentCreatedAt,schemaVersion,threadCreateTime' :
    'archiveCreateTime,migrationDigest,parentCreateTime,parentCreatedAt,schemaVersion,threadCreateTime';
  return Boolean(b && Object.getPrototypeOf(b) === Object.prototype &&
    Object.keys(b).sort().join(',') === expected && [1, 2].includes(b.schemaVersion) &&
    typeof b.migrationDigest === 'string' && /^[a-f0-9]{64}$/.test(b.migrationDigest) &&
    (b.schemaVersion === 1 || /^[a-f0-9]{64}$/.test(b.bodyHash ?? '') && /^[a-f0-9]{64}$/.test(b.parentArchiveKey ?? '') &&
      atOrBefore(b.archiveCreateTime, b.originalArchiveUpdateTime) && atOrBefore(b.parentCreateTime, b.parentArchiveCreateTime)) &&
    [b.archiveCreateTime, b.parentCreateTime, b.parentCreatedAt, b.threadCreateTime].every(v => v instanceof Timestamp) &&
    atOrBefore(b.parentCreateTime, data.sourceCreateTime) && atOrBefore(data.sourceCreateTime, data.sourceUpdateTime) &&
    atOrBefore(data.sourceUpdateTime, b.archiveCreateTime));
}

// SDK updateTime equal to createTime proves that the root copy had no earlier
// mutation. A changed legacy root is unknown, even if its current text matches.
export function accountReportBodyProven(archive, report) {
  if (!archive?.exists || !report?.exists) return false;
  const d = archive.data(), b = d?.lifecycleAccountBinding;
  if (!validAccountLifecycleBinding(d) || b.schemaVersion !== 2 || d.contentExpired === true ||
      !archive.createTime.isEqual(b.archiveCreateTime) || !b.originalArchiveUpdateTime.isEqual(archive.createTime) ||
      !atOrBefore(b.originalArchiveUpdateTime, archive.updateTime) ||
      !atOrBefore(d.sourceUpdateTime, report.createTime) || !atOrBefore(report.createTime, archive.createTime)) return false;
  try { return lifecycleBodyHash(d.content) === b.bodyHash; } catch { return false; }
}
