// Trusted host settings only. The client cannot supply flags, budgets or cache.
import { blockCache } from './feed_block_index_store.js';
import { feedRuntimeConfiguration } from './feed_runtime.js';

export const feedPrivateReadCache = blockCache(); // Separate from the public index cache.
export function feedPageHostOptions(configuration = feedRuntimeConfiguration) {
  if (!configuration || typeof configuration.compatibleGenerations !== 'boolean' ||
      typeof configuration.unreadFirst !== 'boolean' || !Number.isSafeInteger(configuration.maxReadBlockReads) ||
      configuration.maxReadBlockReads < 1 || configuration.unreadFirst && !configuration.compatibleGenerations) {
    throw new Error('invalid-feed-serving-configuration');
  }
  return { compatibleGenerations: configuration.compatibleGenerations,
    readOrdering: configuration.unreadFirst ? { maxBlockReads: configuration.maxReadBlockReads, cache: feedPrivateReadCache } : null };
}
