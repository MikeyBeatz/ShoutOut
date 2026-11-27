import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legacyReportFixtures,parseLegacyReportCleanup,validateLegacyReportCleanup} from './archive_report_cleanup.mjs';
test('report exception has three fixed paths and requires exact DEV, digest, workspace and CI',()=>{
  assert.equal(legacyReportFixtures.length,3);assert.equal(new Set(legacyReportFixtures.map(f=>f.path)).size,3);
  for(const args of [
    ['plan','--project','shoutout-production-a1b34','--output','build/plan.json'],
    ['plan','--project','shoutout-dev-46c81','--output','../outside.json'],
    ['plan','--project','shoutout-dev-46c81','--ids','foreign'],
    ['apply','--project','shoutout-dev-46c81','--plan','build/plan.json'],
  ])assert.throws(()=>parseLegacyReportCleanup(args),/archive-reports-/);
  assert.throws(()=>validateLegacyReportCleanup({},'shoutout-dev-46c81','a'.repeat(64)),/invalid-plan/);
});
