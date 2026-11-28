// This laboratory entry remains emulator only; production artifacts exclude it.
import * as core from './moderation_queue_transition_core.js';
import { moderationQueueBinding } from './moderation_queue.js';
function laboratory(db) {
  if (db.projectId !== 'shoutout-rules-test' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || !db[moderationQueueBinding]?.enabled) throw new Error('moderation-transition-emulator-only');
}
export function moderationQueueTransitionPlan(input) {
  if (input?.projectId !== 'shoutout-rules-test') throw new Error('invalid-moderation-transition-plan');
  return core.moderationQueueTransitionPlan(input);
}
export async function beginModerationQueueTransition(db, plan) { laboratory(db); return core.beginModerationQueueTransition(db, plan); }
export async function stepModerationQueueTransition(db, plan) { laboratory(db); return core.stepModerationQueueTransition(db, plan); }
export async function activateModerationQueueTransition(db, plan) { laboratory(db); return core.activateModerationQueueTransition(db, plan); }
