import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { controllerPath, buildArgs, installedEngineDescriptor, assertTargetPolicy } from '../scripts/dev-v4-installed-controller-adapter.mjs';
test('installed controller is not discovered or launched by legacy interfaces', () => {
  assert.equal(controllerPath({ OFFICE_DEV_CONTROLLER: '/untrusted' }), null);
  for (const value of [buildArgs('/missing', 'start'), installedEngineDescriptor(), assertTargetPolicy()]) {
    assert.equal(value.status, 'retired');
    assert.equal(value.lifecycleExecuted, false);
    assert.equal(value.authorityGranted, false);
  }
});
test('legacy CLI start reports retirement without creating task or lifecycle state', () => {
  const result = spawnSync(process.execPath, ['scripts/dev-v4-installed-controller-adapter.mjs', 'start', '--task-id', 'not-a-permit'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  const value = JSON.parse(result.stdout);
  assert.equal(value.status, 'retired');
  assert.equal(value.writes, false);
  assert.equal(value.decision, undefined);
});
