import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assertTargetOrigin, assertTargetPolicy, buildArgs, controllerPath, installedEngineDescriptor } from '../scripts/dev-v4-installed-controller-adapter.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const policyRoot = path.join(root, 'config', 'dev-v4');
const lifecycle = JSON.parse(fs.readFileSync(path.join(policyRoot, 'lifecycle-contract.v1.json'), 'utf8'));
const descriptor = lifecycle.acceptedRetainedEngines[0];

test('accepts target origin and retained installed engine for standard selector', () => {
  assert.equal(assertTargetOrigin(root, 'https://github.com/office-hue/impact_hub.git'), 'https://github.com/office-hue/impact_hub.git');
  const bundle = assertTargetPolicy(root, 'standard-source-brief', installedEngineDescriptor());
  assert.equal(bundle.selected.requiresPlanId, false);
});

test('rejects foreign origin', () => {
  assert.throws(() => assertTargetOrigin(root, 'https://github.com/other/repo.git'), /target_origin_invalid/);
});

test('rejects foreign engine and candidate-only policy', () => {
  assert.throws(() => assertTargetPolicy(root, 'standard-source-brief', { ...descriptor, digest: '0'.repeat(64) }), /engine_not_retained_for_target/);
  const activationPath = path.join(policyRoot, 'activation-policy.v1.json');
  const original = fs.readFileSync(activationPath, 'utf8');
  fs.writeFileSync(activationPath, original.replace('"candidateAuthority": false', '"candidateAuthority": true'));
  try { assert.throws(() => assertTargetPolicy(root, 'standard-source-brief', descriptor), /activation_policy_not_base_authority/); }
  finally { fs.writeFileSync(activationPath, original); }
});

test('keeps status and resume read-only and rejects invalid start', () => {
  assert.deepEqual(buildArgs(root, 'status'), ['--repo', root, 'status']);
  assert.deepEqual(buildArgs(root, 'resume'), ['--repo', root, 'resume']);
  assert.throws(() => buildArgs(root, 'resume', { selector: 'standard-source-brief' }), /read_only_arguments_invalid/);
  assert.throws(() => buildArgs(root, 'start', { taskId: 'x', selector: 'candidate-only' }), /start_arguments_invalid/);
});

test('CLI forwards unsupported legacy marker as blocked with nonzero exit', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/dev-v4-installed-controller-adapter.mjs'), 'status', '--repo', root], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported_legacy_marker/);
});

test('CLI policy rejection occurs before child controller and is nonzero', () => {
  const policyPath = path.join(policyRoot, 'activation-policy.v1.json');
  const original = fs.readFileSync(policyPath, 'utf8');
  fs.writeFileSync(policyPath, original.replace('"candidateAuthority": false', '"candidateAuthority": true'));
  try {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/dev-v4-installed-controller-adapter.mjs'), 'status', '--repo', root], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /activation_policy_not_base_authority/);
  } finally { fs.writeFileSync(policyPath, original); }
});

test('CLI waits for child and preserves its exit code and streams', () => {
  const fake = path.join(os.tmpdir(), `impact-hub-fake-controller-${process.pid}.mjs`);
  fs.writeFileSync(fake, "#!/usr/bin/env node\nprocess.stdout.write('child-out'); process.stderr.write('child-err'); process.exit(7);\n");
  fs.chmodSync(fake, 0o700);
  try {
    const installedRoot = path.dirname(path.dirname(controllerPath()));
    const active = JSON.parse(fs.readFileSync(path.join(installedRoot, 'defaults', 'dev-v4.json'), 'utf8'));
    const descriptor = path.join(installedRoot, 'packages', 'dev-v4', active.packageDigest, active.sourceCommit, 'files', 'engine-descriptor.json');
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/dev-v4-installed-controller-adapter.mjs'), 'status', '--repo', root], {
      encoding: 'utf8', env: { ...process.env, OFFICE_DEV_CONTROLLER: fake, OFFICE_DEV_ENGINE_DESCRIPTOR: descriptor },
    });
    assert.equal(result.status, 7);
    assert.equal(result.stdout, 'child-out');
    assert.equal(result.stderr, 'child-err');
  } finally { fs.unlinkSync(fake); }
});
