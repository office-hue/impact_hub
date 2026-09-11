#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMIT = /^[0-9a-f]{40}$/;
const TREE = /^[0-9a-f]{40}$/;
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const protectedResult = (reason) => ({ decision: 'protected', authoritative: false, reason });

export function verifyStageA(central, capabilities) {
  if (!central || central.schemaVersion !== 1 || central.contractId !== 'dev-v4.central-contract') return protectedResult('central-contract-invalid');
  if (central.authority !== 'central-base-read-only' || central.status !== 'snapshot-only') return protectedResult('central-contract-authority-invalid');
  if (central.centralRepository?.repo !== 'office-hue/ai-agent' || central.centralRepository.numericId !== 1173292974) return protectedResult('central-repository-identity-invalid');
  if (!COMMIT.test(central.centralMerge?.sha ?? '') || !TREE.test(central.centralMerge?.tree ?? '')) return protectedResult('central-merge-identity-invalid');
  if (!/^[0-9a-f]{64}$/.test(central.operationsPackageSha256 ?? '') || !/^[0-9a-f]{64}$/.test(central.centralContractDigest ?? '')) return protectedResult('central-digest-invalid');
  if ([central.activationAllowed, central.providerMutationAllowed, central.runtimeMutationAllowed, central.hostMutationAllowed, central.readyStateAllowed].some((v) => v !== false)) return protectedResult('activation-or-ready-flag-enabled');
  if (!capabilities || capabilities.schemaVersion !== 1 || capabilities.contractId !== 'dev-v4.repo-capabilities' || capabilities.repoId !== 'impact_hub' || capabilities.status !== 'snapshot-only' || capabilities.authority !== 'repo-base') return protectedResult('capability-snapshot-invalid');
  if (capabilities.activationAllowed !== false || capabilities.readyStateAllowed !== false) return protectedResult('capability-activation-enabled');
  if (!Array.isArray(capabilities.capabilities) || !Array.isArray(capabilities.semanticSurfaces)) return protectedResult('capability-shape-invalid');
  const provider = capabilities.capabilities.find((x) => x.id === 'provider');
  if (!provider || provider.state !== 'not-applicable' || provider.observation?.policyDigest !== '989dd16dd30bdebb07403c1b0f88ad9a182ea0dd167fc37674438b4bc8ef0194') return protectedResult('provider-boundary-invalid');
  return { decision: 'stage-a-valid-unverified', authoritative: false, ready: false, activationPending: true };
}

export function maximumBastion(root = ROOT) {
  const forbidden = /(?:\"?(?:activationAllowed|readyStateAllowed|providerMutationAllowed|runtimeMutationAllowed|hostMutationAllowed)\"?\s*:\s*true|ready_for_execution|(?:^|[^a-z])admit(?:[^a-z]|$))/i;
  const allowed = new Set(['config/dev-v4/central-contract.v1.json', 'config/dev-v4/impact-hub-capabilities.v1.json', 'config/dev-v4/negative-fixtures.v1.json', 'scripts/dev-v4-stage-a-verifier.mjs', 'tests/dev-v4-stage-a.test.mjs', 'docs/dev-plans/DEV-V4-IMPACT-HUB-STAGE-A-20260911.md', 'docs/continuity/dev/2026-09-11-dev-v4-impact-hub-stage-a.md', 'notes.md', 'system-status-snapshot.md']);
  const violations = [];
  for (const rel of allowed) { const p = path.join(root, rel); if (!fs.existsSync(p) || rel.endsWith('negative-fixtures.v1.json')) continue; const text = fs.readFileSync(p, 'utf8'); if (rel.startsWith('config/dev-v4/') && forbidden.test(text)) violations.push(`forbidden-contract-token:${rel}`); }
  return violations.length ? protectedResult(violations.join(',')) : { decision: 'bastion-pass-unverified', authoritative: false, ready: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { const result = verifyStageA(read('config/dev-v4/central-contract.v1.json'), read('config/dev-v4/impact-hub-capabilities.v1.json')); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.decision === 'stage-a-valid-unverified' ? 0 : 2; } catch (error) { process.stdout.write(`${JSON.stringify(protectedResult(String(error.message)))}\n`); process.exitCode = 2; }
}
