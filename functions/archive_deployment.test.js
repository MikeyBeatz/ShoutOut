import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { archiveDeploymentProfile } from './archive_deployment.js';

test('release phases are DEV-only; rollback keeps disclosure, reader and identity purge', () => {
  for (const env of [{}, { GCLOUD_PROJECT: 'shoutout-production-a1b34' },
    { GCLOUD_PROJECT: 'shoutout-dev-46c81', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }]) {
    for (const phase of ['capture', 'active', 'rollback']) assert.equal(archiveDeploymentProfile(env, phase).phase, 'off');
  }
  const env = { GCLOUD_PROJECT: 'shoutout-dev-46c81' };
  const capture = archiveDeploymentProfile(env, 'capture');
  assert(capture.capture && capture.identity && capture.identityPurge && capture.disclosure); assert(!capture.reader && !capture.maintenance);
  const active = archiveDeploymentProfile(env, 'active'); assert(active.reader && active.maintenance);
  const rollback = archiveDeploymentProfile(env, 'rollback');
  assert(rollback.capture && rollback.reader && rollback.identity && rollback.identityPurge && rollback.disclosure); assert(!rollback.maintenance);
  assert.equal(archiveDeploymentProfile({ ...env, SHOUTOUT_ARCHIVE_RELEASE_PHASE: 'rollback' }, 'active').maintenance, false);
  assert.throws(() => archiveDeploymentProfile({ ...env, SHOUTOUT_ARCHIVE_RELEASE_PHASE: 'active' }, 'capture'), /escalation/);
  assert.throws(() => archiveDeploymentProfile({ ...env, SHOUTOUT_ARCHIVE_RELEASE_PHASE: 'off' }, 'active'), /escalation/);
  assert.throws(() => archiveDeploymentProfile({ ...env, GOOGLE_CLOUD_PROJECT: 'other' }), /ambiguous/);
  assert.throws(() => archiveDeploymentProfile(env, 'unknown'), /invalid/);
});

test('real DEV module graph selects the active reader and maintenance without reading a secret or database', () => {
  const script = `import {contentLifecycleConfiguration as lifecycle} from './content_lifecycle.js';
    import {archiveIdentityConfiguration as identity} from './archive_identity.js';
    import {contentLifecycleMaintenanceConfiguration as maintenance} from './content_lifecycle_runtime.js';
    import {currentLegalPolicy} from './legal_policy.js';
    console.log(JSON.stringify({lifecycle,identity,maintenance,legal:currentLegalPolicy()}));`;
  const value = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: import.meta.dirname, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GCLOUD_PROJECT: 'shoutout-dev-46c81', GOOGLE_CLOUD_PROJECT: 'shoutout-dev-46c81', FIRESTORE_EMULATOR_HOST: '', SHOUTOUT_ARCHIVE_RELEASE_PHASE: '' },
  }));
  assert.deepEqual(value.lifecycle, { enabled: true, captureEnabled: true, inlineParentAdoption: true });
  assert.deepEqual(value.identity, { enabled: true, purgeEnabled: true }); assert.equal(value.maintenance.enabled, true);
  assert.equal(value.legal.version, '2026-11-27'); assert.equal(value.legal.archiveDisclosureEnabled, true);
});

test('the actual fallback module graph preserves reader/capture/legal/identity purge and only pauses content maintenance', () => {
  const script = `import {contentLifecycleConfiguration as lifecycle} from './content_lifecycle.js';
    import {archiveIdentityConfiguration as identity} from './archive_identity.js';
    import {contentLifecycleMaintenanceConfiguration as maintenance} from './content_lifecycle_runtime.js';
    import {currentLegalPolicy} from './legal_policy.js';
    console.log(JSON.stringify({lifecycle,identity,maintenance,legal:currentLegalPolicy()}));`;
  const value = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: import.meta.dirname, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GCLOUD_PROJECT: 'shoutout-dev-46c81', GOOGLE_CLOUD_PROJECT: 'shoutout-dev-46c81',
      FIRESTORE_EMULATOR_HOST: '', SHOUTOUT_ARCHIVE_RELEASE_PHASE: 'rollback' },
  }));
  assert.deepEqual(value.lifecycle, { enabled: true, captureEnabled: true, inlineParentAdoption: true });
  assert.deepEqual(value.identity, { enabled: true, purgeEnabled: true }); assert.equal(value.maintenance.enabled, false);
  assert.equal(value.legal.version, '2026-11-27');
});

test('metadata operator explicitly disabling capture does not inherit inline parent adoption from an installed profile', () => {
  const script = `import assert from 'node:assert/strict';
    import {Firestore} from 'firebase-admin/firestore';
    import {createFeedRuntime} from './feed_runtime.js';
    const db=new Firestore({projectId:'shoutout-dev-46c81'});
    db.runTransaction=()=>assert.fail('metadata operator constructor attempted IO');
    const options={enabled:true,contentLifecycleEnabled:false,contentCaptureEnabled:false,contentMaintenanceEnabled:false};
    const runtime=createFeedRuntime(db,{getUser(){assert.fail('unexpected Auth lookup');}},options);
    assert.equal(runtime.enabled,true);assert.equal(runtime.contentMaintenance,null);
    assert.throws(()=>createFeedRuntime(db,null,{...options,inlineParentAdoption:true}),/invalid-feed-runtime-enabled/);
    await db.terminate();console.log('metadata-operator-no-io');`;
  for (const phase of ['active', 'rollback']) {
    assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: import.meta.dirname, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, GCLOUD_PROJECT: 'shoutout-dev-46c81', GOOGLE_CLOUD_PROJECT: 'shoutout-dev-46c81',
        FIRESTORE_EMULATOR_HOST: '', SHOUTOUT_ARCHIVE_RELEASE_PHASE: phase },
    }).trim(), 'metadata-operator-no-io');
  }
});
