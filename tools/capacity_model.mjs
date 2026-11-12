// Offline arithmetic only. No Firebase imports, credentials, Auth or network.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const defaultProfile = Object.freeze({
  registeredAccounts: 100000, activeUsers: 5000, windowSeconds: 600,
  initialArrivalSeconds: 60, refreshArrivalSeconds: 60,
  manualRefreshesPerUser: 1, initialFeedPages: 4, pageCards: 50,
  newReadMarkersPerUser: 60, pendingAtStart: 0, uploadBatch: 32,
  fullReadNodes: 21, deltaReadNodes: 1, downloadPageNodes: 32,
  reactionsPerUser: 2, savesPerUser: 1, commentsPerUser: 0.1,
  publicationsPerUser: 0.02, receiptCleanupPerRun: 500,
  readDiscoveryChecksPerUser: null,
});

function validate(p) {
  for (const [key, value] of Object.entries(p)) {
    if (key === 'readDiscoveryChecksPerUser' && value === null) continue;
    if (!Number.isFinite(value) || value < 0) throw Error(`invalid-profile:${key}`);
  }
  for (const key of ['registeredAccounts', 'activeUsers', 'windowSeconds', 'initialArrivalSeconds',
    'refreshArrivalSeconds', 'manualRefreshesPerUser', 'initialFeedPages', 'pageCards',
    'newReadMarkersPerUser', 'pendingAtStart', 'uploadBatch', 'fullReadNodes', 'deltaReadNodes',
    'downloadPageNodes', 'receiptCleanupPerRun']) {
    if (!Number.isSafeInteger(p[key])) throw Error(`invalid-integer:${key}`);
  }
  if (p.activeUsers > p.registeredAccounts || p.uploadBatch < 1 || p.uploadBatch > 32 ||
      p.downloadPageNodes < 1 || p.downloadPageNodes > 32 || p.windowSeconds < 1 ||
      p.initialArrivalSeconds < 1 || p.refreshArrivalSeconds < 1 || p.initialFeedPages < 1 ||
      p.pageCards < 1 || p.pageCards > 50 || p.receiptCleanupPerRun < 1) throw Error('invalid-profile-bounds');
}

// Stable synthetic identities; no profile documents or real accounts are created.
export function identityProof(count) {
  const digest = createHash('sha256');
  for (let i = 0; i < count; i++) digest.update(`capacity-account-${String(i).padStart(6, '0')}\n`);
  return { count, sha256: digest.digest('hex'), persistedProfiles: 0, authAccountsCreated: 0 };
}

export function requiredInstances(requestsPerSecond, serviceMillis, concurrency, utilization = 0.6) {
  if (![requestsPerSecond, serviceMillis, concurrency, utilization].every(Number.isFinite) ||
      requestsPerSecond < 0 || serviceMillis <= 0 || concurrency < 1 || !Number.isInteger(concurrency) ||
      utilization <= 0 || utilization > 1) throw Error('invalid-sizing-input');
  return Math.ceil(requestsPerSecond * serviceMillis / 1000 / concurrency / utilization);
}

export function modelCapacity(overrides = {}) {
  for (const key of Object.keys(overrides)) if (!Object.hasOwn(defaultProfile, key)) throw Error(`unknown-profile:${key}`);
  const p = { ...defaultProfile, ...overrides }; validate(p);
  const n = p.activeUsers, refreshes = p.manualRefreshesPerUser;
  let uploaded = p.pendingAtStart, callsPerUser = Math.ceil(p.pendingAtStart / p.uploadBatch), previous = 0;
  let largestRefreshUpload = 0;
  // Reading is uniform; explicit refresh j is at j/(refreshes+1) of the window.
  // Reading after the last refresh remains durable locally, NOT silently uploaded.
  for (let j = 1; j <= refreshes; j++) {
    const read = Math.floor(p.newReadMarkersPerUser * j / (refreshes + 1));
    const batchCalls = Math.ceil((read - previous) / p.uploadBatch);
    uploaded += read - previous; callsPerUser += batchCalls;
    largestRefreshUpload = Math.max(largestRefreshUpload, batchCalls); previous = read;
  }
  const downloadPages = nodes => Math.max(1, Math.ceil(nodes / p.downloadPageNodes));
  const firstDownloadPages = downloadPages(p.fullReadNodes), deltaPages = downloadPages(p.deltaReadNodes);
  const readDownloads = n * (firstDownloadPages + refreshes * deltaPages);
  const receiptActions = p.reactionsPerUser + p.savesPerUser + p.commentsPerUser + p.publicationsPerUser;
  const receipts = Math.round(n * receiptActions);
  const feedPages = n * (p.initialFeedPages + refreshes);
  const initialReadRps = n * (Math.ceil(p.pendingAtStart / p.uploadBatch) + firstDownloadPages) / p.initialArrivalSeconds;
  const refreshReadRps = refreshes ? n * (largestRefreshUpload + deltaPages) / p.refreshArrivalSeconds : 0;
  const uploadRps = Math.max(n * Math.ceil(p.pendingAtStart / p.uploadBatch) / p.initialArrivalSeconds,
    refreshes ? n * largestRefreshUpload / p.refreshArrivalSeconds : 0);
  const downloadRps = Math.max(n * firstDownloadPages / p.initialArrivalSeconds,
    refreshes ? n * deltaPages / p.refreshArrivalSeconds : 0);
  return {
    kind: 'offline-workload-model-not-cloud-benchmark', assumptions: p,
    identities: identityProof(p.registeredAccounts),
    feed: { pageRequests: feedPages, fullCardDocumentReadsLowerBound: feedPages * p.pageCards,
      startupFirstPagesPerSecond: n / p.initialArrivalSeconds,
      refreshFirstPagesPerSecond: refreshes ? n / p.refreshArrivalSeconds : 0 },
    reading: { syncEvents: n * (1 + refreshes), uploadRequests: n * callsPerUser,
      downloadRequests: readDownloads, generatedMarkers: n * p.newReadMarkersPerUser,
      pendingAtStart: n * p.pendingAtStart, uploadedMarkers: n * uploaded,
      pendingAtEnd: n * (p.newReadMarkersPerUser - previous),
      maximumBoundaryAverageRequestsPerSecond: Math.max(initialReadRps, refreshReadRps),
      maximumBoundaryAverageUploadRequestsPerSecond: uploadRps,
      maximumBoundaryAverageDownloadRequestsPerSecond: downloadRps,
      // Current 10-second scheduler is not the chosen target. Comparison assumes
      // all clients have at least one new marker at every tick and no coalescing.
      previousTenSecondUploadIllustration: n * Math.floor(p.windowSeconds / 10),
      proposedDownloadDocumentReads: n * (p.fullReadNodes + refreshes * p.deltaReadNodes) + 20 * readDownloads,
      proposedDownloadRateWrites: readDownloads },
    cleanup: { newReceiptDocuments: receipts, existingDailyScanCapacity: p.receiptCleanupPerRun,
      existingScheduledInvocationsPerDay: { accountWorker: 1440, receiptCleanup: 1 },
      runsToScanThisWindowOnceMature: Math.ceil(receipts / p.receiptCleanupPerRun),
      note: 'Excludes retries, preserved/invalid receipts, GC and read-block cleanup; no new activity in drain calculation.' },
    sizingSensitivity: [250, 1000, 3000].flatMap(serviceMillis => [1, 8, 16].map(concurrency => ({
      serviceMillis, concurrency, utilization: 0.6,
      uploadInstancesArithmetic: requiredInstances(uploadRps, serviceMillis, concurrency),
      downloadInstancesArithmetic: requiredInstances(downloadRps, serviceMillis, concurrency),
    }))),
    unresolved: [
      ...(p.readDiscoveryChecksPerUser === null ? ['B4 discovery cadence, query design and cost are not chosen or included.'] : []),
      'Feed index traversal, eligibility, source revalidation, listeners and dependent services are excluded from feed lower bound.',
      'B2 upload document work must be supplied from measured traces; no zero-cost assumption.',
      'Sizing assumes independent work; CPU/RAM/DB contention, cold starts, retries and quotas require cloud validation.',
      'No latency guarantee, daily-active estimate, currency price or production maximum is inferred.',
    ],
    discoveryRequestsIfConfigured: p.readDiscoveryChecksPerUser === null ? null : n * p.readDiscoveryChecksPerUser,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  if (arg && arg !== '--json') throw Error('Usage: node tools/capacity_model.mjs [--json]');
  console.log(JSON.stringify({ baseline: modelCapacity(), quiet: modelCapacity({ activeUsers: 0 }),
    backlog: modelCapacity({ pendingAtStart: 1000 }),
    synchronizedReturn: modelCapacity({ initialArrivalSeconds: 1, refreshArrivalSeconds: 1 }) }, null, 2));
}
