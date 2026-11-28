import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { feedAdminDatabase } from './feed_admin_database.mjs';
import { inspectTransitionRelease } from './feed_generation_transition.mjs';
import { assertBusinessLogoRelease, businessLogoProject as project, logoHash } from './business_logo_dev_release.mjs';
import { validateBusinessLogoPlan } from './business_logo_dev.mjs';
import { openDevPilotAuth } from './dev_pilot_auth.mjs';
const root = resolve(import.meta.dirname, '..'), avatarFields = ['avatarId', 'avatarBackgroundStart', 'avatarBackgroundEnd', 'avatarGradientDirection'];
const require = createRequire(resolve(root, 'functions/package.json'));
const sharp = require('sharp'), { getStorage } = require('firebase-admin/storage');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = s => { throw Error('business-logo-pilot-' + s); };
function local(p) { const full = resolve(root, p ?? ''), rel = relative(root, full); if (!rel || rel.startsWith('..') || isAbsolute(rel)) fail('workspace-path'); return full; }
async function current(db, uid) {
  const rows = await db.getAll(db.doc(`users/${uid}`), db.doc(`publicProfiles/${uid}`), { fieldMask: [...avatarFields, 'businessLogoPath', 'businessLogoVersion'] });
  if (!rows.every(r => r.exists) || logoHash(rows[0].data()) !== logoHash(rows[1].data())) fail('profile-reference-drift');
  return rows[0].data();
}
async function receipts(db, uid) {
  const rows = await db.collection('serverOperations').where('userId', '==', uid).limit(2000).get();
  if (rows.size === 2000) fail('receipt-budget');
  return rows.docs.filter(r => r.get('action') === 'updateBusinessLogo').map(r => ({ id: r.id, data: r.data() }));
}
async function image(bucket, uid, path, color) {
  if (!new RegExp(`^businessLogos/${uid}/logo-[0-9]+\\.png$`).test(path ?? '')) fail('unexpected-image-path');
  const file = bucket.file(path), [meta] = await file.getMetadata(), [bytes] = await bucket.file(path, { generation: meta.generation }).download();
  await verifyBusinessLogoPilotImage(bytes, meta, color);
  return { path, generation: String(meta.generation), digest: digest(bytes), bytes };
}
export async function verifyBusinessLogoPilotImage(bytes, meta, color) {
  if (bytes.length > 2 * 1024 * 1024 || meta.metadata?.shoutoutLogoDigest !== digest(bytes) || meta.metadata?.firebaseStorageDownloadTokens) fail('image-metadata');
  const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== 512 || decoded.info.height !== 512 || decoded.info.channels !== 4) fail('image-shape');
  for (let n = 0; n < decoded.data.length; n += 4) if (!color.every((c, j) => j === 3 ? decoded.data[n + j] === c : Math.abs(decoded.data[n + j] - c) <= 1)) fail('unexpected-image-content');
}
export async function probeBusinessLogoConditionalWrite(bucket, uid, state, profile) {
  if (state.phase !== 'second' || profile.businessLogoPath !== state.B?.path) fail('second-image-required');
  const observed = await image(bucket, uid, state.B.path, state.colors.B);
  if (observed.generation !== state.B.generation) fail('probe-generation-drift');
  let rejected = false;
  try { await bucket.file(state.B.path).save(observed.bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: 'image/png', metadata: { shoutoutLogoDigest: observed.digest } } }); }
  catch (e) { if (Number(e.code) !== 412) throw e; rejected = true; }
  const [after] = await bucket.file(state.B.path).getMetadata();
  if (!rejected || String(after.generation) !== state.B.generation) fail('cloud-precondition-not-proven');
  return { httpStatus: 412, generationUnchanged: true, successfulCloudWrites: 0 };
}
export async function main(argv, { inspectRelease = inspectTransitionRelease, openDatabase = feedAdminDatabase, openStorage = openDevPilotAuth } = {}) {
  const [action, ...args] = argv, o = {};
  if (!['prepare', 'first', 'second', 'probe', 'finish'].includes(action) || args.length % 2) fail('explicit-action');
  for (let n = 0; n < args.length; n += 2) {
    if (!['--project', '--ci-run', '--plan', '--state', '--client-ready', '--approved-digest', '--confirm-project'].includes(args[n]) ||
        !args[n + 1] || Object.hasOwn(o, args[n])) fail('invalid-option');
    o[args[n]] = args[n + 1];
  }
  if (o['--project'] !== project || o['--confirm-project'] !== project || process.env.FIRESTORE_EMULATOR_HOST) fail('explicit-live-dev');
  if (action === 'prepare' && o['--client-ready'] !== 'TestBusiness') fail('available-client-required');
  const proof = inspectRelease(o); assertBusinessLogoRelease(proof);
  const plan = validateBusinessLogoPlan(JSON.parse(readFileSync(local(o['--plan']), 'utf8')), o['--approved-digest']);
  if (plan.sourceCommit !== proof.commit) fail('exact-source');
  const statePath = local(o['--state']), db = await openDatabase(project); let handle;
  try {
    if (db.projectId !== project) fail('explicit-live-dev');
    const uid = plan.inventory.actor.id, profile = await current(db, uid), control = await db.doc('businessLogoMaintenance/current').get();
    if (control.get('planDigest') !== plan.digest || !['active', 'paused'].includes(control.get('mode'))) fail('installed-control');
    handle = await openStorage(project);
    const bucket = getStorage(handle.auth.app).bucket(project + '.firebasestorage.app');
    const [files, next] = await bucket.getFiles({ prefix: `businessLogos/${uid}/`, maxResults: 50, autoPaginate: false });
    if (next?.pageToken || files.length > 2) fail('object-budget');
    if (action === 'prepare') {
      if (control.get('mode') !== 'active') fail('active-control-required');
      if (existsSync(statePath)) {
        const previous = JSON.parse(readFileSync(statePath, 'utf8'));
        if (previous.planDigest !== plan.digest || previous.uid !== uid || previous.sourceCommit !== proof.commit) fail('state-source-drift');
        return { phase: previous.phase, files: previous.paths, cloudWrites: 0 };
      }
      if (files.length || profile.businessLogoPath || profile.businessLogoVersion) fail('nonempty-original');
      const originalAvatar = Object.fromEntries(avatarFields.map(f => [f, profile[f]]));
      if (logoHash(originalAvatar) !== logoHash(Object.fromEntries(avatarFields.map(f => [f, plan.inventory.actor.data[f]])))) fail('original-avatar-changed');
      const prior = await receipts(db, uid), directory = dirname(statePath);
      mkdirSync(directory, { recursive: true });
      const colors = { A: [24,160,133,255], B: [124,77,255,255] }, paths = {};
      for (const [name, color] of Object.entries(colors)) {
        const path = resolve(directory, `business-logo-${name}.png`);
        const png = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: color[0], g: color[1], b: color[2], alpha: 1 } } }).png().toBuffer();
        if (existsSync(path)) { if (digest(readFileSync(path)) !== digest(png)) fail('local-image-drift'); }
        else writeFileSync(path, png, { flag: 'wx' });
        paths[name] = path;
      }
      writeFileSync(statePath, JSON.stringify({ projectId: project, planDigest: plan.digest, sourceCommit: proof.commit, uid,
        phase: 'prepared', originalAvatar, priorReceiptIds: prior.map(r => r.id), colors, paths }, null, 2) + '\n', { flag: 'wx' });
      return { phase: 'prepared', files: paths, cloudWrites: 0 };
    }
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (state.planDigest !== plan.digest || state.uid !== uid || state.sourceCommit !== proof.commit) fail('state-source-drift');
    const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
    const fresh = (await receipts(db, uid)).filter(r => !state.priorReceiptIds.includes(r.id));
    if (fresh.some(r => r.data.result?.status !== 'complete' || r.data.keyVersion !== 1 ||
        r.data.expiresAt?.toMillis() - r.data.createdAt?.toMillis() !== 7 * 86400000)) fail('receipt-retention');
    if (action === 'first' || action === 'second') {
      const label = action === 'first' ? 'A' : 'B';
      if (fresh.length !== (label === 'A' ? 1 : 2) || files.length !== 1 || !fresh.some(r => r.data.result.path === profile.businessLogoPath)) fail('publication-count');
      const observed = await image(bucket, uid, profile.businessLogoPath, state.colors[label]);
      if (label === 'B' && (!state.A || state.A.path === observed.path)) fail('replacement-required');
      const { bytes, ...record } = observed; void bytes;
      state[label] = record; state.phase = action; save();
      return { phase: state.phase, objects: files.length, receipts: fresh.length, cloudWrites: 0 };
    }
    if (action === 'probe') {
      if (files.length !== 1) fail('second-image-required');
      const result = await probeBusinessLogoConditionalWrite(bucket, uid, state, profile);
      state.phase = 'probe'; state.conditionalCreateRejected = true; save();
      return { phase: 'probe', ...result };
    }
    if (state.phase !== 'probe' || !state.conditionalCreateRejected || files.length || profile.businessLogoPath || profile.businessLogoVersion ||
        logoHash(Object.fromEntries(avatarFields.map(f => [f, profile[f]]))) !== logoHash(state.originalAvatar) || fresh.length !== 3 ||
        !fresh.some(r => r.data.result.path === null)) fail('original-avatar-not-restored');
    state.phase = 'finished'; save();
    return { phase: 'finished', originalAvatarRestored: true, files: 0, receiptsRetained: 3, quotaReset: false, cloudWrites: 0 };
  } finally { await db.terminate(); if (handle) await handle.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(r => process.stdout.write(JSON.stringify(r) + '\n'))
    .catch(error => { process.stderr.write((/^business-logo-/.test(error.message ?? '') ? error.message : 'business-logo-pilot-command-failed') + '\n'); process.exitCode = 1; });
}
