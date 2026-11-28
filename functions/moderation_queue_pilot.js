// One bounded, manifest-owned synthetic fixture. Never imported by a host.
import { createHash, randomBytes } from 'node:crypto';
import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { createFeedRuntime } from './feed_runtime.js';
import { createModerationQueueDatabase, moderationReportTarget } from './moderation_queue.js';
import { encodeGeohash } from './geohash.js';
import { legalPolicy, currentLegalPolicy } from './legal_policy.js';
import { removePilotReadKeys } from './feed_news_pilot.js';
const project = 'shoutout-dev-46c81', names = ['Bright_Otter_182', 'TestBusiness', 'TestModerator', 'TestAdmin'];
const sha = value => createHash('sha256').update(canonical(value)).digest('hex');
const stamp = value => value ? [value.seconds, value.nanoseconds] : null;
const fail = code => { throw Error('moderation-pilot-' + code); };
const restricted = doc => doc.exists && (!(doc.get('expiresAt') instanceof Timestamp) || doc.get('expiresAt').toMillis() > Date.now());
const allowed = db => db.projectId === project || db.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
const policy = db => db.projectId === project ? legalPolicy({ archiveDisclosureEnabled: true, version: '2026-11-27' }) : currentLegalPolicy();
export function moderationQueuePilotSlots(plan) {
  const root = plan.shoutId, [a, b] = plan.actors, prefix = `MVP F04 ${plan.runId}`;
  const sources = [{ path: `shouts/${root}`, type: 'shout', id: root, authorId: a.uid, title: prefix, text: 'Synthetic DEV queue pilot. Remove after verification.' },
    ...Array.from({ length: 50 }, (_, n) => ({ path: `shouts/${root}/comments/${sha([plan.runId, 'comment', n])}`, type: 'comment', id: sha([plan.runId, 'comment', n]),
      authorId: b.uid, text: `${prefix} comment ${String(n + 1).padStart(2, '0')}` })),
    { path: `shouts/${root}/privateReplies/${sha([plan.runId, 'private'])}`, type: 'privateReply', id: sha([plan.runId, 'private']), authorId: b.uid, text: `${prefix} private reply` }];
  const reports = sources.map(row => {
    const reporterId = row.type === 'shout' ? b.uid : a.uid;
    const collection = { shout: 'reports', comment: 'commentReports', privateReply: 'privateReplyReports' }[row.type];
    return { sourcePath: row.path, path: `${collection}/${reporterId}_${root}${row.type === 'shout' ? '' : '_' + row.id}`, reporterId,
      reason: `${prefix} ${row.type}${row.type === 'comment' ? ' ' + sources.indexOf(row) : ''}. Remove after verification.`,
      ...(row.type === 'comment' ? { commentId: row.id } : row.type === 'privateReply' ? { privateReplyId: row.id, authorId: row.authorId } : {}) };
  });
  reports.push({ sourcePath: sources[0].path, path: `reports/${plan.actors[2].uid}_${root}`, reporterId: plan.actors[2].uid,
    reason: `${prefix} second report. Remove after verification.` });
  return { sources, reports };
}
export function validateModerationQueuePilot(db, plan, digest = plan?.digest) {
  const { digest: saved, ...body } = plan ?? {};
  if (!allowed(db) || body.projectId !== db.projectId || body.v !== 1 || body.kind !== 'moderation-queue-pilot' ||
      !/^[a-f0-9]{16}$/.test(body.runId ?? '') || !/^[a-f0-9]{40}$/.test(body.sourceCommit ?? '') || saved !== digest || sha(body) !== saved ||
      !Array.isArray(body.actors) || body.actors.length !== 4 || body.actors.some((a, n) => a.nickname !== names[n] || !/^[A-Za-z0-9_-]{1,128}$/.test(a.uid)) ||
      new Set(body.actors.map(a => a.uid)).size !== 4 || body.shoutId !== sha(['moderation-queue-pilot', body.runId]) ||
      !Number.isSafeInteger(body.createdAt) || body.expiresAt !== body.createdAt + 86400000) fail('invalid-plan');
  return plan;
}
export async function planModerationQueuePilot(db, actors, { sourceCommit, now = Date.now() } = {}) {
  if (!allowed(db)) fail('dev-required');
  const controls = await db.getAll(...['feedIndexControl/current', 'contentLifecycleControl/current', 'moderationQueueControl/current'].map(p => db.doc(p)));
  if (controls.some(d => d.get('mode') !== 'active')) fail('active-controls-required');
  const runId = randomBytes(8).toString('hex');
  const originals = [];
  for (const collection of ['shouts', 'accountDeletionRequests']) {
    const rows = await db.collection(collection).select().limit(1001).get();
    if (rows.size > 1000) fail('inventory-budget');
    originals.push(...rows.docs.map(d => ({ path: d.ref.path, createTime: stamp(d.createTime), updateTime: stamp(d.updateTime) })));
  }
  const body = { v: 1, kind: 'moderation-queue-pilot', projectId: db.projectId, runId, sourceCommit, actors,
    createdAt: now, expiresAt: now + 86400000, shoutId: sha(['moderation-queue-pilot', runId]), originals,
    controls: controls.map(d => ({ path: d.ref.path, data: d.data(), createTime: stamp(d.createTime) })) };
  const plan = { ...body, digest: sha(body) }; validateModerationQueuePilot(db, plan);
  await fence(db, db, plan); return plan;
}
async function fence(reader, db, plan) {
  validateModerationQueuePilot(db, plan);
  const rows = plan.originals, refs = rows.map(r => db.doc(r.path));
  const docs = refs.length ? await reader.getAll(...refs) : [];
  docs.forEach((d, n) => { if (!d.exists || canonical(stamp(d.updateTime)) !== canonical(rows[n].updateTime)) fail('protected-source-changed'); });
  const controls = await reader.getAll(...plan.controls.map(r => db.doc(r.path)));
  controls.forEach((d, n) => {
    const previous = plan.controls[n];
    if (!d.exists || canonical(stamp(d.createTime)) !== canonical(previous.createTime) || d.get('mode') !== 'active' ||
        d.get('incarnation') !== previous.data.incarnation || canonical(d.get('writeGenerationIds')) !== canonical(previous.data.writeGenerationIds) ||
        canonical(d.get('cardWriteGenerationIds')) !== canonical(previous.data.cardWriteGenerationIds)) fail('control-changed');
  });
  for (const actor of plan.actors) {
    const [profile, legal, deletion, ban, restriction] = await reader.getAll(db.doc(`users/${actor.uid}`), db.doc(`users/${actor.uid}/legal/${policy(db).acceptanceDocument}`),
      db.doc(`accountDeletionRequests/${actor.uid}`), db.doc(`bans/${actor.uid}`), db.doc(`contentRestrictions/${actor.uid}`));
    if (profile.get('nickname') !== actor.nickname || canonical(stamp(profile.createTime)) !== canonical(actor.profileCreateTime) || !legal.exists || deletion.exists ||
        restricted(ban) || restricted(restriction)) fail('actor-changed');
  }
}
function guarded(db, plan) {
  return new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return (operation, ...args) => target.runTransaction(async tx => { await fence(tx, db, plan); return operation(tx); }, ...args);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}
function runtime(db, plan, identityRuntime) {
  if (db.projectId === project && identityRuntime?.enabled !== true) fail('archive-identity-required');
  const safe = guarded(db, plan);
  return createFeedRuntime(safe, { getUser() { throw Error('moderation-pilot-auth-mutation-forbidden'); } }, {
    moderationQueueEnabled: true, newsRuntimeEnabled: db.projectId === project, contentLifecycleEnabled: true, contentCaptureEnabled: true,
    contentMaintenanceEnabled: false, enforceArchiveDisclosure: true,
    disclosurePolicy: legalPolicy({ archiveDisclosureEnabled: true, version: '2026-11-27' }), identityRuntime,
  });
}
export async function seedModerationQueuePilot(db, plan, { clientAvailable = false, identityRuntime = null } = {}) {
  validateModerationQueuePilot(db, plan); if (clientAvailable !== true) fail('available-client-required');
  if (Date.now() >= plan.expiresAt) fail('expired-plan');
  const rt = runtime(db, plan, identityRuntime), slots = moderationQueuePilotSlots(plan), root = db.doc(`shouts/${plan.shoutId}`);
  const createdAt = Timestamp.fromMillis(plan.createdAt), expiresAt = Timestamp.fromMillis(plan.expiresAt);
  const rootData = { authorId: slots.sources[0].authorId, authorNickname: plan.actors[0].nickname, title: slots.sources[0].title, text: slots.sources[0].text,
    categories: ['Dotaz'], status: 'active', createdAt, expiresAt, location: new GeoPoint(50.53, 14.13), geohash: encodeGeohash(50.53, 14.13),
    geography: { schemaVersion: 1, countryCode: 'CZ', subdivisionCode: 'CZ-42' }, likesCount: 0, dislikesCount: 0, commentsCount: 0, savesCount: 0 };
  await rt.database.runTransaction(async tx => {
    const old = await tx.get(root);
    if (old.exists) { ownedSource(old, slots.sources[0], plan); if (old.get('status') !== 'active') fail('already-retired'); return; }
    const archived = await tx.get(db.doc(`contentLifecycleThreads/${root.id}`)); if (archived.exists) fail('source-id-reused');
    const index = await rt.indexWriter.prepare(tx, root.id, null, rootData); index.apply(); tx.create(root, rootData);
  });
  for (let offset = 1; offset < slots.sources.length; offset += 25) await rt.database.runTransaction(async tx => {
    const batch = slots.sources.slice(offset, offset + 25), current = await tx.get(root), docs = await tx.getAll(...batch.map(r => db.doc(r.path)));
    ownedSource(current, slots.sources[0], plan); docs.forEach((d, n) => ownedSource(d, batch[n], plan));
    const missing = batch.filter((_, n) => !docs[n].exists), count = missing.filter(r => r.type === 'comment').length;
    if (count) {
      const next = { ...current.data(), commentsCount: current.get('commentsCount') + count };
      const index = await rt.indexWriter.prepare(tx, root.id, current.data(), next); index.apply(); tx.update(root, { commentsCount: next.commentsCount });
    }
    for (const r of missing) tx.create(db.doc(r.path), { authorId: r.authorId, authorNickname: plan.actors[1].nickname, text: r.text, createdAt,
      ...(r.type === 'privateReply' ? { recipientId: plan.actors[0].uid, participants: [r.authorId, plan.actors[0].uid] } : { likesCount: 0, dislikesCount: 0 }) });
  });
  for (let offset = 0; offset < slots.reports.length; offset += 25) await rt.database.runTransaction(async tx => {
    const batch = slots.reports.slice(offset, offset + 25), docs = await tx.getAll(...batch.map(r => db.doc(r.path)));
    docs.forEach((d, n) => { if (d.exists) { ownedReport(d, batch[n], plan); if (d.get('status') !== 'open') fail('already-reviewed'); } });
    for (let n = 0; n < batch.length; n++) if (!docs[n].exists) {
      const { path, sourcePath, ...data } = batch[n];
      void sourcePath;
      tx.create(db.doc(path), { ...data, shoutId: root.id, createdAt, status: 'open' });
    }
  });
  return moderationQueuePilotStatus(db, plan);
}
function ownedSource(doc, row, plan) {
  if (!doc.exists) return;
  if (doc.get('authorId') !== row.authorId || doc.get('text') !== row.text || doc.get('createdAt')?.toMillis() !== plan.createdAt || row.type === 'shout' && doc.get('title') !== row.title) fail('foreign-source');
}
function ownedReport(doc, row, plan) {
  if (!doc.exists) return;
  if (doc.get('shoutId') !== plan.shoutId || doc.get('reporterId') !== row.reporterId || doc.get('reason') !== row.reason || doc.get('createdAt')?.toMillis() !== plan.createdAt) fail('foreign-report');
}
export async function moderationQueuePilotStatus(db, plan) {
  validateModerationQueuePilot(db, plan); await fence(db, db, plan);
  const slots = moderationQueuePilotSlots(plan), sources = await db.getAll(...slots.sources.map(r => db.doc(r.path))), reports = await db.getAll(...slots.reports.map(r => db.doc(r.path)));
  sources.forEach((d, n) => ownedSource(d, slots.sources[n], plan)); reports.forEach((d, n) => ownedReport(d, slots.reports[n], plan));
  const cases = await db.collection('moderationCases').where('shoutId', '==', plan.shoutId).get();
  const expected = new Map(); reports.filter(d => ['open', 'escalated'].includes(d.get('status'))).forEach(d => {
    const { caseId } = moderationReportTarget(d.ref.path, d.data()); expected.set(caseId, (expected.get(caseId) ?? 0) + 1);
  });
  if (cases.size !== expected.size || cases.docs.some(c => c.get('pendingCount') !== expected.get(c.id))) fail('projection-count-drift');
  return { projectId: db.projectId, shoutId: plan.shoutId, title: slots.sources[0].title, sourceCount: sources.filter(d => d.exists).length,
    reportCount: reports.filter(d => d.exists).length, pendingReports: [...expected.values()].reduce((a, b) => a + b, 0), cases: cases.size, cloudWrites: 0 };
}
export async function retireModerationQueuePilot(db, plan, { identityRuntime = null } = {}) {
  // The index/source change uses the real writer. Remaining fixture-only rows
  // are separately planned with exact SDK versions before physical cleanup.
  const rt = runtime(db, plan, identityRuntime), row = moderationQueuePilotSlots(plan).sources[0], ref = db.doc(row.path);
  await rt.database.runTransaction(async tx => {
    const old = await tx.get(ref); ownedSource(old, row, plan);
    if (!old.exists || old.get('status') === 'deleted') return;
    const next = { ...old.data(), status: 'deleted' }, index = await rt.indexWriter.prepare(tx, ref.id, old.data(), next);
    index.apply(); tx.update(ref, { status: 'deleted' });
  });
  return { retired: true, receiptsRemoved: 0, rateResets: 0, authMutations: 0 };
}
export async function purgeModerationQueuePilotReports(db, plan) {
  const q = createModerationQueueDatabase(guarded(db, plan), { enabled: true }), rows = moderationQueuePilotSlots(plan).reports;
  for (let offset = 0; offset < rows.length; offset += 50) await q.runTransaction(async tx => {
    const batch = rows.slice(offset, offset + 50), docs = await tx.getAll(...batch.map(r => db.doc(r.path)));
    docs.forEach((d, n) => ownedReport(d, batch[n], plan));
    for (const d of docs) if (d.exists) tx.delete(d.ref);
  });
  return { reportsRemoved: rows.length, receiptsRemoved: 0, rateResets: 0, authMutations: 0 };
}
export async function planModerationQueuePilotCleanup(db, plan) {
  validateModerationQueuePilot(db, plan); await fence(db, db, plan);
  const slots = moderationQueuePilotSlots(plan), root = db.doc(`shouts/${plan.shoutId}`), sourceRows = new Map(slots.sources.map(r => [r.path, r]));
  const selected = new Map(), keep = d => { if (d.exists) selected.set(d.ref.path, { path: d.ref.path, updateTime: stamp(d.updateTime) }); };
  const source = await root.get(); ownedSource(source, slots.sources[0], plan);
  if (source.exists && source.get('status') !== 'deleted') fail('retire-before-cleanup'); keep(source);
  for (const collection of await root.listCollections()) {
    if (!['comments', 'privateReplies', 'reactions', 'saves'].includes(collection.id)) fail('foreign-descendant');
    const rows = await collection.limit(101).get(); if (rows.size > 100) fail('cleanup-budget');
    for (const d of rows.docs) {
      if (sourceRows.has(d.ref.path)) ownedSource(d, sourceRows.get(d.ref.path), plan);
      else if (!['reactions', 'saves'].includes(collection.id) || !plan.actors.some(a => a.uid === d.id)) fail('foreign-descendant');
      if ((await d.ref.listCollections()).length) fail('foreign-descendant'); keep(d);
    }
  }
  for (const collection of ['reports', 'commentReports', 'privateReplyReports', 'moderationCases']) {
    if (!(await db.collection(collection).where('shoutId', '==', root.id).limit(1).get()).empty) fail('reports-not-drained');
  }
  const archives = await db.collection('contentLifecycleArchive').where('threadId', '==', root.id).limit(53).get();
  if (archives.size > 52) fail('foreign-archive');
  for (const d of archives.docs) {
    const row = sourceRows.get(d.get('sourcePath'));
    if (!row || d.get('content.text') !== row.text || d.get('content.authorId') !== row.authorId || d.get('sourceCreatedAt')?.toMillis() !== plan.createdAt) fail('foreign-archive');
    keep(d);
    for (const collection of await d.ref.listCollections()) {
      if (collection.id !== 'accessAudits') fail('foreign-descendant');
      const rows = await collection.limit(101).get(); if (rows.size > 100) fail('cleanup-budget');
      for (const audit of rows.docs) {
        if (!plan.actors.some(a => a.uid === audit.get('actorId')) || !slots.reports.some(r => r.path.split('/')[1] === audit.get('reportId'))) fail('foreign-audit');
        if ((await audit.ref.listCollections()).length) fail('foreign-descendant'); keep(audit);
      }
    }
  }
  keep(await db.doc(`contentLifecycleThreads/${root.id}`).get());
  const clearances = await db.collection('moderationClearances').where('shoutId', '==', root.id).limit(53).get();
  for (const d of clearances.docs) {
    if (!slots.sources.some(r => d.id === `${r.type}_${root.id}${r.type === 'shout' ? '' : '_' + r.id}`) || (await d.ref.listCollections()).length) fail('foreign-clearance'); keep(d);
  }
  for (const actor of plan.actors) {
    const notices = await db.collection(`users/${actor.uid}/notifications`).where('targetShoutId', '==', root.id).limit(101).get();
    if (notices.size > 100) fail('cleanup-budget');
    for (const d of notices.docs) { if ((await d.ref.listCollections()).length) fail('foreign-descendant'); keep(d); }
  }
  const body = { v: 1, fixtureDigest: plan.digest, projectId: db.projectId, rows: [...selected.values()].sort((a, b) => a.path.localeCompare(b.path)) };
  return { ...body, digest: sha(body) };
}
export async function cleanupModerationQueuePilot(db, plan, cleanup, approvedDigest) {
  validateModerationQueuePilot(db, plan);
  const { digest, ...body } = cleanup ?? {};
  if (digest !== approvedDigest || sha(body) !== digest || body.fixtureDigest !== plan.digest || body.projectId !== db.projectId) fail('cleanup-plan-drift');
  // Reconstruct the allowed set. A hand-edited manifest cannot authorize a
  // foreign path, and an interrupted cleanup can only remove remaining rows.
  const current = await planModerationQueuePilotCleanup(db, plan);
  if (current.rows.some(r => !cleanup.rows.some(old => canonical(old) === canonical(r)))) fail('cleanup-source-changed');
  const rt = createFeedRuntime(guarded(db, plan), { getUser() { throw Error('moderation-pilot-auth-mutation-forbidden'); } }, {
    moderationQueueEnabled: true, newsRuntimeEnabled: db.projectId === project, contentLifecycleEnabled: false, contentCaptureEnabled: false, contentMaintenanceEnabled: false, enforceArchiveDisclosure: false,
  });
  let deleted = 0;
  for (let offset = 0; offset < cleanup.rows.length; offset += 40) await rt.database.runTransaction(async tx => {
    const batch = cleanup.rows.slice(offset, offset + 40), docs = await tx.getAll(...batch.map(r => db.doc(r.path)));
    docs.forEach((d, n) => { if (d.exists && canonical(stamp(d.updateTime)) !== canonical(batch[n].updateTime)) fail('cleanup-source-changed'); });
    const root = docs.find(d => d.ref.path === `shouts/${plan.shoutId}` && d.exists);
    const index = await rt.indexWriter.prepareBatch(tx, root ? [{ id: root.id, before: root.data(), after: null }] : [], { additionalWrites: docs.filter(d => d.exists).length });
    index.apply(); docs.filter(d => d.exists).forEach(d => tx.delete(d.ref));
    deleted += docs.filter(d => d.exists).length;
  });
  let readKeys = 0; const root = moderationQueuePilotSlots(plan).sources[0];
  for (const actor of plan.actors) readKeys += await removePilotReadKeys(db, { slots: [{ label: 'root', title: root.title, text: root.text }] },
    { root: { id: plan.shoutId, expiresAt: plan.expiresAt } }, actor, tx => fence(tx, db, plan));
  await fence(db, db, plan);
  return { documentsRemoved: deleted, readKeys, receiptsRemoved: 0, rateResets: 0, authMutations: 0 };
}
