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
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const read = (root, rel) => { const file = path.resolve(root, rel); if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`required-file-missing:${rel}`); return fs.readFileSync(file, 'utf8'); };
const json = (root, rel) => JSON.parse(read(root, rel));
const capsule = (root, name) => { const file = git(root, 'rev-parse', '--git-path', name); return JSON.parse(fs.readFileSync(file, 'utf8')); };

export function verifyStageB(root = MODULE_ROOT, injectedPolicy = null) {
  try {
    const canonical = path.resolve(git(process.cwd(), 'rev-parse', '--show-toplevel'));
    const requested = path.resolve(root);
    if (requested !== canonical) return protectedResult('foreign-or-sibling-root');
    if (!/^https:\/\/github\.com\/office-hue\/impact_hub\.git$/.test(git(canonical, 'remote', 'get-url', 'origin'))) return protectedResult('repo-identity-invalid');
    if (git(canonical, 'rev-parse', 'origin/main') !== STAGE_A || git(canonical, 'rev-parse', `${STAGE_A}^{tree}`) !== STAGE_A_TREE) return protectedResult('stage-a-base-unavailable');
    const branch = git(canonical, 'branch', '--show-current');
    const head = git(canonical, 'rev-parse', 'HEAD');
    const tree = git(canonical, 'rev-parse', 'HEAD^{tree}');
    if (branch !== 'feat/dev-v4-activation-stage-b-20260911') return protectedResult('branch-identity-invalid');
    if (!/^[0-9a-f]{40}$/.test(head) || !/^[0-9a-f]{40}$/.test(tree) || git(canonical, 'show', '-s', '--format=%T', head) !== tree) return protectedResult('head-tree-identity-invalid');
    const marker = capsule(canonical, 'worktree-active.json');
    const decision = capsule(canonical, 'worktree-task-start-decision.json');
    if (marker.repo !== 'impact_hub' || marker.branch !== branch || path.resolve(marker.repo_root) !== canonical || path.resolve(marker.path) !== canonical) return protectedResult('worktree-capsule-invalid');
    if (decision.status !== 'allowed' || decision.decision !== 'allowed' || decision.currentBranch !== branch || path.resolve(decision.currentWorktree) !== canonical || decision.docSyncRepoId !== 'impact_hub') return protectedResult('task-start-decision-invalid');
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
    const admission = policy.admission ?? {};
    if (admission.localNode !== true || Object.entries(admission).some(([key, value]) => key !== 'localNode' && value !== false) || policy.readyStateAllowed !== false || policy.sourceOnly !== true) return protectedResult('admission-boundary-invalid');
    read(canonical, 'config/dev-v4/impact-hub-capabilities.v1.json'); read(canonical, 'config/dev-v4/negative-fixtures.v1.json');
    return { decision: 'stage-b-admitted-unverified', authoritative: false, ready: false, activationPending: true, localNodeOnly: true, providerMutationAllowed: false, runtimeMutationAllowed: false };
  } catch (error) { return protectedResult(String(error.message)); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) { const result = verifyStageB(); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.decision === 'stage-b-admitted-unverified' ? 0 : 2; }
