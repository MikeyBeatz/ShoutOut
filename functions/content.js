import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createFeedRuntime } from './feed_runtime.js';
import { feedRuntimeConfiguration } from './feed_runtime.js';
import { getFeedDeltaOperation, getCompatibleFeedPageOperation } from './feed_delta.js';
import { feedPageHostOptions } from './feed_serving_options.js';
import { getSavedShoutsOperation } from './get_saved_shouts.js';
import { getOwnShoutsOperation } from './get_own_shouts.js';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';
import { Buffer } from 'node:buffer';
import { getApps, initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { secureCallableOptions } from './callable_security.js';
import { createShoutOperation } from './create_shout.js';
import { createCommentOperation } from './create_comment.js';
import { createPrivateReplyOperation } from './create_private_reply.js';
import { toggleShoutReactionOperation } from './toggle_shout_reaction.js';
import { toggleCommentReactionOperation } from './toggle_comment_reaction.js';
import { toggleShoutSaveOperation } from './toggle_shout_save.js';
import { createContentReportOperation } from './create_content_report.js';
import { deleteCommentOperation } from './delete_comment.js';
import { deletePrivateReplyOperation } from './delete_private_reply.js';
import { removeReportedPrivateReplyOperation } from './remove_reported_private_reply.js';
import { decideContentReportsOperation, orphanReportResolutionEnabled } from './decide_content_reports.js';
import { removeReportedPublicContentOperation } from './remove_reported_public_content.js';
import { sanctionContentOperation, revokeSanctionOperation, managedModerationAuthorityEnabled } from './moderation_sanctions.js';
import { moderationEvidenceRetentionEnabled } from './moderation_retention.js';
import { reviewBusinessApplicationOperation, businessReviewEnabled } from './business_review.js';
import { getArchivedCommentReportTargetOperation } from './archived_comment_report.js';
import { deleteShoutOperation } from './delete_shout.js';
import { prepareAccountDeletionOperation } from './prepare_account_deletion.js';
import { finalizeAccountDeletionOperation } from './finalize_account_deletion.js';
import { contentLifecycleConfiguration } from './content_lifecycle.js';
import { getLifecycleReportEvidenceOperation } from './content_lifecycle_evidence.js';
import { getLifecycleSourcePageOperation } from './content_lifecycle_sources.js';
import { preparedArchiveIdentityRuntime, createArchiveIdentityHandlers } from './archive_identity_runtime.js';
import { observeArchiveIdentity as observeArchiveIdentityOperation, archiveIdentityConfiguration } from './archive_identity.js';
import { createModerationQueueHandlers } from './moderation_queue_runtime.js';

if (getApps().length === 0) initializeApp();

// Declaration only. Disabled artifacts do not mount or require this secret.
const archiveIdentityKey = defineSecret('SHOUTOUT_ARCHIVE_IDENTITY_KEY');
const identitySecretOptions = archiveIdentityConfiguration.enabled ? { secrets: [archiveIdentityKey] } : {};
const identityHostOptions = { ...secureCallableOptions, minInstances: 0, maxInstances: 1,
  concurrency: 1, memory: '256MiB', timeoutSeconds: 15, ...identitySecretOptions };
function identityHandlers() {
  return createArchiveIdentityHandlers(preparedArchiveIdentityRuntime(getFirestore()),
    { getUser: uid => getAuth().getUser(uid) });
}
export const observeArchiveIdentity = onCall(identityHostOptions, request => identityHandlers().sync(request));
export const getArchiveIdentityPage = onCall(identityHostOptions, request => identityHandlers().page(request));

// One switch selects writer + early queue + purge coordinator together. The
// queue is not scheduled here; activation requires the migration/runtime gate.
async function indexedOperation(operation, request, { observeIdentity = false, ...options } = {}) {
  const db = getFirestore(), auth = { getUser: uid => getAuth().getUser(uid) };
  let identityRuntime = preparedArchiveIdentityRuntime(db);
  if (identityRuntime.enabled && observeIdentity) {
    const proof = await observeArchiveIdentityOperation(request, identityRuntime, auth);
    identityRuntime = { ...identityRuntime, expectedAuthor: { userId: request.auth.uid, accountKey: proof.accountKey } };
  }
  const runtime = createFeedRuntime(db, auth, { identityRuntime });
  return operation(request, runtime.database, () => new Date(), { ...options, indexWriter: runtime.indexWriter });
}

function projectedOperation(operation, request, options = {}) {
  return feedRuntimeConfiguration.cardStateEnabled || contentLifecycleConfiguration.enabled || contentLifecycleConfiguration.captureEnabled ? indexedOperation(operation, request, options) : operation(request, getFirestore(), () => new Date(), options);
}

function lifecycleDatabase(expectedAuthor = null) {
  const db = getFirestore();
  return contentLifecycleConfiguration.enabled || contentLifecycleConfiguration.captureEnabled
    ? createFeedRuntime(db, { getUser: uid => getAuth().getUser(uid) }, { identityRuntime: { ...preparedArchiveIdentityRuntime(db), ...(expectedAuthor ? { expectedAuthor } : {}) } }).database : db;
}

function moderationQueueHandlers() {
  const db = getFirestore();
  const runtime = createFeedRuntime(db, getAuth(), { identityRuntime: preparedArchiveIdentityRuntime(db) });
  return createModerationQueueHandlers(runtime.database, { indexWriter: runtime.indexWriter });
}
export const getModerationCasePage = onCall(identityHostOptions, request => moderationQueueHandlers().page(request));
export const startModerationCaseDecision = onCall(identityHostOptions, request => moderationQueueHandlers().start(request));
export const stepModerationCaseDecision = onCall(identityHostOptions, request => moderationQueueHandlers().step(request));

export const getLifecycleSourcePage = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => getLifecycleSourcePageOperation(request, getFirestore()));

export const getLifecycleReportEvidence = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => {
  if (!contentLifecycleConfiguration.enabled && !contentLifecycleConfiguration.captureEnabled) throw new HttpsError('failed-precondition', 'Content lifecycle is not enabled.');
  return getLifecycleReportEvidenceOperation(request, lifecycleDatabase());
});

export { cleanupOperationReceipts } from './receipt_cleanup_schedule.js';

// The declaration does not provision a key. Each project's checked initial
// installation provisions its own secret before activating this endpoint.
const feedCursorKey = defineSecret('SHOUTOUT_FEED_CURSOR_KEY');
export const getOwnShouts = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => {
  if (!feedRuntimeConfiguration.enabled) throw new HttpsError('failed-precondition', 'Spatial feed is not enabled.');
  return getOwnShoutsOperation(request, getFirestore());
});
export const getSavedShouts = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => {
  if (!feedRuntimeConfiguration.enabled) throw new HttpsError('failed-precondition', 'Spatial feed is not enabled.');
  return getSavedShoutsOperation(request, getFirestore());
});
export const getFeedPage = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15, secrets: [feedCursorKey],
}, request => {
  if (!feedRuntimeConfiguration.enabled) throw new HttpsError('failed-precondition', 'Spatial feed is not enabled.');
  const encoded = feedCursorKey.value(), key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('invalid-feed-cursor-key');
  if (request.data?.format === 'delta-v1') return getFeedDeltaOperation(request, getFirestore(), { key, ...feedPageHostOptions(), enabled: feedRuntimeConfiguration.cardStateEnabled && feedRuntimeConfiguration.deltaResponsesEnabled, newsEnabled: feedRuntimeConfiguration.newsEnabled, newsRuntimeEnabled: feedRuntimeConfiguration.newsRuntimeEnabled, recenterEnabled: feedRuntimeConfiguration.recenterEnabled });
  return getCompatibleFeedPageOperation(request, getFirestore(), { key, ...feedPageHostOptions(), enabled: feedRuntimeConfiguration.cardStateEnabled && feedRuntimeConfiguration.deltaResponsesEnabled });
});

// Local preparation only: the client switch remains disabled.
export const finalizeAccountDeletion = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => {
  const db = getFirestore();
  return finalizeAccountDeletionOperation(request, db, () => new Date(), { identityRuntime: preparedArchiveIdentityRuntime(db) });
});

// Prepared locally; deploying this export is a separate rollout step.
export const prepareAccountDeletion = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => indexedOperation(prepareAccountDeletionOperation, request));

export const deleteShout = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, request => indexedOperation(deleteShoutOperation, request, { authorOnly: managedModerationAuthorityEnabled }));

export const deleteComment = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => projectedOperation(deleteCommentOperation, request, { authorOnly: managedModerationAuthorityEnabled }));

export const removeReportedPrivateReply = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => removeReportedPrivateReplyOperation(request, lifecycleDatabase()));

export const decideContentReports = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => decideContentReportsOperation(request, lifecycleDatabase(), () => new Date(), { resolveUnavailableTargets: orphanReportResolutionEnabled, guardEvidenceRetention: moderationEvidenceRetentionEnabled }));

export const removeReportedPublicContent = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => indexedOperation(removeReportedPublicContentOperation, request));

export const sanctionContent = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => sanctionContentOperation(request, lifecycleDatabase()));

export const reviewBusinessApplication = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => {
  if (!businessReviewEnabled) throw new HttpsError('failed-precondition', 'Business review is not enabled.');
  return reviewBusinessApplicationOperation(request, getFirestore(), getAuth());
});

export const revokeSanction = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => revokeSanctionOperation(request, getFirestore()));

export const deletePrivateReply = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, request => deletePrivateReplyOperation(request, lifecycleDatabase()));

export const createShout = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => indexedOperation(createShoutOperation, request, { observeIdentity: true }));

export const createComment = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => projectedOperation(createCommentOperation, request, { observeIdentity: true }));

export const createPrivateReply = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, async request => {
  const identity = preparedArchiveIdentityRuntime(getFirestore());
  const proof = identity.enabled ? await observeArchiveIdentityOperation(request, identity, { getUser: uid => getAuth().getUser(uid) }) : null;
  return createPrivateReplyOperation(request, lifecycleDatabase(proof ? { userId: request.auth.uid, accountKey: proof.accountKey } : null));
});

export const toggleShoutReaction = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => indexedOperation(toggleShoutReactionOperation, request));

export const toggleCommentReaction = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => toggleCommentReactionOperation(request, lifecycleDatabase()));

export const toggleShoutSave = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => projectedOperation(toggleShoutSaveOperation, request));

export const createContentReport = onCall({
  ...identitySecretOptions,
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => createContentReportOperation(request, lifecycleDatabase()));


export const getArchivedCommentReportTarget = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => getArchivedCommentReportTargetOperation(request, getFirestore()));
