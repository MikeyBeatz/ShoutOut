import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { accountContentArchiveId, archiveAccountContentPage, drainArchivedCommentReactionsPage } from './account_content_archive.js';

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
