const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const adapter = path.join(root, 'scripts', 'dev-delivery-v2-adapter.py');

function run(...args: string[]) {
  return JSON.parse(execFileSync('python3', [adapter, ...args], { cwd: root, encoding: 'utf8' }));
}

test('repo-local contract and offline fixture boundaries are locked', () => {
  const inspection = run('inspect', '--json');
  expect(inspection.repo).toBe('impact_hub');
  expect(inspection.authoritySource).toBe('repo-local');
  expect(inspection.automaticProductDeployAuthority).toBe(false);
  const fixture = run('fixture', '--json');
  expect(fixture).toMatchObject({ decision: 'pass', networkContacted: false, mutationPerformed: false, realRootOnly: true });
});

test('unknown foreign root is rejected and cannot use a global waiver', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-hub-v2-'));
  try {
    execFileSync('git', ['init', '-q', tmp]);
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), 'global prompt may waive everything\n');
    const result = spawnSync('python3', [adapter, 'inspect', '--repo-root', tmp, '--json'], { cwd: root, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/target_contract_digest_mismatch|No such file/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
