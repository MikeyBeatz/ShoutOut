import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { validAccountLifecycleBinding } from './account_archive_lifecycle_binding.js';
import { validAccountArchiveDeadline } from './account_content_archive.js';
import { validatePurgeSelection } from './account_purge_policy.js';

test('legacy deadline proof preserves exact SDK incarnations and rejects partial/misordered metadata', () => {
  const ts = n => new Timestamp(1000, n), request = ts(50);
  const data = { sourceCreateTime: ts(100), sourceUpdateTime: ts(200), requestCreateTime: request,
    ordinaryRetainUntil: Timestamp.fromMillis(request.toMillis() + 1000), retainUntil: Timestamp.fromMillis(request.toMillis() + 1000),
    lifecycleAccountBinding: { schemaVersion: 1, migrationDigest: 'a'.repeat(64), archiveCreateTime: ts(300), threadCreateTime: ts(99), parentCreateTime: ts(99), parentCreatedAt: ts(0) } };
  assert.equal(validAccountLifecycleBinding(data), true); assert.equal(validAccountArchiveDeadline(data), true);
  data.lifecycleAccountBinding.parentCreateTime = ts(101); assert.equal(validAccountLifecycleBinding(data), false);
  data.lifecycleAccountBinding.parentCreateTime = ts(99); data.lifecycleAccountBinding.extra = true;
  assert.equal(validAccountLifecycleBinding(data), false); delete data.lifecycleAccountBinding.extra;
  delete data.ordinaryRetainUntil; assert.equal(validAccountArchiveDeadline(data), false);
  assert.equal(validAccountLifecycleBinding({}), false);
});

test('a partial empty-body purge page requires a bound ordinary deadline, including the existing native format', () => {
  const request = Timestamp.fromMillis(100000), data = { kind: 'comment', retentionOwnerId: 'owner', subjectUserIds: ['owner'],
    content: {}, contentExpired: false, contentArchiveKey: 'b'.repeat(64), requestCreateTime: request,
    retainUntil: Timestamp.fromMillis(101000), ordinaryRetainUntil: Timestamp.fromMillis(101000) };
  const snapshot = { ref: { path: 'accountContentArchive/record' }, get: key => data[key], data: () => data };
  const stage = { collection: 'accountContentArchive', field: 'subjectUserIds', operator: 'array-contains' };
  assert.equal(validatePurgeSelection(snapshot, stage, 'owner'), true);
  delete data.ordinaryRetainUntil; assert.equal(validatePurgeSelection(snapshot, stage, 'owner'), false);
});
