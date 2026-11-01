export class AccountIdentityWriteBlocked extends Error {
  constructor() { super('Account deletion prevents this identity write.'); }
}

export function assertIdentityWriteTarget(db, uid) {
  if (db?.projectId !== 'shoutout-dev-46c81' &&
      !(db?.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) {
    throw new Error('identity-write-dev-project-required');
  }
  if (typeof uid !== 'string' || uid.length === 0 || uid.includes('/')) throw new Error('invalid-identity-write-uid');
}

export async function runActiveIdentityTransaction(db, uid, write) {
  assertIdentityWriteTarget(db, uid);
  if (typeof write !== 'function') throw new Error('identity-write-callback-required');
  return db.runTransaction(async transaction => {
    const [request, publicProfile] = await transaction.getAll(
      db.doc(`accountDeletionRequests/${uid}`), db.doc(`publicProfiles/${uid}`),
    );
    // Any request blocks, just as existing callable eligibility does.
    if (request.exists || publicProfile.data()?.accountStatus === 'deleted') throw new AccountIdentityWriteBlocked();
    return write(transaction, publicProfile);
  });
}
