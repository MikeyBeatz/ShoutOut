// Read-only cloud evidence. Tokens remain inside the existing CLI credential flow.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonical } from '../functions/feed_block_index.js';
import { verifyModerationQueueRevisionDrain, moderationQueueWriterFunctions } from './feed_revision_drain.mjs';
import { moderationQueueCallables, moderationQueueProject as project } from './moderation_queue_dev_release.mjs';
const region = 'europe-west3';
const sha = value => createHash('sha256').update(canonical(value)).digest('hex');
export async function moderationCloudTransport() {
  if (process.env.FIRESTORE_EMULATOR_HOST) throw Error('moderation-queue-live-transport-required');
  const require = createRequire(resolve(import.meta.dirname, 'package.json')), cli = require('firebase-tools/lib/auth.js');
  const account = cli.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw Error('moderation-queue-existing-auth-required');
  const token = await cli.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  return async (method, resource, body = null) => {
    const url = new URL(resource);
    if (!['cloudfunctions.googleapis.com', 'cloudscheduler.googleapis.com', 'firebasehosting.googleapis.com', 'firebaserules.googleapis.com', 'run.googleapis.com', 'storage.googleapis.com', 'firestore.googleapis.com'].includes(url.hostname) ||
        !['GET', 'POST'].includes(method) || method === 'POST' && (!url.pathname.startsWith(`/v1/projects/${project}/databases/(default)/collectionGroups/`) || !url.pathname.endsWith('/indexes'))) throw Error('moderation-queue-unsafe-cloud-request');
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw Error(`moderation-queue-cloud-http-${response.status}`);
    return url.hostname === 'storage.googleapis.com' && url.searchParams.get('alt') === 'media'
      ? Buffer.from(await response.arrayBuffer()) : response.json();
  };
}
async function pages(call, url, field) {
  const rows = []; let token = null;
  do {
    const u = new URL(url); if (token) u.searchParams.set('pageToken', token);
    const result = await call('GET', u.href); rows.push(...result[field] ?? []); token = result.nextPageToken;
    if (rows.length > 1000) throw Error('moderation-queue-cloud-inventory-budget');
  } while (token);
  return rows;
}
export async function collectModerationCloudSnapshot(call) {
  const functions = await pages(call, `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${region}/functions?pageSize=100`, 'functions');
  const rows = functions.map(f => {
    if (!f.name.startsWith(`projects/${project}/locations/${region}/functions/`)) throw Error('moderation-queue-foreign-function');
    const s = f.serviceConfig;
    return { name: f.name.split('/').at(-1), state: f.state, runtime: f.buildConfig.runtime, service: s.service,
      revision: s.revision, memory: s.availableMemory, min: s.minInstanceCount ?? 0, max: s.maxInstanceCount,
      concurrency: s.maxInstanceRequestConcurrency, timeout: s.timeoutSeconds, cpu: s.availableCpu,
      ingress: s.ingressSettings, serviceAccount: s.serviceAccountEmail,
      secrets: s.secretEnvironmentVariables ?? [], env: s.environmentVariables ?? {}, source: f.buildConfig.source.storageSource };
  }).sort((a, b) => a.name.localeCompare(b.name));
  for (const f of rows.filter(f => [...moderationQueueWriterFunctions, ...moderationQueueCallables].includes(f.name))) {
    const iam = await call('GET', `https://run.googleapis.com/v2/${f.service}:getIamPolicy`);
    f.iamSha256 = sha({ version: iam.version ?? 1, bindings: (iam.bindings ?? []).map(b => ({ role: b.role,
      members: [...b.members ?? []].sort(), condition: b.condition ?? null })).sort((a, b) => canonical(a).localeCompare(canonical(b))) });
  }
  const jobs = await pages(call, `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${region}/jobs?pageSize=100`, 'jobs');
  const releases = await call('GET', `https://firebasehosting.googleapis.com/v1beta1/sites/${project}/releases?pageSize=1`);
  const rules = {};
  for (const name of ['cloud.firestore', `firebase.storage/${project}.firebasestorage.app`]) {
    const r = await call('GET', `https://firebaserules.googleapis.com/v1/projects/${project}/releases/${name}`);
    rules[name] = r.rulesetName;
  }
  const value = { projectId: project, functions: rows, rules, hosting: releases.releases?.[0]?.version?.name,
    jobs: jobs.map(j => ({ name: j.name, schedule: j.schedule, timeZone: j.timeZone, state: j.state, target: j.httpTarget?.uri })).sort((a, b) => a.name.localeCompare(b.name)) };
  return { ...value, digest: sha(value) };
}
export function validateModerationCloudSnapshot(value) {
  const { digest, ...body } = value ?? {};
  if (body.projectId !== project || digest !== sha(body)) throw Error('moderation-queue-invalid-cloud-snapshot');
}
export async function proveModerationQueueDeployment(call, before, manifest) {
  validateModerationCloudSnapshot(before);
  if (manifest?.projectId !== project || manifest.kind !== 'moderation-queue-dev' || manifest.dirty || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)) throw Error('moderation-queue-clean-artifact-required');
  const after = await collectModerationCloudSnapshot(call), selected = [...moderationQueueWriterFunctions, ...moderationQueueCallables];
  if (canonical(after.jobs) !== canonical(before.jobs) || canonical(after.rules) !== canonical(before.rules)) throw Error('moderation-queue-unexpected-environment-change');
  if (after.functions.length !== before.functions.length + moderationQueueCallables.length) throw Error('moderation-queue-function-count-drift');
  const services = [], revisions = {}, verified = [], sourceCache = new Map();
  for (const f of after.functions) {
    const old = before.functions.find(v => v.name === f.name);
    if (!selected.includes(f.name)) {
      if (canonical(f) !== canonical(old)) throw Error('moderation-queue-unrelated-function-change');
      continue;
    }
    if (f.state !== 'ACTIVE' || f.runtime !== 'nodejs22' || f.memory !== '256Mi' && f.memory !== '256M' && f.memory !== '256MiB' || f.min !== 0 || f.max !== 1 || f.concurrency !== 1 || f.timeout !== (['accountDeletionRequestCreatedDev', 'resumeAccountDeletionJobsDev', 'cleanupOperationReceipts'].includes(f.name) ? 60 : 15)) throw Error('moderation-queue-resource-drift');
    if (f.env.SHOUTOUT_MODERATION_QUEUE_PHASE !== manifest.phase || f.env.SHOUTOUT_ARCHIVE_RELEASE_PHASE !== 'active') throw Error('moderation-queue-deployed-phase-drift');
    if (old) for (const key of ['runtime', 'memory', 'min', 'max', 'concurrency', 'timeout', 'cpu', 'ingress', 'serviceAccount', 'secrets', 'service', 'iamSha256']) {
      if (canonical(old[key]) !== canonical(f[key])) throw Error('moderation-queue-existing-resource-change');
    }
    const group = Object.values(manifest.functions).find(g => g.names.includes(f.name));
    if (!group || !f.source?.bucket?.startsWith('gcf-v2-sources-') || !f.source.generation) throw Error('moderation-queue-source-required');
    const sourceKey = canonical(f.source); let hashes = sourceCache.get(sourceKey);
    if (!hashes) {
      const s = f.source, bytes = await call('GET', `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(s.bucket)}/o/${encodeURIComponent(s.object)}?alt=media&generation=${s.generation}`);
      hashes = JSON.parse(execFileSync('python', ['-c', "import sys,io,zipfile,json,hashlib; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if not n.endswith('/')}))"], { input: bytes, encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024 }));
      sourceCache.set(sourceKey, hashes);
    }
    for (const [name, digest] of Object.entries(group.hashes)) {
      const matches = Object.keys(hashes).filter(k => k === name || k.endsWith('/' + name));
      if (matches.length !== 1 || hashes[matches[0]] !== digest) throw Error('moderation-queue-deployed-source-mismatch');
    }
    if (Object.keys(hashes).filter(n => n.endsWith('.js')).length !== Object.keys(group.hashes).filter(n => n.endsWith('.js')).length) throw Error('moderation-queue-extra-deployed-modules');
    verified.push(f.name);
    if (old) {
      const service = await call('GET', `https://run.googleapis.com/v2/${f.service}`); services.push(service);
      revisions[f.service.split('/').at(-1)] = await pages(call, `https://run.googleapis.com/v2/${f.service}/revisions?pageSize=100`, 'revisions');
    }
  }
  const drain = verifyModerationQueueRevisionDrain(project, before.functions, after.functions, services, revisions);
  return { projectId: project, sourceCommit: manifest.sourceCommit, beforeDigest: before.digest, after, verified, drain, cloudWrites: 0 };
}
