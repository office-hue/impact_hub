import assert from 'node:assert/strict';
import test from 'node:test';
import { admitStageB } from '../scripts/dev-v4-stage-b-adapter.mjs';
import { maximumBastion } from '../scripts/dev-v4-stage-a-verifier.mjs';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const policyPath = path.join(root, 'config/dev-v4/stage-b-policy.v1.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

test('Stage B admits only local source work and stays unverified', () => {
  const result = admitStageB(root);
  assert.equal(result.decision, 'stage-b-admitted-unverified');
  assert.equal(result.authoritative, false);
  assert.equal(result.ready, false);
  assert.equal(result.localNodeOnly, true);
  assert.equal(result.providerMutationAllowed, false);
});

test('Stage B rejects every widening of the admission boundary', () => {
  for (const key of ['centralDependencies', 'provider', 'build', 'deploy', 'runtime', 'host', 'secrets', 'cron', 'watchdog']) {
    const widened = { ...policy, admission: { ...policy.admission, [key]: true } };
    fs.writeFileSync(policyPath, `${JSON.stringify(widened, null, 2)}\n`);
    assert.equal(admitStageB(root).decision, 'protected');
    fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  }
  assert.equal(maximumBastion(root).decision, 'bastion-pass-unverified');
});
