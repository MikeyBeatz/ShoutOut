import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createFeedRuntime } from './feed_runtime.js';
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
import { getArchivedCommentReportTargetOperation } from './archived_comment_report.js';
import { deleteShoutOperation } from './delete_shout.js';
import { prepareAccountDeletionOperation } from './prepare_account_deletion.js';
import { finalizeAccountDeletionOperation } from './finalize_account_deletion.js';

if (getApps().length === 0) initializeApp();

// One switch selects writer + early queue + purge coordinator together. The
// queue is not scheduled here; activation requires the migration/runtime gate.
function indexedOperation(operation, request) {
  const runtime = createFeedRuntime(getFirestore(), { getUser: uid => getAuth().getUser(uid) });
  return operation(request, runtime.database, () => new Date(), { indexWriter: runtime.indexWriter });
}

export { cleanupOperationReceipts } from './receipt_cleanup_schedule.js';

// Local preparation only: the client switch remains disabled.
export const finalizeAccountDeletion = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => finalizeAccountDeletionOperation(request, getFirestore()));

// Prepared locally; deploying this export is a separate rollout step.
export const prepareAccountDeletion = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => indexedOperation(prepareAccountDeletionOperation, request));

export const deleteShout = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, request => indexedOperation(deleteShoutOperation, request));

export const deleteComment = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => deleteCommentOperation(request, getFirestore()));

export const createShout = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => indexedOperation(createShoutOperation, request));

export const createComment = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => createCommentOperation(request, getFirestore()));

export const createPrivateReply = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => createPrivateReplyOperation(request, getFirestore()));

export const toggleShoutReaction = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => indexedOperation(toggleShoutReactionOperation, request));

export const toggleCommentReaction = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => toggleCommentReactionOperation(request, getFirestore()));

export const toggleShoutSave = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => toggleShoutSaveOperation(request, getFirestore()));

export const createContentReport = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => createContentReportOperation(request, getFirestore()));


export const getArchivedCommentReportTarget = onCall({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15,
}, request => getArchivedCommentReportTargetOperation(request, getFirestore()));
