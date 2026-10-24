import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyStageA, maximumBastion } from '../scripts/dev-v4-stage-a-verifier.mjs';
test('Stage A and legacy bastion are retired, never a source or permit PASS', () => {
  for (const value of [verifyStageA({ activationAllowed: true }, {}), maximumBastion('/missing')]) {
    assert.equal(value.status, 'retired');
    assert.equal(value.sourceChecks, 'not-evaluated');
    assert.equal(value.authorityGranted, false);
    assert.equal(value.writes, false);
    assert.equal(value.decision, undefined);
  }
});
