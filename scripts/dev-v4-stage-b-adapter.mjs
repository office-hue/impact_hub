#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyStageA, maximumBastion } from './dev-v4-stage-a-verifier.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
const protectedResult = (reason) => ({ decision: 'protected', authoritative: false, ready: false, reason });

export function admitStageB(root = ROOT) {
  const policy = read('config/dev-v4/stage-b-policy.v1.json');
  if (policy.schemaVersion !== 1 || policy.contractId !== 'dev-v4.stage-b-policy' || policy.status !== 'active-source-only' || policy.authority !== 'repo-local') return protectedResult('stage-b-policy-invalid');
  if (policy.baseStageA?.commit !== '5f592790aa2f69de69dee3b3c0ba5d43c5d9ef36' || policy.baseStageA?.tree !== 'c343d4126d60f0d50149815ae461ab6fead79dbb') return protectedResult('stage-a-base-mismatch');
  const admission = policy.admission ?? {};
  if (admission.localNode !== true || admission.centralDependencies !== false || Object.entries(admission).some(([k, v]) => k !== 'localNode' && k !== 'centralDependencies' && v !== false)) return protectedResult('admission-boundary-invalid');
  if (policy.readyStateAllowed !== false || policy.sourceOnly !== true) return protectedResult('ready-or-source-boundary-invalid');
  const stageA = verifyStageA(read('config/dev-v4/central-contract.v1.json'), read('config/dev-v4/impact-hub-capabilities.v1.json'));
  if (stageA.decision !== 'stage-a-valid-unverified') return protectedResult(`stage-a:${stageA.reason}`);
  const bastion = maximumBastion(root);
  if (bastion.decision !== 'bastion-pass-unverified') return protectedResult(`bastion:${bastion.reason}`);
  return { decision: 'stage-b-admitted-unverified', authoritative: false, ready: false, activationPending: true, localNodeOnly: true, providerMutationAllowed: false, runtimeMutationAllowed: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { const result = admitStageB(); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.decision === 'stage-b-admitted-unverified' ? 0 : 2; }
  catch (error) { process.stdout.write(`${JSON.stringify(protectedResult(String(error.message)))}\n`); process.exitCode = 2; }
}
