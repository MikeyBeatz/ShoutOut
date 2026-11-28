import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { requiredTransitionChecks } from './feed_generation_transition.mjs';
import { moderationQueueRequiredChecks } from './moderation_queue_dev_release.mjs';
import { prepareBusinessLogoDevRelease, assertBusinessLogoRelease, logoHash } from './business_logo_dev_release.mjs';
import { main as operator, validateBusinessLogoPlan, validateBusinessLogoDeploymentProof, installBusinessLogoControl, changeBusinessLogoMode } from './business_logo_dev.mjs';
import { main as pilot, verifyBusinessLogoPilotImage, probeBusinessLogoConditionalWrite } from './business_logo_pilot.mjs';
import { createRequire } from 'node:module';
import { proveBusinessLogoBaselineRules } from './business_logo_dev_cloud.mjs';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..'), project = 'shoutout-dev-46c81';
const release = () => ({ branch: 'feature/logos', dirty: '', commit: 'a'.repeat(40), ci: { headSha: 'a'.repeat(40), status: 'completed',
  conclusion: 'success', workflowName: 'Flutter checks', jobs: [{ conclusion: 'success', steps: [...requiredTransitionChecks, ...moderationQueueRequiredChecks,
    'Test inactive Business logo processing and candidate Rules'].map(name => ({ name, conclusion: 'success' })) }] } });
export const sampleLogoPlan = () => {
  const body = { schemaVersion: 1, projectId: project, kind: 'business-logo-dev', sourceCommit: 'a'.repeat(40),
    inventory: { users: [], profiles: [], files: [], control: null, actor: { id: 'fixture' } },
    indexes: { changesTTL: false, actions: [] } };
  return { ...body, digest: logoHash(body) };
};
test('logo operator and pilot reject unapproved target, dirty source, missing full CI and unavailable client before credentials', async () => {
  assertBusinessLogoRelease(release());
  for (const alter of [p => p.dirty = ' M file', p => p.ci.headSha = 'b'.repeat(40), p => p.ci.jobs[0].steps.pop(),
    p => p.ci.jobs[0].steps[0].conclusion = 'skipped']) { const p = release(); alter(p); assert.throws(() => assertBusinessLogoRelease(p)); }
  const deps = { openDatabase: () => assert.fail('no credentials'), inspectRelease: () => ({ ...release(), dirty: 'dirty' }) };
  await assert.rejects(operator(['install','--project',project,'--ci-run','1'], deps), /clean-exact-full-ci/);
  await assert.rejects(operator(['install','--project','shoutout-production-a1b34'], deps), /explicit-live-dev/);
  await assert.rejects(pilot(['prepare','--project',project,'--confirm-project',project], deps), /available-client/);
});
test('active and rollback materialization preserve server client, all other archive/queue features and exact two-function scope', () => {
  for (const phase of ['active','rollback']) {
    const r = prepareBusinessLogoDevRelease(root, phase), c = JSON.parse(readFileSync(r.config));
    assert.equal(c.serverBusinessLogo, true); assert.equal(c.serverModerationQueue, true); assert.equal(c.serverContentLifecycle, true);
    assert.equal(c.legalVersion, '2026-11-27');
    assert.deepEqual(Object.values(r.manifest.functions).flatMap(g => g.names).sort(), ['cleanupOperationReceipts','updateBusinessLogo']);
    assert(readFileSync(r.rules,'utf8').includes('return true; // business-logo-gate'));
    assert(readFileSync(r.storage,'utf8').includes('return true; // business-logo-gate'));
    assert(readFileSync(resolve(r.manifest.functions.logos.source, '.env.'+project),'utf8').includes('SHOUTOUT_BUSINESS_LOGO_PHASE='+phase));
    const deploy = JSON.parse(readFileSync(resolve(r.target,'functions.firebase.json')));
    assert.deepEqual(deploy.functions.map(g => g.codebase), ['default','business-logo']);
  }
  assert.throws(() => prepareBusinessLogoDevRelease(root,'prod'));
});
test('plan/source/digest drift and unproven deployment cannot activate control; helpers refuse production', async () => {
  const p = sampleLogoPlan(); validateBusinessLogoPlan(p); assert.throws(() => validateBusinessLogoPlan({ ...p, sourceCommit: 'b'.repeat(40) }));
  const { digest, ...ttlBody } = p; void digest;
  ttlBody.indexes = { ...ttlBody.indexes, before: { ttlConfig: { state:'ACTIVE' } } };
  assert.throws(() => validateBusinessLogoPlan({ ...ttlBody,digest:logoHash(ttlBody) }),/invalid-plan/);
  assert.throws(() => validateBusinessLogoDeploymentProof(p, { functionsVerified:true, rulesVerified:true, webVerified:true }, release()));
  const db = { projectId:'shoutout-production-a1b34', runTransaction: () => assert.fail('no production write') };
  await assert.rejects(installBusinessLogoControl(db,p), /explicit-dev/);
  await assert.rejects(changeBusinessLogoMode(db,p,'off',1,'active'), /explicit-dev/);
});
test('predecessor Rule bytes must match the fixed approved baseline before planning', async () => {
  const hash = s => createHash('sha256').update(s).digest('hex');
  const manifest = { beforeRulesSha256: hash('firestore'), beforeStorageSha256: hash('storage') };
  const call = async (method, url) => {
    assert.equal(method, 'GET');
    if (url.includes('/releases/')) return { rulesetName: url.includes('cloud.firestore') ? 'firestore' : 'storage' };
    return { source: { files: [{ content: url.endsWith('firestore') ? 'firestore' : 'storage' }] } };
  };
  await proveBusinessLogoBaselineRules(call, manifest);
  await assert.rejects(proveBusinessLogoBaselineRules(call, { ...manifest, beforeStorageSha256: hash('unexpected') }), /baseline-rules-drift/);
});
test('the live conditional probe touches only a verified synthetic PNG and never compensates by deleting', async () => {
  const sharp = createRequire(new URL('../functions/package.json', import.meta.url))('sharp');
  const bytes = await sharp({ create: { width:512,height:512,channels:4,background:'#7c4dff' } }).png().toBuffer();
  const meta = { generation:'100',metadata:{shoutoutLogoDigest:createHash('sha256').update(bytes).digest('hex')} }, calls=[];
  const bucket = { file(path) { calls.push(path); return {
    getMetadata: async () => [meta], download:async()=>[bytes],
    save:async(data,options)=>{ assert.deepEqual(data,bytes); assert.equal(options.preconditionOpts.ifGenerationMatch,0); throw Object.assign(Error('expected'),{code:412}); },
  }; } };
  const state = { phase:'second',B:{path:'businessLogos/u/logo-1.png',generation:'100'},colors:{B:[124,77,255,255]} };
  assert.equal((await probeBusinessLogoConditionalWrite(bucket,'u',state,{businessLogoPath:state.B.path})).httpStatus,412);
  const before=calls.length;
  await assert.rejects(probeBusinessLogoConditionalWrite(bucket,'u',state,{businessLogoPath:'businessLogos/u/logo-2.png'}),/second-image-required/);
  assert.equal(calls.length,before);
  await assert.rejects(probeBusinessLogoConditionalWrite(bucket,'foreign',state,{businessLogoPath:state.B.path}),/unexpected-image-path/);
  assert.equal(calls.length,before);
  await assert.rejects(verifyBusinessLogoPilotImage(bytes,meta,[24,160,133,255]),/unexpected-image-content/);
  await assert.rejects(verifyBusinessLogoPilotImage(bytes,{...meta,metadata:{...meta.metadata,firebaseStorageDownloadTokens:'forbidden'}},state.colors.B),/image-metadata/);
});
