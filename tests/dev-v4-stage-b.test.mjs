import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRecordedBase, verifyStageB } from '../scripts/dev-v4-stage-b-adapter.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const root = path.resolve(import.meta.dirname, '..');
const policyPath = path.join(root, 'config/dev-v4/stage-b-policy.v1.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const markerPath = execFileSync('git', ['rev-parse', '--git-path', 'worktree-active.json'], { encoding: 'utf8' }).trim();
const decisionPath = execFileSync('git', ['rev-parse', '--git-path', 'worktree-task-start-decision.json'], { encoding: 'utf8' }).trim();
const readPrivateFixture = (filePath) => fs.existsSync(filePath)
  ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
  : {};
const marker = readPrivateFixture(markerPath);
const decision = readPrivateFixture(decisionPath);
const verifyCurrentCheckout = () => process.env.GITHUB_ACTIONS === 'true'
  ? verifyStageB(root, null, { marker: {}, decision: {} }, { ...process.env, __ciMode: true })
  : verifyStageB(root);
const eventBaseSha = () => process.env.GITHUB_ACTIONS === 'true'
  ? process.env.PR_BASE_SHA
  : execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();

test('Stage B admits only local source work and stays unverified', () => {
  const result = verifyCurrentCheckout();
  if (result.decision === 'protected') {
    // The task-start marker is intentionally a snapshot. After a source
    // commit it must not be treated as current admission evidence.
    assert.equal(result.reason, 'capsule-head-mismatch');
    return;
  }
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

test('CI accepts a later exact-main PR tuple without a private capsule', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const baseSha = eventBaseSha();
  assert.match(baseSha, /^[0-9a-f]{40}$/);
  const eventPath = path.join(os.tmpdir(), `impact-hub-stage-b-event-${process.pid}.json`);
  fs.writeFileSync(eventPath, JSON.stringify({ repository: { full_name: 'office-hue/impact_hub', id: 1080246107 }, pull_request: { base: { ref: 'main', sha: baseSha, repo: { full_name: 'office-hue/impact_hub', id: 1080246107 } }, head: { sha: head } } }));
  const ciEnv = { __ciMode: true, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: 'office-hue/impact_hub', PR_BASE_SHA: baseSha, PR_HEAD_SHA: head };
  const result = verifyStageB(root, policy, { marker: {}, decision: {} }, ciEnv);
  const baseContainsStageA = (() => {
    try { execFileSync('git', ['merge-base', '--is-ancestor', policy.baseStageA.commit, baseSha]); return true; }
    catch { return false; }
  })();
  if (!baseContainsStageA) assert.equal(result.reason, 'ci-pr-tuple-invalid');
  else assert.equal(result.decision, 'stage-b-admitted-unverified');
});

test('CI rejects partial, wrong-repository, wrong-base and wrong-head tuples', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const baseSha = eventBaseSha();
  assert.match(baseSha, /^[0-9a-f]{40}$/);
  const eventPath = path.join(os.tmpdir(), `impact-hub-stage-b-event-negative-${process.pid}.json`);
  const validEvent = { repository: { full_name: 'office-hue/impact_hub', id: 1080246107 }, pull_request: { base: { ref: 'main', sha: baseSha, repo: { full_name: 'office-hue/impact_hub', id: 1080246107 } }, head: { sha: head } } };
  fs.writeFileSync(eventPath, JSON.stringify(validEvent));
  const base = { __ciMode: true, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: 'office-hue/impact_hub', PR_BASE_SHA: baseSha, PR_HEAD_SHA: head };
  for (const variant of [
    { ...base, GITHUB_REPOSITORY: 'office-hue/other' },
    { ...base, PR_BASE_SHA: '0'.repeat(40) },
    { ...base, PR_HEAD_SHA: '0'.repeat(40) },
    { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'office-hue/impact_hub', PR_BASE_SHA: baseSha },
  ]) assert.equal(verifyStageB(root, policy, { marker: {}, decision: {} }, variant).decision, 'protected');
  for (const changed of [
    { ...validEvent, repository: { ...validEvent.repository, id: 0 } },
    { ...validEvent, pull_request: { ...validEvent.pull_request, base: { ...validEvent.pull_request.base, ref: 'release' } } },
    { ...validEvent, pull_request: { ...validEvent.pull_request, base: { ...validEvent.pull_request.base, repo: { full_name: 'office-hue/other', id: 1080246107 } } } },
    { ...validEvent, pull_request: { ...validEvent.pull_request, base: { ...validEvent.pull_request.base, sha: head } } },
    { ...validEvent, pull_request: { ...validEvent.pull_request, head: { sha: baseSha } } },
  ]) {
    fs.writeFileSync(eventPath, JSON.stringify(changed));
    assert.equal(verifyStageB(root, policy, { marker: {}, decision: {} }, base).decision, 'protected');
  }
  const beforeStageA = execFileSync('git', ['rev-parse', `${policy.baseStageA.commit}^`], { encoding: 'utf8' }).trim();
  const earlyBaseEvent = { ...validEvent, pull_request: { ...validEvent.pull_request, base: { ...validEvent.pull_request.base, sha: beforeStageA } } };
  fs.writeFileSync(eventPath, JSON.stringify(earlyBaseEvent));
  assert.equal(verifyStageB(root, policy, { marker: {}, decision: {} }, { ...base, PR_BASE_SHA: beforeStageA }).decision, 'protected');
  fs.writeFileSync(eventPath, JSON.stringify(validEvent));
  const spoofed = { ...base };
  delete spoofed.__ciMode;
  assert.equal(verifyStageB(root, policy, { marker: {}, decision: {} }, spoofed).decision, 'protected');
});
