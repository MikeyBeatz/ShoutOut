import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareModerationQueueDevRelease, assertModerationQueueRelease } from './moderation_queue_dev_release.mjs';
import { prepareFunctionArtifact } from './function_artifact.mjs';
import { businessLogoCandidate } from './rules/business_logo_candidate.mjs';
import { canonical } from '../functions/feed_block_index.js';
export const businessLogoProject = 'shoutout-dev-46c81';
// Exact current DEV predecessor (9df1b1b / F-01 Rules). Its deployed files do
// not contain the later inactive logo helper scaffolding in this worktree.
export const businessLogoBaselineRules = Object.freeze({
  firestore: '5b33f52df1832fd5d14890d0e77a76fb96866830ba8afeaf4bcf2c80a52e97f1',
  storage: 'd9c230499a65d2b4efb6572ac27c08e78316d4992e46ccf11f657c46cb53102c',
});
export const logoHash = value => createHash('sha256').update(canonical(value)).digest('hex');
const bytesHash = bytes => createHash('sha256').update(bytes).digest('hex');
export function assertBusinessLogoRelease(proof) {
  assertModerationQueueRelease(proof);
  if (!proof.ci.jobs.some(j => j.conclusion === 'success' &&
      j.steps.some(s => s.name === 'Test inactive Business logo processing and candidate Rules' && s.conclusion === 'success'))) throw Error('business-logo-full-ci-required');
}
export function prepareBusinessLogoDevRelease(root, phase = 'active') {
  if (!['active', 'rollback'].includes(phase)) throw Error('business-logo-release-phase');
  const base = prepareModerationQueueDevRelease(root, 'active'), target = resolve(root, `build/business-logo-release-${phase}`);
  mkdirSync(target, { recursive: true });
  const config = JSON.parse(readFileSync(base.config, 'utf8'));
  config.serverBusinessLogo = true; // Also during rollback: never reopen direct writes.
  const configPath = resolve(target, 'app-config.json'); writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  const beforeRules = readFileSync(base.rules, 'utf8'), beforeStorage = readFileSync(resolve(root, 'storage.rules'), 'utf8');
  const rules = resolve(target, 'firestore.rules'), storage = resolve(target, 'storage.rules');
  writeFileSync(rules, businessLogoCandidate(beforeRules).replaceAll('\r\n', '\n'));
  writeFileSync(storage, businessLogoCandidate(beforeStorage).replaceAll('\r\n', '\n'));
  const groups = {};
  for (const [key, entry, names, codebase] of [
    ['content', 'content.js', ['cleanupOperationReceipts'], 'default'],
    ['logos', 'business_logo_host.js', ['updateBusinessLogo'], 'business-logo'],
  ]) {
    const artifact = prepareFunctionArtifact(root, `functions-business-logo-${phase}-${key}`, entry), env = `.env.${businessLogoProject}`;
    writeFileSync(resolve(artifact.target, env), `SHOUTOUT_ARCHIVE_RELEASE_PHASE=active\nSHOUTOUT_MODERATION_QUEUE_PHASE=active\nSHOUTOUT_BUSINESS_LOGO_PHASE=${phase}\n`);
    groups[key] = { source: artifact.target, names, codebase, hashes: Object.fromEntries([...artifact.files, 'package.json', 'package-lock.json', env]
      .map(name => [name, bytesHash(readFileSync(resolve(artifact.target, name)))])) };
  }
  const manifest = { kind: 'business-logo-dev', projectId: businessLogoProject, phase,
    sourceCommit: base.manifest.sourceCommit, dirty: base.manifest.dirty, functions: groups,
    configSha256: bytesHash(readFileSync(configPath)), rulesSha256: bytesHash(readFileSync(rules)), storageSha256: bytesHash(readFileSync(storage)),
    beforeRulesSha256: businessLogoBaselineRules.firestore, beforeStorageSha256: businessLogoBaselineRules.storage };
  writeFileSync(resolve(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  // Deployment remains an explicit CLI action with a two-name filter.
  writeFileSync(resolve(target, 'functions.firebase.json'), JSON.stringify({ functions: Object.values(groups).map(g => ({ source: g.source, codebase: g.codebase })) }, null, 2) + '\n');
  writeFileSync(resolve(target, 'rules.firebase.json'), JSON.stringify({ firestore: { rules }, storage: { rules: storage } }, null, 2) + '\n');
  return { target, rules, storage, config: configPath, manifest };
}
export function assertBusinessLogoArtifact(root, manifest) {
  if (!manifest || manifest.dirty || canonical(prepareBusinessLogoDevRelease(root, manifest.phase).manifest) !== canonical(manifest)) throw Error('business-logo-artifact-source-drift');
}
