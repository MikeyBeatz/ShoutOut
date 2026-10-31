// Experimental feed building block. Correct ordering is tested; universal read
// savings are NOT established. No callable, writes or live index changes.
import { geohashQueryBounds } from 'geofire-common';
const alphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
const radians = (value) => value * Math.PI / 180;
const earthKm = 6371;
const copy = (value) => JSON.parse(JSON.stringify(value));

export function distanceKm(a, b) {
  const lat = radians(b.latitude - a.latitude);
  const lon = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) *
    Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function geohashBounds(prefix) {
  const longitude = [-180, 180], latitude = [-90, 90];
  let axis = 0;
  for (const character of prefix) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error('invalid-geohash');
    for (let bit = 4; bit >= 0; bit--) {
      const range = axis++ % 2 === 0 ? longitude : latitude;
      range[(value >> bit) & 1 ? 0 : 1] = (range[0] + range[1]) / 2;
    }
  }
  return { latitude, longitude };
}

export class FeedMinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  peek() { return this.items[0]; }
  push(value) {
    const array = this.items;
    let index = array.length;
    array.push(value);
    while (index) {
      const parent = (index - 1) >> 1;
      if (this.compare(array[parent], value) <= 0) break;
      array[index] = array[parent]; index = parent;
    }
    array[index] = value;
  }
  pop() {
    const array = this.items, result = array[0], last = array.pop();
    if (!array.length) return result;
    let index = 0;
    while (index * 2 + 1 < array.length) {
      let child = index * 2 + 1;
      if (child + 1 < array.length && this.compare(array[child + 1], array[child]) < 0) child++;
      if (this.compare(last, array[child]) <= 0) break;
      array[index] = array[child]; index = child;
    }
    array[index] = last;
    return result;
  }
}

const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const rank = (a, b) => a.distanceKm - b.distanceKm || b.createdAt - a.createdAt || ordinal(a.id, b.id);
const pointValid = (p) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
  Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

function codeNumber(code) {
  let result = 0;
  for (const character of code.slice(0, 7)) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error('invalid-geohash');
    result = result * 32 + value;
  }
  return result * 32 ** Math.max(0, 7 - code.length);
}
function numberCode(value) {
  let result = '';
  for (let i = 0; i < 7; i++) { result = alphabet[value % 32] + result; value = Math.floor(value / 32); }
  return result;
}
function upperNumber(code) {
  if (code.endsWith('~')) {
    const base = code.slice(0, -1);
    return codeNumber(base) + 32 ** Math.max(0, 7 - base.length);
  }
  return codeNumber(code) + (code.length >= 7 ? 1 : 0);
}
function merge(ranges) {
  const result = [];
  for (const range of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (result.length && range[0] <= result.at(-1)[1]) result.at(-1)[1] = Math.max(result.at(-1)[1], range[1]);
    else result.push([...range]);
  }
  return result;
}
function subtract(ranges, covered) {
  const result = [];
  for (const [start, end] of ranges) {
    let cursor = start;
    for (const [low, high] of covered) {
      if (high <= cursor || low >= end) continue;
      if (low > cursor) result.push([cursor, low]);
      cursor = Math.max(cursor, high);
      if (cursor >= end) break;
    }
    if (cursor < end) result.push([cursor, end]);
  }
  return result;
}

/**
 * readRange({start, end, after, limit, snapshot}) reads one pinned database view,
 * returning {rows, exhausted, next} for an inclusive seven-character hash range.
 * Every row is normalized plain data, with id/geohash/location/createdAt.
 * Budget is explicit per invocation, not a product capacity or financial cap.
 */
export function spatialSession({ readRange, snapshot, uid, project, point, radiusKm,
  eligible = () => true, readIds = [], unreadFirst = false, pageSize = 50,
  initialRadiusKm = .25, queryBatch = 51 }) {
  if (typeof readRange !== 'function' || !snapshot || !uid || !project || !pointValid(point) ||
      !Number.isFinite(radiusKm) || radiusKm <= 0 || !Number.isInteger(pageSize) ||
      pageSize < 1 || pageSize > 50 || !Number.isFinite(initialRadiusKm) || initialRadiusKm <= 0 ||
      !Number.isInteger(queryBatch) || queryBatch < 1) throw new Error('invalid-context');
  point = { ...point };
  const reads = new Set(readIds), seen = new Set();
  const frontier = [];
  let covered = [], certifiedRadius = -1, targetRadius = 0;
  const groups = [new FeedMinHeap(rank), new FeedMinHeap(rank)];
  const metrics = { queries: 0, emptyQueries: 0, candidates: 0, emitted: 0 };
  const pages = new WeakMap();
  const issue = () => { const key = Object.freeze({}); pages.set(key, { pending: [], result: null, flight: null }); return key; };
  const first = issue();
  let group = 0, active = first;
  function expand() {
    targetRadius = Math.min(radiusKm, targetRadius ? targetRadius * 2 : initialRadiusKm);
    const bounds = geohashQueryBounds([point.latitude, point.longitude], targetRadius * 1000);
    const ranges = merge(bounds.map(([start, end]) => [codeNumber(start), upperNumber(end)]));
    frontier.push(...subtract(ranges, covered).map(([start, end]) => ({ start, end, after: null })));
  }
  expand();

  function insert(row, range) {
    if (!row || typeof row.id !== 'string' || !pointValid(row.location) ||
      !Number.isFinite(row.createdAt) || typeof row.geohash !== 'string' ||
      row.geohash.length !== 7 || row.geohash < numberCode(range.start) ||
      row.geohash > numberCode(range.end - 1)) throw new Error('invalid-candidate');
    const bounds = geohashBounds(row.geohash);
    if (row.location.latitude < bounds.latitude[0] || row.location.latitude > bounds.latitude[1] ||
      row.location.longitude < bounds.longitude[0] || row.location.longitude > bounds.longitude[1]) throw new Error('invalid-candidate-location');
    if (seen.has(row.id)) return;
    seen.add(row.id);
    const distance = distanceKm(point, row.location);
    if (distance <= radiusKm && eligible(row)) groups[unreadFirst && reads.has(row.id) ? 1 : 0]
      .push({ ...copy(row), distanceKm: distance });
  }

  async function advance(token, budget) {
    const page = pages.get(token);
    if (token !== active && !page.result) throw new Error('invalid-cursor');
    const startQueries = metrics.queries, startCandidates = metrics.candidates;
    while (page.pending.length < pageSize) {
      const candidate = groups[group].peek(), range = frontier[0];
      // All ranges covering the certified circle are complete, including ties.
      if (candidate && (group === 1 || candidate.distanceKm <= certifiedRadius)) {
        page.pending.push(groups[group].pop()); metrics.emitted++; continue;
      }
      if (!range) {
        certifiedRadius = targetRadius;
        if (candidate && candidate.distanceKm <= certifiedRadius) continue;
        if (certifiedRadius < radiusKm) { expand(); continue; }
        if (group === 0) { group = 1; continue; }
        break;
      }
      if (metrics.queries - startQueries >= budget.queries ||
          metrics.candidates - startCandidates >= budget.candidates) {
        return { state: 'preparing', rows: [], next: token, metrics: { ...metrics } };
      }
      const limit = Math.min(queryBatch, budget.candidates - (metrics.candidates - startCandidates));
      metrics.queries++;
      const response = await readRange({ start: numberCode(range.start), end: numberCode(range.end - 1),
        after: range.after, limit, snapshot });
      if (!response || !Array.isArray(response.rows) || response.rows.length > limit ||
          typeof response.exhausted !== 'boolean' ||
          (!response.exhausted && (!response.rows.length || !response.next))) throw new Error('invalid-repository-response');
      metrics.candidates += response.rows.length;
      if (!response.rows.length) metrics.emptyQueries++;
      for (const row of response.rows) insert(row, range);
      if (response.exhausted) {
        frontier.shift(); covered = merge([...covered, [range.start, range.end]]);
      } else range.after = response.next;
    }
    const end = certifiedRadius === radiusKm && !frontier.length && !groups[0].peek() && !groups[1].peek();
    const next = end ? null : issue();
    page.result = { state: end ? 'end' : 'continuation', rows: copy(page.pending), next, metrics: { ...metrics } };
    active = next;
    return { ...page.result, rows: copy(page.result.rows) };
  }

  return {
    first,
    page(token, budget, identity = { uid, project }) {
      if (identity.uid !== uid || identity.project !== project || !pages.has(token)) return Promise.reject(new Error('invalid-cursor'));
      if (!budget || !Number.isInteger(budget.queries) || budget.queries < 1 ||
        !Number.isInteger(budget.candidates) || budget.candidates < 1) return Promise.reject(new Error('invalid-budget'));
      const page = pages.get(token);
      if (page.result) return Promise.resolve({ ...page.result, rows: copy(page.result.rows) });
      if (!page.flight) page.flight = advance(token, budget).finally(() => { page.flight = null; });
      return page.flight;
    },
  };
}
