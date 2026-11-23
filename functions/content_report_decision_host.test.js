import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideContentReports, removeReportedPublicContent } from './content.js';
import { secureCallableOptions } from './callable_security.js';

for (const [name, callable] of [['basic decisions', decideContentReports], ['public removal', removeReportedPublicContent]]) test(`${name} expose the approved callable envelope with shared App Check enforcement`, () => {
  const host = callable.__endpoint;
  assert.equal(host.platform, 'gcfv2'); assert.deepEqual(host.region, ['europe-west3']);
  assert.equal(host.minInstances, 0); assert.equal(host.maxInstances, 1); assert.equal(host.concurrency, 1);
  assert.equal(host.availableMemoryMb, 256); assert.equal(host.timeoutSeconds, 15);
  assert.deepEqual(host.callableTrigger, {}); assert.equal(secureCallableOptions.enforceAppCheck, true);
});
