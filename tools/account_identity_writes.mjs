import { FieldValue } from 'firebase-admin/firestore';
import { AccountIdentityWriteBlocked, runActiveIdentityTransaction } from './identity_write_fence.mjs';

export async function backfillPublicProfileForUser(db, uid) {
  try {
    return await runActiveIdentityTransaction(db, uid, async transaction => {
      const [user, role] = await transaction.getAll(db.doc(`users/${uid}`), db.doc(`accountRoles/${uid}`));
      const data = user.data();
      if (!data?.nickname || !data.avatarId) return { written: false, reason: 'missing-profile-fields' };
      const publicRole = role.data()?.role;
      transaction.set(db.doc(`publicProfiles/${uid}`), {
        nickname: data.nickname,
        avatarId: data.avatarId,
        avatarBackgroundStart: data.avatarBackgroundStart,
        avatarBackgroundEnd: data.avatarBackgroundEnd,
        avatarGradientDirection: data.avatarGradientDirection,
        ...(publicRole && publicRole !== 'user' ? { publicRole } : {}),
      }, { merge: true });
      return { written: true };
    });
  } catch (error) {
    if (error instanceof AccountIdentityWriteBlocked) return { written: false, reason: 'account-deleting' };
    throw error;
  }
}

// Role names, levels, scope and timestamps are still built by the existing CLI.
export async function writeAccountRoleForUser(db, uid, assignment) {
  return runActiveIdentityTransaction(db, uid, transaction => {
    const role = db.doc(`accountRoles/${uid}`), profile = db.doc(`publicProfiles/${uid}`);
    if (assignment === null) {
      transaction.delete(role);
      transaction.update(profile, { publicRole: FieldValue.delete() });
    } else {
      transaction.set(role, assignment);
      transaction.update(profile, { publicRole: assignment.role });
    }
  });
}
