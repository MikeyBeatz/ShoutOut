// Bounded immutable-tree comparison. No database, body reads or live scheduler.
import { canonical, clone, verifyNode } from './feed_block_index.js';

export async function scanFeedNews({ before, current, position = null, load, accept, eligible, budget = 32 }) {
  if (!Array.isArray(before) || !Array.isArray(current) || !Number.isSafeInteger(budget) || budget < 2 || budget > 128) throw new Error('invalid-news-scan');
  const previous = new Map(before.map(row => [row.path, row]));
  const state = position ? clone(position) : { root: 0, stack: [], rows: [] };
  if (!Number.isSafeInteger(state.root) || state.root < 0 || state.root > current.length || !Array.isArray(state.stack) ||
      !Array.isArray(state.rows) || state.rows.length > 100 || new Set(state.rows.map(row => row.id)).size !== state.rows.length) throw new Error('invalid-news-position');
  const metrics = { nodeLoads: 0, skippedHashes: 0, metadataExamined: 0, maxRetainedCandidates: state.rows.length };
  while (state.rows.length < 100) {
    if (!state.stack.length) {
      if (state.root === current.length) break;
      const next = current[state.root++]; state.stack.push({ next, old: previous.get(next.path) ?? null });
    }
    const task = state.stack.at(-1);
    if (task.next.hash === task.old?.hash) { state.stack.pop(); metrics.skippedHashes++; continue; }
    const cost = task.old ? 2 : 1;
    if (metrics.nodeLoads + cost > budget) return { state: 'preparing', position: state, metrics };
    state.stack.pop();
    const read = async descriptor => {
      metrics.nodeLoads++;
      const node = verifyNode(descriptor.hash, await load(descriptor.hash), { cardProjection: true });
      if (!node.path.startsWith(descriptor.path) || descriptor.summary && canonical(node.summary) !== canonical(descriptor.summary)) throw new Error('news-index-descriptor-mismatch');
      return node;
    };
    const next = await read(task.next), old = task.old ? await read(task.old) : null;
    if (next.kind === 'branch') {
      const siblings = old?.kind === 'branch' ? Object.values(old.children) : [];
      for (const child of Object.values(next.children).reverse()) {
        const summary = { ...child }; delete summary.hash; delete summary.path;
        state.stack.push({ next: { ...child, summary }, old: siblings.find(row => row.path === child.path) ?? null });
      }
    } else {
      metrics.metadataExamined += next.rows.length;
      // Shared IDs are not sufficient to establish first publication: an old
      // unavailable source may be restored. accept checks server createTime.
      const existing = new Set(old?.kind === 'leaf' ? old.rows.map(row => row.id) : []);
      const candidates = next.rows.filter(row => !existing.has(row.id) && eligible(row));
      const accepted = await accept(candidates);
      for (const row of accepted) {
        if (state.rows.some(known => known.id === row.id)) throw new Error('duplicate-news-row');
        state.rows.push(row); metrics.maxRetainedCandidates = Math.max(metrics.maxRetainedCandidates, state.rows.length); if (state.rows.length === 100) break;
      }
    }
  }
  return { state: 'ready', rows: state.rows, capped: state.rows.length === 100, metrics };
}
