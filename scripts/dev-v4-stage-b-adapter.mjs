#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGE_A = '5f592790aa2f69de69dee3b3c0ba5d43c5d9ef36';
const STAGE_A_TREE = 'c343d4126d60f0d50149815ae461ab6fead79dbb';
const CENTRAL = { repo: 'office-hue/ai-agent', numericId: 1173292974, merge: '94db78c66b21979c9511594344649a518a4d31d8', tree: '6fd0f87b40b74e74abce72caf03a48280f7659ab', operations: '229649232d28644a85321f43f0f7b266bdb8a05cc6d5329d8b40c84b154d43dd' };
const requiredStageAFiles = ['config/dev-v4/central-contract.v1.json', 'config/dev-v4/impact-hub-capabilities.v1.json', 'config/dev-v4/negative-fixtures.v1.json', 'docs/bastion-guard-status.md', 'docs/continuity/dev/2026-09-11-dev-v4-impact-hub-stage-a.md', 'docs/dev-plans/DEV-V4-IMPACT-HUB-STAGE-A-20260911.md', 'docs/impact-hub-doc-sync-map-2026-06-23.md', 'docs/impact-hub-governance-system-plan-2026-06-16.md', 'notes.md', 'scripts/dev-delivery-v2-adapter.py', 'scripts/dev-v4-stage-a-verifier.mjs', 'system-status-snapshot.md', 'tests/dev-v4-stage-a.test.mjs'];
const protectedResult = (reason) => ({ decision: 'protected', authoritative: false, ready: false, reason });
const git = (root, ...rawArgs) => {
  const options = rawArgs.at(-1)?.required === false ? rawArgs.pop() : {};
  try { return execFileSync('git', ['-C', root, ...rawArgs], { encoding: 'utf8' }).trim(); }
  catch (error) { if (options.required === false) return ''; throw error; }
};
const isAncestor = (root, ancestor, descendant) => {
  try { execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant]); return true; }
  catch { return false; }
};
const objectExists = (root, object) => {
  try { execFileSync('git', ['-C', root, 'cat-file', '-e', object]); return true; }
  catch { return false; }
};
const normalizeOrigin = (value) => {
  const match = String(value).trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:)(office-hue\/impact_hub)(?:\.git)?$/);
  return match ? match[1] : null;
};
const commit = /^[0-9a-f]{40}$/;
const read = (root, rel) => { const file = path.resolve(root, rel); if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`required-file-missing:${rel}`); return fs.readFileSync(file, 'utf8'); };
const json = (root, rel) => JSON.parse(read(root, rel));
const capsule = (root, name) => { const file = git(root, 'rev-parse', '--git-path', name); return JSON.parse(fs.readFileSync(file, 'utf8')); };

function capsuleIdentity(root, branch, head, tree, marker, decision, originMain) {
  if (marker.schemaVersion !== 2 || decision.schemaVersion !== 2) return 'capsule-schema-invalid';
  for (const [value, expected, reason] of [
    [marker.branch, branch, 'worktree-capsule-branch-mismatch'],
    [marker.repo_root, root, 'worktree-capsule-root-mismatch'],
    [marker.path, root, 'worktree-capsule-path-mismatch'],
    [decision.currentBranch, branch, 'task-start-branch-mismatch'],
    [decision.currentWorktree, root, 'task-start-worktree-mismatch'],
  ]) if (value !== undefined && path.resolve(String(value)) !== path.resolve(String(expected)) && reason.includes('root')) return reason;
  if (marker.branch !== branch || path.resolve(marker.repo_root || '') !== root || path.resolve(marker.path || '') !== root) return 'worktree-capsule-invalid';
  if (decision.status !== 'allowed' || decision.decision !== 'allowed' || decision.currentBranch !== branch || path.resolve(decision.currentWorktree || '') !== root) return 'task-start-decision-invalid';
  for (const [payload, expected, reason] of [[marker, head, 'capsule-head-mismatch'], [decision, head, 'decision-head-mismatch']]) {
    const value = payload.head ?? payload.headSha ?? payload.currentHead;
    if (value === undefined || value !== expected) return reason;
    const valueTree = payload.tree ?? payload.treeSha ?? payload.currentTree;
    if (valueTree === undefined || valueTree !== tree) return reason.replace('head', 'tree');
  }
  const recordedRef = marker.baseRef ?? marker.base_ref ?? decision.baseRef ?? decision.baseRefName;
  const recordedBase = marker.baseCommit ?? marker.base_commit ?? marker.baseSha ?? decision.baseCommit ?? decision.baseSha;
  if (recordedRef === undefined || recordedBase === undefined) return 'capsule-base-missing';
  const baseError = validateRecordedBase(root, originMain, recordedRef, recordedBase);
  if (baseError) return baseError;
  return null;
}

export function validateRecordedBase(root, originMain, recordedRef, recordedBase) {
  if (recordedRef !== undefined && recordedRef !== 'origin/main') return 'capsule-base-ref-invalid';
  if (recordedBase !== undefined) {
    if (!commit.test(recordedBase)) return 'capsule-base-commit-invalid';
    if (!isAncestor(root, recordedBase, originMain)) return 'capsule-base-not-ancestor';
  }
  return null;
}

export function verifyStageB(root = MODULE_ROOT, injectedPolicy = null, injectedCapsules = null, injectedEnv = process.env) {
  try {
    const requested = path.resolve(root);
    const canonical = path.resolve(git(requested, 'rev-parse', '--show-toplevel'));
    if (requested !== canonical) return protectedResult('foreign-or-sibling-root');
    if (normalizeOrigin(git(canonical, 'remote', 'get-url', 'origin')) !== 'office-hue/impact_hub') return protectedResult('repo-identity-invalid');
    const commonDir = path.resolve(git(canonical, 'rev-parse', '--git-common-dir'));
    if (!commonDir || !fs.existsSync(commonDir) || !objectExists(canonical, `${STAGE_A}^{commit}`)) return protectedResult('stage-a-base-unavailable');
    if (git(canonical, 'rev-parse', `${STAGE_A}^{tree}`) !== STAGE_A_TREE) return protectedResult('stage-a-base-unavailable');
    const branch = git(canonical, 'branch', '--show-current');
    const head = git(canonical, 'rev-parse', 'HEAD');
    const tree = git(canonical, 'rev-parse', 'HEAD^{tree}');
    if (!branch || !commit.test(head) || !commit.test(tree) || git(canonical, 'show', '-s', '--format=%T', head) !== tree) return protectedResult('head-tree-identity-invalid');
    const originMain = git(canonical, 'rev-parse', 'origin/main');
    const ciKeys = ['GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'PR_BASE_SHA', 'PR_HEAD_SHA'];
    const ciRequested = ciKeys.some((key) => injectedEnv[key] !== undefined);
    const ci = injectedEnv.GITHUB_ACTIONS === 'true';
    if (ciRequested && !ci) return protectedResult('ci-context-invalid');
    if (ci) {
      if (injectedEnv.GITHUB_REPOSITORY !== 'office-hue/impact_hub' || !commit.test(injectedEnv.PR_BASE_SHA || '') || !commit.test(injectedEnv.PR_HEAD_SHA || '')) return protectedResult('ci-context-invalid');
      if (injectedEnv.PR_BASE_SHA !== STAGE_A || injectedEnv.PR_HEAD_SHA !== head || injectedEnv.PR_HEAD_SHA !== git(canonical, 'rev-parse', 'HEAD')) return protectedResult('ci-pr-tuple-invalid');
    } else {
      const marker = injectedCapsules?.marker ?? capsule(canonical, 'worktree-active.json');
      const decision = injectedCapsules?.decision ?? capsule(canonical, 'worktree-task-start-decision.json');
      if (marker.repo !== 'impact_hub' || decision.docSyncRepoId !== 'impact_hub') return protectedResult('worktree-capsule-invalid');
      const identityError = capsuleIdentity(canonical, branch, head, tree, marker, decision, originMain);
      if (identityError) return protectedResult(identityError);
    }
    const policy = injectedPolicy ?? json(canonical, 'config/dev-v4/stage-b-policy.v1.json');
    if (policy.schemaVersion !== 1 || policy.contractId !== 'dev-v4.stage-b-policy' || policy.status !== 'active-source-only' || policy.authority !== 'repo-local') return protectedResult('stage-b-policy-invalid');
    if (policy.baseStageA?.commit !== STAGE_A || policy.baseStageA?.tree !== STAGE_A_TREE || policy.central?.merge !== CENTRAL.merge || policy.central?.tree !== CENTRAL.tree || policy.central?.operations !== CENTRAL.operations) return protectedResult('immutable-identity-invalid');
    if (!Array.isArray(policy.requiredStageAFiles) || policy.requiredStageAFiles.length !== requiredStageAFiles.length || policy.requiredStageAFiles.some((x, i) => x.path !== requiredStageAFiles[i] || !/^[0-9a-f]{40}$/.test(x.blob))) return protectedResult('stage-a-file-pin-shape-invalid');
    for (const pin of policy.requiredStageAFiles) if (git(canonical, 'rev-parse', `${STAGE_A}:${pin.path}`) !== pin.blob) return protectedResult(`stage-a-file-pin-drift:${pin.path}`);
    for (const pin of policy.requiredStageAFiles.slice(0, 3)) if (git(canonical, 'hash-object', pin.path) !== pin.blob) return protectedResult(`checked-out-stage-a-file-drift:${pin.path}`);
    const verifierPin = policy.requiredStageAFiles.find((x) => x.path === 'scripts/dev-v4-stage-a-verifier.mjs');
    if (git(canonical, 'hash-object', verifierPin.path) !== verifierPin.blob) return protectedResult('stage-a-verifier-mutated');
    const central = json(canonical, 'config/dev-v4/central-contract.v1.json');
    if (central.centralRepository?.repo !== CENTRAL.repo || central.centralRepository?.numericId !== CENTRAL.numericId || central.centralMerge?.sha !== CENTRAL.merge || central.centralMerge?.tree !== CENTRAL.tree || central.operationsPackageSha256 !== CENTRAL.operations || central.centralContractDigest !== policy.central.snapshotDigest) return protectedResult('central-snapshot-invalid');
    if ([central.activationAllowed, central.providerMutationAllowed, central.runtimeMutationAllowed, central.hostMutationAllowed, central.readyStateAllowed].some((value) => value !== false)) return protectedResult('central-authority-flag-enabled');
    if (policy.central.snapshotDigest !== '184dc4386f6330f47a1921f114aca32b0f66cd0b714a8e88af562f47b7699157') return protectedResult('central-snapshot-digest-invalid');
    if (!objectExists(canonical, 'HEAD:config/dev-v4/stage-b-policy.v1.json')) return protectedResult('stage-b-contract-not-in-head');
    const admission = policy.admission ?? {};
    if (admission.localNode !== true || Object.entries(admission).some(([key, value]) => key !== 'localNode' && value !== false) || policy.readyStateAllowed !== false || policy.sourceOnly !== true) return protectedResult('admission-boundary-invalid');
    read(canonical, 'config/dev-v4/impact-hub-capabilities.v1.json'); read(canonical, 'config/dev-v4/negative-fixtures.v1.json');
    return { decision: 'stage-b-admitted-unverified', authoritative: false, ready: false, activationPending: true, localNodeOnly: true, providerMutationAllowed: false, runtimeMutationAllowed: false };
  } catch (error) { return protectedResult(String(error.message)); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) { const result = verifyStageB(); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.decision === 'stage-b-admitted-unverified' ? 0 : 2; }
