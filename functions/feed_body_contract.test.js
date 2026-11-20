import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { bodyProjection, bodyDigest, bodySelectionCodec, bodyPageCore, validateDescriptors } from './feed_body_contract.js';
import { readContentHash } from './read_content_identity.js';

const source = extra => ({ authorId: 'author', authorNickname: 'Writer', title: 'Title', text: 'Text',
  categories: ['Help', 'Tip'], createdAt: Timestamp.fromMillis(1), expiresAt: Timestamp.fromMillis(4000),
  status: 'active', likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0, ...extra });
const scope = { project: 'shoutout-rules-test', uid: 'reader', generation: 'feed-v3', incarnation: 'create-1', context: 'nearest-20km' };
const codec = bodySelectionCodec(Buffer.alloc(32, 7));
function fixture() {
  let data = source(), time = 100;
  const project = () => bodyProjection(data);
  const row = () => ({ id: 'a', bodyVersion: project().version, state: project().state, read: false });
  const selection = { ...scope, startedAt: 10, expiresAt: 2000, rows: [row()] };
  let guards = 0, sourceReads = 0, hook = () => {};
  const core = bodyPageCore({ codec, clock: () => time, guard: async () => { guards++; hook(); },
    store: { async states() { return new Map([['a', project().state]]); },
      async bodies(ids) { sourceReads += ids.length; return new Map([['a', data]]); } } });
  return { core, selection, row, setData: extra => { data = source(extra); }, setTime: value => { time = value; },
    setGuard: value => { hook = value; }, counts: () => ({ guards, sourceReads }) };
}
test('full body identity preserves display order, presentation, geography and promo; counters do not clear reading', () => {
  const original = bodyProjection(source());
  for (const extra of [{ categories: ['Tip', 'Help'] }, { authorNickname: 'New' }, { avatarId: 'avatar2' },
    { geography: { localityName: 'Town' } }, { businessPromotion: 'spotlight' }, { businessAuthorFormat: 'branch' },
    { expiresAt: Timestamp.fromMillis(5000) }, { title: 'Changed' }]) {
    assert.notEqual(bodyProjection(source(extra)).version, original.version);
  }
  for (const extra of [{ likesCount: 1 }, { commentsCount: 5 }, { savesCount: 1 }, { status: 'deleted' },
    { geography: { resolvedAt: Timestamp.fromMillis(2), resolutionStatus: 'zeroResults' } }]) {
    const before = source(), after = source(extra);
    const expectedChange = Object.hasOwn(extra, 'geography'); // Empty public geography is a visible schema change.
    assert.equal(bodyProjection(after).version === original.version, !expectedChange);
    assert.equal(readContentHash(before.title, before.text), readContentHash(after.title, after.text));
  }
  assert.throws(() => bodyProjection(source({ likesCount: -1 })), /counter/);
  assert.equal(bodyDigest({ a: 1, b: ['x', 1.5] }), bodyDigest({ b: ['x', 1.5], a: 1 }));
});
test('JS/Dart shared hash vectors, including unicode, fractional timestamps and numbers', () => {
  const vectors = JSON.parse(readFileSync(new URL('../test/fixtures/feed_body_vectors.json', import.meta.url)));
  for (const { body, version } of vectors) assert.equal(bodyDigest({ schema: 1, body }), version);
});
test('shared server wire fixture keeps the exact signed selection across cold/manifest/completion', () => {
  const { cold, manifest, completed } = JSON.parse(readFileSync(new URL('../test/fixtures/feed_body_page.json', import.meta.url)));
  const decoded = bodySelectionCodec(Buffer.alloc(32, 5)).decode(cold.token, cold, 100);
  assert.equal(decoded.expiresAt, cold.expiresAt);
  assert.equal(manifest.token, cold.token); assert.equal(completed.token, cold.token);
  assert.deepEqual(cold, completed); assert.deepEqual(manifest.bodies, []);
  for (const payload of cold.bodies) assert.equal(bodyDigest({ schema: 1, body: payload.body }), payload.bodyVersion);
});
test('bounded signed proof binds every scope field, content, order and original deadline', () => {
  const f = fixture(), token = codec.encode(f.selection);
  assert.deepEqual(codec.decode(token, scope, 100).rows, f.selection.rows.map(({ id, bodyVersion, read }) => ({ id, bodyVersion, read })));
  for (const field of Object.keys(scope)) assert.throws(() => codec.decode(token, { ...scope, [field]: 'other' }, 100), /scope/);
  assert.throws(() => codec.decode(token, scope, 2000), /expired/);
  assert.throws(() => codec.decode(`${token.slice(0, -4)}xxxx`, scope, 100), /proof/);
  assert.throws(() => validateDescriptors(Array(51).fill(f.row())), /selection/);
  assert.throws(() => validateDescriptors([f.row(), f.row()]), /selection/);
  assert.throws(() => validateDescriptors([{ ...f.row(), read: true }, { ...f.row(), id: 'b' }]), /order/);
});
test('warm selection reads no bodies, missing hydration only, cold uses one request and retries are read-only', async () => {
  const f = fixture();
  const selected = await f.core.select(f.selection);
  assert.equal(f.counts().sourceReads, 0);
  assert.equal((await f.core.complete(selected.token, scope, ['a'])).bodies.length, 1);
  assert.equal(f.counts().sourceReads, 1);
  assert.equal((await f.core.complete(selected.token, scope, [])).bodies.length, 0);
  const cold = await f.core.select(f.selection, { cold: true });
  assert.equal(cold.bodies.length, 1); assert.equal(f.counts().sourceReads, 2);
  await assert.rejects(f.core.complete(selected.token, scope, ['foreign']), /missing/);
});
test('counter changes are refreshed; changed body, deletion, expiry and revoked policies fail closed', async () => {
  for (const extra of [{ title: 'edited' }, { geography: { localityName: 'Town' } }, { status: 'deleted' }, { expiresAt: Timestamp.fromMillis(90) }]) {
    const f = fixture(), page = await f.core.select(f.selection); f.setData(extra);
    await assert.rejects(f.core.complete(page.token, scope, []), /stale/);
  }
  const f = fixture(), page = await f.core.select(f.selection); f.setData({ likesCount: 8 });
  assert.equal((await f.core.complete(page.token, scope, [])).rows[0].state.likesCount, 8);
  f.setGuard(() => { throw new Error('revoked-auth-block-generation-r5'); });
  await assert.rejects(f.core.complete(page.token, scope, []), /revoked/);
  f.setGuard(() => {}); f.setTime(2000);
  await assert.rejects(f.core.complete(page.token, scope, []), /expired/);
});
test('second availability check catches source deletion or policy loss during body hydration', async () => {
  const f = fixture(); let reads = 0;
  const projection = bodyProjection(source());
  const core = bodyPageCore({ codec, clock: () => 100, guard: async () => {}, store: {
    async states() { return ++reads === 1 ? new Map([['a', projection.state]]) : new Map(); },
    async bodies() { return new Map([['a', source()]]); },
  } });
  await assert.rejects(core.select(f.selection, { cold: true }), /stale/);
});
test('read grouping applies only to unread-first; other modes preserve selected order and promo body', async () => {
  const projection = bodyProjection(source({ businessPromotion: 'spotlight' }));
  const rows = [true, false].map((read, i) => ({ id: `row-${i}`, read, bodyVersion: projection.version, state: projection.state }));
  validateDescriptors(rows, { unreadFirst: false });
  const token = codec.encode({ ...scope, startedAt: 1, expiresAt: 2000, rows, unreadFirst: false });
  assert.deepEqual(codec.decode(token, scope, 100).rows.map(row => row.read), [true, false]);
  assert.throws(() => codec.encode({ ...scope, startedAt: 1, expiresAt: 2000, rows, unreadFirst: true }), /order/);
  const core = bodyPageCore({ codec, clock: () => 100, guard: async () => {}, store: {
    async states(ids) { return new Map(ids.map(id => [id, projection.state])); },
    async bodies(ids) { return new Map(ids.map(id => [id, source({ businessPromotion: 'spotlight' })])); },
  } });
  const result = await core.complete(token, scope, rows.map(row => row.id));
  assert.deepEqual(result.rows.map(row => row.read), [true, false]);
  assert.equal(result.bodies[0].body.businessPromotion, 'spotlight');
});
