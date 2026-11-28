import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectModerationCloudSnapshot } from './moderation_queue_cloud.mjs';
import { verifyRevisionDrain } from './feed_revision_drain.mjs';
import { assertBusinessLogoArtifact, businessLogoProject as project, logoHash } from './business_logo_dev_release.mjs';
import { canonical } from '../functions/feed_block_index.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function proveBusinessLogoBaselineRules(call, manifest) {
  for (const [release, expected] of [['cloud.firestore', manifest.beforeRulesSha256],
    [`firebase.storage/${project}.firebasestorage.app`, manifest.beforeStorageSha256]]) {
    const r = await call('GET', `https://firebaserules.googleapis.com/v1/projects/${project}/releases/${release}`);
    const rules = await call('GET', 'https://firebaserules.googleapis.com/v1/' + r.rulesetName);
    if (rules.source?.files?.length !== 1 || sha(rules.source.files[0].content) !== expected) throw Error('business-logo-baseline-rules-drift');
  }
}
export async function proveBusinessLogoEnvironment(root, call, plan, manifest, { readPublic = url => fetch(url, { cache: 'no-store' }) } = {}) {
  assertBusinessLogoArtifact(root, manifest);
  if (manifest.sourceCommit !== plan.sourceCommit || manifest.projectId !== project) throw Error('business-logo-evidence-source');
  const after = await collectModerationCloudSnapshot(call), before = plan.before, selected = ['cleanupOperationReceipts', 'updateBusinessLogo'];
  if (after.functions.length !== before.functions.length + 1 || canonical(after.jobs) !== canonical(before.jobs)) throw Error('business-logo-unexpected-environment-change');
  const verified = [];
  for (const f of after.functions) {
    const old = before.functions.find(x => x.name === f.name);
    if (!selected.includes(f.name)) {
      if (canonical(f) !== canonical(old)) throw Error('business-logo-unrelated-function-change');
      continue;
    }
    if (f.state !== 'ACTIVE' || f.runtime !== 'nodejs22' || !['256Mi','256MiB','256M'].includes(f.memory) || f.min !== 0 || f.max !== 1 ||
        f.concurrency !== 1 || f.timeout !== (f.name === 'updateBusinessLogo' ? 15 : 60) ||
        f.env.SHOUTOUT_BUSINESS_LOGO_PHASE !== manifest.phase || f.env.SHOUTOUT_ARCHIVE_RELEASE_PHASE !== 'active' ||
        f.env.SHOUTOUT_MODERATION_QUEUE_PHASE !== 'active') throw Error('business-logo-resource-or-phase-drift');
    if (old) for (const key of ['runtime','memory','min','max','concurrency','timeout','cpu','ingress','serviceAccount','secrets','service','iamSha256']) {
      if (canonical(old[key]) !== canonical(f[key])) throw Error('business-logo-existing-resource-change');
    }
    if (!old && (f.serviceAccount !== before.functions.find(x => x.name === 'cleanupOperationReceipts').serviceAccount || f.secrets.length)) throw Error('business-logo-new-identity-or-secret');
    if (!old) {
      const policy = await call('GET', `https://run.googleapis.com/v2/${f.service}:getIamPolicy`);
      if (!policy.bindings?.some(b => b.role === 'roles/run.invoker' && b.members?.includes('allUsers') && !b.condition)) throw Error('business-logo-callable-transport-not-public');
    }
    const group = Object.values(manifest.functions).find(g => g.names.includes(f.name)), s = f.source;
    if (!group || !s?.bucket?.startsWith('gcf-v2-sources-') || !s.generation) throw Error('business-logo-source-required');
    const bytes = await call('GET', `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(s.bucket)}/o/${encodeURIComponent(s.object)}?alt=media&generation=${s.generation}`);
    const hashes = JSON.parse(execFileSync('python', ['-c', "import sys,io,zipfile,json,hashlib; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if not n.endswith('/')}))"],
      { input: bytes, encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024 }));
    for (const [name, digest] of Object.entries(group.hashes)) {
      const matches = Object.keys(hashes).filter(k => k === name || k.endsWith('/' + name));
      if (matches.length !== 1 || hashes[matches[0]] !== digest) throw Error('business-logo-deployed-source-mismatch');
    }
    if (Object.keys(hashes).filter(n => n.endsWith('.js')).length !== Object.keys(group.hashes).filter(n => n.endsWith('.js')).length) throw Error('business-logo-extra-deployed-modules');
    verified.push(f.name);
  }
  if (verified.length !== 2) throw Error('business-logo-two-functions-required');
  const old = before.functions.find(f => f.name === 'cleanupOperationReceipts'), current = after.functions.find(f => f.name === old.name);
  const service = await call('GET', `https://run.googleapis.com/v2/${current.service}`);
  const revisions = await call('GET', `https://run.googleapis.com/v2/${current.service}/revisions?pageSize=100`);
  if (revisions.nextPageToken) throw Error('business-logo-incomplete-revisions');
  const drain = verifyRevisionDrain(project, before.functions, after.functions, [service], { [current.service.split('/').at(-1)]: revisions.revisions ?? [] }, [current.name]);
  for (const [release, expected] of [['cloud.firestore', manifest.rulesSha256], [`firebase.storage/${project}.firebasestorage.app`, manifest.storageSha256]]) {
    const r = await call('GET', `https://firebaserules.googleapis.com/v1/projects/${project}/releases/${release}`);
    const rules = await call('GET', 'https://firebaserules.googleapis.com/v1/' + r.rulesetName);
    if (rules.source?.files?.length !== 1 || sha(rules.source.files[0].content) !== expected) throw Error('business-logo-rules-source-mismatch');
  }
  const web = JSON.parse(readFileSync(resolve(root, 'build/environments/dev.manifest.json'), 'utf8'));
  if (web.mode !== 'release' || !web.config.serverBusinessLogo || sha(JSON.stringify(web.config, null, 2) + '\n') !== manifest.configSha256) throw Error('business-logo-web-config-required');
  for (const [name, digest] of Object.entries(web.files)) {
    if (name.startsWith('/') || name.split('/').includes('..')) throw Error('business-logo-web-path');
    const response = await readPublic(`https://${project}.web.app/${name.split('/').map(encodeURIComponent).join('/')}?mvp-proof=${manifest.sourceCommit}`);
    if (!response.ok || sha(new Uint8Array(await response.arrayBuffer())) !== digest) throw Error('business-logo-web-file-mismatch');
  }
  const body = { projectId: project, sourceCommit: manifest.sourceCommit, planDigest: plan.digest, checkedAt: new Date().toISOString(),
    phase: manifest.phase, manifest, functionsVerified: true, rulesVerified: true, webVerified: true, cloud: after, drain };
  return { ...body, digest: logoHash(body) };
}
