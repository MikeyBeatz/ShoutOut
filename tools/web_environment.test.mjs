import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { assertDevelopmentProject, buildHostingConfig, devProject, prodProject, presentationSite, fingerprint, loadConfig, root, validateConfig, verifyBuild } from './web_environment.mjs';

const dev = loadConfig('dev');

test('Shout saves default off and independently require App Check and a boolean', () => {
  const defaults = { ...dev };
  delete defaults.serverShoutSaves;
  assert.doesNotThrow(() => validateConfig(defaults, 'dev'));
  assert.doesNotThrow(() => validateConfig({ ...dev, serverShoutSaves: true }, 'dev'));
  assert.throws(() => validateConfig({ ...dev, serverShoutSaves: 'true' }, 'dev'));
  const config = { ...defaults, serverShoutCreation: false, serverCommentCreation: false,
    serverPrivateReplyCreation: false, serverShoutReactions: false, serverCommentReactions: false };
  delete config.appCheckSiteKey;
  assert.doesNotThrow(() => validateConfig(config, 'dev'));
  assert.throws(() => validateConfig({ ...config, serverShoutSaves: true }, 'dev'));
});

test('web App Check configuration gates server publishing', () => {
  const withoutAppCheck = { ...dev, serverShoutCreation: false,
    serverCommentCreation: false, serverPrivateReplyCreation: false, serverShoutReactions: false, serverCommentReactions: false };
  delete withoutAppCheck.appCheckSiteKey;
  assert.throws(() => validateConfig({ ...withoutAppCheck, serverShoutCreation: true }, 'dev'));
  assert.throws(() => validateConfig({ ...dev, serverShoutCreation: 'true' }, 'dev'));
  assert.throws(() => validateConfig({ ...dev, appCheckSiteKey: '' }, 'dev'));
  assert.doesNotThrow(() => validateConfig({ ...dev,
    appCheckSiteKey: 'test-only-recaptcha-enterprise-key', serverShoutCreation: true }, 'dev'));
  assert.throws(() => validateConfig({ ...withoutAppCheck, serverShoutCreation: false, serverCommentCreation: true }, 'dev'));
  assert.throws(() => validateConfig({ ...dev, serverCommentCreation: 'true' }, 'dev'));
  assert.doesNotThrow(() => validateConfig({ ...dev, serverCommentCreation: true }, 'dev'));
  assert.throws(() => validateConfig({ ...withoutAppCheck, serverShoutCreation: false, serverCommentCreation: false, serverPrivateReplyCreation: true }, 'dev'));
  assert.throws(() => validateConfig({ ...dev, serverPrivateReplyCreation: 'true' }, 'dev'));
  assert.doesNotThrow(() => validateConfig({ ...dev, serverPrivateReplyCreation: true }, 'dev'));
});
const prod = {
  ...dev, environment: 'prod', appUrl: 'https://go.shoutout-app.eu',
  hostingSite: 'example-shoutout-live', firebase: {
    ...dev.firebase, apiKey: 'test-only-api-key', projectId: prodProject,
    messagingSenderId: '123456789000', appId: '1:123456789000:web:abc123',
    authDomain: `${prodProject}.firebaseapp.com`,
    storageBucket: `${prodProject}.firebasestorage.app`,
  },
};

test('comment reactions have an independent optional flag requiring App Check', () => {
  const defaults = { ...dev };
  delete defaults.serverCommentReactions;
  assert.doesNotThrow(() => validateConfig(defaults, 'dev'));
  assert.doesNotThrow(() => validateConfig({ ...defaults, serverCommentReactions: true }, 'dev'));
  assert.throws(() => validateConfig({ ...defaults, serverCommentReactions: 'true' }, 'dev'));
  const config = { ...defaults, serverShoutCreation: false, serverCommentCreation: false,
    serverPrivateReplyCreation: false, serverShoutReactions: false, serverCommentReactions: true };
  delete config.appCheckSiteKey;
  assert.throws(() => validateConfig(config, 'dev'));
});

test('Shout reactions remain optional and require a boolean and App Check', () => {
  const defaults = { ...dev };
  delete defaults.serverShoutReactions;
  assert.doesNotThrow(() => validateConfig(defaults, 'dev'));
  assert.doesNotThrow(() => validateConfig({ ...dev, serverShoutReactions: true }, 'dev'));
  assert.throws(() => validateConfig({ ...dev, serverShoutReactions: 'true' }, 'dev'));
  const config = { ...dev, serverShoutCreation: false, serverCommentCreation: false,
    serverPrivateReplyCreation: false, serverShoutReactions: true, serverCommentReactions: false };
  delete config.appCheckSiteKey;
  assert.throws(() => validateConfig(config, 'dev'));
});

test('production accepts the shared project with a separate app site and rejects unsafe configurations', () => {
  assert.equal(validateConfig(prod, 'prod'), prod);
  assert.throws(() => validateConfig(dev, 'prod'));
  const example = JSON.parse(readFileSync(join(root, 'config/prod.json.example'), 'utf8'));
  assert.throws(() => validateConfig(example, 'prod'));
  for (const projectId of [devProject, 'unapproved-project']) {
    assert.throws(() => validateConfig({ ...prod, firebase: {
      ...prod.firebase, projectId, authDomain: `${projectId}.firebaseapp.com`,
      storageBucket: `${projectId}.firebasestorage.app`,
    } }, 'prod'));
  }
  for (const hostingSite of [presentationSite, devProject, '']) {
    assert.throws(() => validateConfig({ ...prod, hostingSite }, 'prod'));
  }
  assert.throws(() => validateConfig({ ...prod, appUrl: dev.appUrl }, 'prod'));
  assert.throws(() => validateConfig({ ...prod, firebase: { ...prod.firebase,
    messagingSenderId: dev.firebase.messagingSenderId, appId: dev.firebase.appId,
  } }, 'prod'));
  assert.throws(() => validateConfig({ ...prod, firebase: { ...prod.firebase, messagingSenderId: '0' } }, 'prod'));
});

test('Hosting configuration keeps the application separate from the landing site', () => {
  const presentation = JSON.parse(readFileSync(join(root, 'presentation/firebase.json'), 'utf8'));
  assert.equal(presentation.hosting.site, presentationSite);
  const base = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8')).hosting;
  const config = buildHostingConfig(prod, { ...base, target: 'landing' });
  assert.deepEqual(Object.keys(config), ['hosting']);
  assert.equal(config.hosting.site, prod.hostingSite);
  assert.notEqual(config.hosting.site, presentation.hosting.site);
  assert.equal(config.hosting.public, 'build/web-prod');
  assert.equal(config.hosting.target, undefined);
  assert.deepEqual(config.hosting.predeploy, ['node tools/web_environment.mjs check prod']);
  assert.deepEqual(buildHostingConfig(dev, base).hosting, base);
  assert.throws(() => buildHostingConfig({ ...prod, hostingSite: presentationSite }, base));
});

test('deployment rejects wrong target, debug builds, changed configuration and changed files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shoutout-build-'));
  try {
    writeFileSync(join(dir, 'main.dart.js'), 'test compiled application');
    const manifest = { mode: 'release', config: dev, files: fingerprint(dir) };
    assert.doesNotThrow(() => verifyBuild(dev, manifest, devProject, dir));
    for (const project of [undefined, prodProject, 'unapproved-project']) {
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
    for (const project of [prodProject, 'unapproved-project', undefined]) {
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

test('App Check probe cannot be included in production or non-build commands', () => {
  for (const args of [['build', 'prod'], ['prepare', 'dev'], ['deploy', 'dev']]) {
    const result = spawnSync(process.execPath, [join(root, 'tools/web_environment.mjs'), ...args, '--app-check-probe'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /build dev only/);
  }
});

test('development probe never displays an attestation token or initializes production', async () => {
  const source = readFileSync(join(root, 'tools/app_check_probe.html'), 'utf8')
    .match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;$/gm, '');
  for (const config of [dev, prod]) {
    const elements = new Map([
      ['#result', {textContent: ''}], ['#run', {}], ['#site-key', {value: 'test-only-public-site-key'}],
    ]);
    let starts = 0;
    let calls = 0;
    await runInNewContext(`(async()=>{${source}; await button.onclick();})()`, {
      document: {querySelector: key => elements.get(key)},
      window: {appCheckDiagnosticError: null},
      initializeApp: () => {starts++;return {};},
      initializeAppCheck: () => ({}),
      ReCaptchaEnterpriseProvider: function () {},
      getToken: async () => ({token:'private-attestation-token'}),
      fetch: async url => url === '/app-config.json'
        ? {json: async () => config}
        : (calls++, {status:401,json:async()=>({error:{message:'Authentication is required.'}})}),
    });
    const displayed = elements.get('#result').textContent;
    assert.equal(displayed.includes('private-attestation-token'), false);
    assert.equal(starts, config === dev ? 1 : 0);
    assert.equal(calls, config === dev ? 1 : 0);
  }
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
    [{ ...prod, hostingSite: presentationSite }, 'go.shoutout-app.eu', false],
    [{ ...prod, hostingSite: '' }, 'go.shoutout-app.eu', false],
    [prod, 'shoutout-app.eu', false],
    [{ ...prod, firebase: { ...prod.firebase, projectId: 'unapproved-project',
      authDomain: 'unapproved-project.firebaseapp.com' } }, 'go.shoutout-app.eu', false],
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
