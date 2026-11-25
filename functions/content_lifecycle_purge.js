// Local, resumable post-order primitive. No scheduler, live scan or activation.
// A caller selects a known thread and supplies the established bounded pager.
import { Timestamp } from 'firebase-admin/firestore';
import { lifecycleEnabled, lifecycleSource, validateLifecycleThread } from './content_lifecycle.js';
import { accountArchiveEffectiveDeadline } from './account_content_archive.js';

const same = (a, b) => a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b);
const frameFor = path => ({ path, collections: null, collectionIndex: 0, pageToken: null, exhausted: false });
const fail = text => { throw new Error(text); };
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

function allowedPath(path, threadId, selected) {
  const p = path.split('/');
  if (selected.startsWith('contentLifecycleArchive/')) return path === selected ||
    p.length === 4 && p.slice(0, 2).join('/') === selected && p[2] === 'accessAudits' && identifier(p[3]);
  if (p[0] !== 'shouts' || p[1] !== threadId || !p.every(identifier)) return false;
  return p.length === 2 || p.length === 4 && ['comments', 'privateReplies', 'reactions', 'saves'].includes(p[2]) ||
    p.length === 6 && p[2] === 'comments' && p[4] === 'reactions';
}

// Keep a body-free account-job header until its original journal completes.
// Removing that header early would strand a persisted pendingArchiveId. Source
// reactions can still drain after this point, but cannot create fresh copies.
export async function expireLifecycleAccountCopy(db, { threadId, clock = () => new Date(), pageSize = 50 } = {}) {
  if (!lifecycleEnabled(db) || !identifier(threadId) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new Error('invalid-lifecycle-copy-options');
  }
  const candidate = (await db.collection('accountContentArchive').where('sourceShoutId', '==', threadId)
    .where('contentExpired', '==', false).limit(1).get()).docs[0];
  if (!candidate) return { state: 'complete', deleted: 0 };
  const collections = await candidate.ref.listCollections();
  if (collections.some(c => !['reactions', 'accessAudits'].includes(c.id))) fail('lifecycle-copy-unknown-subcollection');
  return db.runTransaction(async tx => {
    const now = Timestamp.fromDate(clock());
    const [control, source] = await tx.getAll(db.doc('contentLifecycleControl/current'), candidate.ref);
    if (control.get('mode') !== 'active' || control.get('schemaVersion') !== 1) fail('lifecycle-copy-paused');
    if (!source.exists) return { state: 'continuation', deleted: 0 };
    if (!same(source.createTime, candidate.createTime) || source.get('sourceShoutId') !== threadId) fail('lifecycle-copy-replaced');
    const deadline = await accountArchiveEffectiveDeadline(tx, db, source.data());
    if (now.toMillis() < deadline.toMillis()) fail('lifecycle-copy-not-due');
    const reactions = await tx.get(source.ref.collection('reactions').limit(pageSize));
    const audits = reactions.size === pageSize ? null : await tx.get(source.ref.collection('accessAudits').limit(pageSize - reactions.size));
    const children = [...reactions.docs, ...(audits?.docs ?? [])];
    for (const child of children) if ((await child.ref.listCollections()).length) fail('lifecycle-copy-unexpected-descendants');
    for (const child of children) tx.delete(child.ref, { lastUpdateTime: child.updateTime });
    tx.update(source.ref, { content: {}, contentExpired: children.length < pageSize });
    return { state: 'continuation', deleted: children.length, redacted: 1 };
  });
}

// One bounded external discovery and one fenced commit per call. The durable
// version prevents two workers from advancing the same discovery. A restart
// resumes the saved stack; it never restarts a whole thread inventory.
export async function stepContentLifecycleTree(db, { threadId, kind, archiveKey = null, pager, indexWriter,
  clock = () => new Date(), beforeCommit = null } = {}) {
  if (!lifecycleEnabled(db) || !identifier(threadId) || !['source', 'archive'].includes(kind) ||
      kind === 'archive' && (typeof archiveKey !== 'string' || !/^[a-f0-9]{64}$/.test(archiveKey)) ||
      !pager || typeof pager.list !== 'function') throw new Error('invalid-lifecycle-purge-options');
  const rootPath = kind === 'source' ? `shouts/${threadId}` : `contentLifecycleArchive/${archiveKey}`;
  const jobRef = db.doc(`contentLifecycleJobs/${kind}_${kind === 'source' ? threadId : archiveKey}`);
  const headerRef = db.doc(`contentLifecycleThreads/${threadId}`);
  const guard = async tx => {
    const date = clock();
    if (!(date instanceof Date) || !Number.isSafeInteger(date.getTime())) fail('invalid-lifecycle-purge-clock');
    const now = Timestamp.fromDate(date);
    const [control, header, journal] = await tx.getAll(db.doc('contentLifecycleControl/current'), headerRef, jobRef);
    if (control.get('schemaVersion') !== 1 || control.get('mode') !== 'active' || !Number.isSafeInteger(control.get('revision')) || control.get('revision') < 1) fail('lifecycle-purge-paused');
    if (!header.exists) fail('lifecycle-purge-header-missing');
    const h = validateLifecycleThread(header.data(), threadId);
    const deadline = kind === 'source' ? h.historyUntil : h.retainUntil;
    if (now.toMillis() < deadline.toMillis()) fail('lifecycle-purge-not-due');
    const job = journal.data();
    if (job && (job.schemaVersion !== 1 || job.threadId !== threadId || job.rootPath !== rootPath ||
        !same(job.threadCreatedAt, h.sourceCreatedAt) || !Number.isSafeInteger(job.version) || job.version < 1 ||
        !Array.isArray(job.stack) || job.stack.length > 100)) fail('invalid-lifecycle-purge-journal');
    return { now, header: h, job };
  };
  const initial = await db.runTransaction(async tx => {
    const context = await guard(tx);
    if (context.job) return context;
    const root = await tx.get(db.doc(rootPath));
    if (kind === 'archive' && root.exists && root.get('threadId') !== threadId) fail('lifecycle-purge-wrong-thread');
    const job = { schemaVersion: 1, threadId, rootPath, threadCreatedAt: context.header.sourceCreatedAt,
      version: 1, deletedCount: 0, rootCreateTime: root.createTime ?? null, stack: [frameFor(rootPath)] };
    tx.create(jobRef, job); return { ...context, job };
  });
  const job = initial.job;
  if (!job.stack.length) return { state: 'complete', deleted: 0 };
  const frame = job.stack.at(-1);
  if (!allowedPath(frame.path, threadId, rootPath)) fail('lifecycle-purge-unexpected-path');
  const ref = db.doc(frame.path), stack = globalThis.structuredClone(job.stack);
  let source = null, remove = false;
  if (frame.collections === null) {
    const collections = (await ref.listCollections()).map(c => c.id).sort();
    if (collections.some(c => !allowedPath(`${ref.path}/${c}/probe`, threadId, rootPath))) fail('lifecycle-purge-unknown-subcollection');
    stack.at(-1).collections = collections;
  } else if (!Array.isArray(frame.collections) || !Number.isInteger(frame.collectionIndex) ||
      frame.collectionIndex < 0 || frame.collectionIndex > frame.collections.length) fail('invalid-lifecycle-purge-cursor');
  else if (frame.collectionIndex < frame.collections.length) {
    if (frame.exhausted) Object.assign(stack.at(-1), { collectionIndex: frame.collectionIndex + 1, pageToken: null, exhausted: false });
    else {
      const page = await pager.list(`${frame.path}/${frame.collections[frame.collectionIndex]}`, frame.pageToken);
      if (!Array.isArray(page.paths) || page.paths.length > 1 || page.paths.some(p =>
        p.split('/').slice(0, -1).join('/') !== `${frame.path}/${frame.collections[frame.collectionIndex]}` || !allowedPath(p, threadId, rootPath)) ||
        page.next !== null && typeof page.next !== 'string') fail('invalid-lifecycle-purge-page');
      Object.assign(stack.at(-1), { pageToken: page.next, exhausted: page.next === null });
      if (page.paths.length) stack.push(frameFor(page.paths[0]));
    }
  } else { source = await ref.get(); remove = true; stack.pop(); }
  if (stack.length > 100) fail('lifecycle-purge-too-deep');
  if (beforeCommit) await beforeCommit({ path: ref.path, remove });
  return db.runTransaction(async tx => {
    const current = await guard(tx);
    if (current.job?.version !== job.version) fail('lifecycle-purge-version-changed');
    const root = await tx.get(db.doc(rootPath));
    if (root.exists && !same(root.createTime, job.rootCreateTime)) fail('lifecycle-purge-root-replaced');
    const leaf = remove ? ref.path === rootPath ? root : await tx.get(ref) : null;
    if (leaf?.exists && (!source.exists || !same(source.updateTime, leaf.updateTime))) fail('lifecycle-purge-leaf-changed');
    if (kind === 'archive' && root.exists && root.get('threadId') !== threadId) fail('lifecycle-purge-wrong-thread');
    const count = Number(leaf?.exists === true);
    let plan = null;
    if (count && ref.path === `shouts/${threadId}` && leaf.get('contentPurged') !== true) {
      if (!indexWriter || typeof indexWriter.prepare !== 'function') fail('lifecycle-purge-index-writer-required');
      plan = await indexWriter.prepare(tx, threadId, leaf.data(), null, { additionalWrites: 2 });
      if (!plan || typeof plan.apply !== 'function') fail('lifecycle-purge-index-plan-required');
    }
    plan?.apply();
    if (count) tx.delete(ref, { lastUpdateTime: leaf.updateTime });
    tx.update(jobRef, { stack, version: job.version + 1, deletedCount: current.job.deletedCount + count, updatedAt: current.now });
    if (kind === 'source' && !stack.length) tx.update(headerRef, { sourceDrainedAt: current.now });
    return { state: stack.length ? 'continuation' : 'complete', deleted: count,
      sourceBody: count && lifecycleSource(ref.path) !== null };
  });
}

export async function finishContentLifecycleThread(db, { threadId, clock = () => new Date() } = {}) {
  if (!lifecycleEnabled(db) || !identifier(threadId)) throw new Error('invalid-lifecycle-finish-options');
  const ref = db.doc(`contentLifecycleThreads/${threadId}`);
  return db.runTransaction(async tx => {
    const [control, header, source] = await tx.getAll(db.doc('contentLifecycleControl/current'), ref, db.doc(`shouts/${threadId}`));
    if (control.get('schemaVersion') !== 1 || control.get('mode') !== 'active') fail('lifecycle-finish-paused');
    if (!header.exists) return { state: 'complete', deleted: 0 };
    const data = validateLifecycleThread(header.data(), threadId), now = Timestamp.fromDate(clock());
    if (now.toMillis() < data.retainUntil.toMillis() || !(data.sourceDrainedAt instanceof Timestamp) || source.exists) fail('lifecycle-finish-not-ready');
    const remaining = await tx.get(db.collection('contentLifecycleArchive').where('threadId', '==', threadId).limit(1));
    const copies = await tx.get(db.collection('accountContentArchive').where('sourceShoutId', '==', threadId).limit(1));
    if (!remaining.empty) return { state: 'continuation', deleted: 0 };
    if (!copies.empty) {
      // The ordinary body is gone. An account journal may still need only the
      // technical deadline header; its former regional context is unnecessary.
      tx.update(ref, { geography: null });
      return { state: 'waiting-for-account-journal', deleted: 0 };
    }
    const jobs = await tx.get(db.collection('contentLifecycleJobs').where('threadId', '==', threadId).limit(50));
    for (const job of jobs.docs) tx.delete(job.ref, { lastUpdateTime: job.updateTime });
    if (jobs.size < 50) tx.delete(ref);
    return { state: jobs.size < 50 ? 'complete' : 'continuation', deleted: jobs.size + Number(jobs.size < 50) };
  });
}
