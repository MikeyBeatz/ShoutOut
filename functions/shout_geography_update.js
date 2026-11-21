import { isDeepStrictEqual } from 'node:util';
import { prepareCardMutation } from './feed_card_state.js';
import { Timestamp } from 'firebase-admin/firestore';

// The provider request stays outside this transaction. No retry/geocoding here.
export async function finishShoutGeography(db, original, geography, { clock = () => new Date() } = {}) {
  return db.runTransaction(async tx => {
    const current = await tx.get(original.ref);
    if (!current.exists || !current.createTime.isEqual(original.createTime)) return false;
    const before = current.data(), captured = original.data();
    if (before.status !== 'active' || !(before.expiresAt instanceof Timestamp) || before.expiresAt.toMillis() <= clock().getTime() ||
        before.contentPurged === true || before.geography?.schemaVersion === 1 ||
        before.authorId !== captured.authorId || before.geohash !== captured.geohash ||
        !isDeepStrictEqual(before.location, captured.location)) return false;
    const profile = await tx.get(db.doc(`publicProfiles/${before.authorId}`));
    if (profile.get('accountStatus') === 'deleted') return false;
    const after = { ...before, geography };
    const plan = await prepareCardMutation(db, tx, current.id, before, after);
    plan?.apply(); tx.update(current.ref, { geography });
    return true;
  });
}
