// Local operator core only. It never observes Auth or creates contact/identity
// records. A real, previously accepted observation is mandatory.
import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { canonical } from './feed_block_index.js';
import { requireIdentityRuntime, identityId, identityNow, validateIdentityAccount } from './archive_identity.js';
import { currentLegalPolicy, legalPolicy } from './legal_policy.js';
import { validateLifecycleArchive, validateLifecycleThread, lifecycleSubjectDeadline } from './content_lifecycle.js';

const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
const notBefore = (a, b) => a instanceof Timestamp && b instanceof Timestamp && (a.seconds > b.seconds || a.seconds === b.seconds && a.nanoseconds >= b.nanoseconds);
const stamp = t => t instanceof Timestamp ? [t.seconds, t.nanoseconds] : null;
const proof = d => d.exists ? { createTime: stamp(d.createTime), updateTime: stamp(d.updateTime), hash: hash(d.data()) } : null;
const same = (a, b) => canonical(a) === canonical(b);
const fail = code => { throw new Error(code); };
const pathList = paths => {
  if (!Array.isArray(paths) || !paths.length || paths.length > 50 || new Set(paths).size !== paths.length ||
      paths.some(p => typeof p !== 'string' || !/^contentLifecycleArchive\/[a-f0-9]{64}$/.test(p))) fail('invalid-identity-adoption-paths');
  return [...paths].sort();
};
function policyFor(value) {
  const policy = legalPolicy(value);
  if (!policy.archiveDisclosureEnabled) fail('identity-adoption-disclosure-required');
  return policy;
}
async function inspect(tx, runtime, paths, policy) {
  const { db, codec, clock } = runtime, now = identityNow(clock), entries = [], changes = [];
  const cache = new Map();
  const reader = {
    async getAll(...refs) {
      const missing = [...new Map(refs.filter(r => !cache.has(r.path)).map(r => [r.path, r])).values()];
      if (missing.length) {
        const rows = await tx.getAll(...missing);
        rows.forEach((row, n) => cache.set(missing[n].path, row));
      }
      return refs.map(ref => cache.get(ref.path));
    },
    async get(ref) { return (await this.getAll(ref))[0]; },
  };
  for (const path of paths) {
    const archive = await reader.get(db.doc(path));
    const entry = { path, action: 'blocked', reason: null, accountKey: null, bindingDigest: null, proofs: { archive: proof(archive) } };
    entries.push(entry);
    const blocked = reason => { entry.reason = reason; };
    if (!archive.exists) { blocked('archive-missing'); continue; }
    const data = archive.data();
    if (!['shout', 'comment'].includes(data.kind)) { blocked('public-content-only'); continue; }
    try { validateLifecycleArchive(db, archive.id, data); } catch { blocked('archive-proof-invalid'); continue; }
    const uid = data.content.authorId;
    const [current, profile, deletion, legal, thread, source] = await reader.getAll(
      db.doc(`archiveIdentityCurrent/${uid}`), db.doc(`users/${uid}`), db.doc(`accountDeletionRequests/${uid}`),
      db.doc(`users/${uid}/legal/${policy.acceptanceDocument}`), db.doc(`contentLifecycleThreads/${data.threadId}`), db.doc(data.sourcePath));
    Object.assign(entry.proofs, { current: proof(current), profile: proof(profile), deletion: proof(deletion),
      legal: proof(legal), thread: proof(thread), source: proof(source) });
    if (deletion.exists || !profile.exists) { blocked('author-deleted-or-pending'); continue; }
    if (!legal.exists || legal.get('termsVersion') !== policy.version || legal.get('privacyVersion') !== policy.version ||
        legal.get('ageConfirmed') !== true || !(legal.get('acceptedAt') instanceof Timestamp)) { blocked('disclosure-not-accepted'); continue; }
    if (!identityId(current.get('accountKey'))) { blocked('author-not-observed'); continue; }
    const account = await reader.get(db.doc(`archiveIdentityAccounts/${current.get('accountKey')}`));
    entry.proofs.account = proof(account);
    let identity;
    try { identity = validateIdentityAccount(account.data(), codec, account.id); } catch { blocked('account-proof-invalid'); continue; }
    if (identity.userId !== uid || !identity.profileCreateTime.isEqual(profile.createTime) ||
        !current.get('profileCreateTime')?.isEqual(profile.createTime) || current.get('authCreatedAtMillis') !== identity.authCreatedAtMillis ||
        identity.deletionClosedAt !== undefined || identity.deletionRequestCreateTime !== undefined ||
        legal.get('acceptedAt').toMillis() > identity.observedAt.toMillis()) { blocked('account-incarnation-unproven'); continue; }
    // Atomic copies share their source's SDK commit. Transition copies must
    // carry its actual SDK createTime, never a guessed publication timestamp.
    const sourceBirth = data.sourceCreateTime ?? (data.captureMode !== 'transition' ? archive.createTime : null);
    if (!(sourceBirth instanceof Timestamp) || sourceBirth.toMillis() < identity.authCreatedAtMillis ||
        !notBefore(sourceBirth, profile.createTime) || data.sourceCreatedAt.toMillis() < identity.authCreatedAtMillis ||
        !notBefore(data.sourceCreatedAt, profile.createTime) || !notBefore(archive.createTime, sourceBirth) ||
        source.exists && (!source.createTime.isEqual(sourceBirth) || !source.get('createdAt')?.isEqual(data.sourceCreatedAt))) {
      blocked('source-incarnation-unproven'); continue;
    }
    let header;
    try { header = validateLifecycleThread(thread.data(), data.threadId); } catch { blocked('thread-proof-invalid'); continue; }
    if (!header.sourceCreatedAt.isEqual(data.threadCreatedAt)) { blocked('thread-incarnation-unproven'); continue; }
    const deadline = await lifecycleSubjectDeadline(reader, db, data.subjectUserIds, header.retainUntil);
    if (deadline.retainUntil.toMillis() <= now.toMillis()) { blocked('archive-expired'); continue; }
    entry.accountKey = account.id;
    if (data.authorAccountKey !== undefined) {
      if (data.authorAccountKey !== account.id) { blocked('different-author-binding'); continue; }
      entry.action = 'bound';
      entry.bindingDigest = data.authorBindingDigest ?? null;
    } else {
      entry.action = 'bind';
      changes.push({ ref: archive.ref, accountKey: account.id });
    }
  }
  return { entries, changes, documentReads: cache.size };
}
export async function planArchiveIdentityAdoption(runtime, paths, { disclosurePolicy = currentLegalPolicy() } = {}) {
  requireIdentityRuntime(runtime);
  const policy = policyFor(disclosurePolicy), ordered = pathList(paths);
  return runtime.db.runTransaction(async tx => {
    const { entries, documentReads } = await inspect(tx, runtime, ordered, policy);
    const value = { v: 1, kind: 'archive-identity-adoption', projectId: runtime.db.projectId,
      policyVersion: policy.version, keyVersion: runtime.codec.keyVersion, entries, documentReads };
    return { ...value, digest: hash(value) };
  }, { readOnly: true });
}
export function validateArchiveIdentityAdoption(plan, projectId, approvedDigest = plan?.digest) {
  if (!plan || Object.keys(plan).sort().join(',') !== 'digest,documentReads,entries,keyVersion,kind,policyVersion,projectId,v') fail('invalid-identity-adoption-plan');
  const { digest, ...value } = plan;
  if (plan.v !== 1 || plan.kind !== 'archive-identity-adoption' || plan.projectId !== projectId ||
      !identityId(digest) || approvedDigest !== digest || hash(value) !== digest) fail('invalid-identity-adoption-plan');
  pathList(plan.entries?.map(e => e.path));
  return plan;
}
export async function applyArchiveIdentityAdoption(runtime, plan, { approvedDigest, disclosurePolicy = currentLegalPolicy(), beforeCommit = null } = {}) {
  requireIdentityRuntime(runtime);
  validateArchiveIdentityAdoption(plan, runtime.db.projectId, approvedDigest);
  const policy = policyFor(disclosurePolicy);
  if (approvedDigest !== plan.digest || plan.policyVersion !== policy.version || plan.keyVersion !== runtime.codec.keyVersion) fail('identity-adoption-approved-policy-required');
  return runtime.db.runTransaction(async tx => {
    // Receipt is retained with the archive, not a new unbounded collection.
    const inspected = await inspect(tx, runtime, pathList(plan.entries.map(e => e.path)), policy);
    if (inspected.entries.some(e => e.action === 'blocked')) fail('identity-adoption-blocked');
    const replay = inspected.entries.every(e => e.action === 'bound') && inspected.entries.every(e =>
      plan.entries.some(p => p.path === e.path && p.accountKey === e.accountKey &&
        (p.action === 'bound' || e.bindingDigest === plan.digest)));
    // Replays still re-prove all identity/deletion/deadline constraints above.
    if (replay) return { state: 'already-bound', writes: 0, documentReads: inspected.documentReads };
    if (!same(inspected.entries, plan.entries)) fail('identity-adoption-proof-drift');
    if (inspected.changes.length > 450) fail('feed-transaction-write-budget-exceeded');
    for (const change of inspected.changes) tx.update(change.ref, { authorAccountKey: change.accountKey,
      authorBindingDigest: plan.digest, authorBoundAt: FieldValue.serverTimestamp() });
    if (beforeCommit) await beforeCommit();
    return { state: 'bound', writes: inspected.changes.length, documentReads: inspected.documentReads };
  });
}
