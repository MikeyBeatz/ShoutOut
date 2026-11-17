import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startReadSyncTransportFixture } from './read_sync_transport_fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await startReadSyncTransportFixture();
console.log(`B2 transport fixture: ${fixture.origin}; loopback only, no Firebase.`);
try {
  const args = ['test', '--platform', 'chrome', 'test/read_sync_transport_browser.dart'];
  const explicit = process.env.DART_BIN;
  // A fixed command is used only for the Windows .bat launcher; no user text.
  const child = process.platform === 'win32' && !explicit
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'dart test --platform chrome test/read_sync_transport_browser.dart'], { cwd: root, stdio: 'inherit' })
    : spawn(explicit ?? 'dart', args, { cwd: root, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill(), 180000);
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('exit', value => resolve(value ?? 1));
    });
  } finally { clearTimeout(timer); }
  if (code === 0 && fixture.remaining() !== 0) throw Error('Local HTTP fixtures were not cleaned');
  process.exitCode = code;
} finally { await fixture.close(); }
