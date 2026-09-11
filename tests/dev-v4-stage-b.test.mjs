import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyStageB } from '../scripts/dev-v4-stage-b-adapter.mjs';
import { maximumBastion } from '../scripts/dev-v4-stage-a-verifier.mjs';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const policyPath = path.join(root, 'config/dev-v4/stage-b-policy.v1.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

test('Stage B admits only local source work and stays unverified', () => {
  const result = verifyStageB(root);
  assert.equal(result.decision, 'stage-b-admitted-unverified');
  assert.equal(result.authoritative, false);
  assert.equal(result.ready, false);
  assert.equal(result.localNodeOnly, true);
  assert.equal(result.providerMutationAllowed, false);
});

test('Stage B rejects every widening of the admission boundary', () => {
  for (const key of ['centralDependencies', 'provider', 'build', 'deploy', 'runtime', 'host', 'secrets', 'cron', 'watchdog']) {
    const widened = { ...policy, admission: { ...policy.admission, [key]: true } };
    assert.equal(verifyStageB(root, widened).decision, 'protected');
  }
  assert.equal(maximumBastion(root).decision, 'bastion-pass-unverified');
});

test('foreign, missing and old-worktree roots fail closed', () => {
  assert.equal(verifyStageB('/tmp/nonexistent-impact-hub-root', policy).decision, 'protected');
  assert.equal(verifyStageB(path.dirname(root), policy).decision, 'protected');
  assert.equal(verifyStageB('/Users/bujdosoarnold/.worktrees/impact-hub-dev-operations-adapter-luna-20260908', policy).decision, 'protected');
});

test('immutable file pins and central digest reject drift without editing tracked policy', () => {
  const drift = { ...policy, requiredStageAFiles: policy.requiredStageAFiles.map((x, i) => i === 0 ? { ...x, blob: '0'.repeat(40) } : x) };
  assert.equal(verifyStageB(root, drift).decision, 'protected');
  assert.equal(verifyStageB(root, { ...policy, central: { ...policy.central, snapshotDigest: '0'.repeat(64) } }).decision, 'protected');
});
