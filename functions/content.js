import { getFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { secureCallableOptions } from './callable_security.js';
import { createShoutOperation } from './create_shout.js';

if (getApps().length === 0) initializeApp();

export const createShout = onCall({
  ...secureCallableOptions,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
}, (request) => createShoutOperation(request, getFirestore()));
