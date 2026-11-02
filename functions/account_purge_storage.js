import { AccountPurgeNeedsReview, AccountPurgeLeaseLost } from './account_purge_guard.js';

export async function stepAccountPurgeStorage({ identity, bucket, jobRef, guard, stage, db, beforeCommit }) {
  if (![`${identity.projectId}.firebasestorage.app`, `${identity.projectId}.appspot.com`].includes(bucket?.name) ||
      ![`businessLogos/${identity.userId}/`, `bugReports/${identity.userId}/`].includes(stage.prefix)) {
    throw new AccountPurgeNeedsReview('invalid-purge-storage-target');
  }
  const [policy] = await bucket.getMetadata();
  if (policy.versioning?.enabled || Number(policy.softDeletePolicy?.retentionDurationSeconds ?? 0) !== 0 || policy.retentionPolicy?.retentionPeriod) {
    throw new AccountPurgeNeedsReview('purge-storage-retention-policy-blocks-deletion');
  }
  let { job } = await db.runTransaction(guard);
  if (!job.pendingFile) {
    const [files] = await bucket.getFiles({ prefix: stage.prefix, maxResults: 1, autoPaginate: false });
    if (files.length > 1) throw new AccountPurgeNeedsReview('unbounded-purge-storage-page');
    if (!files.length) return { complete: true };
    const file = files[0], path = file.name;
    const valid = stage.prefix.startsWith('businessLogos/')
      ? new RegExp(`^businessLogos/${identity.userId}/logo-[0-9]+\\.png$`).test(path)
      : new RegExp(`^bugReports/${identity.userId}/[A-Za-z0-9_-]{1,128}/screenshot$`).test(path);
    if (!valid) throw new AccountPurgeNeedsReview('unknown-owned-storage-object');
    const [metadata] = await file.getMetadata();
    if (!/^[1-9][0-9]*$/.test(String(metadata.generation))) throw new AccountPurgeNeedsReview('storage-generation-unavailable');
    await db.runTransaction(async transaction => {
      const current = await guard(transaction);
      if (current.job.version !== job.version || current.job.pendingFile) throw new AccountPurgeLeaseLost();
      transaction.update(jobRef, { pendingFile: { path, generation: String(metadata.generation) },
        version: job.version + 1, updatedAt: current.now });
    });
    job = (await db.runTransaction(guard)).job;
  }
  const pending = job.pendingFile;
  const pendingPathValid = stage.prefix.startsWith('businessLogos/')
    ? new RegExp(`^businessLogos/${identity.userId}/logo-[0-9]+\\.png$`).test(pending?.path)
    : new RegExp(`^bugReports/${identity.userId}/[A-Za-z0-9_-]{1,128}/screenshot$`).test(pending?.path);
  if (typeof pending?.path !== 'string' || !pending.path.startsWith(stage.prefix) || !pendingPathValid ||
      !/^[1-9][0-9]*$/.test(pending.generation)) throw new AccountPurgeNeedsReview('invalid-pending-storage-file');
  if (beforeCommit) await beforeCommit({ path: pending.path, operation: 'storage-delete' });
  await db.runTransaction(guard);
  const file = bucket.file(pending.path);
  try { await file.delete({ ifGenerationMatch: pending.generation }); }
  catch (error) { if (error.code !== 404) throw error; }
  try { await file.getMetadata(); throw new AccountPurgeNeedsReview('storage-delete-not-verified'); }
  catch (error) { if (error.code !== 404) throw error; }
  await db.runTransaction(async transaction => {
    const current = await guard(transaction);
    if (current.job.version !== job.version || current.job.pendingFile?.path !== pending.path ||
        current.job.pendingFile?.generation !== pending.generation) throw new AccountPurgeLeaseLost();
    transaction.update(jobRef, { pendingFile: null, storageCount: current.job.storageCount + 1,
      version: job.version + 1, updatedAt: current.now });
  });
  return { complete: false };
}
