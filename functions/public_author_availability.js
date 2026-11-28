// Public source eligibility, shared by metadata, cached-body and saved readers.
// A missing legacy public profile remains allowed. Any deletion request fences
// public access immediately, independently of the later identity/purge phase.
// Read through the caller's transaction; never cache these mutable guards.
export async function readPublicAuthorAvailability(reader, db, authorIds) {
  const ids = [...new Set(authorIds)];
  if (ids.some(id => typeof id !== 'string' || !id.length || id.length > 128 || id.includes('/'))) {
    throw new Error('invalid-public-author');
  }
  if (!ids.length) return { unavailable: new Set(), readUnits: 0 };
  const docs = await reader.getAll(...ids.flatMap(id => [
    db.doc(`publicProfiles/${id}`), db.doc(`accountDeletionRequests/${id}`),
  ]), { fieldMask: ['accountStatus'] });
  return { readUnits: docs.length, unavailable: new Set(ids.filter((id, i) =>
    docs[i * 2].get('accountStatus') === 'deleted' || docs[i * 2 + 1].exists)) };
}
