import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const devProject = 'shoutout-dev-46c81';
export const prodProject = 'shoutout-production-a1b34';
export const presentationSite = prodProject;
export function assertDevelopmentProject(project) {
  if (project !== devProject) throw new Error('Development tools only support shoutout-dev-46c81.');
}

export function validateConfig(config, environment) {
  if (!['dev', 'prod'].includes(environment) || config.environment !== environment) {
    throw new Error('Choose a matching dev or prod configuration.');
  }
  const f = config.firebase ?? {};
  for (const key of ['apiKey', 'appId', 'projectId', 'messagingSenderId', 'authDomain', 'storageBucket']) {
    if (typeof f[key] !== 'string' || !f[key].trim()) throw new Error(`Missing Firebase field: ${key}`);
  }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(f.projectId) ||
      !/^1:\d+:web:[a-zA-Z0-9]+$/.test(f.appId) ||
      !f.appId.startsWith(`1:${f.messagingSenderId}:web:`) ||
      f.authDomain !== `${f.projectId}.firebaseapp.com` ||
      ![`${f.projectId}.firebasestorage.app`, `${f.projectId}.appspot.com`].includes(f.storageBucket) ||
      typeof config.hostingSite !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(config.hostingSite)) {
    throw new Error('Inconsistent Firebase project, app or Hosting site.');
  }
  if (environment === 'dev') {
    assertDevelopmentProject(f.projectId);
    if (config.appUrl !== `https://${devProject}.web.app` || config.hostingSite !== devProject) {
      throw new Error('Development URL and Hosting site must match the dev project.');
    }
  } else if (f.projectId !== prodProject ||
      f.messagingSenderId === '696035472864' ||
      [devProject, presentationSite].includes(config.hostingSite) ||
      config.appUrl !== 'https://go.shoutout-app.eu') {
    throw new Error('Production must use the shared production project, a separate app Hosting site and go domain.');
  }
  return config;
}

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
export function loadConfig(environment) {
  if (!['dev', 'prod'].includes(environment)) throw new Error('Expected dev or prod.');
  const path = join(root, 'config', `${environment}.json`);
  if (!existsSync(path)) throw new Error(`Missing config/${environment}.json; configure this environment before building.`);
  return validateConfig(readJson(path), environment);
}
export function fingerprint(directory) {
  const result = {};
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Build must not contain symlinks.');
    if (entry.isDirectory()) {
      for (const [name, hash] of Object.entries(fingerprint(path))) result[`${entry.name}/${name}`] = hash;
    } else {
      result[entry.name] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  }
  return result;
}
export function verifyBuild(config, manifest, project, directory) {
  validateConfig(config, config.environment);
  if (!project || project !== config.firebase.projectId) throw new Error('Deployment project does not match build environment.');
  if (manifest.mode !== 'release' || JSON.stringify(manifest.config) !== JSON.stringify(config)) {
    throw new Error('A matching release build is required.');
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(fingerprint(directory))) {
    throw new Error('Build files changed; rebuild before deployment.');
  }
}

export function buildHostingConfig(config, hosting) {
  validateConfig(config, config.environment);
  // Never inherit a presentation or development target from another config.
  const { target, ...settings } = hosting;
  return { hosting: {
    ...settings, public: `build/web-${config.environment}`,
    site: config.hostingSite,
    predeploy: [`node tools/web_environment.mjs check ${config.environment}`],
  } };
}

function run(program, args) {
  // Windows .bat/.cmd launchers require cmd.exe; all arguments are quoted using
  // Windows command-line rules. Configuration JSON is passed through a file.
  let result;
  if (process.platform === 'win32') {
    const found = spawnSync('where.exe', [program], { encoding: 'utf8' });
    const launcher = found.stdout?.split(/\r?\n/).find(path => /\.(bat|cmd|exe)$/i.test(path));
    if (!launcher) throw new Error(`Cannot locate ${program} on PATH.`);
    for (const value of [launcher, ...args]) {
      if (/["%\r\n]/.test(value)) throw new Error('Unsupported command argument.');
    }
    result = spawnSync(process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/v:off', '/s', '/c', `"${[launcher, ...args].map(value => `"${value}"`).join(' ')}"`],
      { cwd: root, stdio: 'inherit', windowsVerbatimArguments: true });
  } else {
    result = spawnSync(program, args, { cwd: root, stdio: 'inherit' });
  }
  if (result.error || result.status !== 0) throw new Error(`${program} failed (${result.status}).`);
}

export function main(args) {
  const [command, environment, ...flags] = args;
  if (!['prepare', 'build', 'check', 'deploy'].includes(command) ||
      flags.some(flag => !['--debug', '--apply'].includes(flag) && !/^--project=[a-z0-9-]+$/.test(flag)) ||
      (command !== 'build' && flags.includes('--debug')) ||
      (command !== 'deploy' && flags.includes('--apply'))) {
    throw new Error('Usage: node tools/web_environment.mjs prepare|build|check|deploy dev|prod [--debug] [--project=ID] [--apply]');
  }
  const config = loadConfig(environment);
  const directory = join(root, 'build', `web-${environment}`);
  const manifestPath = join(root, 'build', 'environments', `${environment}.manifest.json`);
  const definesPath = join(root, 'build', 'environments', `${environment}.defines.json`);
  if (command === 'prepare' || command === 'build') {
    writeJson(definesPath, { SHOUTOUT_CONFIG: JSON.stringify(config) });
    console.log(`Prepared ${environment}: ${config.firebase.projectId} → ${config.appUrl}`);
    if (command === 'prepare') return;
    if (existsSync(manifestPath)) rmSync(manifestPath);
    const geoPath = join(root, environment === 'dev' ? '.geoapify.json' : '.geoapify.prod.json');
    const geo = existsSync(geoPath) ? readJson(geoPath) : {};
    if (!geo || typeof geo !== 'object' || Object.keys(geo).some(key => key !== 'GEOAPIFY_API_KEY')) {
      throw new Error('Geoapify file must contain only GEOAPIFY_API_KEY.');
    }
    const debug = flags.includes('--debug');
    if (!debug && (typeof geo.GEOAPIFY_API_KEY !== 'string' || !geo.GEOAPIFY_API_KEY.trim())) {
      throw new Error('Release requires the environment-specific Geoapify file.');
    }
    const buildArgs = ['build', 'web', debug ? '--debug' : '--release',
      '--output', directory, `--dart-define-from-file=${definesPath}`];
    if (existsSync(geoPath)) buildArgs.push(`--dart-define-from-file=${geoPath}`);
    run('flutter', buildArgs);
    writeJson(join(directory, 'app-config.json'), config);
    writeJson(manifestPath, { mode: debug ? 'debug' : 'release', config, files: fingerprint(directory) });
    return;
  }
  const project = flags.find(flag => flag.startsWith('--project='))?.slice(10) ??
    (command === 'check' ? process.env.GCLOUD_PROJECT : undefined);
  verifyBuild(config, readJson(manifestPath), project, directory);
  if (command === 'check') {
    if (process.env.RESOURCE_DIR && resolve(process.env.RESOURCE_DIR) !== directory) {
      throw new Error('Hosting resource directory does not match verified build.');
    }
    console.log(`Verified release for ${project}.`);
    return;
  }
  console.log(`Hosting only: ${project} / ${config.hostingSite} → ${config.appUrl}`);
  if (!flags.includes('--apply')) {
    console.log('Preview only. Add --apply after deployment approval.');
    return;
  }
  const hosting = readJson(join(root, 'firebase.json')).hosting;
  const deploymentConfig = join(root, `.firebase-hosting-${environment}.json`);
  writeJson(deploymentConfig, buildHostingConfig(config, hosting));
  run('firebase', ['deploy', '--only', 'hosting', '--project', project, '--config', deploymentConfig]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
