// Explicitly approved DEV-only metadata repair. Never called by a live export.
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { encodeGeohash } from './geohash.js';
import { preflightFeedIndex } from './feed_index_preflight.js';

const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
function allowedProject(projectId) {
  return projectId === 'shoutout-dev-46c81' ||
    (projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080');
}
export async function planGeohashRepair(records, { projectId, now }) {
  if (!allowedProject(projectId) || !Array.isArray(records) || records.length > 10000) throw new Error('invalid-geohash-repair-source');
  const changes = [], proposed = records.map(record => {
    const data = record.data, point = data?.location;
    if (!point || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
        !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180) return record;
    const after = encodeGeohash(point.latitude, point.longitude);
    if (data.geohash === after) return record;
    if (!(record.updateTime instanceof Timestamp)) throw new Error('missing-geohash-repair-precondition');
    changes.push({ id: record.id, hadGeohash: Object.hasOwn(data, 'geohash'), before: data.geohash ?? null, after,
      updateTime: { seconds: record.updateTime.seconds, nanoseconds: record.updateTime.nanoseconds } });
    return { id: record.id, data: { ...data, geohash: after } };
  });
  const validation = await preflightFeedIndex(proposed, { now, errorLimit: 1000 });
  const plan = { version: 1, projectId, asOfMillis: now, sourceRecords: records.length,
    state: validation.state === 'valid' && changes.length <= 50 ? 'ready-for-approval' : 'blocked',
    changes, validation };
  return { ...plan, digest: digest(plan) };
}

export async function applyGeohashRepairPlan(db, plan, { approvedDigest } = {}) {
  const { digest: checksum, ...body } = plan;
  if (!allowedProject(db.projectId) || plan.projectId !== db.projectId || body.version !== 1 ||
      body.state !== 'ready-for-approval' || checksum !== approvedDigest || digest(body) !== checksum ||
      !Array.isArray(body.changes) || body.changes.length > 50) throw new Error('unapproved-geohash-repair-plan');
  const refs = body.changes.map(change => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(change.id) || !/^[0123456789bcdefghjkmnpqrstuvwxyz]{7}$/.test(change.after) ||
        !Number.isInteger(change.updateTime?.seconds) || !Number.isInteger(change.updateTime?.nanoseconds) ||
        change.updateTime.nanoseconds < 0 || change.updateTime.nanoseconds >= 1000000000) throw new Error('invalid-geohash-repair-plan');
    return db.doc(`shouts/${change.id}`);
  });
  if (!refs.length) return { updated: 0, digest: checksum };
  const batch = db.batch();
  body.changes.forEach((change, i) => batch.update(refs[i], { geohash: change.after }, {
    lastUpdateTime: new Timestamp(change.updateTime.seconds, change.updateTime.nanoseconds),
  }));
  const result = await batch.commit();
  return { updated: result.length, digest: checksum,
    writes: result.map((write, i) => ({ id: body.changes[i].id, updateTime: write.writeTime.toDate().toISOString() })) };
}
