import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { validLegacyReportBinding, reportArchiveVersionProven, reportArchivePairProven } from './content_lifecycle_report_provenance.js';

const time = n => new Timestamp(1000, n);
const doc = (data, created) => ({ exists: true, createTime: created, data: () => data, get: key => data[key] });

test('late transition evidence requires explicit migration and an exact pre-report SDK version', () => {
  const report = doc({}, time(500));
  const archive = doc({ captureMode: 'transition', sourceCreateTime: time(100), sourceUpdateTime: time(500), archivedAt: time(800) }, time(800));
  assert.equal(reportArchiveVersionProven(archive, report), false);
  assert.equal(reportArchiveVersionProven(archive, report, true), true);
  archive.data().sourceUpdateTime = time(501);
  assert.equal(reportArchiveVersionProven(archive, report, true), false);
  archive.data().captureMode = 'atomic-write';
  assert.equal(reportArchiveVersionProven(archive, report, true), false);
});

test('original report incarnation and parent incarnation cannot be replaced within the same millisecond', () => {
  const report = doc({ legacyEvidenceBinding: { schemaVersion: 1, migrationDigest: 'a'.repeat(64), reportCreateTime: time(500) } }, time(500));
  assert.equal(validLegacyReportBinding(report), true);
  report.createTime = time(501); assert.equal(validLegacyReportBinding(report), false);
  report.createTime = time(500);
  const child = doc({ captureMode: 'transition', sourceCreateTime: time(100), sourceUpdateTime: time(200), archivedAt: time(800) }, time(800));
  const parent = doc({ captureMode: 'transition', sourceCreateTime: time(99), sourceUpdateTime: time(300), archivedAt: time(800) }, time(800));
  assert.equal(reportArchivePairProven(child, parent, report), true);
  parent.data().sourceCreateTime = time(101); assert.equal(reportArchivePairProven(child, parent, report), false);
});

test('an earlier ordinary atomic copy needs no legacy override; extra proof fields are rejected', () => {
  const report = doc({}, time(500)), archive = doc({ captureMode: 'atomic-write', archivedAt: time(100) }, time(100));
  assert.equal(reportArchiveVersionProven(archive, report), true);
  assert.equal(reportArchiveVersionProven(archive, report, true), false);
  report.data().legacyEvidenceBinding = { schemaVersion: 1, migrationDigest: 'b'.repeat(64), reportCreateTime: time(500), arbitrary: true };
  assert.equal(validLegacyReportBinding(report), false);
});
