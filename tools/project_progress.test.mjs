import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { calculateProgress, sourceParents, synchronizeProgress, validateEvidence } from './project_progress.mjs';

function model() {
  const sections = [
    { id: 'code', title: 'Prepared implementation', phase: 'implementation', complete: true, evidence: ['evidence.md#proof'] },
    { id: 'check', title: 'Automated check', phase: 'verification', complete: false, evidence: [], requires: ['code'] },
    { id: 'deploy', title: 'Development deployment', phase: 'deployment', complete: false, evidence: [], requires: ['check'] },
    { id: 'accept', title: 'Live acceptance', phase: 'acceptance', complete: false, evidence: [], requires: ['deploy'] },
  ];
  const parts = sections.map(s => ({ section: s.id, weight: 2500 }));
  return { version: 1, parentWeight: 10000, baseline: { mvp: { total: 1 }, backlog: { total: 1 } }, sections,
    views: { mvp: [{ id: 'mvp-01', parts: structuredClone(parts) }], backlog: [{ id: 'bl-001', parts: structuredClone(parts) }] } };
}
const sources = () => ({ mvp: [{ id: 'mvp-01', title: 'Milestone', complete: false }], backlog: [{ id: 'bl-001', title: 'Task', complete: false }] });
function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'shoutout-progress-'));
  t.after(() => { assert.equal(dirname(root), resolve(tmpdir())); assert(root.startsWith(resolve(tmpdir(), 'shoutout-progress-'))); rmSync(root, { recursive: true }); });
  mkdirSync(resolve(root, 'docs')); mkdirSync(resolve(root, 'tools'));
  copyFileSync(fileURLToPath(new URL('./project_progress.mjs', import.meta.url)), resolve(root, 'tools/project_progress.mjs'));
  writeFileSync(resolve(root, 'docs/progress.json'), JSON.stringify(model()));
  writeFileSync(resolve(root, 'evidence.md'), '# Evidence\n\n## Proof\nMeasured result.\n');
  writeFileSync(resolve(root, 'docs/TODO.md'), '# TODO\n\n<!-- progress:mvp:start -->\nold\n<!-- progress:mvp:end -->\n\n<!-- progress:backlog:start -->\nold\n<!-- progress:backlog:end -->\n\n1. ⬜ <a id="mvp-01"></a> Milestone\n    Preserve this acceptance criterion.\n');
  writeFileSync(resolve(root, 'docs/BACKLOG.md'), '# Backlog\n\n<!-- progress:backlog:start -->\nold\n<!-- progress:backlog:end -->\n\n- [ ] <a id="bl-001"></a> Task\n  Preserve this requirement.\n');
  writeFileSync(resolve(root, 'docs/PROGRESS.md'), '# Progress\n\n<!-- progress:details:start -->\nold\n<!-- progress:details:end -->\n');
  return root;
}

test('a verified section advances both weighted views while all parent gates remain open', () => {
  const data = model(), result = calculateProgress(data, sources());
  for (const view of ['mvp', 'backlog']) {
    assert.equal(result[view].percent, 25); assert.equal(result[view].complete, 0);
    assert.equal(result[view].partial, 1); assert.equal(result[view].completeSections, 1);
  }
  data.sections[1] = { ...data.sections[1], complete: true, evidence: ['evidence.md#proof'] };
  assert.equal(calculateProgress(data, sources()).mvp.percent, 50);
});

test('parents keep equal weight regardless of their number of sections', () => {
  const data = model(), src = sources();
  data.sections.push({ id: 'baseline', title: 'Old completion', phase: 'legacy', complete: true, evidence: ['old.txt'] });
  data.views.mvp.push({ id: 'mvp-02', parts: [{ section: 'baseline', weight: 10000 }] });
  src.mvp.push({ id: 'mvp-02', title: 'Legacy milestone', complete: true });
  const result = calculateProgress(data, src);
  assert.equal(result.mvp.percent, 62.5); // (25% + 100%) / 2, not two of five sections.
  assert.equal(result.backlog.percent, 25);
});

test('splitting only an open share preserves percentage and completing a child moves it', () => {
  const data = model(); data.sections.push({ id: 'check-extra', title: 'Extra verification', phase: 'verification', complete: false, evidence: [] });
  for (const view of ['mvp', 'backlog']) data.views[view][0].parts.splice(1, 1, { section: 'check', weight: 1000 }, { section: 'check-extra', weight: 1500 });
  assert.equal(calculateProgress(data, sources()).mvp.percent, 25);
  data.sections.at(-1).complete = true; data.sections.at(-1).evidence = ['evidence.md'];
  assert.equal(calculateProgress(data, sources()).mvp.percent, 40);
});

test('rounding never renders 100% or a full bar before the last acceptance gate', () => {
  const data = model(); data.sections = [data.sections[0], data.sections[3]]; delete data.sections[1].requires;
  for (const view of ['mvp', 'backlog']) data.views[view][0].parts = [{ section: 'code', weight: 9999 }, { section: 'accept', weight: 1 }];
  // A larger denominator makes raw rounding reach 100, while one tiny gate remains.
  const src = sources();
  for (let i = 2; i <= 10; i++) {
    const id = `mvp-${String(i).padStart(2, '0')}`, section = `done-${i}`;
    data.sections.push({ id: section, title: 'Done', phase: 'legacy', complete: true, evidence: ['old.txt'] });
    data.views.mvp.push({ id, parts: [{ section, weight: 10000 }] }); src.mvp.push({ id, title: 'Done', complete: true });
  }
  let result = calculateProgress(data, src);
  assert.equal(result.mvp.percent, 99.99); assert.equal(result.mvp.bar.replace(/░/g, '').length, 39);
  data.sections[1].complete = true; data.sections[1].evidence = ['evidence.md'];
  result = calculateProgress(data, src); assert.equal(result.mvp.percent, 100); assert.equal(result.mvp.complete, 10);
});

test('duplicate credit/IDs, invalid weights, missing coverage and orphan sections fail closed', () => {
  const corruptions = [
    d => d.sections.push(structuredClone(d.sections[0])),
    d => d.views.mvp[0].parts[1].section = 'code',
    d => d.views.mvp[0].parts[0].weight = 2499,
    d => d.views.mvp[0].parts[0].weight = 2500.5,
    d => d.views.mvp[0].parts[0].weight = 0,
    d => d.views.mvp[0].parts[0].section = 'missing',
    d => d.views.mvp.push(structuredClone(d.views.mvp[0])),
    d => d.views.mvp = [],
    d => d.sections.push({ id: 'orphan', title: 'Orphan', phase: 'remaining', complete: false, evidence: [] }),
    d => d.baseline.mvp.total = Number.MAX_SAFE_INTEGER,
  ];
  for (const corrupt of corruptions) { const d = model(); corrupt(d); assert.throws(() => calculateProgress(d, sources()), /progress:/); }
});

test('a completed section needs local evidence and completed dependencies, without dependency cycles', () => {
  let d = model(); d.sections[0].evidence = []; assert.throws(() => calculateProgress(d, sources()), /lacks local evidence/);
  d = model(); d.sections[0].evidence = ['https://github.com/MikeyBeatz/ShoutOut/actions/runs/1']; assert.throws(() => calculateProgress(d, sources()), /lacks local evidence/);
  d = model(); d.sections[3].complete = true; d.sections[3].evidence = ['evidence.md']; assert.throws(() => calculateProgress(d, sources()), /unmet dependency/);
  d = model(); d.sections[0].requires = ['check']; assert.throws(() => calculateProgress(d, sources()), /cycle/);
});

test('source IDs are stable and unique, including nested checkboxes, while code examples do not count', () => {
  const input = '- [x] <a id="bl-001"></a> Parent\n  - [ ] <a id="bl-002"></a> Child\n```md\n- [ ] Example\n```\n~~~md\n- [ ] Other example\n~~~\n';
  assert.equal(sourceParents(input, 'backlog').length, 2);
  assert.throws(() => sourceParents('- [x] Missing ID', 'backlog'), /missing/);
  assert.throws(() => sourceParents(input + '\n- [ ] <a id="bl-001"></a> Duplicate', 'backlog'), /duplicate/);
  assert.throws(() => sourceParents('1. ✅ <a id="bl-001"></a> Wrong view', 'mvp'), /invalid/);
  assert.throws(() => sourceParents('- [x] <a id="bl-001"></a><a id="bl-002"></a> Ambiguous', 'backlog'), /ambiguous/);
  assert.equal(sourceParents('1. ⬜ <a id="mvp-01"></a> Full\n   acceptance criterion.\n\nNotes.', 'mvp')[0].title, 'Full acceptance criterion.');
});

test('evidence validation rejects missing/outside paths, missing anchors and circular generated proof', t => {
  const root = fixture(t), data = model(); validateEvidence(root, data);
  for (const path of ['missing.md', '../outside.md', 'evidence.md#missing', 'evidence.md#proof#bad', 'docs/TODO.md', 'docs/./TODO.md', 'docs/PROGRESS.md', 'https://example.com/fake', 'C:\\private.txt']) {
    data.sections[0].evidence = [path]; assert.throws(() => validateEvidence(root, data), /progress:/);
  }
});

test('generation detects stale summaries and parent icons, preserves requirements, and is idempotent', t => {
  const root = fixture(t);
  assert.equal(synchronizeProgress(root).stale.length, 3);
  synchronizeProgress(root, { write: true }); assert.deepEqual(synchronizeProgress(root).stale, []);
  let todo = readFileSync(resolve(root, 'docs/TODO.md'), 'utf8');
  assert(todo.includes('**25,00 %**')); assert(todo.includes('1. ⬜')); assert(todo.includes('Preserve this acceptance criterion.'));
  const data = model(); for (const row of data.sections) { row.complete = true; row.evidence = ['evidence.md#proof']; }
  writeFileSync(resolve(root, 'docs/progress.json'), JSON.stringify(data));
  assert.equal(synchronizeProgress(root).stale.length, 3); synchronizeProgress(root, { write: true });
  todo = readFileSync(resolve(root, 'docs/TODO.md'), 'utf8');
  assert(todo.includes('**100,00 %**')); assert(todo.includes('1. ✅'));
  assert(readFileSync(resolve(root, 'docs/BACKLOG.md'), 'utf8').includes('- [x]'));
  assert.deepEqual(synchronizeProgress(root).stale, []);
});

test('missing or duplicate output blocks abort before modifying any document', t => {
  const root = fixture(t), todo = readFileSync(resolve(root, 'docs/TODO.md'));
  writeFileSync(resolve(root, 'docs/PROGRESS.md'), '# Missing render block\n');
  assert.throws(() => synchronizeProgress(root, { write: true }), /render block/);
  assert.deepEqual(readFileSync(resolve(root, 'docs/TODO.md')), todo);
  writeFileSync(resolve(root, 'docs/PROGRESS.md'), '<!-- progress:details:start -->\n<!-- progress:details:start -->\n<!-- progress:details:end -->');
  assert.throws(() => synchronizeProgress(root, { write: true }), /render block/);
});

test('the actual CLI reports stale output as failure and --write fixes it without granting completion', t => {
  const root = fixture(t), script = resolve(root, 'tools/project_progress.mjs');
  let run = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 1); assert.equal(JSON.parse(run.stdout).metrics.mvp.percent, 25);
  run = spawnSync(process.execPath, [script, '--write'], { encoding: 'utf8' }); assert.equal(run.status, 0);
  assert.deepEqual(JSON.parse(run.stdout).stale, []); assert.equal(JSON.parse(run.stdout).updated.length, 3);
  run = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' }); assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).metrics.mvp.complete, 0);
  run = spawnSync(process.execPath, [script, '--write', '--check'], { encoding: 'utf8' }); assert.equal(run.status, 1);
});
