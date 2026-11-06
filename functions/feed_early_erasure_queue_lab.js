import { createLabBlockIndex } from './feed_block_index_lab.js';
import { labIndexBinding } from './feed_index_paths.js';
import { createEarlyErasureQueueStore } from './feed_early_erasure_queue.js';
export { EarlyErasureIdentityChanged, EarlyErasureLeaseLost, EarlyErasureNeedsReview } from './feed_early_erasure_queue.js';
export function createEarlyErasureQueueLab(db, auth, { namespace, ...options } = {}) {
  if (db?.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('early-erasure-emulator-only');
  }
  if (typeof namespace !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(namespace)) throw new Error('invalid-early-erasure-options');
  return createEarlyErasureQueueStore(db, auth, { ...options, binding: {
    base: db.doc(`feedErasureQueueLab/${namespace}`),
    indexFor: id => labIndexBinding(db, id).base,
    createIndex: (database, id) => createLabBlockIndex(database, { namespace: id, accountRetention: true }),
  } });
}
