// Prepared handler/adapters only. No new callable or secret is deployed here.
import { archiveIdentityConfiguration, createArchiveIdentityRuntime, observeArchiveIdentity, requireIdentityRuntime } from './archive_identity.js';
import { getArchiveIdentityPageOperation } from './archive_identity_reader.js';
import { requireCallableIdentity } from './callable_security.js';
import { Buffer } from 'node:buffer';
import { HttpsError } from 'firebase-functions/v2/https';
import { contentLifecycleConfiguration } from './content_lifecycle.js';
import { currentLegalPolicy, assertCaptureDisclosure } from './legal_policy.js';

export function preparedArchiveIdentityRuntime(db, options = {}) {
  const enabled = options.enabled ?? archiveIdentityConfiguration.enabled;
  if (!enabled) return createArchiveIdentityRuntime(db, { enabled: false });
  const encoded = options.encodedKey ?? process.env.SHOUTOUT_ARCHIVE_IDENTITY_KEY;
  if (typeof encoded !== 'string' || !/^[a-f0-9]{64}$/.test(encoded)) throw new Error('archive-identity-key-required');
  if (!(options.captureEnabled ?? (contentLifecycleConfiguration.enabled || contentLifecycleConfiguration.captureEnabled))) throw new Error('archive-identity-capture-required');
  assertCaptureDisclosure(options.disclosurePolicy ?? currentLegalPolicy(), true);
  return createArchiveIdentityRuntime(db, { ...options, enabled, key: Buffer.from(encoded, 'hex') });
}
export function createArchiveIdentityHandlers(runtime, auth) {
  return Object.freeze({
    sync: async request => {
      requireIdentityRuntime(runtime);
      const { uid } = requireCallableIdentity(request), data = request.data;
      if (!data || data.expectedUserId !== uid || Object.keys(data).some(k => k !== 'expectedUserId')) throw new HttpsError('invalid-argument', 'Invalid identity observation request.');
      return observeArchiveIdentity(request, runtime, auth);
    },
    page: request => getArchiveIdentityPageOperation(request, runtime),
  });
}
