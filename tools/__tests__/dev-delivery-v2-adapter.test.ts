const { spawnSync } = require('child_process');
const path = require('path');
test('retired v2 adapter cannot return source success or lifecycle authorization', () => {
  const adapter = path.resolve(__dirname, '../../scripts/dev-delivery-v2-adapter.py');
  for (const operation of ['inspect', 'freeze', 'record', 'close', 'fixture', 'ci-classify', 'ci-validate']) {
    const result = spawnSync('python3', ['-B', adapter, operation, '--json'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const value = JSON.parse(result.stdout);
    expect(value).toMatchObject({ status: 'retired', writes: false, authorityGranted: false, sourceChecks: 'not-evaluated', lifecycleExecuted: false });
    expect(value.decision).toBeUndefined();
  }
});
