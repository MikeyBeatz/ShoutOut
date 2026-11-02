// Internal operator utility. No credential loading, CLI side effects or automatic migration.
import { createHash } from 'node:crypto';
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const ownershipDataDigest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function ownershipPlanDigest(plan) {
  const { digest: _digest, verifiedAt: _time, liveWrites: _writes, ...body } = plan;
  return ownershipDataDigest(body);
}
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function validatePlan(db, plan, expectedDigest) {
  if (db.projectId !== 'shoutout-dev-46c81' || plan?.projectId !== db.projectId || plan.kind !== 'reaction-save-ownership-v1' ||
      !Array.isArray(plan.repairs) || plan.repairs.length > 500 || !Array.isArray(plan.review) || plan.review.length ||
      plan.coverageReady !== false || !/^[a-f0-9]{64}$/.test(plan.digest) || plan.digest !== expectedDigest ||
      ownershipPlanDigest(plan) !== plan.digest) throw new Error('invalid-or-unapproved-ownership-plan');
  const seen = new Set();
  for (const row of plan.repairs) {
    const p = typeof row.path === 'string' ? row.path.split('/') : [];
    if (seen.has(row.path) || p[0] !== 'shouts' || !identifier(row.userId) || p.at(-1) !== row.userId ||
        !p.filter((_, i) => i % 2 === 1).every(identifier) ||
        !(p.length === 4 && ['reactions', 'saves'].includes(p[2]) || p.length === 6 && p[2] === 'comments' && p[4] === 'reactions') ||
        Object.keys(row.patch ?? {}).length !== 1 || row.patch.userId !== row.userId ||
        !/^[a-f0-9]{64}$/.test(row.originalDigest) || !Number.isSafeInteger(row.updateTime?.seconds) || row.updateTime.seconds < 0 ||
        !Number.isInteger(row.updateTime?.nanoseconds) || row.updateTime.nanoseconds < 0 || row.updateTime.nanoseconds > 999999999) {
      throw new Error('invalid-ownership-repair-row');
    }
    seen.add(row.path);
  }
}
const stamp = value => typeof value?.toMillis === 'function' && Number.isFinite(value.toMillis());
function validData(data, group) {
  return data && (group === 'reactions'
    ? Object.keys(data).every(k => ['type', 'updatedAt', 'userId'].includes(k)) && ['like', 'dislike'].includes(data.type) && stamp(data.updatedAt)
    : Object.keys(data).every(k => ['createdAt', 'userId'].includes(k)) && stamp(data.createdAt));
}

export async function repairActivityOwnership(db, plan, { expectedDigest, apply = false } = {}) {
  validatePlan(db, plan, expectedDigest);
  if (typeof apply !== 'boolean') throw new Error('invalid-ownership-repair-mode');
  if (!plan.repairs.length) return { wouldChange: 0, changed: 0, alreadyIndexed: 0 };
  const snapshots = await db.getAll(...plan.repairs.map(row => db.doc(row.path))), pending = [];
  let alreadyIndexed = 0;
  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i], row = plan.repairs[i], data = snap.data();
    if (!snap.exists || snap.ref.path !== row.path || !validData(data, row.path.split('/').at(-2))) throw new Error('ownership-source-needs-review');
    if (data.userId === row.userId) { alreadyIndexed++; continue; }
    if (Object.hasOwn(data, 'userId') || snap.updateTime.seconds !== row.updateTime.seconds ||
        snap.updateTime.nanoseconds !== row.updateTime.nanoseconds || ownershipDataDigest(data) !== row.originalDigest) {
      throw new Error('ownership-plan-is-stale');
    }
    pending.push({ snap, row });
  }
  if (apply && pending.length) {
    const batch = db.batch();
    for (const { snap, row } of pending) batch.update(snap.ref, { userId: row.userId }, { lastUpdateTime: snap.updateTime });
    await batch.commit();
  }
  return { wouldChange: pending.length, changed: apply ? pending.length : 0, alreadyIndexed };
}
