import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireCallableIdentity, requireAccountDeletionActor } from './callable_security.js';
import { prepareArchiveIdentityDeletion } from './archive_identity.js';

const retentionMillis = 60 * 86400000;

// The per-UID request is the retry anchor. Never renew an existing
// request, delete Auth, hide content or remove children here.
export async function finalizeAccountDeletionOperation(request, db, clock = () => new Date(), { beforeCommit = null, identityRuntime = null } = {}) {
  const { uid, email } = requireCallableIdentity(request), input = request.data;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !Object.hasOwn(input, 'expectedUserId') || input.expectedUserId !== uid) {
    throw new HttpsError('invalid-argument', 'Invalid account deletion finalization fields.');
  }
  const ref = db.doc(`accountDeletionRequests/${uid}`);
  const result = await db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const data = existing.data();
      if (data.userId !== uid || data.status !== 'pending' ||
          !(data.requestedAt instanceof Timestamp) || !(data.retainUntil instanceof Timestamp) ||
          Object.hasOwn(data, 'authDeletionConfirmedAt') && !(data.authDeletionConfirmedAt instanceof Timestamp)) {
        throw new HttpsError('failed-precondition', 'Invalid existing account deletion request.');
      }
      const identity = await prepareArchiveIdentityDeletion(transaction, db, uid, identityRuntime, existing);
      identity?.apply();
      return { userId: uid, ready: true, confirmed: data.authDeletionConfirmedAt instanceof Timestamp };
    }
    const now = clock();
    await requireAccountDeletionActor({ request, db, reader: transaction, now });
    // createShout reads the same request document inside its transaction. If it
    // commits first this query observes its Shout (or this transaction retries);
    // if finalization commits first publication retries and rejects pending Auth.
    const active = await transaction.get(db.collection('shouts').where('authorId', '==', uid)
      .where('status', '==', 'active').limit(1));
    if (!active.empty) return { userId: uid, ready: false, confirmed: false };
    const identity = await prepareArchiveIdentityDeletion(transaction, db, uid, identityRuntime);
    transaction.create(ref, {
      userId: uid, email, status: 'pending', requestedAt: FieldValue.serverTimestamp(),
      // Existing workers derive the authoritative deadline from createTime +60d.
      retainUntil: Timestamp.fromMillis(now.getTime() + retentionMillis),
      ...(identity?.requestFields ?? {}),
    });
    identity?.apply();
    if (beforeCommit) await beforeCommit();
    return { userId: uid, ready: true, confirmed: false };
  });
  if (result.ready && identityRuntime?.enabled) await db.runTransaction(async transaction => {
    const original = await transaction.get(ref);
    if (!original.exists) return;
    const identity = await prepareArchiveIdentityDeletion(transaction, db, uid, identityRuntime, original);
    identity?.apply();
  });
  return result;
}
