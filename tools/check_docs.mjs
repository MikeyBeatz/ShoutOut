import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))].filter(path => existsSync(resolve(root, path)));
const canonical = new Map(files.map(path => [path.toLowerCase(), path]));
const markdown = files.filter(path => path.endsWith('.md'));
const sources = new Map(markdown.map(path => [path, readFileSync(resolve(root, path), 'utf8')]));
const slug = value => value.replace(/<[^>]*>/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[`*_~]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');
const withoutCode = text => {
  let fence = null;
  return text.split(/\r?\n/).map(line => {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (match) { if (!fence) fence = match[1][0]; else if (match[1][0] === fence) fence = null; return ''; }
    return fence ? '' : line;
  }).join('\n');
};
function anchors(text) {
  const result = new Set(), counts = new Map();
  for (const line of withoutCode(text).split('\n')) {
    for (const match of line.matchAll(/<(?:a|[a-z][\w-]*)\s+[^>]*(?:id|name)=["']([^"']+)["']/gi)) result.add(match[1]);
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) { const base = slug(heading[1]), count = counts.get(base) ?? 0;
      result.add(base + (count ? `-${count}` : '')); counts.set(base, count + 1); }
  }
  return result;
}
const allAnchors = new Map([...sources].map(([path, text]) => [path, anchors(text)]));
const issues = [], edges = new Map(markdown.map(path => [path, new Set()]));
let linkCount = 0;
function checkLink(source, href, line) {
  if (!href || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) return;
  linkCount++;
  let target, fragment;
  try { const parts = href.split('#'); target = decodeURIComponent(parts[0].split('?')[0]); fragment = decodeURIComponent(parts.slice(1).join('#')); }
  catch { issues.push({ source, line, href, problem: 'invalid-encoding' }); return; }
  const absolute = target ? resolve(target.startsWith('/') ? root : dirname(resolve(root, source)), target.replace(/^\//, '')) : resolve(root, source);
  let path = relative(root, absolute).split(sep).join('/');
  if (path.startsWith('../')) { issues.push({ source, line, href, problem: 'outside-repository' }); return; }
  if (!existsSync(absolute)) { issues.push({ source, line, href, problem: 'missing-target' }); return; }
  if (statSync(absolute).isDirectory()) path += '/README.md';
  const actual = canonical.get(path.toLowerCase());
  if (actual && actual !== path) issues.push({ source, line, href, problem: 'path-case', expected: actual });
  if (fragment && allAnchors.has(path) && !allAnchors.get(path).has(fragment)) issues.push({ source, line, href, problem: 'missing-anchor' });
  edges.get(source).add(path);
}
for (const [source, original] of sources) {
  const text = withoutCode(original), definitions = new Map();
  for (const line of text.split('\n')) { const match = line.match(/^\s{0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?/); if (match) definitions.set(match[1].toLowerCase(), match[2]); }
  for (const [index, line] of text.split('\n').entries()) {
    const plain = line.replace(/`+[^`\n]*`+/g, '');
    for (const match of plain.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g)) checkLink(source, match[1] ?? match[2], index + 1);
    for (const match of plain.matchAll(/!?\[([^\]]+)\]\[([^\]]*)\]/g)) {
      const key = (match[2] || match[1]).toLowerCase(), href = definitions.get(key);
      if (href) checkLink(source, href, index + 1); else issues.push({ source, line: index + 1, href: key, problem: 'undefined-reference' });
    }
  }
}
function reachFrom(seeds) {
  const found = new Set(), visit = path => { if (found.has(path)) return; found.add(path); for (const next of edges.get(path) ?? []) visit(next); };
  for (const path of seeds) visit(path); return found;
}
const reachable = reachFrom(['README.md', 'AGENTS.md', 'docs/README.md']), indexed = reachFrom(['docs/README.md']);
const orphanDocs = markdown.filter(path => path.startsWith('docs/') && !indexed.has(path));
const backlog = sources.get('docs/BACKLOG.md') ?? '', todo = sources.get('docs/TODO.md') ?? '';
const checked = [...withoutCode(backlog).matchAll(/^\s*- \[x\] /gmi)].length;
const open = [...withoutCode(backlog).matchAll(/^\s*- \[ \] /gm)].length;
const completeMilestones = [...todo.matchAll(/^\d+\. ✅ /gm)].length, openMilestones = [...todo.matchAll(/^\d+\. ⬜ /gm)].length;
const metrics = { backlog: { complete: checked, open, total: checked + open, percent: Math.round(100 * checked / (checked + open)) },
  mvp: { complete: completeMilestones, open: openMilestones, total: completeMilestones + openMilestones, percent: Math.round(100 * completeMilestones / (completeMilestones + openMilestones)) } };
for (const [path, text] of [['docs/TODO.md', todo], ['docs/BACKLOG.md', backlog]]) {
  if (!text.includes(`${checked} ze ${checked + open}`)) issues.push({ source: path, problem: 'backlog-count-summary', expected: `${checked} ze ${checked + open}` });
}
if (!todo.includes(`${completeMilestones} z ${completeMilestones + openMilestones}`)) issues.push({ source: 'docs/TODO.md', problem: 'mvp-count-summary' });
for (const [path, text, percent] of [['docs/TODO.md', todo, metrics.mvp.percent], ['docs/TODO.md', todo, metrics.backlog.percent], ['docs/BACKLOG.md', backlog, metrics.backlog.percent]]) {
  if (!text.includes(`**${percent} %**`)) issues.push({ source: path, problem: 'percentage-summary', expected: percent });
}
const snapshotsPath = resolve(root, 'docs/archive/snapshots.json'), snapshots = [];
if (existsSync(snapshotsPath)) for (const row of JSON.parse(readFileSync(snapshotsPath, 'utf8')).snapshots) {
  const path = resolve(root, row.path), actual = existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
  snapshots.push({ path: row.path, unchanged: actual === row.sha256 });
  if (actual !== row.sha256) issues.push({ source: row.path, problem: 'snapshot-integrity' });
}
const report = { markdownDocuments: markdown.length, documentationDocuments: markdown.filter(path => path.startsWith('docs/')).length,
  internalLinks: linkCount, metrics, issues, orphanDocs, snapshots,
  inventory: [...sources].filter(([path]) => path.startsWith('docs/')).map(([path, text]) => ({ path, lines: text.split('\n').length, reachable: reachable.has(path) })) };
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(JSON.stringify({ ...report, inventory: undefined }, null, 2));
  console.log('Scope: tracked/unignored Markdown links, GFM heading/HTML anchors, reachability, metrics and registered snapshot bytes. External URLs, local secrets and historical plain-text contents are not crawled.');
}
if (!process.argv.includes('--audit') && (issues.length || orphanDocs.length)) process.exitCode = 1;
