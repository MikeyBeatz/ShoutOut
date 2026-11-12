// Separate prepared entry point; deliberately not re-exported from index/content.
// No deployment or background cleanup is enabled by adding this local module.
import { Buffer } from 'node:buffer';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onCall } from 'firebase-functions/v2/https';
import { secureCallableOptions } from './callable_security.js';
import { createReadSyncRuntime } from './read_sync_runtime.js';

if (getApps().length === 0) initializeApp();
const projectKey = defineSecret('SHOUTOUT_FEED_CURSOR_KEY');
export const readSyncCallableOptions = Object.freeze({
  ...secureCallableOptions, minInstances: 0, maxInstances: 1, concurrency: 1,
  memory: '256MiB', timeoutSeconds: 15, secrets: [projectKey],
});
function runtime() {
  const encoded = projectKey.value(), key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('invalid-read-sync-project-key');
  return createReadSyncRuntime(getFirestore(), { key });
}
export const syncReadBatch = onCall(readSyncCallableOptions, request => runtime().upload(request));
export const getReadStatePage = onCall(readSyncCallableOptions, request => runtime().download(request));
