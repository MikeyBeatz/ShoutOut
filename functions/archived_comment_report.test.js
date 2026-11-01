import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getArchivedCommentReportTargetOperation as read } from './archived_comment_report.js';

test('retained lookup accepts only a report ID after verified callable identity', async () => {
  await assert.rejects(read({}, {}), e => e.code === 'unauthenticated');
  const identity = { auth: { uid: 'mod', token: { email: 'mod@example.test', email_verified: true } }, app: { appId: 'web' } };
  for (const data of [{ reportId: '../secrets' }, { reportId: 'id', archiveId: 'forged' }, null]) {
    await assert.rejects(read({ ...identity, data }, {}), e => e.code === 'invalid-argument');
  }
});
