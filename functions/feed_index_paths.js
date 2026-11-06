// Fixed, server-owned bindings. No client-supplied collection/path is accepted.
const validId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(id);
const emulator = db => db?.projectId === 'shoutout-rules-test' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080';
export function assertFeedRuntimeTarget(db) {
  if (!['shoutout-dev-46c81', 'shoutout-production-a1b34'].includes(db?.projectId) && !emulator(db)) {
    throw new Error('feed-runtime-project-required');
  }
}
export function labIndexBinding(db, namespace, sourceCollection = null) {
  if (!emulator(db)) throw new Error('index-lab-emulator-only');
  if (!validId(namespace)) throw new Error('invalid-index-namespace');
  const base = db.collection('feedIndexLab').doc(namespace);
  return Object.freeze({ kind: 'lab', namespace, base, source: sourceCollection ?? base.collection('source') });
}
export function runtimeIndexBinding(db, namespace) {
  assertFeedRuntimeTarget(db);
  if (!validId(namespace)) throw new Error('invalid-index-namespace');
  return Object.freeze({ kind: 'runtime', namespace, base: db.doc(`feedIndexGenerations/${namespace}`), source: db.collection('shouts') });
}
export function assertIndexBinding(db, binding) {
  const { kind, namespace, base, source } = binding ?? {};
  if (!validId(namespace) || base?.firestore?.projectId !== db.projectId) throw new Error('invalid-index-binding');
  if (kind === 'lab') {
    if (!emulator(db) || base.path !== `feedIndexLab/${namespace}`) throw new Error('index-lab-emulator-only');
  } else {
    assertFeedRuntimeTarget(db);
    if (kind !== 'runtime' || base.path !== `feedIndexGenerations/${namespace}` || source?.path !== 'shouts' ||
        source.firestore?.projectId !== db.projectId) throw new Error('invalid-index-binding');
  }
}
