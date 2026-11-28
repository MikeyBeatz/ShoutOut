// Metadata-only local operator. No live inventory or scheduler is invoked.
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { validLogoPath } from './business_logo_storage.js';
const hash = d => createHash('sha256').update(JSON.stringify(d)).digest('hex');
const fail = () => { throw new HttpsError('failed-precondition', 'The logo orphan plan changed.'); };
const stamp = t => t ? [t.seconds, t.nanoseconds] : null;
async function snapshot(reader, db, uid) {
  const rows = await reader.getAll(...[`users/${uid}`, `publicProfiles/${uid}`, `businessProfiles/${uid}/logoState/current`, `accountDeletionRequests/${uid}`].map(p => db.doc(p)));
  if (!rows[0].exists || !rows[1].exists || rows[1].get('accountStatus') === 'deleted' || rows[3].exists) fail();
  return { versions: rows.slice(0, 3).map(d => stamp(d.updateTime)),
    protectedPaths: [rows[0].get('businessLogoPath'), rows[1].get('businessLogoPath'), rows[2].get('pending.path'), rows[2].get('pending.oldPath')].filter(p => typeof p === 'string') };
}
export async function planBusinessLogoOrphans(db, storage, uid, { enabled = false, pageToken = null } = {}) {
  if (!enabled) return { status: 'disabled' };
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) fail();
  const before = await snapshot(db, db, uid), page = await storage.list(uid, { limit: 50, pageToken });
  const after = await snapshot(db, db, uid); if (hash(before) !== hash(after)) fail();
  const body = { v: 1, projectId: db.projectId, uid, ...before,
    rows: page.rows.filter(r => !before.protectedPaths.includes(r.path)), nextPageToken: page.pageToken };
  if (body.rows.some(r => !validLogoPath(uid, r.path) || !/^[1-9][0-9]*$/.test(r.generation))) fail();
  return { ...body, digest: hash(body) };
}
export async function cleanupBusinessLogoOrphans(db, storage, plan, approvedDigest, { enabled = false } = {}) {
  if (!enabled) return { status: 'disabled' };
  const { digest, ...body } = plan ?? {};
  if (digest !== approvedDigest || hash(body) !== digest || body.v !== 1 || body.projectId !== db.projectId ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(body.uid) || !Array.isArray(body.rows) || body.rows.length > 50 ||
      body.rows.some(r => !validLogoPath(body.uid, r.path) || !/^[1-9][0-9]*$/.test(r.generation) || body.protectedPaths.includes(r.path))) fail();
  const guard = () => db.runTransaction(async tx => {
    const current = await snapshot(tx, db, body.uid);
    if (hash(current) !== hash({ versions: body.versions, protectedPaths: body.protectedPaths })) fail();
  });
  let deleted = 0;
  for (const row of body.rows) { await storage.remove(body.uid, row.path, row.generation, guard); deleted++; }
  await guard(); return { status: 'complete', examined: body.rows.length, deleted, nextPageToken: body.nextPageToken };
}
