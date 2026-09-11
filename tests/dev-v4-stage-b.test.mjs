import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRecordedBase, verifyStageB } from '../scripts/dev-v4-stage-b-adapter.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const policyPath = path.join(root, 'config/dev-v4/stage-b-policy.v1.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const markerPath = execFileSync('git', ['rev-parse', '--git-path', 'worktree-active.json'], { encoding: 'utf8' }).trim();
const decisionPath = execFileSync('git', ['rev-parse', '--git-path', 'worktree-task-start-decision.json'], { encoding: 'utf8' }).trim();
const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
const decision = JSON.parse(fs.readFileSync(decisionPath, 'utf8'));

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

test('pre-merge fixture rejects a forged capsule base equal to candidate HEAD', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const originMain = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  assert.equal(validateRecordedBase(root, originMain, 'origin/main', head), 'capsule-base-not-ancestor');
});

test('post-merge fixture accepts an arbitrary branch base recorded from origin/main', () => {
  const originMain = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  assert.equal(validateRecordedBase(root, originMain, 'origin/main', originMain), null);
});

test('end-to-end capsule fixtures fail closed for missing or tampered identity', () => {
  const markerMissingBase = { ...marker };
  const decisionMissingBase = { ...decision };
  delete markerMissingBase.baseCommit;
  delete decisionMissingBase.baseCommit;
  const variants = [
    { marker: markerMissingBase, decision: decisionMissingBase },
    { marker: { ...marker, head: '0'.repeat(40) }, decision },
    { marker, decision: { ...decision, tree: '0'.repeat(40) } },
  ];
  for (const fixture of variants) {
    assert.equal(verifyStageB(root, policy, fixture).decision, 'protected');
  }
});
