import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deletePrivateReply } from './content.js';
import { secureCallableOptions } from './callable_security.js';

test('private deletion is a callable with the approved DEV resource envelope and shared App Check policy', () => {
  const endpoint = deletePrivateReply.__endpoint;
  assert.equal(endpoint.platform, 'gcfv2');
  assert.deepEqual(endpoint.region, ['europe-west3']);
  assert.equal(endpoint.minInstances, 0);
  assert.equal(endpoint.maxInstances, 1);
  assert.equal(endpoint.concurrency, 1);
  assert.equal(endpoint.availableMemoryMb, 256);
  assert.equal(endpoint.timeoutSeconds, 15);
  assert.deepEqual(endpoint.callableTrigger, {});
  assert.equal(secureCallableOptions.enforceAppCheck, true);
});
