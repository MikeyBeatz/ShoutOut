import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { feedBodyState, selectionIdentity, validateBodyReadState, publicBodyReadState } from './feed_body_state.js';
import { encodeGeohash } from './create_shout.js';

const point = { latitude: 50.08, longitude: 14.44 };
const source = extra => ({ authorId: 'author', authorNickname: 'Writer', title: 'Title', text: 'Text',
  location: point, geohash: encodeGeohash(point.latitude, point.longitude), categories: ['Dotaz'], status: 'active',
  createdAt: Timestamp.fromMillis(10), expiresAt: Timestamp.fromMillis(10000),
  likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0, ...extra });
test('exact movement inside one geohash changes selection identity while cached public body stays reusable only for the original selection', () => {
  const a = feedBodyState('id', source()), b = feedBodyState('id', source({ location: { ...point, latitude: point.latitude + .00000001 } }));
  assert.equal(a.version, b.version); assert.notEqual(a.state.selectionVersion, b.state.selectionVersion);
  assert.equal(validateBodyReadState('id', b.state), b.state);
});
test('counters do not change frozen ordering identity or B3 reading; presentation changes only body identity', () => {
  const a = feedBodyState('id', source()), b = feedBodyState('id', source({ commentsCount: 2, savesCount: 3, likesCount: 4 }));
  assert.equal(a.version, b.version); assert.equal(a.state.selectionVersion, b.state.selectionVersion);
  assert.equal(a.state.eligibility.contentHash, b.state.eligibility.contentHash);
  const presentation = feedBodyState('id', source({ avatarId: 'new' }));
  assert.notEqual(a.version, presentation.version); assert.equal(a.state.selectionVersion, presentation.state.selectionVersion);
  assert.notEqual(a.state.eligibility.contentHash, feedBodyState('id', source({ text: 'changed' })).state.eligibility.contentHash);
});
test('damaged metadata fails closed and internal precise location never enters public state', () => {
  const { state } = feedBodyState('id', source());
  assert.throws(() => validateBodyReadState('id', { ...state, authorId: 'other' }), /invalid/);
  assert.throws(() => validateBodyReadState('id', { ...state, schema: 3 }), /invalid/);
  assert.throws(() => validateBodyReadState('id', { ...state, selectionVersion: 'a'.repeat(64) }), /invalid/);
  assert.throws(() => selectionIdentity({ ...state.eligibility, geohash: '0000000' }), /mismatch/);
  const visible = JSON.stringify(publicBodyReadState(state));
  assert.equal(visible.includes('latitude'), false); assert.equal(visible.includes('eligibility'), false);
  assert.equal(visible.includes('contentHash'), false);
});
