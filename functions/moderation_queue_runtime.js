// Prepared injectable handlers only: no onCall/onSchedule export or resources.
import { HttpsError } from 'firebase-functions/v2/https';
import { createModerationQueueDatabase, moderationQueueConfiguration } from './moderation_queue.js';
import { lifecycleReadsEnabled } from './content_lifecycle.js';
import { getModerationCasePageOperation } from './moderation_queue_reader.js';
import { startModerationCaseDecisionOperation, stepModerationCaseDecisionOperation, reapExpiredModerationCaseDecisions } from './moderation_case_decision.js';
export function createModerationQueueHandlers(db, { enabled = moderationQueueConfiguration.enabled, clock = () => new Date(), indexWriter = null } = {}) {
  if (typeof enabled !== 'boolean' || typeof clock !== 'function') throw new Error('invalid-moderation-queue-runtime');
  const database = createModerationQueueDatabase(db, { enabled });
  const guard = operation => (...args) => {
    if (!enabled) throw new HttpsError('failed-precondition', 'Moderation queue is not enabled.');
    return operation(...args);
  };
  const managed = operation => guard((...args) => {
    if (!lifecycleReadsEnabled(database)) throw new HttpsError('failed-precondition', 'Moderation decisions require the managed archive runtime.');
    return operation(...args);
  });
  return Object.freeze({ enabled, database,
    page: guard(request => getModerationCasePageOperation(request, database, clock)),
    start: managed(request => startModerationCaseDecisionOperation(request, database, clock)),
    step: managed(request => stepModerationCaseDecisionOperation(request, database, clock, { indexWriter })),
    maintenance: enabled ? () => reapExpiredModerationCaseDecisions(database, clock) : async () => ({ examined: 0, deleted: 0, disabled: true }),
  });
}
