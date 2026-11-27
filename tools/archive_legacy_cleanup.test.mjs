import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legacyArchiveRoots,parseLegacyArchiveCleanup,validateLegacyArchiveCleanup} from './archive_legacy_cleanup.mjs';
test('legacy cleanup has fixed eleven IDs and no arbitrary deletion arguments',()=>{
  assert.equal(legacyArchiveRoots.length,11);assert.equal(new Set(legacyArchiveRoots).size,11);
  assert.throws(()=>parseLegacyArchiveCleanup(['apply','--project','shoutout-production-a1b34']),/explicit-dev/);
  assert.throws(()=>parseLegacyArchiveCleanup(['plan','--project','shoutout-dev-46c81','--output','../outside.json']),/workspace/);
  assert.throws(()=>parseLegacyArchiveCleanup(['apply','--project','shoutout-dev-46c81','--plan','build/plan.json']),/explicit-ci/);
  assert.throws(()=>parseLegacyArchiveCleanup(['plan','--project','shoutout-dev-46c81','--ids','anything']),/invalid-options/);
  assert.throws(()=>validateLegacyArchiveCleanup({},'shoutout-dev-46c81','a'.repeat(64)),/invalid-plan/);
});
