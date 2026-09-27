import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertTargetOrigin, assertTargetPolicy, buildArgs, legacyProjection } from '../scripts/dev-v4-installed-controller-adapter.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const policyRoot = path.join(root, 'config', 'dev-v4');
const lifecycle = JSON.parse(fs.readFileSync(path.join(policyRoot, 'lifecycle-contract.v1.json'), 'utf8'));
const descriptor = lifecycle.acceptedRetainedEngines[0];

test('accepts target origin and retained installed engine for standard selector', () => {
  assert.equal(assertTargetOrigin(root, 'https://github.com/office-hue/impact_hub.git'), 'https://github.com/office-hue/impact_hub.git');
  const bundle = assertTargetPolicy(root, 'standard-source-brief', descriptor);
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

test('projects legacy Stage A marker without mutating it', () => {
  const projection = legacyProjection(root);
  assert.equal(projection.status, 'legacy-unverified');
  assert.equal(projection.writes, false);
  assert.equal(projection.capsule.identityCurrent, false);
});
