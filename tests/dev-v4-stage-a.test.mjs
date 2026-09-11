import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { maximumBastion, verifyStageA } from '../scripts/dev-v4-stage-a-verifier.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'config/dev-v4', name), 'utf8'));

test('Stage A remains inert and returns only valid-unverified', () => {
  const result = verifyStageA(read('central-contract.v1.json'), read('impact-hub-capabilities.v1.json'));
  assert.equal(result.decision, 'stage-a-valid-unverified');
  assert.equal(result.authoritative, false);
  assert.equal(result.ready, false);
  assert.equal(maximumBastion(root).decision, 'bastion-pass-unverified');
});

test('negative activation and provider fixtures fail closed', () => {
  const central = read('central-contract.v1.json');
  const caps = read('impact-hub-capabilities.v1.json');
  assert.equal(verifyStageA({ ...central, activationAllowed: true }, caps).decision, 'protected');
  assert.equal(verifyStageA(central, { ...caps, readyStateAllowed: true }).decision, 'protected');
  assert.equal(verifyStageA(central, { ...caps, capabilities: caps.capabilities.map((x) => x.id === 'provider' ? { ...x, state: 'available' } : x) }).decision, 'protected');
  assert.equal(verifyStageA({ ...central, centralMerge: {} }, caps).decision, 'protected');
});

test('every central identity mismatch fails closed', () => {
  const central = read('central-contract.v1.json');
  const caps = read('impact-hub-capabilities.v1.json');
  const mismatches = [
    { centralMerge: { ...central.centralMerge, sha: '0'.repeat(40) } },
    { centralMerge: { ...central.centralMerge, tree: '0'.repeat(40) } },
    { centralRepository: { ...central.centralRepository, numericId: 1 } },
    { operationsPackageSha256: '0'.repeat(64) },
    { centralContractDigest: '0'.repeat(64) },
  ];
  for (const change of mismatches) assert.equal(verifyStageA({ ...central, ...change }, caps).decision, 'protected');
});

test('checked-in negative fixture catalog is explicit', () => {
  const fixtures = read('negative-fixtures.v1.json').fixtures;
  assert.deepEqual(fixtures.map((x) => x.expected), ['protected', 'protected', 'protected', 'protected']);
  assert.deepEqual(new Set(fixtures.map((x) => x.id)).size, fixtures.length);
});
