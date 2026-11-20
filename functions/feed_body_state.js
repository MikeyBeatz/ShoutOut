// B4 read projection, not activated by any live writer or host.
import { bodyProjection, bodyDigest } from './feed_body_contract.js';
import { metadataOf } from './feed_block_index.js';

export function selectionIdentity(row) {
  const metadata = metadataOf(row);
  // Counter changes never move already selected cards. Text identity has its
  // own B3 contract; presentation-only body changes do not reset reading.
  const value = Object.fromEntries(Object.entries(metadata).filter(([key]) =>
    !['likesCount', 'dislikesCount', 'contentHash'].includes(key)));
  return bodyDigest({ schema: 1, selection: value });
}

export function feedBodyState(id, source) {
  const projection = bodyProjection(source);
  const eligibility = metadataOf({ ...source, id }, { contentIdentity: true });
  return { ...projection, state: { ...projection.state, projectionSchema: 2,
    eligibility, selectionVersion: selectionIdentity(eligibility) } };
}

export function validateBodyReadState(id, state) {
  if (state?.schema !== 1 || state.projectionSchema !== 2 || state.eligibility?.id !== id ||
      !/^[a-f0-9]{64}$/.test(state.bodyVersion ?? '') ||
      state.authorId !== state.eligibility.authorId || state.status !== state.eligibility.status ||
      state.expiresAt !== state.eligibility.expiresAt ||
      state.likesCount !== state.eligibility.likesCount || state.dislikesCount !== state.eligibility.dislikesCount ||
      ![state.commentsCount, state.savesCount].every(value => Number.isSafeInteger(value) && value >= 0) ||
      selectionIdentity(state.eligibility) !== state.selectionVersion) throw new Error('invalid-body-read-state');
  metadataOf(state.eligibility, { contentIdentity: true });
  return state;
}

export function publicBodyReadState(state) {
  // Eligibility contains exact server-only location and query metadata. The
  // client receives the existing public state contract, never the internal row.
  return Object.fromEntries(['schema', 'bodyVersion', 'authorId', 'status', 'expiresAt',
    'likesCount', 'dislikesCount', 'commentsCount', 'savesCount'].map(key => [key, state[key]]));
}
