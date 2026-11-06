import { createLabBlockIndex } from './feed_block_index_lab.js';
import { runAccountIndexErasureSliceStore } from './feed_account_retention_runner.js';
export { AccountIndexSliceError } from './feed_account_retention_runner.js';
export async function runAccountIndexErasureSlice(identity, db, { namespace, ...options } = {}) {
  if (db?.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('index-runner-emulator-only');
  }
  return runAccountIndexErasureSliceStore(identity, db, { ...options,
    createIndex: measured => createLabBlockIndex(measured, { namespace, accountRetention: true }) });
}
