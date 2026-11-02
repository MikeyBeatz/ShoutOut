// A post-order journal: each step is bounded, each mutation and journal advance
// share one transaction. Missing intermediate documents are still traversed.
import { AccountPurgeNeedsReview, AccountPurgeLeaseLost, AccountPurgeConflict, samePurgeTime } from './account_purge_guard.js';

export function purgeTreeFrame(path) {
  return { path, collections: null, collectionIndex: 0, pageToken: null, exhausted: false };
}

export async function stepAccountPurgeTree(db, { pager, guard, jobRef, validateSelection, beforeCommit = null }) {
  const initial = await db.runTransaction(guard), { job } = initial;
  const selected = job.selected, frame = job.stack.at(-1);
  if (!selected || !frame || typeof frame.path !== 'string' ||
      !(frame.path === selected.path || frame.path.startsWith(selected.path + '/')) ||
      frame.path.split('/').length % 2 !== 0) throw new AccountPurgeNeedsReview('invalid-purge-tree-frame');
  const ref = db.doc(frame.path);
  let nextStack = globalThis.structuredClone(job.stack), operation = 'journal', source;
  if (frame.collections === null) {
    const collections = (await ref.listCollections()).map(col => col.id).sort();
    if (new Set(collections).size !== collections.length || collections.some(id => !id || id.includes('/'))) {
      throw new AccountPurgeNeedsReview('invalid-purge-subcollections');
    }
    nextStack.at(-1).collections = collections;
  } else if (!Array.isArray(frame.collections) || !Number.isInteger(frame.collectionIndex) ||
      frame.collectionIndex < 0 || frame.collectionIndex > frame.collections.length) {
    throw new AccountPurgeNeedsReview('invalid-purge-tree-cursor');
  } else if (frame.collectionIndex < frame.collections.length) {
    if (frame.exhausted) {
      Object.assign(nextStack.at(-1), { collectionIndex: frame.collectionIndex + 1, pageToken: null, exhausted: false });
    } else {
      const page = await pager.list(`${frame.path}/${frame.collections[frame.collectionIndex]}`, frame.pageToken);
      Object.assign(nextStack.at(-1), { pageToken: page.next, exhausted: page.next === null });
      if (page.paths.length) nextStack.push(purgeTreeFrame(page.paths[0]));
    }
  } else {
    source = await ref.get(); nextStack.pop(); operation = 'delete';
  }
  if (nextStack.length > 100) throw new AccountPurgeNeedsReview('purge-tree-too-deep');
  if (beforeCommit) await beforeCommit({ path: ref.path, operation });
  return db.runTransaction(async transaction => {
    const current = await guard(transaction);
    if (current.job.version !== job.version) throw new AccountPurgeLeaseLost();
    const root = await transaction.get(db.doc(selected.path));
    if (root.exists && (!samePurgeTime(root.createTime, selected.createTime) || !validateSelection(root))) {
      throw new AccountPurgeNeedsReview('purge-root-replaced');
    }
    const leaf = operation === 'delete' ? (ref.path === selected.path ? root : await transaction.get(ref)) : null;
    if (leaf?.exists && (!source.exists || !samePurgeTime(leaf.updateTime, source.updateTime))) {
      throw new AccountPurgeConflict('purge-leaf-changed');
    }
    if (leaf?.exists) transaction.delete(ref, { lastUpdateTime: leaf.updateTime });
    transaction.update(jobRef, { stack: nextStack, selected: nextStack.length ? selected : null,
      deletedCount: current.job.deletedCount + (leaf?.exists ? 1 : 0), version: job.version + 1, updatedAt: current.now });
    return { deleted: leaf?.exists ? 1 : 0, work: 1 };
  });
}
