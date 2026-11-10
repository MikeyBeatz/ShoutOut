import { Timestamp } from 'firebase-admin/firestore';

export const purgedShoutContext = Object.freeze({ schemaVersion: 1, status: 'deleted', contentPurged: true });
export const isPurgedShoutContext = data => data?.schemaVersion === 1 && data.status === 'deleted' && data.contentPurged === true;

// Check inside each writing transaction, before counters, rate limits or notices.
// A materialized status alone cannot authorize a request after its deadline.
export const shoutAcceptsInteractions = (data, now) => data?.status === 'active' && data.contentPurged !== true &&
  data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() > now.toMillis();
