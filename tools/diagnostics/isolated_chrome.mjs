// Test-only Chrome, connected through the pipe of our own child process.
// Never attaches to a running browser, existing user profile or remote port.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function isolatedChrome({ executable, outputRoot }) {
  const root = resolve(outputRoot), profile = resolve(root, `profile-${randomUUID()}`);
  const within = relative(root, profile);
  if (!within || within.startsWith('..') || isAbsolute(within)) throw Error('Invalid isolated profile');
  await mkdir(profile, { recursive: true });
  const child = spawn(executable, [
    '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1000,700', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise(accept => { child.once('exit', accept); child.once('error', accept); });
  // Browser stderr is not persisted: it can contain third-party query strings.
  child.stderr.resume();
  const pending = new Map(), listeners = new Set();
  let sequence = 0, buffer = '', closed = false;
  function send(method, params = {}, sessionId) {
    if (closed) return Promise.reject(Error('Isolated Chrome closed'));
    const id = ++sequence;
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`Diagnostic CDP timeout: ${method}`)); }, 20000);
      pending.set(id, { accept, reject, timer });
      child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
  const fail = () => {
    closed = true;
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(Error('Isolated Chrome exited')); }
    pending.clear();
  };
  child.on('error', fail); child.on('exit', fail);
  child.stdio[4].on('data', value => {
    buffer += value.toString();
    let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      if (message.id) {
        const request = pending.get(message.id);
        if (!request) continue;
        pending.delete(message.id); clearTimeout(request.timer);
        if (message.error) request.reject(Error(`Diagnostic CDP error: ${message.error.message}`));
        else request.accept(message.result);
      } else for (const listener of listeners) listener(message);
    }
  });
  try { await send('Browser.getVersion'); }
  catch (error) { child.kill(); throw new Error('Unable to start isolated test Chrome', { cause: error }); }
  return {
    send,
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async page() {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      return { targetId, sessionId };
    },
    async screenshot(sessionId, filename) {
      const result = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(filename, Buffer.from(result.data, 'base64'));
    },
    async close() {
      if (!closed) { try { await send('Browser.close'); } catch { /* Own child can already have exited. */ } }
      if (!closed) child.kill();
      await exited;
      // Verify the absolute target stays within the explicit diagnostic output.
      const checked = relative(root, resolve(profile));
      if (!checked || checked.startsWith('..') || isAbsolute(checked)) throw Error('Unsafe diagnostic cleanup target');
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
