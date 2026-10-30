import { getFirestore } from 'firebase-admin/firestore';
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

if (getApps().length === 0) initializeApp();

export { cleanupOperationReceipts } from './receipt_cleanup_schedule.js';

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
}, (request) => createShoutOperation(request, getFirestore()));

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
}, (request) => toggleShoutReactionOperation(request, getFirestore()));

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
