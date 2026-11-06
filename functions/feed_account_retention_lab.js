import { createAccountRetentionStore } from './feed_account_retention_store.js';
import { labIndexBinding } from './feed_index_paths.js';
export { retentionCell } from './feed_account_retention_store.js';
export function createAccountRetentionLab(db, base, removeRows) {
  const binding = labIndexBinding(db, base?.id);
  if (base?.path !== binding.base.path) throw new Error('index-lab-emulator-only');
  return createAccountRetentionStore(db, binding, removeRows);
}
