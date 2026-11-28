import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareArchiveDevRelease } from './archive_dev_release.mjs';
import { assertTransitionRelease } from './feed_generation_transition.mjs';
import { moderationQueueWriterFunctions } from './feed_revision_drain.mjs';
import { prepareFunctionArtifact } from './function_artifact.mjs';
import { canonical } from '../functions/feed_block_index.js';
export const moderationQueueProject = 'shoutout-dev-46c81';
export const moderationQueueCallables = Object.freeze(['getModerationCasePage', 'startModerationCaseDecision', 'stepModerationCaseDecision']);
export const moderationQueueRequiredChecks = Object.freeze(['Test inactive moderation queue and large decisions', 'Test inactive content lifecycle', 'Test prepared moderation sanctions', 'Test prepared content report decisions']);
export function assertModerationQueueRelease(proof) {
  assertTransitionRelease(moderationQueueProject, proof);
  if (!moderationQueueRequiredChecks.every(name => proof.ci.jobs.some(job => job.conclusion === 'success' &&
      job.steps.some(step => step.name === name && step.conclusion === 'success')))) throw Error('moderation-queue-full-matrix-required');
}
export function prepareModerationQueueDevRelease(root, phase = 'active') {
  if (!['active', 'rollback'].includes(phase)) throw Error('moderation-queue-invalid-release-phase');
  const prepared = prepareArchiveDevRelease(root, 'active');
  const config = JSON.parse(readFileSync(prepared.config, 'utf8'));
  config.serverModerationQueue = true; // Rollback keeps the complete, compatible queue.
  const target = resolve(root, `build/moderation-queue-release-${phase}`); mkdirSync(target, { recursive: true });
  const configPath = resolve(target, 'app-config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  const groups = {};
  for (const [key, group] of Object.entries(prepared.manifest.functions)) {
    if (!['content', 'accounts'].includes(key)) continue;
    const artifact = prepareFunctionArtifact(root, `functions-moderation-queue-${phase}-${key}`, key === 'content' ? 'content.js' : 'account_deletion_dev.js');
    const envName = `.env.${moderationQueueProject}`;
    writeFileSync(resolve(artifact.target, envName), `SHOUTOUT_ARCHIVE_RELEASE_PHASE=active\nSHOUTOUT_MODERATION_QUEUE_PHASE=${phase}\n`);
    groups[key] = { source: artifact.target, names: [...moderationQueueWriterFunctions.filter(name => group.names.includes(name)),
      ...(key === 'content' ? moderationQueueCallables : [])], hashes: Object.fromEntries([...artifact.files, 'package.json', 'package-lock.json', envName]
        .map(name => [name, createHash('sha256').update(readFileSync(resolve(artifact.target, name))).digest('hex')])) };
  }
  const manifest = { ...prepared.manifest, kind: 'moderation-queue-dev', phase, functions: groups,
    configSha256: createHash('sha256').update(readFileSync(configPath)).digest('hex') };
  writeFileSync(resolve(target, 'moderation-queue-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { ...prepared, target, config: configPath, manifest };
}
export function assertModerationQueueArtifact(root, manifest) {
  if (!manifest || manifest.dirty || !['active', 'rollback'].includes(manifest.phase) ||
      canonical(prepareModerationQueueDevRelease(root, manifest.phase).manifest) !== canonical(manifest)) throw Error('moderation-queue-artifact-source-drift');
}
