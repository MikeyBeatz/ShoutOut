// Stateless selection over immutable roots. No database or per-user session map.
import { canonical, clone, metadataOf, verifyNode } from './feed_block_index.js';
import { FeedMinHeap } from './feed_spatial.js';

const compare = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};

export async function portableIndexPage({ roots, position = {}, readNode, eligible, rowKey, nodeKey,
  mayContainRows = () => true, assertSessionAlive }, { nodes = 32 } = {}) {
  if (!Array.isArray(roots) || typeof assertSessionAlive !== 'function' || typeof readNode !== 'function' ||
      typeof eligible !== 'function' || typeof rowKey !== 'function' || typeof nodeKey !== 'function' ||
      !Number.isInteger(nodes) || nodes < 1 || nodes > 128) throw new Error('invalid-portable-selection');
  assertSessionAlive();
  // Copy caller state: a failed/retried request must not partially advance it.
  const state = clone(position), after = state.after ?? null;
  if (after !== null && (!Array.isArray(after) || after.length !== 6 ||
      !after.slice(0, 5).every(Number.isFinite) || typeof after[5] !== 'string')) throw new Error('invalid-portable-position');
  const frontier = new FeedMinHeap((a, b) => compare(a.key, b.key));
  for (const item of state.frontier ?? roots.map(root => ({ ...root, exact: false, summary: null }))) {
    // Derived optimistic keys may contain Infinity; recompute them, never JSON it.
    frontier.push({ ...item, key: nodeKey(item.summary) });
  }
  const pending = (state.pending ?? []).map(metadataOf);
  const candidates = (state.candidates ?? []).map(row => ({ row: metadataOf(row), key: rowKey(row) }));
  if (pending.length >= 50 || candidates.length + pending.length > 50) throw new Error('invalid-portable-position');
  candidates.sort((a, b) => compare(a.key, b.key));
  let dropped = state.dropped === true, processed = 0;
  const metrics = { nodesProcessed: 0, metadataExamined: 0, maxRetainedCandidates: pending.length + candidates.length };
  const checkpoint = () => ({ after, pending, candidates: candidates.map(item => item.row), dropped,
    frontier: frontier.items.map(item => ({ hash: item.hash, path: item.path, exact: item.exact, summary: item.summary })) });
  while (pending.length < 50) {
    assertSessionAlive();
    if (candidates.length && (!frontier.peek() || compare(candidates[0].key, frontier.peek().key) < 0)) {
      pending.push(candidates.shift().row); continue;
    }
    if (!frontier.peek()) break;
    if (processed >= nodes) return { state: 'preparing', rows: [], position: clone(checkpoint()), metrics };
    const item = frontier.pop();
    const node = verifyNode(item.hash, await readNode(item.hash));
    assertSessionAlive(); processed++; metrics.nodesProcessed++;
    if ((item.exact ? node.path !== item.path : !node.path.startsWith(item.path)) ||
        (item.summary && canonical(node.summary) !== canonical(item.summary))) throw new Error('index-descriptor-mismatch');
    if (node.kind === 'branch') {
      for (const [part, descriptor] of Object.entries(node.children)) {
        if (!mayContainRows(descriptor)) continue;
        if (!descriptor.path.startsWith(node.path + part)) throw new Error('index-descriptor-mismatch');
        const summary = { ...descriptor }; delete summary.hash; delete summary.path;
        frontier.push({ hash: descriptor.hash, path: descriptor.path, exact: true, summary, key: nodeKey(summary) });
      }
    } else {
      metrics.metadataExamined += node.rows.length;
      for (const row of node.rows) {
        const key = rowKey(row);
        if (!eligible(row) || (after && compare(key, after) <= 0)) continue;
        if (pending.some(value => value.id === row.id) || candidates.some(value => value.row.id === row.id)) throw new Error('duplicate-index-row');
        let start = 0, end = candidates.length;
        while (start < end) { const middle = (start + end) >>> 1; if (compare(candidates[middle].key, key) < 0) start = middle + 1; else end = middle; }
        const capacity = 50 - pending.length;
        if (start < capacity) candidates.splice(start, 0, { row, key }); else dropped = true;
        if (candidates.length > capacity) { candidates.pop(); dropped = true; }
        metrics.maxRetainedCandidates = Math.max(metrics.maxRetainedCandidates, pending.length + candidates.length);
      }
    }
  }
  assertSessionAlive();
  const more = pending.length === 50 && (dropped || frontier.peek() || candidates.length);
  // Only the next rank boundary is needed between completed pages. Dropped
  // candidates are rediscovered from the same roots; shared block cache helps.
  return { state: more ? 'continuation' : 'end', rows: clone(pending),
    position: more ? { after: rowKey(pending.at(-1)) } : null, metrics };
}
