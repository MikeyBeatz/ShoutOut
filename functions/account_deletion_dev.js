// DEV-only entry point deployed as the separate account-deletion codebase.
// Deliberately absent from index.js/content.js; preparation alone never deploys it.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { runAccountDeletionCreatedEvent } from './account_deletion_job.js';
import { runAccountMaintenanceTick } from './shout_expiration.js';

if (getApps().length === 0) initializeApp();

export const accountDeletionDevProposal = Object.freeze({
  retentionPurgeEnabled: false, // Activation follows exact CI, ownership/index and Storage policy checks.
  retireRolePrivilegesEnabled: true, // Retire both role stores atomically with Auth confirmation.
  shoutExpirationEnabled: true, // Reuse otherwise idle maintenance ticks; never delete content here.
  reactionRemovalEnabled: true, // UID coverage/indexes verified in DEV; only new jobs use v5.
  publicIdentityEnabled: true, // Historical v1/v2/v3/v4 jobs retain their schema.
  confirmAuthDeletionEnabled: true, // Gate every new destructive slice before touching content.
  contentArchiveEnabled: true, // Approved DEV archive pilot, 1 November 2026.
  privateCleanupEnabled: true, // Approved DEV private-data pilot, 1 November 2026.
  leaseMillis: 120000, retryDelayMillis: 60000, authWaitMillis: 86400000, pageSize: 50, maxJobs: 1,
});

export function assertAccountDeletionDevTarget(projectId) {
  if (projectId === 'shoutout-dev-46c81' ||
      projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080') return;
  throw new Error('account-deletion-dev-target-required');
}

function database() {
  const db = getFirestore(); assertAccountDeletionDevTarget(db.projectId); return db;
}

function workerOptions(db) {
  return { ...accountDeletionDevProposal,
    logoBucket: getStorage().bucket(`${db.projectId}.firebasestorage.app`),
    bucket: getStorage().bucket(`${db.projectId}.firebasestorage.app`) };
}

const common = { region: 'europe-west3', minInstances: 0, maxInstances: 1,
  concurrency: 1, memory: '256MiB', timeoutSeconds: 60 };

export const accountDeletionRequestCreatedDev = onDocumentCreated({
  ...common, document: 'accountDeletionRequests/{userId}', retry: true,
}, async event => {
  try {
    const db = database();
    const result = await runAccountDeletionCreatedEvent(event, db, getAuth(), workerOptions(db));
    const summary = { phase: result.state, hidden: result.hidden ?? 0, privateDeleted: result.deleted ?? 0 };
    (result.state === 'needs-review' ? logger.warn : logger.info)('account-deletion-shout-job', summary);
  } catch {
    logger.error('account-deletion-shout-job', { stage: 'creation', code: 'processing-failed' });
    throw new Error('account-deletion-job-failed');
  }
});

export const resumeAccountDeletionJobsDev = onSchedule({
  ...common, schedule: '* * * * *', timeZone: 'Etc/UTC', retryCount: 0,
}, async () => {
  try {
    const db = database();
    const result = await runAccountMaintenanceTick(db, getAuth(), {
      ...workerOptions(db), clock: () => new Date(),
    });
    const log = result.purgeFailed || result.purgeNeedsReview || result.failed || result.needsReview || result.privateDisabled || result.contentDisabled || result.identityDisabled || result.reactionRemovalDisabled || result.checkpointConflict ? logger.warn : logger.info;
    log('account-deletion-job-recovery', result);
  } catch {
    logger.error('account-deletion-job-recovery', { code: 'scan-failed' });
    throw new Error('account-deletion-recovery-failed');
  }
});
