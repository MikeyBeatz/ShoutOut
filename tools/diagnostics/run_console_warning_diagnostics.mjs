// Manual, isolated diagnostic. Not part of normal app startup or CI.
// Builds the renderer probe separately first; no Firebase SDK/token/Auth/data calls.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { isolatedChrome } from './isolated_chrome.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'build/console-warning-diagnostics');
const webRoot = resolve(root, 'build/console-warning-probe-web');
const fontsOnly = process.argv.includes('--fonts-only');
const recaptchaOnly = process.argv.includes('--recaptcha-only');
const devReadonly = process.argv.includes('--dev-readonly');
assert(!(fontsOnly && recaptchaOnly));
assert(process.argv.slice(2).every(value => ['--fonts-only', '--recaptcha-only', '--dev-readonly'].includes(value)), 'Unexpected diagnostic option');
await stat(resolve(webRoot, 'main.dart.js'));
await mkdir(output, { recursive: true });
const config = JSON.parse(await readFile(resolve(root, 'config/dev.json'), 'utf8'));
assert.equal(config.firebase.projectId, 'shoutout-dev-46c81');
assert(/^[A-Za-z0-9_-]+$/.test(config.appCheckSiteKey), 'Existing public DEV site key required');
// Read the actual two constant symbols; do not initialize the production app.
const source = await readFile(resolve(root, 'lib/src/shout_model.dart'), 'utf8');
const offer = source.match(/'Nabídka': '([^']+)'/)?.[1], warning = source.match(/'Varování!': '([^']+)'/)?.[1];
assert(offer && warning, 'Expected category constants');
const inputs = { offer: `${offer} Nabídka`, warning: `${warning} Varování!` };

const sanitizedUrl = value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? `${url.origin}${url.pathname}` : url.protocol;
  } catch { return 'unavailable'; }
};
const sanitizedText = value => String(value).replace(/https?:\/\/[^\s'"<>]+/g, sanitizedUrl)
  .replace(/nonce-[A-Za-z0-9+/_=-]+/g, 'nonce-[omitted]')
  .replace(/\b[A-Za-z0-9_-]{100,}\b/g, '[long-value-omitted]').slice(0, 1800);
function frameRule(value) {
  return String(value ?? '').split(';').map(row => row.trim()).filter(row => row.startsWith('frame-ancestors'));
}
function recaptchaHtml(host) {
  assert(['www.google.com', 'www.recaptcha.net'].includes(host));
  return `<!doctype html><meta charset="utf-8"><title>Isolated reCAPTCHA render probe</title>
<h1>Isolated reCAPTCHA render probe</h1><div id="probe" style="display:none"></div>
<p>Render only: no execute(), App Check token, Auth or database access.</p>
<script>window.probeLoaded=()=>grecaptcha.enterprise.ready(()=>{
  try { grecaptcha.enterprise.render('probe',{sitekey:${JSON.stringify(config.appCheckSiteKey)},size:'invisible'});
    document.body.dataset.recaptchaProbeReady='rendered';
  } catch(e) { document.body.dataset.recaptchaProbeReady='render-error'; console.error('RECAPTCHA_RENDER_ERROR '+e.name); }
});</script><script src="https://${host}/recaptcha/enterprise.js?render=explicit&onload=probeLoaded" async defer></script>`;
}
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/probe-inputs.json') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(inputs)); return;
    }
    if (url.pathname === '/csp-control.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><title>Report-only capture control</title><iframe src="http://localhost:${server.address().port}/csp-leaf.html"></iframe>`); return;
    }
    if (url.pathname === '/csp-leaf.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy-Report-Only': "frame-ancestors 'self'" });
      response.end('<!doctype html><title>Intentional local report-only control</title>Local control only'); return;
    }
    if (url.pathname === '/google-frame-control.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><title>Public Google frame control</title><iframe src="https://www.google.com/"></iframe>'); return;
    }
    if (url.pathname === '/recaptcha.html') {
      if (fontsOnly) { response.writeHead(404).end(); return; }
      const host = url.searchParams.get('host');
      if (!['www.google.com', 'www.recaptcha.net'].includes(host)) { response.writeHead(400).end(); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(recaptchaHtml(host)); return;
    }
    const filename = resolve(webRoot, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    const within = relative(webRoot, filename);
    if (!within || within.startsWith('..') || isAbsolute(within)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(filename);
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
      '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png' }[extname(filename)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }); response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
const origin = `http://127.0.0.1:${server.address().port}`;
const executable = process.env.CHROME_EXECUTABLE ?? (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
let chrome;
const cases = [], backendAttempts = [];
try {
  chrome = await isolatedChrome({ executable, outputRoot: output });
  const version = await chrome.send('Browser.getVersion');
  const specs = (recaptchaOnly ? [] : ['baseline', 'current-categories', 'categories', 'offer', 'warning', 'without-selector', 'selector-only'])
    .map(sample => ({ name: sample, kind: 'font', path: `/?sample=${sample}` }));
  if (!fontsOnly) {
    specs.push({ name: 'local-report-only-control', kind: 'control', path: '/csp-control.html' });
    specs.push({ name: 'google-frame-control', kind: 'control', path: '/google-frame-control.html' });
    for (const host of ['www.google.com', 'www.recaptcha.net']) specs.push({
      name: host, kind: 'recaptcha', path: `/recaptcha.html?host=${host}`,
    });
  }
  if (devReadonly) specs.push({ name: 'dev-readonly-startup', kind: 'dev', url: 'https://shoutout-dev-46c81.web.app/' });
  for (const spec of specs) {
    const page = await chrome.page(), { sessionId } = page;
    const result = { name: spec.name, kind: spec.kind, ready: false, notoWarnings: [], securityLogs: [],
      runtimeErrors: [], policyResponses: [], documentResponses: [], failedRequests: [], frames: [] };
    const seen = new Map();
    const sessions = new Set([sessionId]), setups = [];
    const configure = async id => {
      await chrome.send('Network.enable', {}, id);
      await chrome.send('Page.enable', {}, id);
      await chrome.send('Runtime.enable', {}, id);
      await chrome.send('Log.enable', {}, id);
      await chrome.send('Fetch.enable', { patterns: [
        { urlPattern: '*://*.googleapis.com/*', requestStage: 'Request' },
        { urlPattern: '*://*.cloudfunctions.net/*', requestStage: 'Request' },
        { urlPattern: '*://*.run.app/*', requestStage: 'Request' },
      ] }, id);
      await chrome.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
        filter: [{ type: 'iframe' }, { exclude: true }] }, id);
    };
    const off = chrome.onEvent(event => {
      if (!sessions.has(event.sessionId)) return;
      const p = event.params;
      if (event.method === 'Target.attachedToTarget') {
        sessions.add(p.sessionId);
        setups.push(configure(p.sessionId).then(() => chrome.send('Runtime.runIfWaitingForDebugger', {}, p.sessionId))
          .catch(error => result.runtimeErrors.push(sanitizedText(error.message))));
      }
      if (event.method === 'Fetch.requestPaused') {
        backendAttempts.push({ sample: spec.name, url: sanitizedUrl(p.request.url) });
        void chrome.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, event.sessionId).catch(() => {});
      }
      if (event.method === 'Network.requestWillBeSent') seen.set(p.requestId, sanitizedUrl(p.request.url));
      if (event.method === 'Network.loadingFailed') result.failedRequests.push({ url: seen.get(p.requestId), error: p.errorText });
      if (event.method === 'Network.responseReceived') {
        const response = p.response;
        const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value]));
        const info = { url: sanitizedUrl(response.url), status: response.status,
          enforced: frameRule(headers['content-security-policy']), reportOnly: frameRule(headers['content-security-policy-report-only']) };
        if (info.enforced.length || info.reportOnly.length) result.policyResponses.push(info);
        if (p.type === 'Document') result.documentResponses.push(info);
      }
      if (event.method === 'Page.frameNavigated') result.frames.push(sanitizedUrl(p.frame.url));
      if (event.method === 'Log.entryAdded' && p.entry.source === 'security') result.securityLogs.push(sanitizedText(p.entry.text));
      if (event.method === 'Runtime.exceptionThrown') {
        result.runtimeErrors.push(sanitizedText(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
      }
      if (event.method === 'Runtime.consoleAPICalled') {
        const message = p.args.map(arg => arg.value ?? '').join(' ');
        if (message.includes('Could not find a set of Noto fonts')) result.notoWarnings.push(sanitizedText(message));
      }
    });
    try {
      // Fail closed before any Firebase backend request, even if a dependency regresses.
      await configure(sessionId);
      assert(spec.url === undefined || spec.kind === 'dev' && spec.url === 'https://shoutout-dev-46c81.web.app/');
      assert(spec.url || spec.path.startsWith('/') && !spec.path.startsWith('//'));
      await chrome.send('Page.navigate', { url: spec.url ?? origin + spec.path }, sessionId);
      const deadline = Date.now() + 25000;
      do {
        await new Promise(accept => setTimeout(accept, 500));
        const checked = await chrome.send('Runtime.evaluate', {
          expression: spec.kind === 'font' ? 'document.body?.dataset.fontProbeReady ?? null'
            : ['control', 'dev'].includes(spec.kind) ? "document.readyState === 'complete'"
            : 'document.body?.dataset.recaptchaProbeReady ?? null',
          returnByValue: true,
        }, sessionId);
        result.ready = checked.result?.value ?? false;
      } while (!result.ready && Date.now() < deadline);
      await new Promise(accept => setTimeout(accept, spec.kind === 'font' ? 5000 : spec.kind === 'dev' ? 30000 : 10000));
      await Promise.all(setups);
      if (spec.kind === 'font' && ['categories', 'without-selector'].includes(spec.name)) {
        await chrome.screenshot(sessionId, resolve(output, `${spec.name}.png`));
      }
      cases.push(result);
      console.log(JSON.stringify({ name: result.name, ready: result.ready, notoWarnings: result.notoWarnings.length,
        securityLogs: result.securityLogs.length, policyResponses: result.policyResponses,
        runtimeErrors: result.runtimeErrors.length, failedRequests: result.failedRequests.length }));
    } finally { off(); await chrome.send('Target.closeTarget', { targetId: page.targetId }); }
  }
  const proof = { checkedAt: new Date().toISOString(), browser: version.product, origin: 'isolated loopback',
    firebaseBackendAttemptsBlocked: backendAttempts, firebaseBackendRequestsAllowed: 0,
    componentProbesCallExecute: false, devStartupMayExecuteRecaptcha: devReadonly,
    appCheckExchangeBlocked: true, userProfileAttached: false, cases };
  await writeFile(resolve(output, fontsOnly ? 'fonts-proof.json' : recaptchaOnly ? 'recaptcha-proof.json' : 'proof.json'), JSON.stringify(proof, null, 2) + '\n');
  assert(backendAttempts.every(attempt => attempt.sample === 'dev-readonly-startup'),
    'Unexpected Firebase backend request was blocked in an isolated component probe');
  assert(cases.filter(row => row.kind === 'font').every(row => row.ready), 'A renderer probe did not reach its first frame');
  for (const name of ['baseline', 'without-selector']) {
    const control = cases.find(row => row.name === name);
    if (control) assert.equal(control.notoWarnings.length, 0, 'Renderer negative control failed');
  }
  if (!fontsOnly) assert(cases.find(row => row.name === 'local-report-only-control').securityLogs.length > 0,
    'Local positive CSP control was not observed; absence of Google warnings would be inconclusive');
} finally {
  try { if (chrome) await chrome.close(); }
  finally {
    server.closeAllConnections();
    await new Promise(accept => server.close(accept));
  }
}
