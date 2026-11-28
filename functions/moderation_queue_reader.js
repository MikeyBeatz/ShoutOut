// Private server contract. No callable is exported or activated here.
import { createHash } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireEligibleActor } from './callable_security.js';
import { privateReportModeratorLevel } from './remove_reported_private_reply.js';
import { validateModerationQueueControl, validateModerationCase, moderationReportTarget, moderationQueueOrders, moderationQueuePageSize } from './moderation_queue.js';
import { moderationAreaTokens, moderationAreaContains } from './moderation_queue_geography.js';
import { readableModerationQueueReports } from './moderation_queue_retention.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const invalid = () => { throw new HttpsError('invalid-argument', 'Invalid moderation page.'); };
const fail = () => { throw new HttpsError('failed-precondition', 'Refresh the moderation queue.'); };
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).every(k => keys.includes(k));
const metadataFields = ['reporterId', 'shoutId', 'commentId', 'privateReplyId', 'reason', 'status', 'createdAt', 'authorId',
  'contentArchiveKey', 'shoutArchiveKey', 'moderationGeography', 'parentContextPurged', 'legacyEvidenceBinding', 'accountArchiveId', 'accountEvidenceBinding'];
function timestamp(value) {
  if (!exact(value, ['seconds', 'nanoseconds']) || !Number.isSafeInteger(value.seconds) || value.seconds < 0 || value.seconds > 253402300799 ||
      !Number.isInteger(value.nanoseconds) || value.nanoseconds < 0 || value.nanoseconds >= 1e9) invalid();
  return new Timestamp(value.seconds, value.nanoseconds);
}
const timeJson = value => ({ seconds: value.seconds, nanoseconds: value.nanoseconds });

export function validateModerationPage(data) {
  if (!exact(data, ['expectedUserId', 'category', 'order', 'area', 'cursor']) ||
      typeof data.expectedUserId !== 'string' || !data.expectedUserId ||
      !['all', 'shout', 'comment', 'privateReply'].includes(data.category) || !['mostReported', 'newest', 'oldest'].includes(data.order) ||
      !exact(data.area, ['kind', 'value'])) invalid();
  moderationAreaTokens(3, data.category, data.area);
  if (data.cursor !== undefined && (!exact(data.cursor, ['caseId', 'binding', 'count', 'at']) ||
      !hex(data.cursor.caseId) || !hex(data.cursor.binding) || !Number.isSafeInteger(data.cursor.count) || data.cursor.count < 1)) invalid();
  if (data.cursor) timestamp(data.cursor.at);
  return data;
}

/** Metadata is global by the owner's explicit Q-01 decision. This operation
 * never grants body access, applies a geography permission, or returns text.
 * Cursors are bound to account/current role/control/filter; order changes
 * use a fresh cursor. New or reranked cases appear on explicit refresh.
 */
export async function getModerationCasePageOperation(request, db, clock = () => new Date()) {
  const { uid } = requireCallableIdentity(request), input = validateModerationPage(request.data);
  if (uid !== input.expectedUserId) throw new HttpsError('unauthenticated', 'The signed-in account changed.');
  return db.runTransaction(async tx => {
    const now = clock();
    await requireEligibleActor({ request, db, reader: tx, now });
    const [role, legacy, control] = await tx.getAll(db.doc(`accountRoles/${uid}`), db.doc(`moderators/${uid}`), db.doc('moderationQueueControl/current'));
    const level = privateReportModeratorLevel(role.data(), legacy.data());
    const state = validateModerationQueueControl(control.data(), { reading: true });
    const binding = digest([db.projectId, uid, role.updateTime?.seconds, role.updateTime?.nanoseconds, legacy.updateTime?.seconds, legacy.updateTime?.nanoseconds,
      state.incarnation, state.revision, input.category, input.order, { kind: input.area.kind, value: input.area.value }]);
    if (input.cursor && input.cursor.binding !== binding) fail();
    const tokens = moderationAreaTokens(level >= 4 ? 4 : 3, input.category, input.area);
    let query = db.collection('moderationCases').where('filterTokens', tokens.length === 1 ? 'array-contains' : 'array-contains-any', tokens.length === 1 ? tokens[0] : tokens);
    for (const [field, direction] of moderationQueueOrders[input.order]) query = query.orderBy(field === '__name__' ? FieldPath.documentId() : field, direction);
    if (input.cursor) query = input.order === 'mostReported' ? query.startAfter(input.cursor.count, timestamp(input.cursor.at), input.cursor.caseId) :
      query.startAfter(timestamp(input.cursor.at), input.cursor.caseId);
    const page = await tx.get(query.limit(moderationQueuePageSize));
    const records = page.docs.map(d => ({ ref: d.ref, data: validateModerationCase(d.data(), d.id) }));
    const selected = records.filter(r => moderationAreaContains(input.area, r.data.geohash));
    const reports = selected.length ? await tx.getAll(...selected.map(r => db.doc(r.data.representativePath)), { fieldMask: metadataFields }) : [];
    const readable = await readableModerationQueueReports(tx, db, reports, selected.map(r => r.data.type), now);
    const items = selected.flatMap((r, index) => {
      const report = reports[index], data = report.data(), target = moderationReportTarget(report.ref.path, data);
      if (!report.exists || target.caseId !== r.ref.id || !['open', 'escalated'].includes(data.status) || typeof data.reason !== 'string') fail();
      if (!readable[index]) return [];
      return [{ caseId: r.ref.id, incarnation: r.data.incarnation, revision: r.data.revision,
        targetType: r.data.type, shoutId: r.data.shoutId, targetId: r.data.targetId,
        pendingCount: r.data.pendingCount, openCount: r.data.openCount, escalatedCount: r.data.escalatedCount,
        firstAt: timeJson(r.data.firstAt), lastAt: timeJson(r.data.lastAt),
        geography: r.data.geography, geohash: r.data.geohash,
        representativeReport: { collection: report.ref.parent.id, id: report.id, reason: data.reason },
        deciding: Boolean(r.data.activeDecision), activeJobId: r.data.activeDecision ?? null,
        appliedDecision: r.data.appliedEffect?.decision ?? null }];
    });
    const last = records.at(-1), cursor = page.size === 50 && last ? { caseId: last.ref.id, binding, count: last.data.pendingCount, at: timeJson(last.data.lastAt) } : null;
    return { schemaVersion: 1, items, cursor, observedAt: now.toISOString() };
  });
}
