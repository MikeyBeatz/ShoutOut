import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { assertDevelopmentProject, devProject, fingerprint, loadConfig, root, validateConfig, verifyBuild } from './web_environment.mjs';

const dev = loadConfig('dev');
const prod = {
  ...dev, environment: 'prod', appUrl: 'https://go.shoutout-app.eu',
  hostingSite: 'example-shoutout-live', firebase: {
    ...dev.firebase, projectId: 'example-shoutout-live',
    messagingSenderId: '123456789000', appId: '1:123456789000:web:abc123',
    authDomain: 'example-shoutout-live.firebaseapp.com',
    storageBucket: 'example-shoutout-live.firebasestorage.app',
  },
};

test('configuration rejects wrong environment, incomplete production and reused projects', () => {
  assert.equal(validateConfig(prod, 'prod'), prod);
  assert.throws(() => validateConfig(dev, 'prod'));
  const example = JSON.parse(readFileSync(join(root, 'config/prod.json.example'), 'utf8'));
  assert.throws(() => validateConfig(example, 'prod'));
  for (const projectId of [devProject, 'shoutout-production-a1b34']) {
    assert.throws(() => validateConfig({ ...prod, firebase: {
      ...prod.firebase, projectId, authDomain: `${projectId}.firebaseapp.com`,
      storageBucket: `${projectId}.firebasestorage.app`,
    } }, 'prod'));
  }
  assert.throws(() => validateConfig({ ...prod, appUrl: dev.appUrl }, 'prod'));
  assert.throws(() => validateConfig({ ...prod, firebase: { ...prod.firebase,
    messagingSenderId: dev.firebase.messagingSenderId, appId: dev.firebase.appId,
  } }, 'prod'));
  assert.throws(() => validateConfig({ ...prod, firebase: { ...prod.firebase, messagingSenderId: '0' } }, 'prod'));
});

test('deployment rejects wrong target, debug builds, changed configuration and changed files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shoutout-build-'));
  try {
    writeFileSync(join(dir, 'main.dart.js'), 'test compiled application');
    const manifest = { mode: 'release', config: dev, files: fingerprint(dir) };
    assert.doesNotThrow(() => verifyBuild(dev, manifest, devProject, dir));
    for (const project of [undefined, prod.firebase.projectId, 'shoutout-production-a1b34']) {
      assert.throws(() => verifyBuild(dev, manifest, project, dir));
    }
    assert.throws(() => verifyBuild(dev, { ...manifest, mode: 'debug' }, devProject, dir));
    assert.throws(() => verifyBuild(prod, manifest, prod.firebase.projectId, dir));
    writeFileSync(join(dir, 'main.dart.js'), 'changed application');
    assert.throws(() => verifyBuild(dev, manifest, devProject, dir));
    writeFileSync(join(dir, 'main.dart.js'), 'test compiled application');
    writeFileSync(join(dir, 'unexpected.json'), '{}');
    assert.throws(() => verifyBuild(dev, manifest, devProject, dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('development guard rejects non-dev credentials before Admin SDK initialization', () => {
  assert.doesNotThrow(() => assertDevelopmentProject(devProject));
  const dir = mkdtempSync(join(tmpdir(), 'shoutout-credentials-'));
  try {
    for (const project of [prod.firebase.projectId, 'shoutout-production-a1b34', undefined]) {
      assert.throws(() => assertDevelopmentProject(project));
      const key = join(dir, 'fake.json');
      writeFileSync(key, JSON.stringify({ project_id: project }));
      for (const script of ['enable_test_user_tutorial.mjs', 'round_shout_locations.mjs', 'set_moderator.mjs']) {
        const result = spawnSync(process.execPath, [join(root, 'tools', script), 'test@example.invalid'], {
          env: { ...process.env, FIREBASE_SERVICE_ACCOUNT_PATH: key }, encoding: 'utf8',
        });
        assert.notEqual(result.status, 0, script);
        assert.match(result.stderr, /Development tools only support/, script);
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unknown environment exits before launching Flutter', () => {
  const result = spawnSync(process.execPath, [join(root, 'tools/web_environment.mjs'), 'build', 'unknown'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected dev or prod/);
});

test('auth action uses supplied project and rejects missing config or cross-environment hosts', async () => {
  const source = readFileSync(join(root, 'web/auth-action.html'), 'utf8')
    .match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/^\s*import .*;$/gm, '');
  for (const [config, hostname, allowed] of [
    [dev, 'shoutout-dev-46c81.web.app', true],
    [prod, 'go.shoutout-app.eu', true],
    [dev, 'go.shoutout-app.eu', false],
    [prod, 'shoutout-dev-46c81.web.app', false],
    [{ ...prod, firebase: dev.firebase }, 'go.shoutout-app.eu', false],
    [null, 'go.shoutout-app.eu', false],
  ]) {
    const elements = new Map();
    const initialized = [];
    const applied = [];
    const getElement = key => {
      if (!elements.has(key)) elements.set(key, { hidden: true });
      return elements.get(key);
    };
    await runInNewContext(`(async () => { ${source} })()`, {
      document: { documentElement: {}, querySelector: getElement },
      navigator: { language: 'en' },
      location: { hostname, search: '?mode=verifyEmail&oobCode=test-only' },
      URLSearchParams,
      fetch: async () => ({ ok: !!config, json: async () => config }),
      initializeApp: value => { initialized.push(value); return {}; },
      getAuth: () => ({}),
      applyActionCode: async (_, code) => { applied.push(code); },
    });
    assert.equal(initialized.length, allowed ? 1 : 0);
    assert.equal(applied.length, allowed ? 1 : 0);
    if (allowed) assert.equal(initialized[0].projectId, config.firebase.projectId);
    else assert.equal(getElement('#title').textContent, 'Invalid request');
  }
});
