// Local preparation only: no Function export and no account-job integration.
import { Timestamp } from 'firebase-admin/firestore';
import { AccountDeletionRequestUnavailable } from './account_shout_hiding.js';

export class AccountPublicIdentityNeedsReview extends Error {}
export const deletedPublicIdentity = Object.freeze({ schemaVersion: 1, accountStatus: 'deleted' });
const profileKeys = new Set(['nickname', 'avatarId', 'avatarBackgroundStart', 'avatarBackgroundEnd',
  'avatarGradientDirection', 'publicRole', 'businessLogoPath', 'businessLogoVersion']);

export async function maskDeletedAccountPublicIdentity(identity, db, auth, {
  clock = () => new Date(), transactionGuard, beforeTransaction = null,
} = {}) {
  if (!identity || identity.projectId !== db.projectId || typeof identity.userId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(identity.userId) || !(identity.requestCreateTime instanceof Timestamp) ||
      typeof transactionGuard !== 'function' || typeof clock !== 'function') throw new Error('invalid-public-identity-options');
  const requestRef = db.doc(`accountDeletionRequests/${identity.userId}`);
  const publicRef = db.doc(`publicProfiles/${identity.userId}`), userRef = db.doc(`users/${identity.userId}`);
  const retainUntil = Timestamp.fromMillis(identity.requestCreateTime.toMillis() + 60 * 86400000);
  const checkRequest = snapshot => {
    if (!snapshot.exists || snapshot.data()?.userId !== identity.userId || snapshot.data()?.status !== 'pending') {
      throw new AccountDeletionRequestUnavailable('not-pending');
    }
    if (!snapshot.createTime.isEqual(identity.requestCreateTime)) throw new AccountDeletionRequestUnavailable('replaced');
    const now = clock();
    if (!(now instanceof Date) || !Number.isSafeInteger(now.getTime())) throw new Error('invalid-identity-clock');
    if (now.getTime() >= retainUntil.toMillis()) throw new AccountPublicIdentityNeedsReview('identity-retention-expired');
  };
  checkRequest(await requestRef.get());
  try { await auth.getUser(identity.userId); return { state: 'waiting-for-auth-deletion', changed: false }; }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  if ((await publicRef.listCollections()).length) throw new AccountPublicIdentityNeedsReview('unexpected-public-children');
  if (beforeTransaction) await beforeTransaction();
  return db.runTransaction(async transaction => {
    const [request, user, current] = await transaction.getAll(requestRef, userRef, publicRef);
    checkRequest(request);
    const key = user.data()?.nicknameLower, nickname = user.data()?.nickname;
    if (!user.exists || typeof key !== 'string' || key.length < 3 || key.length > 24 || key !== key.toLowerCase() ||
        !/^[\p{L}0-9]+([-_][\p{L}0-9]+)*$/u.test(key) || typeof nickname !== 'string' || nickname.toLowerCase() !== key) {
      throw new AccountPublicIdentityNeedsReview('nickname-identity-unavailable');
    }
    const reservation = await transaction.get(db.collection('nicknames').doc(key));
    if (!reservation.exists || reservation.data()?.uid !== identity.userId || reservation.data()?.nicknameLower !== key) {
      throw new AccountPublicIdentityNeedsReview('nickname-reservation-not-owned');
    }
    const data = current.data();
    const alreadyMasked = current.exists && Object.keys(data).length === 2 &&
      data.schemaVersion === 1 && data.accountStatus === 'deleted';
    if (current.exists && !alreadyMasked &&
        (Object.keys(data).some(k => !profileKeys.has(k)) || data.nickname !== nickname)) {
      throw new AccountPublicIdentityNeedsReview('unexpected-public-profile');
    }
    const result = { state: 'public-identity-masked', changed: !alreadyMasked,
      reservationKey: key, retainUntil };
    const record = await transactionGuard(transaction, result);
    if (typeof record !== 'function') throw new Error('public-identity-guard-required');
    if (!alreadyMasked) transaction.set(publicRef, deletedPublicIdentity);
    // Existing reservation and private/Business profiles/roles are untouched.
    record(); return result;
  });
}
