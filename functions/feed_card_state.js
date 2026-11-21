// Generation-bound B4 publisher. The runtime opt-in remains false in hosts.
import { isDeepStrictEqual } from 'node:util';
import { bodyProjection } from './feed_body_contract.js';
import { selectionIdentity } from './feed_body_state.js';
import { isPurgedShoutContext } from './shout_context.js';
import { validateFeedIndexControl } from './feed_index_admin_guard.js';

const publishers = new WeakMap(), planned = new WeakMap(), sourceSnapshots = new WeakMap();
const usable = value => value && !isPurgedShoutContext(value);
const validRevision = value => Number.isSafeInteger(value) && value >= 0;
const snapshotValue = value => Array.isArray(value) ? value.map(snapshotValue) :
  value && Object.getPrototypeOf(value) === Object.prototype ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshotValue(item)])) : value;
export function publicCardState(id, source, revision = source?.cardRevision ?? 0) {
  if (!usable(source)) return null;
  if (!validRevision(revision)) throw new Error('invalid-card-revision');
  return { schemaVersion: 1, ...bodyProjection(source).state,
    createdAt: source.createdAt.toMillis(), selectionVersion: selectionIdentity({ ...source, id }), revision };
}
export function bindCardPublisher(db, publisher) { publishers.set(db, publisher); }
export function observeCardSources(tx, result) {
  let observed = sourceSnapshots.get(tx); if (!observed) { observed = new Map(); sourceSnapshots.set(tx, observed); }
  for (const doc of Array.isArray(result) ? result : result.docs ?? [result]) {
    if (/^shouts\/[^/]+$/.test(doc.ref?.path ?? '')) observed.set(doc.id, doc.exists ? snapshotValue(doc.data()) : null);
  }
  return result;
}
export async function prepareCardMutation(db, tx, id, before, after, options = {}) {
  if (publishers.has(db)) return publishers.get(db).prepare(tx, id, before, after, options);
  const control = await tx.get(db.doc('feedIndexControl/current'));
  if (control.exists && (validateFeedIndexControl(control.data()).cardWriteGenerationIds ?? []).length) throw new Error('card-publisher-required');
  return null;
}
export function registerCardSourcePlan(tx, changes) {
  let entries = planned.get(tx); if (!entries) { entries = new Map(); planned.set(tx, entries); }
  for (const change of changes) {
    if (entries.has(change.id)) throw new Error('duplicate-card-source-plan');
    entries.set(change.id, { ...change, before: snapshotValue(change.before), after: snapshotValue(change.after),
      required: !isDeepStrictEqual(change.before, change.after), written: false, applied: false });
  }
  return () => changes.forEach(change => { entries.get(change.id).applied = true; });
}
export function assertCardTransaction(tx) {
  if ([...(planned.get(tx)?.values() ?? [])].some(entry => entry.written && !entry.applied || entry.required && !entry.written)) throw new Error('unapplied-card-source-plan');
}
// The runtime intercepts only root Shout mutations, after all planning reads.
// This also detects a newly added writer that forgot the shared publisher.
export function cardSourceMutation(tx, method, args) {
  const [ref, data, ...tail] = args;
  if (!/^shouts\/[^/]+$/.test(ref?.path ?? '')) return args;
  const entry = planned.get(tx)?.get(ref.id);
  if (!entry || entry.written) throw new Error('unplanned-card-source-write');
  if (entry.before === null && method !== 'create' && sourceSnapshots.get(tx)?.get(ref.id) !== null) throw new Error('unread-card-source-write');
  if (method === 'update' && (!data || Object.getPrototypeOf(data) !== Object.prototype || Object.keys(data).some(key => key.includes('.')))) throw new Error('unsupported-card-source-patch');
  if (method === 'set' && tail[0]) throw new Error('unsupported-card-source-merge');
  const result = method === 'delete' ? null : method === 'update' ? { ...entry.before, ...data } : data;
  const normalize = value => usable(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'cardRevision')) : null;
  if (!isDeepStrictEqual(normalize(result), normalize(entry.after))) throw new Error('card-source-plan-mismatch');
  entry.written = true;
  return method === 'delete' || !usable(result) ? args : [ref, { ...data, cardRevision: entry.revision }, ...tail];
}

export async function prepareCardStates(tx, db, changes, control, generationContext, { cardBackfill = null } = {}) {
  const generations = control.cardWriteGenerationIds ?? [];
  const getProfile = async uid => {
    if (!generationContext.profiles.has(uid)) generationContext.profiles.set(uid, await tx.get(db.doc(`publicProfiles/${uid}`)));
    return generationContext.profiles.get(uid);
  };
  const edits = [];
  for (const change of changes) {
    if (change.before !== null && !isDeepStrictEqual(sourceSnapshots.get(tx)?.get(change.id), change.before)) throw new Error('card-source-snapshot-required');
    const before = publicCardState(change.id, change.before), next = publicCardState(change.id, change.after);
    const changed = !isDeepStrictEqual(before, next);
    const revision = (before?.revision ?? 0) + Number(changed);
    if (!validRevision(revision)) throw new Error('card-revision-exhausted');
    const uid = next?.authorId ?? before?.authorId;
    const erased = uid && (await getProfile(uid)).get('accountStatus') === 'deleted';
    if (erased && next?.status === 'active' && !before) throw new Error('card-author-erased');
    edits.push({ ...change, revision, before: change.before, after: change.after,
      oldState: before, nextState: erased || !next ? null : { ...next, revision } });
  }
  const writes = [];
  for (const generation of generations) {
    const marker = generationContext.markers.get(generation);
    if (marker?.get('cardProjection') !== 1 || marker.get('v') !== 2) throw new Error('card-generation-required');
    const refs = edits.map(edit => db.doc(`feedIndexGenerations/${generation}/publicStates/${edit.id}`));
    const docs = refs.length ? await tx.getAll(...refs) : [];
    for (const [i, edit] of edits.entries()) {
      const current = docs[i].exists ? docs[i].data() : null;
      if (current && !isDeepStrictEqual(current, edit.oldState)) throw new Error('card-projection-inconsistent');
      if (!current && edit.oldState && generation !== cardBackfill && marker.get('cardReady') === true &&
          (await getProfile(edit.oldState.authorId)).get('accountStatus') !== 'deleted') throw new Error('card-projection-missing');
      if (!isDeepStrictEqual(current, edit.nextState)) writes.push({ ref: refs[i], state: edit.nextState });
    }
  }
  return { writes: writes.length, edits,
    apply() { for (const { ref, state } of writes) { if (state) tx.set(ref, state); else tx.delete(ref); } } };
}
