import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runActiveIdentityTransaction } from './identity_write_fence.mjs';

test('identity writer rejects production and malformed paths before any database operation', async () => {
  let called = false;
  const target = projectId => ({ projectId, runTransaction() { called = true; } });
  for (const projectId of ['shoutout-production-a1b34', 'unknown']) {
    await assert.rejects(runActiveIdentityTransaction(target(projectId), 'user', () => {}), /dev-project-required/);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    await assert.rejects(runActiveIdentityTransaction(target('shoutout-rules-test'), 'user', () => {}), /dev-project-required/);
  }
  for (const uid of ['', null, '../other', 'user/other']) {
    await assert.rejects(runActiveIdentityTransaction(target('shoutout-dev-46c81'), uid, () => {}), /invalid-identity-write-uid/);
  }
  await assert.rejects(runActiveIdentityTransaction(target('shoutout-dev-46c81'), 'user'), /callback-required/);
  assert.equal(called, false);
});

test('all three CLI entry points still refuse non-dev credentials before SDK initialization', () => {
  const temporaryRoot = resolve(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, 'identity-cli-guard-'));
  try {
    const key = join(directory, 'fake.json');
    for (const project of ['shoutout-production-a1b34', 'unknown', undefined]) {
      writeFileSync(key, JSON.stringify({ project_id: project }));
      for (const [script, args] of [
        ['backfill_public_profiles.mjs', []],
        ['set_role.mjs', ['fixture@example.invalid', 'moderator']],
        ['activate_business_application.mjs', ['fixture@example.invalid']],
      ]) {
        const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
          env: { ...process.env, FIREBASE_SERVICE_ACCOUNT_PATH: key }, encoding: 'utf8',
        });
        assert.notEqual(result.status, 0, script);
        assert.match(result.stderr, /only supports shoutout-dev-46c81|Refusing project/, script);
      }
    }
  } finally {
    assert.equal(dirname(resolve(directory)), temporaryRoot);
    assert(basename(directory).startsWith('identity-cli-guard-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
