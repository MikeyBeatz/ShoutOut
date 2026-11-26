import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { validAccountLifecycleBinding, accountReportBodyProven } from './account_archive_lifecycle_binding.js';
import { lifecycleBodyHash } from './content_lifecycle.js';
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

test('body proof survives later metadata writes but never invents an original version from a mutated copy', () => {
  const ts = n => new Timestamp(1000, n), content = { text: 'original', createdAt: ts(0) };
  const d = { sourceCreateTime: ts(100), sourceUpdateTime: ts(200), content,
    lifecycleAccountBinding: { schemaVersion: 2, migrationDigest: 'a'.repeat(64), archiveCreateTime: ts(300),
      originalArchiveUpdateTime: ts(300), bodyHash: lifecycleBodyHash(content), parentArchiveKey: 'b'.repeat(64), parentArchiveCreateTime: ts(299),
      threadCreateTime: ts(99), parentCreateTime: ts(99), parentCreatedAt: ts(0) } };
  const archive = { exists: true, createTime: ts(300), updateTime: ts(900), data: () => d }, report = { exists: true, createTime: ts(250) };
  assert(validAccountLifecycleBinding(d)); assert(accountReportBodyProven(archive, report));
  report.createTime = ts(199); assert(!accountReportBodyProven(archive, report));
  report.createTime = ts(301); assert(!accountReportBodyProven(archive, report)); report.createTime = ts(250);
  d.content = { ...content, text: 'later' }; assert(!accountReportBodyProven(archive, report)); d.content = content;
  d.lifecycleAccountBinding.originalArchiveUpdateTime = ts(301); assert(!accountReportBodyProven(archive, report));
  d.lifecycleAccountBinding.originalArchiveUpdateTime = ts(299); assert(!validAccountLifecycleBinding(d));
  d.lifecycleAccountBinding.originalArchiveUpdateTime = ts(300); archive.createTime = ts(301); assert(!accountReportBodyProven(archive, report));
  archive.createTime = ts(300); d.contentExpired = true; assert(!accountReportBodyProven(archive, report));
  delete d.contentExpired; d.lifecycleAccountBinding.schemaVersion = 1;
  for (const key of ['bodyHash', 'parentArchiveKey', 'parentArchiveCreateTime', 'originalArchiveUpdateTime']) delete d.lifecycleAccountBinding[key];
  assert(validAccountLifecycleBinding(d)); assert(!accountReportBodyProven(archive, report));
});
