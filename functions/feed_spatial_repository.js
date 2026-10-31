import { FieldPath } from 'firebase-admin/firestore';

const hashValid = value => typeof value === 'string' && /^[0123456789bcdefghjkmnpqrstuvwxyz]{7}$/.test(value);

// No writes, public endpoint or silent fallback to an unpinned read.
// The caller must additionally enforce Auth/App Check and content availability.
export async function openSpatialRepository(db) {
  const seed = await db.collection('shouts').select('geohash').limit(1).get();
  const readTime = seed.readTime;
  if (!readTime) throw new Error('feed-snapshot-unavailable');
  const snapshot = Object.freeze({ readTime });
  return {
    snapshot,
    async readRange({ start, end, after, limit, snapshot: supplied }) {
      if (supplied !== snapshot || !hashValid(start) || !hashValid(end) || start > end ||
        !Number.isInteger(limit) || limit < 1 || (after && (!hashValid(after.hash) ||
        typeof after.id !== 'string' || !after.id || after.id.includes('/')))) throw new Error('invalid-range');
      let query = db.collection('shouts').where('status', '==', 'active')
        .where('geohash', '>=', start).where('geohash', '<=', end)
        .orderBy('geohash').orderBy(FieldPath.documentId()).limit(limit);
      if (after) query = query.startAfter(after.hash, after.id);
      const result = await db.runTransaction(transaction => transaction.get(query), { readOnly: true, readTime });
      const rows = result.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, geohash: data.geohash,
          location: { latitude: data.location?.latitude, longitude: data.location?.longitude },
          createdAt: data.createdAt?.toMillis(), expiresAt: data.expiresAt?.toMillis(),
          authorId: data.authorId, categories: data.categories,
          businessHighlighted: data.businessHighlighted === true, businessSpotlight: data.businessSpotlight === true,
          likesCount: data.likesCount ?? 0, dislikesCount: data.dislikesCount ?? 0 };
      });
      const last = rows.at(-1);
      return { rows, exhausted: rows.length < limit, next: last ? { hash: last.geohash, id: last.id } : null };
    },
  };
}
