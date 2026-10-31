// A1 only: local Cartesian kilometres, immutable in-memory sessions.
// This is not a Firestore adapter or a production geographic index.
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

export const modes = ['nearest', 'popular', 'endingSoon', 'followed'];
const distance = (row, context) => Math.hypot(row.x - context.x, row.y - context.y);
const tie = (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id, 'en');

export function available(row, c) {
  return row.createdAt <= c.boundary && row.expiresAt > c.boundary &&
    !row.deleted && !c.blocked.has(row.author) &&
    (c.category === null || row.categories.includes(c.category)) &&
    (!row.spotlight || row.highlighted) && distance(row, c) <= c.radius;
}

export function compareRows(c) {
  return (a, b) => {
    // Existing low-rating partition is preserved for A. Its precedence over
    // personal read groups remains a product gate before B3.
    const low = Number(a.lowRated) - Number(b.lowRated);
    if (low) return low;
    switch (c.mode) {
      case 'nearest': {
        const read = c.unreadFirst ? Number(c.read.has(a.id)) - Number(c.read.has(b.id)) : 0;
        return read || distance(a, c) - distance(b, c) || tie(a, b);
      }
      case 'popular': return b.likes - a.likes || tie(a, b);
      case 'endingSoon': return a.expiresAt - b.expiresAt || tie(a, b);
      case 'followed': return Number(c.followed.has(b.author)) - Number(c.followed.has(a.author)) ||
        distance(a, c) - distance(b, c) || tie(a, b);
      default: throw new Error('Unknown mode');
    }
  };
}

export function context(overrides = {}) {
  const c = { project: 'synthetic', uid: 'fixture', x: 0, y: 0, radius: 5,
    boundary: 100, category: null, mode: 'nearest', unreadFirst: false,
    read: new Set(), blocked: new Set(), followed: new Set(), ...overrides };
  if (!modes.includes(c.mode) || ![c.x, c.y, c.radius, c.boundary].every(Number.isFinite) || c.radius <= 0) {
    throw new Error('Invalid context');
  }
  return Object.freeze({ ...c, read: new Set(c.read), blocked: new Set(c.blocked), followed: new Set(c.followed) });
}

export function reference(rows, c) {
  return rows.filter(row => available(row, c)).sort(compareRows(c));
}

export function cellIndex(rows, cellKm = 1) {
  if (!Number.isFinite(cellKm) || cellKm <= 0) throw new Error('Invalid cell size');
  const cells = new Map();
  for (const row of rows) {
    const x = Math.floor(row.x / cellKm), y = Math.floor(row.y / cellKm);
    const key = `${x}:${y}`;
    if (!cells.has(key)) cells.set(key, { x, y, rows: [] });
    cells.get(key).rows.push(structuredClone(row));
  }
  return { cells: [...cells.values()], cellKm };
}

function lowerBound(cell, index, c) {
  const dx = Math.max(cell.x * index.cellKm - c.x, 0, c.x - (cell.x + 1) * index.cellKm);
  const dy = Math.max(cell.y * index.cellKm - c.y, 0, c.y - (cell.y + 1) * index.cellKm);
  return Math.hypot(dx, dy);
}

// Bounded work per advance; exhaustion is 'preparing', never a false end.
// All intersecting cells must be examined before exposing global sort results.
// A nearest-only early stop cannot safely serve Top, Followed or unread-first.
export function prepare(index, suppliedContext) {
  const c = context(suppliedContext);
  const cells = index.cells.map(cell => ({ cell, bound: lowerBound(cell, index, c) }))
    .filter(item => item.bound <= c.radius).sort((a, b) => a.bound - b.bound);
  const matches = [];
  let offset = 0, candidates = 0, result = null;
  return {
    advance(cellBudget) {
      if (!Number.isInteger(cellBudget) || cellBudget < 1) throw new Error('Invalid budget');
      const end = Math.min(offset + cellBudget, cells.length);
      while (offset < end) {
        const { cell } = cells[offset++];
        candidates += cell.rows.length;
        matches.push(...cell.rows.filter(row => available(row, c)));
      }
      if (offset === cells.length && result === null) {
        result = matches.sort(compareRows(c)).map(row => structuredClone(row));
      }
      return { state: result === null ? 'preparing' : 'ready', candidates,
        queries: offset, totalQueries: cells.length, rows: result === null ? null : structuredClone(result) };
    },
  };
}

// Opaque object identity models a server-owned cursor. No client offsets are
// accepted. This is deliberately not a deployable cursor/signature format.
export function session(rows, suppliedContext) {
  const c = context(suppliedContext);
  const snapshot = structuredClone(rows);
  const cursors = new WeakMap();
  const issue = offset => { const token = Object.freeze({}); cursors.set(token, offset); return token; };
  const first = issue(0);
  return {
    first,
    page(cursor, size = 50, actor = c.uid, project = c.project) {
      if (actor !== c.uid || project !== c.project || !cursors.has(cursor)) throw new Error('Invalid cursor');
      if (!Number.isInteger(size) || size < 1 || size > 50) throw new Error('Invalid page size');
      const offset = cursors.get(cursor), end = Math.min(offset + size, snapshot.length);
      return { rows: structuredClone(snapshot.slice(offset, end)),
        next: end < snapshot.length ? issue(end) : null,
        state: end < snapshot.length ? 'continuation' : 'end' };
    },
  };
}

export function fixtures(count, density = 'sparse', seed = 17) {
  let value = seed;
  const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 2 ** 32; };
  const span = density === 'dense' ? 4 : 100;
  return Array.from({ length: count }, (_, i) => ({ id: `shout-${String(i).padStart(6, '0')}`,
    x: (random() - .5) * span, y: (random() - .5) * span, author: `author-${i % 13}`,
    createdAt: i % 101, expiresAt: 101 + i % 50, categories: [i % 2 ? 'help' : 'event'],
    likes: i % 19, lowRated: i % 23 === 0, deleted: i % 41 === 0,
    spotlight: i % 31 === 0, highlighted: i % 62 === 0 }));
}

export function benchmark() {
  const results = [];
  for (const count of [100, 1000, 10000]) for (const density of ['sparse', 'dense']) {
    const rows = fixtures(count, density), start = performance.now(), index = cellIndex(rows);
    const indexMs = performance.now() - start;
    for (const mode of modes) {
      const c = context({ mode, read: new Set(rows.filter((_, i) => i % 3 === 0).map(row => row.id)), unreadFirst: true });
      const begin = performance.now(), job = prepare(index, c);
      let state, advances = 0;
      do { state = job.advance(8); advances++; } while (state.state === 'preparing');
      const elapsed = performance.now() - begin;
      const expected = reference(rows, c).map(row => row.id);
      if (JSON.stringify(expected) !== JSON.stringify(state.rows.map(row => row.id))) throw new Error('Oracle mismatch');
      results.push({ count, density, mode, completeSnapshotCandidates: count,
        cellCandidates: state.candidates, occupiedCellQueries: state.queries, advances,
        returned: state.rows.length, pages: Math.ceil(state.rows.length / 50),
        snapshotBytes: Buffer.byteLength(JSON.stringify(state.rows)),
        indexMs: +indexMs.toFixed(3), preparationMs: +elapsed.toFixed(3) });
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({ disclaimer: 'Local Cartesian simulation, not Firestore billing or cloud latency', results: benchmark() }, null, 2));
}
