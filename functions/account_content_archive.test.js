import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { accountContentArchiveId, archiveAccountContentPage, drainArchivedCommentReactionsPage, validAccountArchiveDeadline } from './account_content_archive.js';

test('archive identity binds project, complete source path and document incarnation', () => {
  const time = Timestamp.fromMillis(1000), path = 'shouts/s/comments/c';
  const id = accountContentArchiveId('project', path, time);
  assert.match(id, /^[a-f0-9]{64}$/); assert.equal(accountContentArchiveId('project', path, time), id);
  for (const input of [['other', path, time], ['project', 'shouts/t/comments/c', time], ['project', path, Timestamp.fromMillis(1001)]]) {
    assert.notEqual(accountContentArchiveId(...input), id);
  }
});

test('archive operations require trusted identity and a transaction fence before database access', async () => {
  await assert.rejects(archiveAccountContentPage({}, {}, {}), /invalid-content-archive-options/);
  await assert.rejects(drainArchivedCommentReactionsPage({}, {}, {}), /invalid-content-archive-options/);
});

test('a bound account copy accepts only the exact earlier ordinary or account deadline', () => {
  const start = Timestamp.fromMillis(1000), accountEnd = Timestamp.fromMillis(1000 + 60 * 86400000);
  const data = { requestCreateTime: start, retainUntil: accountEnd };
  assert(validAccountArchiveDeadline(data));
  assert(!validAccountArchiveDeadline({ ...data, retainUntil: Timestamp.fromMillis(accountEnd.toMillis() + 1) }));
  const earlier = Timestamp.fromMillis(2000), bound = { ...data, ordinaryRetainUntil: earlier, retainUntil: earlier, contentArchiveKey: 'a'.repeat(64) };
  assert(validAccountArchiveDeadline(bound));
  assert(!validAccountArchiveDeadline({ ...bound, retainUntil: accountEnd }));
  assert(!validAccountArchiveDeadline({ ...bound, contentArchiveKey: undefined }));
});
