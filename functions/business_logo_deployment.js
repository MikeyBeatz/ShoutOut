// Committed DEV release, never selected by client data or a Remote Config flag.
export const businessLogoDevDeploymentPhase = 'active';
export function businessLogoDeploymentProfile(env = process.env, phase = businessLogoDevDeploymentPhase) {
  if (!['off', 'active', 'rollback'].includes(phase)) throw Error('invalid-business-logo-deployment-phase');
  const override = env.SHOUTOUT_BUSINESS_LOGO_PHASE;
  if (override && override !== phase && !(phase === 'active' && override === 'rollback')) throw Error('business-logo-phase-escalation');
  if (override) phase = override;
  const projects = [env.GCLOUD_PROJECT, env.GOOGLE_CLOUD_PROJECT].filter(Boolean);
  if (new Set(projects).size > 1) throw Error('ambiguous-business-logo-project');
  const installed = phase !== 'off' && projects[0] === 'shoutout-dev-46c81' && !env.FIRESTORE_EMULATOR_HOST;
  return Object.freeze({ enabled: installed && phase === 'active', clientEnabled: installed });
}
