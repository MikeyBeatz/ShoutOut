// R6b: legacy DEV tools may mutate canonical Shouts only while no index is
// maintained. This module never creates the control document or a generation.
const generationId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value);
const controlKeys = ['schemaVersion', 'revision', 'mode', 'readGenerationId', 'writeGenerationIds'];

export class FeedIndexAdminWriteBlocked extends Error {
  constructor() { super('feed-index-requires-managed-writer'); }
}

export function validateFeedIndexControl(data) {
  const invalid = () => { throw new Error('invalid-feed-index-control'); };
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).length !== controlKeys.length || Object.keys(data).some(key => !controlKeys.includes(key)) ||
      data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !['off', 'building', 'active', 'paused'].includes(data.mode) ||
      !(data.readGenerationId === null || generationId(data.readGenerationId)) ||
      !Array.isArray(data.writeGenerationIds) || data.writeGenerationIds.some(id => !generationId(id)) ||
      new Set(data.writeGenerationIds).size !== data.writeGenerationIds.length) invalid();
  const { mode, readGenerationId: reader, writeGenerationIds: writers } = data;
  if (reader !== null && !writers.includes(reader)) invalid();
  if (mode === 'off' && (reader !== null || writers.length !== 0) ||
      mode === 'active' && reader === null || mode === 'paused' && (reader !== null || !writers.length) ||
      mode === 'building' && writers.length <= (reader === null ? 0 : 1)) invalid();
  return { ...data, writeGenerationIds: [...writers] };
}

export function assertFeedAdminTarget(db) {
  if (db?.projectId !== 'shoutout-dev-46c81' &&
      !(db?.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080')) {
    throw new Error('feed-admin-dev-project-required');
  }
}

export async function assertLegacyFeedAdminWrite(transaction, db) {
  assertFeedAdminTarget(db);
  const control = await transaction.get(db.doc('feedIndexControl/current'));
  if (control.exists && validateFeedIndexControl(control.data()).mode !== 'off') throw new FeedIndexAdminWriteBlocked();
  // Missing control is compatible with the pre-index DEV project only if no
  // generation remains. A retained/paused generation also needs a writer.
  const generations = await transaction.get(db.collection('feedIndexGenerations').limit(1));
  if (!generations.empty) throw new FeedIndexAdminWriteBlocked();
}

export async function runLegacyFeedAdminTransaction(db, write) {
  assertFeedAdminTarget(db);
  if (typeof write !== 'function') throw new Error('feed-admin-write-callback-required');
  return db.runTransaction(async transaction => {
    await assertLegacyFeedAdminWrite(transaction, db);
    return write(transaction);
  });
}

export async function applyLegacyFeedAdminUpdates(db, changes) {
  assertFeedAdminTarget(db);
  if (!Array.isArray(changes) || changes.length > 450 || new Set(changes.map(change => change?.ref?.path)).size !== changes.length ||
      changes.some(change => !/^shouts\/[^/]+$/.test(change?.ref?.path ?? '') || change.ref.firestore?.projectId !== db.projectId ||
        !change.data || typeof change.data !== 'object' || Array.isArray(change.data) ||
        typeof change.updateTime?.toMillis !== 'function')) throw new Error('invalid-feed-admin-updates');
  if (!changes.length) return { updated: 0 };
  return runLegacyFeedAdminTransaction(db, transaction => {
    for (const change of changes) transaction.update(change.ref, change.data, { lastUpdateTime: change.updateTime });
    return { updated: changes.length };
  });
}
