import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as host from './content.js';
import { secureCallableOptions } from './callable_security.js';
import { createArchiveIdentityHandlers } from './archive_identity_runtime.js';

test('prepared archive callables have Auth/App Check, bounded resources and inactive no-IO handlers', async () => {
  for (const name of ['observeArchiveIdentity', 'getArchiveIdentityPage', 'getLifecycleSourcePage', 'getLifecycleReportEvidence']) {
    const endpoint = host[name].__endpoint;
    assert.deepEqual(endpoint.region, ['europe-west3']);
    assert.equal(endpoint.maxInstances, 1); assert.equal(endpoint.minInstances, 0);
    assert.equal(endpoint.concurrency, 1); assert.equal(endpoint.availableMemoryMb, 256);
    assert.equal(endpoint.timeoutSeconds, 15); assert.equal(secureCallableOptions.enforceAppCheck, true);
  }
  const unexpected = new Proxy({}, { get() { assert.fail('inactive handler accessed IO'); } });
  const active = createArchiveIdentityHandlers({ enabled: true }, unexpected);
  await assert.rejects(active.sync({}), e => e.code === 'unauthenticated');
  await assert.rejects(active.sync({ auth: { uid: 'actor', token: { email: 'a@example.cz', email_verified: true } } }), e => e.code === 'unauthenticated');
  const handlers = createArchiveIdentityHandlers({ enabled: false }, unexpected);
  await assert.rejects(handlers.sync({}), /disabled/); await assert.rejects(handlers.page({}), /disabled/);
});
test('all wrappers that construct the identity runtime mount its secret on activation', () => {
  const code = readFileSync(new URL('./content.js', import.meta.url), 'utf8').replaceAll('\r', '');
  for (const name of ['getLifecycleReportEvidence', 'finalizeAccountDeletion', 'prepareAccountDeletion', 'deleteShout', 'deleteComment',
    'removeReportedPrivateReply', 'decideContentReports', 'removeReportedPublicContent', 'sanctionContent', 'deletePrivateReply',
    'createShout', 'createComment', 'createPrivateReply', 'toggleShoutReaction', 'toggleCommentReaction', 'toggleShoutSave', 'createContentReport']) {
    assert(code.includes(`export const ${name} = onCall({\n  ...identitySecretOptions,`), name);
    assert.equal(host[name].__endpoint.secretEnvironmentVariables?.length ?? 0, 0);
  }
});
