// Committed release phase, not a client/Remote Config toggle. Only the exact
// DEV Cloud Functions project can activate it. Each phase needs exact full CI.
export const archiveDevDeploymentPhase = 'active';
export function archiveDeploymentProfile(env = process.env, phase = archiveDevDeploymentPhase) {
  if (!['off', 'capture', 'active', 'rollback'].includes(phase)) throw new Error('invalid-archive-deployment-phase');
  const override = env.SHOUTOUT_ARCHIVE_RELEASE_PHASE;
  if (override && override !== phase && !(phase === 'active' && override === 'rollback')) throw new Error('archive-deployment-phase-escalation');
  if (override) phase = override;
  const projects = [env.GCLOUD_PROJECT, env.GOOGLE_CLOUD_PROJECT].filter(Boolean);
  if (new Set(projects).size > 1) throw new Error('ambiguous-archive-deployment-project');
  const installed = phase !== 'off' && projects[0] === 'shoutout-dev-46c81' && !env.FIRESTORE_EMULATOR_HOST;
  return Object.freeze({ phase: installed ? phase : 'off',
    capture: installed, reader: installed && phase !== 'capture', identity: installed,
    identityPurge: installed, maintenance: installed && phase === 'active', disclosure: installed });
}
