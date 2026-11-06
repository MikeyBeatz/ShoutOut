import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireEligibleActor } from './callable_security.js';
import { assertFeedRuntimeTarget } from './feed_index_paths.js';
import { publicFeedBody } from './get_feed_page.js';
import { distanceKm } from './feed_spatial.js';

// The continuation only skips within this actor's own bookmark query. It
// grants no access, contains no source body and need not be a signed feed
// snapshot. Source availability and account gates are checked on every page.
export async function getSavedShoutsOperation(request, db, { clock = () => new Date() } = {}) {
  assertFeedRuntimeTarget(db);
  const identity = await requireEligibleActor({ request, db, now: clock() }), input = request.data;
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.expectedUserId !== identity.uid ||
      Object.keys(input).some(key => !['expectedUserId', 'after', 'point'].includes(key)) ||
      !(input.point == null || typeof input.point === 'object' && !Array.isArray(input.point) &&
        Object.keys(input.point).length === 2 && Number.isFinite(input.point.latitude) && Math.abs(input.point.latitude) <= 90 &&
        Number.isFinite(input.point.longitude) && Math.abs(input.point.longitude) <= 180) ||
      !(input.after == null || typeof input.after === 'string' && /^shouts\/[^/]{1,256}\/saves\/[^/]{1,128}$/.test(input.after) &&
        input.after.split('/')[3] === identity.uid)) throw new HttpsError('invalid-argument', 'Invalid saved Shout page.');
  let query = db.collectionGroup('saves').where('userId', '==', identity.uid).orderBy(FieldPath.documentId()).limit(50);
  if (input.after) query = query.startAfter(db.doc(input.after));
  const page = await query.get(), sources = page.docs.filter(doc => /^shouts\/[^/]+\/saves\/[^/]+$/.test(doc.ref.path) && doc.id === identity.uid);
  const docs = sources.length ? await db.getAll(...sources.map(doc => doc.ref.parent.parent)) : [];
  const blocked = new Set((await db.doc(`users/${identity.uid}`).collection('blocked').limit(200).get()).docs.map(doc => doc.id));
  const authors = [...new Set(docs.map(doc => doc.get('authorId')).filter(id => typeof id === 'string' && id.length && !id.includes('/')))];
  const deleted = new Set((authors.length ? await db.getAll(...authors.map(id => db.doc(`publicProfiles/${id}`))) : [])
    .filter(doc => doc.get('accountStatus') === 'deleted').map(doc => doc.id));
  const now = clock().getTime();
  const items = docs.filter(doc => doc.exists && doc.get('status') === 'active' && doc.get('contentPurged') !== true &&
    doc.get('expiresAt') instanceof Timestamp && doc.get('expiresAt').toMillis() > now &&
    !blocked.has(doc.get('authorId')) && !deleted.has(doc.get('authorId')))
    .map(doc => ({ id: doc.id, distanceKm: input.point && Number.isFinite(doc.get('location')?.latitude) && Number.isFinite(doc.get('location')?.longitude)
      ? distanceKm(input.point, doc.get('location')) : 0, data: publicFeedBody(doc.data()) }));
  await requireEligibleActor({ request, db, now: clock() });
  return { version: 1, items, next: page.size === 50 ? page.docs.at(-1).ref.path : null };
}
