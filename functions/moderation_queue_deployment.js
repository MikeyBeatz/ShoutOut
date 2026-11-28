// Exact-project deployment policy. Control mode gates serving, never writers.
// A pause/rollback must keep projection and the original retention running.
export const moderationQueueDevPhase = 'active';
export function moderationQueueDeploymentProfile(env = process.env, phase = moderationQueueDevPhase) {
  if (!['off', 'active', 'rollback'].includes(phase)) throw new Error('moderation-queue-invalid-phase');
  const override = env.SHOUTOUT_MODERATION_QUEUE_PHASE;
  if (override && override !== phase && !(phase === 'active' && override === 'rollback')) throw new Error('moderation-queue-phase-escalation');
  const projects = [env.GCLOUD_PROJECT, env.GOOGLE_CLOUD_PROJECT].filter(Boolean);
  if (new Set(projects).size > 1) throw new Error('moderation-queue-ambiguous-project');
  const enabled = phase !== 'off' && projects[0] === 'shoutout-dev-46c81' && !env.FIRESTORE_EMULATOR_HOST;
  return Object.freeze({ phase: enabled ? override || phase : 'off', enabled });
}
