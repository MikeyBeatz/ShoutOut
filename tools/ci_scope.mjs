// Node + Git only: this selector runs before installing application dependencies.
import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value);
const lightweightTools = new Set(['tools/check_docs.mjs', 'tools/project_progress.mjs', 'tools/project_progress.test.mjs']);
const lightweightPath = path => typeof path === 'string' && path.length > 0 &&
  !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(p => p === '..' || p === '.') &&
  (/^docs\/[\s\S]+\.(?:md|txt)$/.test(path) || ['docs/progress.json', 'docs/archive/snapshots.json'].includes(path) || /^(?:.+\/)?README\.md$/.test(path) ||
    path === 'AGENTS.md' || lightweightTools.has(path));
const full = (reason, changed = 0) => ({ full: true, reason, changed });

export function parseChangedPaths(raw) {
  if (!raw || !raw.endsWith('\0')) throw new Error('invalid-diff');
  const fields = raw.slice(0, -1).split('\0'), changes = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++];
    if (!/^(?:[AMDUTXB]|[RC]\d{1,3})$/.test(status)) throw new Error('invalid-diff-status');
    const count = /^[RC]/.test(status) ? 2 : 1, paths = fields.slice(i, i + count); i += count;
    if (paths.length !== count || paths.some(p => !p)) throw new Error('incomplete-diff');
    changes.push({ status, paths });
  }
  return changes;
}

export function classifyChanges(changes) {
  if (!Array.isArray(changes) || !changes.length) return full('empty-or-unknown-range');
  for (const change of changes) {
    if (!change || !/^(?:[AMD]|[RC]\d{1,3})$/.test(change.status) || !Array.isArray(change.paths) ||
        change.paths.length !== (/^[RC]/.test(change.status) ? 2 : 1)) return full('unsupported-change', changes.length);
    if (change.paths.some(p => !lightweightPath(p))) return full('application-or-infrastructure-change', changes.length);
    if (change.status === 'D' && change.paths.some(p => lightweightTools.has(p))) return full('checker-removed', changes.length);
    if (/^[RC]/.test(change.status) && change.paths.some(p => lightweightTools.has(p))) return full('checker-moved', changes.length);
  }
  return { full: false, reason: 'documentation-and-progress-only', changed: changes.length };
}

function command(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000 });
  if (result.status !== 0 || result.error) throw new Error('git-range-unavailable');
  return result.stdout;
}

export function selectCiScope({ cwd, eventName, event, expectedSha, git = args => command(cwd, args) }) {
  // Dispatch is also the explicit way to obtain full release checks for a
  // documentation-only commit. Unknown ranges always stay conservative.
  if (eventName === 'workflow_dispatch') return full('manual-full-check');
  if (!['push', 'pull_request'].includes(eventName)) return full('unknown-event');
  try {
    const head = git(['rev-parse', 'HEAD']).trim();
    if (!sha(head) || !sha(expectedSha) || head !== expectedSha) return full('checkout-mismatch');
    let base;
    if (eventName === 'push') {
      if (!sha(event?.after) || event.after !== head || event.deleted || typeof event.ref !== 'string' || !event.ref.startsWith('refs/heads/')) return full('tag-or-invalid-push');
      if (event.before === '0'.repeat(40) && event.created === true) {
        // Common first push of a documentation branch: its sole parent is an
        // existing remote branch tip. Diff that immutable, known source tree.
        // A multi-commit/unrelated new branch with no known parent runs full.
        const parents = git(['show', '-s', '--format=%P', head]).trim().split(' ');
        const remote = new Set(git(['ls-remote', '--heads', 'origin']).split('\n')
          .map(line => line.match(/^([a-f0-9]{40})\trefs\/heads\/\S+$/)?.[1]).filter(hash => sha(hash) && hash !== head));
        if (parents.length !== 1 || !remote.has(parents[0])) return full('new-branch-base-unknown');
        base = parents[0];
      } else {
        if (!sha(event.before)) return full('invalid-push-base');
        base = event.before;
      }
      try { git(['cat-file', '-e', `${base}^{commit}`]); }
      catch { git(['fetch', '--no-tags', '--depth=1', 'origin', base]); }
    } else {
      base = event?.pull_request?.base?.sha;
      const source = event?.pull_request?.head?.sha;
      if (!sha(base) || !sha(source)) return full('invalid-pull-request');
      // actions/checkout defaults to the PR merge commit. Compare that exact
      // tested tree with its base, including both sides of every rename.
      const parents = git(['show', '-s', '--format=%P', head]).trim().split(' ');
      if (parents.length !== 2 || !parents.includes(base) || !parents.includes(source)) return full('unexpected-pr-checkout');
    }
    return classifyChanges(parseChangedPaths(git(['diff', '--name-status', '-z', '--find-renames', base, head])));
  } catch { return full('range-detection-failed'); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let selection;
  try {
    selection = selectCiScope({ cwd: process.cwd(), eventName: process.env.GITHUB_EVENT_NAME,
      expectedSha: process.env.GITHUB_SHA, event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) });
  } catch { selection = full('event-detection-failed'); }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `full=${selection.full}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### CI scope\n\nMode: **${selection.full ? 'full application checks' : 'documentation and progress only'}**\n\nReason: ${selection.reason}; changed entries: ${selection.changed}.\n`);
  console.log(JSON.stringify(selection));
}
