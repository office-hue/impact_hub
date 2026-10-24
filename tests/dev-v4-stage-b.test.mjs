import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyStageB, validateRecordedBase } from '../scripts/dev-v4-stage-b-adapter.mjs';
test('Stage B cannot synthesize admission from a capsule or CI environment', () => {
  for (const value of [verifyStageB('/missing', { admission: true }, { forged: true }), validateRecordedBase('candidate', 'candidate', 'origin/main', 'candidate')]) {
    assert.equal(value.status, 'retired');
    assert.equal(value.lifecycleExecuted, false);
    assert.equal(value.ready, false);
    assert.equal(value.decision, undefined);
  }
});
