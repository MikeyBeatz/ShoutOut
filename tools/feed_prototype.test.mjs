import assert from 'node:assert/strict';
import test from 'node:test';
import { modes, context, reference, cellIndex, prepare, session, fixtures, benchmark } from './feed_prototype.mjs';

const ids = rows => rows.map(row => row.id);
function finish(rows, c, budget = 1) {
  const job = prepare(cellIndex(rows), c);
  let state;
  do { state = job.advance(budget); } while (state.state === 'preparing');
  return state;
}

test('all modes and pages match complete oracle across seeded filters and read snapshots', () => {
  for (const density of ['sparse', 'dense']) for (const seed of [1, 17, 93]) for (const mode of modes) {
    const rows = fixtures(1000, density, seed);
    const c = context({ mode, x: -.001, y: .999, category: 'help', blocked: new Set(['author-2']),
      followed: new Set(['author-3']), unreadFirst: true, read: new Set(rows.filter((_, i) => i % 2).map(row => row.id)) });
    const result = finish(rows, c);
    const pager = session(result.rows, c), actual = [];
    let cursor = pager.first;
    do { const page = pager.page(cursor, 7); actual.push(...page.rows); cursor = page.next; } while (cursor);
    assert.deepEqual(ids(actual), ids(reference(rows, c)));
    assert.equal(new Set(ids(actual)).size, actual.length);
  }
});

test('work budget exhaustion is preparing and empty cells are not a false end', () => {
  const rows = fixtures(1000, 'dense');
  const job = prepare(cellIndex(rows), context({ category: 'absent' }));
  assert.equal(job.advance(1).state, 'preparing');
  let state;
  do { state = job.advance(1); } while (state.state === 'preparing');
  assert.deepEqual(state.rows, []);
  assert.throws(() => job.advance(0));
});

test('older local Shout survives more than 50 newer distant Shouts', () => {
  const rows = fixtures(101, 'dense').map((r, i) => ({ ...r, id: `${i}`, createdAt: i,
    x: i ? 99 : 0, y: 0, deleted: false, spotlight: false, lowRated: false }));
  const c = context();
  assert.deepEqual(ids(finish(rows, c).rows), ['0']);
  assert.deepEqual(reference([...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50), c), []);
});

test('far unread must precede nearby read; other modes ignore read state', () => {
  const rows = fixtures(3).map((r, i) => ({ ...r, x: i, y: 0, createdAt: 1,
    deleted: false, spotlight: false, lowRated: false }));
  const read = new Set([rows[0].id, rows[1].id]);
  assert.equal(finish(rows, context({ read, unreadFirst: true })).rows[0].id, rows[2].id);
  for (const mode of modes.slice(1)) {
    assert.deepEqual(ids(finish(rows, context({ mode, read, unreadFirst: true })).rows),
      ids(finish(rows, context({ mode })).rows));
  }
});

test('boundary points, ties and low-rating/Spotlight A policy are deterministic', () => {
  const rows = fixtures(5).map((r, i) => ({ ...r, id: `id-${i}`, x: i === 4 ? 5.001 : 5,
    y: 0, createdAt: 1, deleted: false, spotlight: i === 3, highlighted: false, lowRated: i === 0 }));
  assert.deepEqual(ids(finish(rows, context()).rows), ['id-1', 'id-2', 'id-0']);
  assert.deepEqual(ids(finish([...rows].reverse(), context()).rows), ['id-1', 'id-2', 'id-0']);
});

test('session freezes membership/order; source changes and retries cannot reorder pages', () => {
  const rows = fixtures(100, 'dense'), c = context(), result = finish(rows, c).rows;
  const pager = session(result, c), expected = ids(result);
  const first = pager.page(pager.first, 3);
  result.reverse(); result[0].likes = 999; c.read.add(result[0].id);
  assert.deepEqual(ids(pager.page(pager.first, 3).rows), ids(first.rows));
  const actual = [...first.rows]; let cursor = first.next;
  while (cursor) { const page = pager.page(cursor, 3); actual.push(...page.rows); cursor = page.next; }
  assert.deepEqual(ids(actual), expected);
  first.rows[0].id = 'tampered';
  assert.equal(pager.page(pager.first, 3).rows[0].id, expected[0]);
  assert.throws(() => pager.page({}, 3));
  assert.throws(() => pager.page(pager.first, 3, 'other-user'));
  assert.throws(() => pager.page(pager.first, 3, c.uid, 'production'));
  assert.throws(() => pager.page(pager.first, 51));
  assert.throws(() => session([], c).page(pager.first));
});

test('all 24 benchmark cases match oracle and dense data demonstrates worst-case scan', () => {
  const results = benchmark();
  assert.equal(results.length, 24);
  assert(results.filter(r => r.density === 'dense').every(r => r.cellCandidates === r.count));
});

test('invalid context and cell sizes fail explicitly', () => {
  assert.throws(() => context({ mode: 'unknown' }));
  assert.throws(() => context({ x: NaN }));
  assert.throws(() => context({ radius: 0 }));
  assert.throws(() => cellIndex([], 0));
  const empty = session([], context());
  assert.deepEqual(empty.page(empty.first), { rows: [], next: null, state: 'end' });
});

test('explicit ranking examples cover all four existing primary keys', () => {
  const rows = fixtures(3).map((r, i) => ({ ...r, id: `id-${i}`, x: i + 1, y: 0,
    author: `author-${i}`, createdAt: 1, expiresAt: 103 - i, likes: i,
    deleted: false, spotlight: false, lowRated: false }));
  const expected = { nearest: ['id-0', 'id-1', 'id-2'], popular: ['id-2', 'id-1', 'id-0'],
    endingSoon: ['id-2', 'id-1', 'id-0'], followed: ['id-2', 'id-0', 'id-1'] };
  for (const mode of modes) assert.deepEqual(ids(finish(rows,
    context({ mode, followed: new Set(['author-2']) })).rows), expected[mode]);
});

test('availability boundaries, filters and frozen source exclude later publications', () => {
  const base = { ...fixtures(1)[0], x: 0, y: 0, createdAt: 100, expiresAt: 101,
    deleted: false, spotlight: false, lowRated: false, categories: ['help'], author: 'allowed' };
  const rows = [base, { ...base, id: 'future', createdAt: 101 },
    { ...base, id: 'expired', expiresAt: 100 }, { ...base, id: 'deleted', deleted: true },
    { ...base, id: 'blocked', author: 'blocked' }, { ...base, id: 'category', categories: ['event'] }];
  const index = cellIndex(rows), job = prepare(index, context({ category: 'help', blocked: new Set(['blocked']) }));
  rows[0].deleted = true; rows.push({ ...base, id: 'later-same-timestamp' });
  assert.deepEqual(ids(job.advance(100).rows), [base.id]);
});
