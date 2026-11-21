// Inactive regional signal adapter. Never stores source IDs, authors or clocks.
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { directoryWindows } from './feed_block_index_store.js';
import { encodeGeohash } from './geohash.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { requireEligibleActor } from './callable_security.js';

export const newsSignalLimit = 64;
// Separate policy/record from B2: importing its runtime here would pull private
// read-sync handlers into every feed writer/maintenance deployment artifact.
export function consumeNewsCredit(data, nowMillis) {
  if (!Number.isSafeInteger(nowMillis) || nowMillis < 0) throw new Error('invalid-news-clock');
  let available = 40000, stamp = nowMillis;
  if (data !== undefined) {
    if (!data || Object.keys(data).sort().join(',') !== 'creditMillis,updatedAt,v' || data.v !== 1 ||
        !Number.isSafeInteger(data.creditMillis) || data.creditMillis < 0 || data.creditMillis > 40000 ||
        !(data.updatedAt instanceof Timestamp) || !Number.isSafeInteger(data.updatedAt.toMillis()) || data.updatedAt.toMillis() < 0) throw new Error('invalid-news-rate-record');
    stamp = Math.max(nowMillis, data.updatedAt.toMillis());
    available = Math.min(40000, data.creditMillis + Math.max(0, nowMillis - data.updatedAt.toMillis()));
  }
  return available < 1000 ? { allowed: false, retryAfterMs: stamp - nowMillis + 1000 - available } :
    { allowed: true, record: { v: 1, creditMillis: available - 1000, updatedAt: Timestamp.fromMillis(stamp) } };
}
const stamp = time => [time.seconds, time.nanoseconds];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const reject = reason => { throw new HttpsError('failed-precondition', 'Refresh the feed news context.', { reason }); };
export function newsCoverage(point, radiusKm) {
  if (!point || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
      !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180 || ![1, 3, 5, 10, 20, 50].includes(radiusKm)) throw new Error('invalid-news-coverage');
  const cells = new Set();
  for (const w of directoryWindows(point, radiusKm)) {
    if ((w.latEnd - w.latStart + 1) * (w.lonEnd - w.lonStart + 1) > newsSignalLimit) return null;
    for (let y = w.latStart; y <= w.latEnd; y++) for (let x = w.lonStart; x <= w.lonEnd; x++) {
      cells.add(encodeGeohash((y + .5) / 1024 * 180 - 90, (x + .5) / 1024 * 360 - 180).slice(0, 4));
      if (cells.size > newsSignalLimit) return null;
    }
  }
  return [...cells].sort();
}
export function validateNewsControl(data) {
  if (!data || Object.keys(data).sort().join(',') !== 'generation,incarnation,mode,revision,v' || data.v !== 1 ||
      !Number.isSafeInteger(data.revision) || data.revision < 1 || !['off', 'active', 'paused'].includes(data.mode) ||
      typeof data.generation !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(data.generation) ||
      !Array.isArray(data.incarnation) || data.incarnation.length !== 2 ||
      !data.incarnation.every(Number.isSafeInteger) || data.incarnation[0] < 0 || data.incarnation[1] < 0 || data.incarnation[1] >= 1e9) reject('invalid-news-control');
  return data;
}
export async function newsControl(tx, db, binding, { writer = false, state = null, marker = null } = {}) {
  const control = validateNewsControl((await tx.get(db.doc('feedNewsControl/current'))).data());
  if (!writer && control.mode !== 'active') reject(`news-${control.mode}`);
  state ??= validateFeedIndexControl((await tx.get(db.doc('feedIndexControl/current'))).data());
  if (!['active', 'building'].includes(state.mode) || state.cardReadGenerationId !== control.generation ||
      !state.cardWriteGenerationIds?.includes(control.generation) || binding &&
      (binding.generation !== control.generation || !same(binding.incarnation, control.incarnation))) reject('feed-session-expired');
  marker ??= await tx.get(db.doc(`feedIndexGenerations/${control.generation}`));
  if (!marker.exists || marker.get('cardReady') !== true || marker.get('cardProjection') !== 1 ||
      !same(stamp(marker.createTime), control.incarnation) || !same(marker.get('newsIncarnation'), control.incarnation)) reject('feed-session-expired');
  return control;
}
export async function preparePublicationSignal(tx, db, changes, state, context) {
  const control = await newsControl(tx, db, null, { writer: true, state, marker: context.markers.get(state.cardReadGenerationId) });
  const cells = new Set();
  for (const change of changes) {
    if (change.before !== null || change.after?.status !== 'active' || !/^[0123456789bcdefghjkmnpqrstuvwxyz]{7}$/.test(change.after.geohash)) throw new Error('invalid-new-publication');
    cells.add(change.after.geohash.slice(0, 4));
  }
  const edits = [...cells].map(cell => [db.doc(`feedIndexGenerations/${control.generation}/publicationHeads/${cell}`), { v: 1, token: randomUUID() }]);
  return { writes: edits.length, apply() { for (const [ref, value] of edits) tx.set(ref, value); } };
}
export async function admitNewsRead(request, db, binding, clock) {
  return db.runTransaction(async tx => {
    await requireEligibleActor({ request, db, reader: tx, now: clock() });
    await newsControl(tx, db, binding);
    const ref = db.doc(`rateLimits/${request.auth.uid}/actions/feedNews`), prior = await tx.get(ref);
    const credit = consumeNewsCredit(prior.data(), clock().getTime());
    if (!credit.allowed) throw new HttpsError('resource-exhausted', 'Feed news rate limit.', { reason: 'feed-news-rate-limit', retryAfterMs: credit.retryAfterMs });
    tx.set(ref, credit.record);
  });
}
export async function captureNewsSignals(request, db, { binding, snapshot, baseline }, { historical = false, confirm = true, clock = () => new Date() } = {}) {
  const cells = newsCoverage(snapshot.context.point, snapshot.context.radiusKm);
  const result = await db.runTransaction(async tx => {
    await requireEligibleActor({ request, db, reader: tx, now: clock() });
    await newsControl(tx, db, binding);
    const docs = cells?.length ? await tx.getAll(...cells.map(cell => db.doc(`feedIndexGenerations/${binding.generation}/publicationHeads/${cell}`))) : [];
    const heads = cells === null ? null : Object.fromEntries(docs.map(doc => {
      const data = doc.data();
      if (doc.exists && (Object.keys(data).sort().join(',') !== 'token,v' || data.v !== 1 || typeof data.token !== 'string' || !/^[a-f0-9-]{36}$/.test(data.token))) reject('invalid-news-head');
      return [doc.id, data?.token ?? null];
    }));
    return { v: 1, baseline, generation: binding.generation, incarnation: binding.incarnation, heads };
  }, { readOnly: true, ...(historical ? { readTime: new Timestamp(snapshot.readTime.seconds, snapshot.readTime.nanoseconds) } : {}) });
  if (confirm) await db.runTransaction(async tx => {
    await requireEligibleActor({ request, db, reader: tx, now: clock() }); await newsControl(tx, db, binding);
  }, { readOnly: true });
  return result;
}
