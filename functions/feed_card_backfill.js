// Internal resumable preparation; no callable, CLI, scheduler or live activation.
import { createHash } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { createFeedRuntime } from './feed_runtime.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';
import { generationId, generationStamp, sameGenerationStamp } from './feed_generation_format.js';
import { metadataOf, canonical, verifyNode } from './feed_block_index.js';
import { publicCardState } from './feed_card_state.js';
import { isPurgedShoutContext } from './shout_context.js';

const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const empty = () => ({ count: 0, xor: '0'.repeat(64), sum: '0'.repeat(64) });
function add(acc, value) {
  const n = BigInt('0x' + digest(value)), mod = 1n << 256n;
  acc.count++; acc.xor = (BigInt('0x' + acc.xor) ^ n).toString(16).padStart(64, '0');
  acc.sum = ((BigInt('0x' + acc.sum) + n) % mod).toString(16).padStart(64, '0');
}
export function createCardBackfill(db, source, target) {
  if (!generationId(source) || !generationId(target) || source === target) throw new Error('invalid-card-backfill');
  const runtime = createFeedRuntime(db, { getUser() { throw new Error('backfill-does-not-access-auth'); } }, { cardStateEnabled: true });
  const database = runtime.database, controlRef = db.doc('feedIndexControl/current'),
    markerRef = db.doc(`feedIndexGenerations/${target}`), sourceRef = db.doc(`feedIndexGenerations/${source}`),
    jobRef = db.doc(`feedIndexMaintenance/cardBackfills/jobs/${target}`);
  async function guard(tx, phases) {
    const [control, job, marker, from] = await tx.getAll(controlRef, jobRef, markerRef, sourceRef);
    const state = validateFeedIndexControl(control.data()), data = job.data();
    if (state.schemaVersion !== 2 || !state.cardWriteGenerationIds.includes(target) ||
        data?.v !== 1 || data.target !== target || data.source !== source || !phases.includes(data.phase) ||
        !Number.isSafeInteger(data.version) || data.version < 0 || !Number.isInteger(data.batchSize) || data.batchSize < 1 || data.batchSize > 50 ||
        !sameGenerationStamp(from, data.sourceIncarnation) || !job.createTime.isEqual(marker.createTime) ||
        marker.get('v') !== 2 || marker.get('cardProjection') !== 1 || marker.get('cardBackfillId') !== target ||
        data.controlRevision !== state.revision) throw new Error('stale-card-backfill');
    return { state, data, job, marker, from };
  }
  async function begin(expectedRevision) {
    return database.runTransaction(async tx => {
      const [control, marker, job, from] = await tx.getAll(controlRef, markerRef, jobRef, sourceRef);
      const state = validateFeedIndexControl(control.data());
      if (marker.exists || job.exists || state.revision !== expectedRevision || state.readGenerationId !== source ||
          state.mode !== 'active' || !from.exists || from.get('v') !== 1 || from.get('accountRetention') !== true ||
          from.get('readIdentity') !== 1) throw new Error('card-backfill-start-conflict');
      const revision = state.revision + 1;
      tx.create(markerRef, { schemaVersion: 1, v: 2, accountRetention: true, readIdentity: 1, cardProjection: 1,
        cardReady: false, cardBackfillId: target, erasureRevision: 0, prunedThrough: from.get('prunedThrough') ?? -1 });
      tx.create(jobRef, { v: 1, source, target, sourceIncarnation: generationStamp(from), controlRevision: revision,
        phase: 'backfill', version: 0, after: null, batchSize: 50, scanned: 0 });
      tx.set(controlRef, { ...state, schemaVersion: 2, revision, mode: 'building',
        writeGenerationIds: [...state.writeGenerationIds, target],
        cardWriteGenerationIds: [...(state.cardWriteGenerationIds ?? []), target], cardReadGenerationId: state.cardReadGenerationId ?? null });
      return { phase: 'backfill' };
    });
  }
  async function step() {
    let attempted;
    try {
      return await database.runTransaction(async tx => {
        const current = await guard(tx, ['backfill']); attempted = current.data;
        let query = db.collection('shouts').orderBy(FieldPath.documentId()).limit(current.data.batchSize);
        if (current.data.after) query = query.startAfter(current.data.after);
        const page = await tx.get(query);
        const authors = [...new Set(page.docs.map(doc => doc.get('authorId')).filter(Boolean))];
        const profiles = authors.length ? await tx.getAll(...authors.map(uid => db.doc(`publicProfiles/${uid}`))) : [];
        const erased = new Set(profiles.filter(doc => doc.get('accountStatus') === 'deleted').map(doc => doc.id));
        const changes = page.docs.filter(doc => !erased.has(doc.get('authorId')) && !isPurgedShoutContext(doc.data()))
          .map(doc => ({ id: doc.id, before: doc.data(), after: doc.data() }));
        const plan = await runtime.indexWriter.prepareBatch(tx, changes, { cardBackfill: target, additionalWrites: 1,
          operationId: digest([target, current.job.createTime.toMillis(), current.data.version]) });
        plan.apply();
        const phase = page.size < current.data.batchSize ? 'audit' : 'backfill';
        tx.update(jobRef, { phase, version: current.data.version + 1, after: page.docs.at(-1)?.id ?? current.data.after,
          scanned: current.data.scanned + page.size });
        return { phase, scanned: page.size, cardWrites: plan.cardWrites, indexWrites: plan.nodeWrites + plan.directoryWrites + plan.historyWrites };
      });
    } catch (error) {
      if (!attempted || !['lab-mutation-too-large', 'feed-transaction-write-budget-exceeded'].includes(error.message) || attempted.batchSize === 1) throw error;
      return database.runTransaction(async tx => {
        const current = await guard(tx, ['backfill']);
        if (current.data.version !== attempted.version) throw new Error('card-backfill-step-changed');
        tx.update(jobRef, { batchSize: Math.max(1, Math.floor(attempted.batchSize / 2)), version: attempted.version + 1 });
        return { phase: 'backfill', resized: true, scanned: 0 };
      });
    }
  }
  async function beginAudit() {
    return database.runTransaction(async tx => {
      const current = await guard(tx, ['audit', 'auditing']);
      const pin = { readTime: current.marker.readTime, cutoff: current.marker.get('prunedThrough') ?? -1,
        erasureRevision: current.marker.get('erasureRevision') ?? 0, sourceErasure: current.from.get('erasureRevision') ?? 0,
        part: 'source', after: null, rootAfter: null, rootsDone: false, queue: [],
        sourcePublic: empty(), actualPublic: empty(), sourceIndex: empty(), actualIndex: empty() };
      tx.update(jobRef, { phase: 'auditing', audit: pin, version: current.data.version + 1 });
      return { phase: 'auditing' };
    });
  }
  async function auditStep() {
    const current = await database.runTransaction(tx => guard(tx, ['auditing']), { readOnly: true });
    const pin = JSON.parse(JSON.stringify(current.data.audit));
    const readTime = current.data.audit.readTime;
    if (!(readTime instanceof Timestamp)) throw new Error('invalid-card-audit');
    await db.runTransaction(async tx => {
      const marker = await tx.get(markerRef);
      if (!marker.exists || !marker.createTime.isEqual(current.marker.createTime)) throw new Error('stale-card-backfill');
      if (pin.part === 'source' || pin.part === 'states') {
        let query = (pin.part === 'source' ? db.collection('shouts') : markerRef.collection('publicStates'))
          .orderBy(FieldPath.documentId()).limit(50);
        if (pin.after) query = query.startAfter(pin.after);
        const page = await tx.get(query);
        const authors = [...new Set(page.docs.map(doc => doc.get('authorId')).filter(Boolean))];
        const profiles = authors.length ? await tx.getAll(...authors.map(uid => db.doc(`publicProfiles/${uid}`))) : [];
        const deleted = new Set(profiles.filter(doc => doc.get('accountStatus') === 'deleted').map(doc => doc.id));
        for (const doc of page.docs) {
          if (pin.part === 'states') { add(pin.actualPublic, [doc.id, doc.data()]); continue; }
          if (isPurgedShoutContext(doc.data()) || deleted.has(doc.get('authorId'))) continue;
          add(pin.sourcePublic, [doc.id, publicCardState(doc.id, doc.data())]);
          if (doc.get('status') === 'active' && doc.get('expiresAt').toMillis() > pin.cutoff) {
            add(pin.sourceIndex, metadataOf({ ...doc.data(), id: doc.id }, { contentIdentity: true, cardProjection: true }));
          }
        }
        pin.after = page.docs.at(-1)?.id ?? pin.after;
        if (page.size < 50) { pin.part = pin.part === 'source' ? 'states' : 'index'; pin.after = null; }
      } else if (pin.part === 'index') {
        if (!pin.queue.length && !pin.rootsDone) {
          let query = markerRef.collection('cells').orderBy(FieldPath.documentId()).limit(16);
          if (pin.rootAfter) query = query.startAfter(pin.rootAfter);
          const roots = await tx.get(query);
          pin.queue.push(...roots.docs.map(doc => ({ hash: doc.get('hash'), path: doc.id })));
          pin.rootAfter = roots.docs.at(-1)?.id ?? pin.rootAfter; pin.rootsDone = roots.size < 16;
        }
        for (let work = 0; work < 32 && pin.queue.length; work++) {
          const item = pin.queue.shift(), doc = await tx.get(markerRef.collection('nodes').doc(item.hash));
          const node = verifyNode(item.hash, doc.data(), { cardProjection: true });
          if (!node.path.startsWith(item.path)) throw new Error('card-audit-path');
          if (node.rows) node.rows.forEach(row => add(pin.actualIndex, row));
          else pin.queue.push(...Object.values(node.children).map(child => ({ hash: child.hash, path: child.path })));
        }
        if (!pin.queue.length && pin.rootsDone) pin.part = 'done';
      } else throw new Error('invalid-card-audit-phase');
    }, { readOnly: true, readTime });
    return database.runTransaction(async tx => {
      const fresh = await guard(tx, ['auditing']);
      if (fresh.data.version !== current.data.version) throw new Error('card-audit-step-changed');
      if (fresh.marker.get('activeErasure') || (fresh.marker.get('erasureRevision') ?? 0) !== pin.erasureRevision ||
          (fresh.from.get('erasureRevision') ?? 0) !== pin.sourceErasure) throw new Error('card-audit-retention-changed');
      let phase = 'auditing';
      if (pin.part === 'done') {
        if (canonical(pin.sourcePublic) !== canonical(pin.actualPublic) || canonical(pin.sourceIndex) !== canonical(pin.actualIndex)) throw new Error('card-audit-coverage-mismatch');
        phase = 'ready'; tx.update(markerRef, { cardReady: true });
      }
      tx.update(jobRef, { phase, audit: { ...pin, readTime }, version: fresh.data.version + 1 });
      return { phase, part: pin.part };
    });
  }
  return { begin, step, beginAudit, auditStep, jobRef, markerRef };
}
