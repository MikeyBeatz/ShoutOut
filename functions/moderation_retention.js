import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { AccountPurgeNeedsReview, accountRetentionMillis, accountPurgeJobRef } from './account_purge_guard.js';

export const moderationEvidenceRetentionEnabled = false;
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

// The read participates in the same transaction as the new evidence copy. A
// concurrent request, marker or purge forces a retry before any copy is written.
export async function assertReportEvidenceRetention(tx, db, reports, now) {
  const uids = [...new Set(reports.docs.map(report => report.get('reporterId')))];
  if (uids.length > 50 || !uids.every(id) || !(now instanceof Timestamp)) throw new Error('invalid-report-retention-input');
  if (!uids.length) return;
  const snapshots = await tx.getAll(...uids.flatMap(uid => [
    db.doc(`accountDeletionRequests/${uid}`), db.doc(`publicProfiles/${uid}`),
  ]), { fieldMask: ['userId', 'accountStatus'] });
  for (let n = 0; n < uids.length; n++) {
    const request = snapshots[n * 2], marker = snapshots[n * 2 + 1];
    if (request.exists && (request.get('userId') !== uids[n] || !(request.createTime instanceof Timestamp))) {
      throw new HttpsError('failed-precondition', 'The report retention state is ambiguous.');
    }
    if (request.exists ? now.toMillis() >= request.createTime.toMillis() + accountRetentionMillis : marker.get('accountStatus') === 'deleted') {
      throw new HttpsError('failed-precondition', 'The report evidence retention expired. Refresh after cleanup.');
    }
  }
  const jobs = snapshots.filter((snapshot, n) => n % 2 === 0 && snapshot.exists).map(request => accountPurgeJobRef(db, {
    projectId: db.projectId, userId: request.id, requestCreateTime: request.createTime,
  }));
  if (jobs.length) for (const job of await tx.getAll(...jobs, { fieldMask: ['ingressClosedAt'] })) {
    // This read fences a transaction that began just before the deadline but
    // would otherwise copy evidence after the purge's link inventory passed.
    if (job.exists && job.get('ingressClosedAt') != null) {
      throw new HttpsError('failed-precondition', 'The report evidence purge already started.');
    }
  }
}

// Prepare all reads before applying writes. Only the exact historical sanction
// may lose its copied reason; a new active ban is never modified by this plan.
export async function prepareSanctionCopyScrub(tx, db, sanction) {
  const data = sanction.data();
  if (!sanction.exists || !id(data.userId) || !['warning', 'accountBan', 'contentRestriction'].includes(data.type)) {
    throw new AccountPurgeNeedsReview('invalid-sanction-copy-source');
  }
  let copies;
  if (data.type === 'warning') {
    const warnings = await tx.get(db.collection('warnings').where('sanctionId', '==', sanction.id).limit(2).select('userId', 'sanctionId', 'reason'));
    if (warnings.size > 1) throw new AccountPurgeNeedsReview('ambiguous-sanction-warning-copies');
    copies = warnings.docs;
  } else copies = [await tx.get(db.doc(`${data.type === 'accountBan' ? 'bans' : 'contentRestrictions'}/${data.userId}`))];
  const changes = [];
  for (const copy of copies) {
    if (!copy.exists || copy.get('sanctionId') !== sanction.id) continue;
    if (copy.get('userId') !== data.userId) throw new AccountPurgeNeedsReview('ambiguous-sanction-active-copy');
    if (Object.hasOwn(copy.data(), 'reason')) changes.push(copy.ref);
  }
  return { count: changes.length, apply() { for (const ref of changes) tx.update(ref, { reason: FieldValue.delete() }); } };
}
