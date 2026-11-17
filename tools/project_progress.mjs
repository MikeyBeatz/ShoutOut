import { readFileSync, writeFileSync, existsSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const parentWeight = 10000;
const phases = new Set(['legacy', 'planning', 'implementation', 'verification', 'deployment', 'acceptance', 'remaining']);
const assert = (condition, message) => { if (!condition) throw new Error(`progress: ${message}`); };
const slug = text => text.replace(/<[^>]*>/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[`*_~]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');
const strip = text => text.replace(/<a id="[^"]+"><\/a>\s*/g, '').replace(/\*\*/g, '').trim();
function visibleLines(text) {
  let fence = null;
  return text.split(/\r?\n/).map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return '';
    }
    return fence ? '' : line;
  });
}

export function sourceParents(text, view) {
  const rows = [];
  const lines = visibleLines(text);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = view === 'backlog' ? line.match(/^\s*- \[([x ])\] (.*)$/i) : line.match(/^\d+\. (✅|⬜) (.*)$/);
    if (!match) continue;
    const ids = [...match[2].matchAll(/<a id="((?:bl|mvp)-\d+)"><\/a>/g)];
    assert(ids.length === 1, `missing or ambiguous ${view} parent ID: ${line}`);
    const id = ids[0][1];
    assert(id, `missing ${view} parent ID: ${line}`);
    assert(new RegExp(`^${view === 'mvp' ? 'mvp' : 'bl'}-\\d+$`).test(id), `invalid ${view} parent ID ${id}`);
    assert(!rows.some(row => row.id === id), `duplicate source parent ${id}`);
    let title = match[2];
    for (let next = index + 1; next < lines.length && /^\s+\S/.test(lines[next]) && !/^\s*(?:-|#|\d+\.)/.test(lines[next]); next++) title += ' ' + lines[next].trim();
    rows.push({ id, complete: ['x', 'X', '✅'].includes(match[1]), title: strip(title) });
  }
  return rows;
}

// All weights are integer shares of one fixed parent. Subdividing an unfinished
// share must conserve its weight; adding tasks cannot mint completed credit.
export function calculateProgress(data, sources) {
  assert(data?.version === 1 && data.parentWeight === parentWeight, 'unsupported schema/parent weight');
  assert(Array.isArray(data.sections) && data.views && data.baseline, 'missing registry');
  const sections = new Map();
  for (const row of data.sections) {
    assert(row && typeof row.id === 'string' && /^[a-z][a-z0-9-]+$/.test(row.id), 'invalid section ID');
    assert(!sections.has(row.id), `duplicate section ${row.id}`);
    assert(typeof row.title === 'string' && row.title.trim() && phases.has(row.phase), `invalid section ${row.id}`);
    assert(typeof row.complete === 'boolean' && Array.isArray(row.evidence) && row.evidence.every(p => typeof p === 'string'), `invalid state/evidence ${row.id}`);
    assert(!row.complete || row.evidence.some(p => !/^https?:/.test(p)), `completed section lacks local evidence: ${row.id}`);
    assert(row.requires === undefined || Array.isArray(row.requires) && new Set(row.requires).size === row.requires.length, `invalid dependencies ${row.id}`);
    sections.set(row.id, row);
  }
  const visited = new Set(), active = new Set();
  function visit(id) {
    assert(sections.has(id), `unknown dependency ${id}`);
    assert(!active.has(id), `dependency cycle ${id}`);
    if (visited.has(id)) return;
    active.add(id);
    for (const dep of sections.get(id).requires ?? []) {
      visit(dep);
      assert(!sections.get(id).complete || sections.get(dep).complete, `unmet dependency ${id} -> ${dep}`);
    }
    active.delete(id); visited.add(id);
  }
  for (const id of sections.keys()) visit(id);
  const report = {}, referenced = new Set();
  for (const view of ['mvp', 'backlog']) {
    const parents = data.views[view], source = sources[view];
    assert(Array.isArray(parents) && Array.isArray(source) && source.length > 0, `missing ${view}`);
    const sourceIds = new Set(source.map(p => p.id)), parentIds = new Set(), used = new Set(), rows = [];
    assert(sourceIds.size === source.length, `duplicate source IDs ${view}`);
    assert(parents.length === source.length, `parent coverage ${view}`);
    // The original parents retain their identities; future approved additions
    // may extend the set but cannot erase or renumber the baseline.
    const baselineCount = data.baseline[view]?.total;
    assert(Number.isSafeInteger(baselineCount) && baselineCount > 0 && baselineCount <= source.length, `invalid baseline ${view}`);
    for (let i = 1; i <= baselineCount; i++) assert(sourceIds.has(`${view === 'mvp' ? 'mvp' : 'bl'}-${String(i).padStart(view === 'mvp' ? 2 : 3, '0')}`), `missing baseline parent ${view} ${i}`);
    let weightDone = 0;
    for (const parent of parents) {
      assert(parent && sourceIds.has(parent.id) && !parentIds.has(parent.id), `unknown/duplicate ${view} parent ${parent?.id}`);
      parentIds.add(parent.id);
      assert(Array.isArray(parent.parts) && parent.parts.length > 0, `empty parent ${parent.id}`);
      let total = 0, done = 0, completeSections = 0;
      for (const part of parent.parts) {
        assert(sections.has(part.section), `unknown section ${part.section}`);
        assert(!used.has(part.section), `duplicate credit in ${view}: ${part.section}`);
        assert(Number.isSafeInteger(part.weight) && part.weight > 0 && part.weight <= parentWeight, `invalid weight ${part.section}`);
        used.add(part.section); referenced.add(part.section); total += part.weight;
        if (sections.get(part.section).complete) { done += part.weight; completeSections++; }
      }
      assert(total === parentWeight, `weights must sum to ${parentWeight}: ${parent.id}`);
      weightDone += done;
      rows.push({ ...source.find(p => p.id === parent.id), complete: done === parentWeight,
        weightDone: done, completeSections, totalSections: parent.parts.length });
    }
    const weightTotal = parents.length * parentWeight;
    const full = weightDone === weightTotal;
    const hundredths = Math.min(full ? 10000 : 9999, Math.round(weightDone * 10000 / weightTotal));
    report[view] = { complete: rows.filter(p => p.complete).length, total: rows.length,
      partial: rows.filter(p => p.weightDone > 0 && !p.complete).length,
      completeSections: [...used].filter(id => sections.get(id).complete).length, totalSections: used.size,
      weightDone, weightTotal, percent: hundredths / 100, percentText: (hundredths / 100).toFixed(2).replace('.', ','),
      bar: '█'.repeat(Math.floor(40 * weightDone / weightTotal)) + '░'.repeat(40 - Math.floor(40 * weightDone / weightTotal)), rows };
  }
  for (const id of sections.keys()) assert(referenced.has(id), `orphan section ${id}`);
  return report;
}

function markdownAnchors(text) {
  const result = new Set(), counts = new Map();
  for (const line of visibleLines(text)) {
    for (const match of line.matchAll(/<a id="([^"]+)">/g)) result.add(match[1]);
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (heading) { const base = slug(heading[1]), count = counts.get(base) ?? 0; result.add(base + (count ? `-${count}` : '')); counts.set(base, count + 1); }
  }
  return result;
}

export function validateEvidence(root, data) {
  for (const section of data.sections) for (const target of section.evidence) {
    if (/^https:\/\/github.com\/MikeyBeatz\/ShoutOut\/(?:actions\/runs\/\d+|commit\/[a-f0-9]{7,40})$/.test(target)) continue;
    assert(!/^[a-z][\w+.-]*:/i.test(target) && !target.startsWith('/') && !target.includes('\\'), `invalid evidence path ${target}`);
    assert(target.split('#').length <= 2, `invalid evidence fragment ${target}`);
    const [path, fragment] = target.split('#'), absolute = resolve(root, path), inside = relative(root, absolute);
    assert(inside && !inside.startsWith('..') && existsSync(absolute), `missing/outside evidence ${target}`);
    const physical = relative(realpathSync(root), realpathSync(absolute));
    assert(physical && !physical.startsWith('..') && statSync(absolute).isFile(), `outside/non-file evidence ${target}`);
    assert(!['docs/progress.json', 'docs/PROGRESS.md', 'docs/TODO.md', 'docs/BACKLOG.md'].includes(inside.replace(/\\/g, '/')), `circular projection evidence ${target}`);
    if (fragment) assert(path.endsWith('.md') && markdownAnchors(readFileSync(absolute, 'utf8')).has(fragment), `missing evidence anchor ${target}`);
  }
}

const summary = (view, row) => [
  `\`${row.bar}\` **${row.percentText} %** — vážené dokončení podúseků`,
  '',
  `Hotové úseky: **${row.completeSections}/${row.totalSections}**. Celé ${view === 'mvp' ? 'milníky' : 'položky'}: **${row.complete}/${row.total}**; rozpracované: ${row.partial}.`,
].join('\n');
function replaceBlock(text, id, value) {
  const start = `<!-- progress:${id}:start -->`, end = `<!-- progress:${id}:end -->`;
  assert(text.split(start).length === 2 && text.split(end).length === 2 && text.indexOf(start) < text.indexOf(end), `missing/duplicate render block ${id}`);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.slice(0, text.indexOf(start) + start.length) + eol + value.replace(/\n/g, eol) + eol + text.slice(text.indexOf(end));
}
const cell = text => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
function details(data, report) {
  const lines = ['### MVP podle hlavních milníků', '', '| Milník | Dokončení | Úseky |', '|---|---:|---:|'];
  for (const row of report.mvp.rows) lines.push(`| [${row.id}: ${cell(row.title)}](TODO.md#${row.id}) | ${(row.weightDone / 100).toFixed(2).replace('.', ',')} % | ${row.completeSections}/${row.totalSections} |`);
  lines.push('', '### Rozpracované backlogové položky', '', '| Položka | Dokončení | Úseky |', '|---|---:|---:|');
  for (const row of report.backlog.rows.filter(p => p.weightDone > 0 && !p.complete)) lines.push(`| [${row.id}: ${cell(row.title)}](BACKLOG.md#${row.id}) | ${(row.weightDone / 100).toFixed(2).replace('.', ',')} % | ${row.completeSections}/${row.totalSections} |`);
  lines.push('', '### Dílčí evidence mimo původní uzavřené položky', '', '| ID a úsek | Fáze | Stav | Důkazy |', '|---|---|---|---|');
  for (const row of data.sections.filter(s => s.phase !== 'legacy')) {
    const links = row.evidence.map((p, i) => `[${i + 1}](${p.startsWith('https:') ? p : '../' + p})`).join(', ');
    lines.push(`| ${row.id}: ${cell(row.title)} | ${row.phase} | ${row.complete ? '✅' : '⬜'} | ${links || '—'} |`);
  }
  return lines.join('\n');
}

export function synchronizeProgress(root, { write = false } = {}) {
  const data = JSON.parse(readFileSync(resolve(root, 'docs/progress.json'), 'utf8'));
  const paths = ['docs/TODO.md', 'docs/BACKLOG.md', 'docs/PROGRESS.md'];
  const originals = Object.fromEntries(paths.map(path => [path, readFileSync(resolve(root, path), 'utf8')]));
  const sources = { mvp: sourceParents(originals[paths[0]], 'mvp'), backlog: sourceParents(originals[paths[1]], 'backlog') };
  const report = calculateProgress(data, sources);
  validateEvidence(root, data);
  const generated = { ...originals };
  generated[paths[0]] = replaceBlock(replaceBlock(originals[paths[0]], 'mvp', summary('mvp', report.mvp)), 'backlog', summary('backlog', report.backlog));
  generated[paths[1]] = replaceBlock(originals[paths[1]], 'backlog', summary('backlog', report.backlog));
  generated[paths[2]] = replaceBlock(originals[paths[2]], 'details', details(data, report));
  // Checkbox/icon states are projections too. Completing the last planned share
  // closes its parent; checking a parent manually cannot override open shares.
  const states = new Map([...report.mvp.rows, ...report.backlog.rows].map(p => [p.id, p.complete]));
  generated[paths[0]] = generated[paths[0]].replace(/^(\d+\. )(✅|⬜)( <a id="(mvp-\d+)"><\/a>)/gm,
    (_, prefix, _icon, suffix, id) => prefix + (states.get(id) ? '✅' : '⬜') + suffix);
  generated[paths[1]] = generated[paths[1]].replace(/^(\s*- \[)[x ](\] <a id="(bl-\d+)"><\/a>)/gmi,
    (_, prefix, suffix, id) => prefix + (states.get(id) ? 'x' : ' ') + suffix);
  const stale = paths.filter(path => generated[path] !== originals[path]);
  if (write) for (const path of stale) writeFileSync(resolve(root, path), generated[path]);
  return { metrics: Object.fromEntries(Object.entries(report).map(([key, { rows: _rows, ...value }]) => [key, value])),
    stale: write ? [] : stale, updated: write ? stale : [] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2); assert(args.every(x => ['--write', '--check', '--json'].includes(x)) && !(args.includes('--write') && args.includes('--check')), 'invalid CLI arguments');
    const result = synchronizeProgress(resolve(dirname(fileURLToPath(import.meta.url)), '..'), { write: args.includes('--write') });
    console.log(JSON.stringify(result, null, 2));
    if (!args.includes('--write') && result.stale.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
