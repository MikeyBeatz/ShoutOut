import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelCapacity, requiredInstances } from './capacity_model.mjs';

test('approved population has stable synthetic identities and quiet traffic is zero', () => {
  const peak = modelCapacity(), quiet = modelCapacity({ activeUsers: 0 });
  assert.equal(peak.identities.count, 100000);
  assert.equal(peak.identities.sha256, quiet.identities.sha256);
  assert.equal(peak.identities.authAccountsCreated, 0);
  for (const key of ['uploadRequests', 'downloadRequests', 'pendingAtEnd']) assert.equal(quiet.reading[key], 0);
  assert.equal(quiet.feed.pageRequests, 0); assert.equal(quiet.cleanup.newReceiptDocuments, 0);
  assert.equal(peak.discoveryRequestsIfConfigured, null);
  assert(peak.unresolved.some(s => s.includes('B4')));
});

test('boundary-only sync conserves every marker, including reading after the final refresh', () => {
  for (const refreshes of [0, 1, 2, 7]) for (const backlog of [0, 31, 32, 33, 1000]) {
    const r = modelCapacity({ manualRefreshesPerUser: refreshes, pendingAtStart: backlog }).reading;
    assert.equal(r.generatedMarkers + r.pendingAtStart, r.uploadedMarkers + r.pendingAtEnd);
    assert.equal(r.pendingAtEnd, 5000 * (60 - Math.floor(60 * refreshes / (refreshes + 1))));
    if (!refreshes && !backlog) assert.equal(r.uploadRequests, 0);
  }
  const r = modelCapacity().reading;
  assert.equal(r.uploadRequests, 5000); assert.equal(r.downloadRequests, 10000);
  assert.equal(r.pendingAtEnd, 150000);
  assert.equal(r.previousTenSecondUploadIllustration, 300000);
});

test('burst shape changes capacity, not action counts; daily cleanup cannot drain mature peak receipts in one run', () => {
  const base = modelCapacity(), burst = modelCapacity({ initialArrivalSeconds: 1, refreshArrivalSeconds: 1 });
  assert.equal(base.reading.uploadRequests, burst.reading.uploadRequests);
  assert.equal(burst.reading.maximumBoundaryAverageRequestsPerSecond, base.reading.maximumBoundaryAverageRequestsPerSecond * 60);
  assert.equal(base.cleanup.newReceiptDocuments, 15600);
  assert.equal(base.cleanup.runsToScanThisWindowOnceMature, 32);
  assert.equal(base.feed.fullCardDocumentReadsLowerBound, 1250000);
});

test('sizing is explicitly hypothetical and invalid or silently ignored profile choices fail', () => {
  assert.equal(requiredInstances(100, 1000, 1), 167);
  assert.equal(requiredInstances(100, 1000, 10), 17);
  for (const p of [{ activeUsers: 100001 }, { uploadBatch: 33 }, { downloadPageNodes: 0 },
    { manualRefreshesPerUser: 0.5 }, { windowSeconds: 0 }, { mystery: 1 }]) assert.throws(() => modelCapacity(p));
  assert.throws(() => requiredInstances(10, 100, 0));
});
