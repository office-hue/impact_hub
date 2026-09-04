const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const adapter = path.join(root, 'scripts', 'dev-delivery-v2-adapter.py');

function run(...args: string[]) {
  return JSON.parse(execFileSync('python3', [adapter, ...args], { cwd: root, encoding: 'utf8' }));
}

function fail(...args: string[]) {
  return spawnSync('python3', [adapter, ...args], { cwd: root, encoding: 'utf8' });
}

function classify(paths: string[]) {
  const source = [
    'import importlib.util,json,sys',
    `s=importlib.util.spec_from_file_location('adapter', ${JSON.stringify(adapter)})`,
    'm=importlib.util.module_from_spec(s);s.loader.exec_module(m)',
    'print(m.classify(json.loads(sys.argv[1])))',
  ].join(';');
  return execFileSync('python3', ['-c', source, JSON.stringify(paths)], { encoding: 'utf8' }).trim();
}

test('fixture is explicit, offline, separate and mutation-free', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-hub-v2-fixture-'));
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'sentinel.txt'), 'immutable fixture');
    const before = fs.readFileSync(path.join(fixtureRoot, 'sentinel.txt'), 'utf8');
    const fixture = run('fixture', '--fixture-root', fixtureRoot, '--json');
    expect(fixture).toMatchObject({ decision: 'pass', fixtureMode: 'offline', fixtureRoot: fs.realpathSync(fixtureRoot), networkContacted: false, mutationPerformed: false });
    expect(fs.readFileSync(path.join(fixtureRoot, 'sentinel.txt'), 'utf8')).toBe(before);
    expect(fail('fixture', '--json').status).not.toBe(0);
    expect(fail('fixture', '--fixture-root', root, '--json').stderr).toMatch(/fixture_root_must_be_separate/);
  } finally { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
});

test('foreign and sibling worktree roots are rejected even when valid git repositories', () => {
  const sibling = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .split('\n').find((line: string) => line.startsWith('worktree ') && line.slice(9) !== root)?.slice(9);
  expect(sibling).toBeTruthy();
  const result = fail('inspect', '--repo-root', sibling!, '--json');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/exact_current_worktree_root_required/);
});

test('missing shallow CI commit is fail-closed and event SHAs bind a report', () => {
  const missing = '1111111111111111111111111111111111111111';
  const shallow = fail('ci-classify', '--base', missing, '--head', 'HEAD', '--json');
  expect(shallow.status).not.toBe(0);
  expect(shallow.stderr).toMatch(/base_or_head_commit_unavailable/);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const report = run('ci-classify', '--base', head, '--head', head, '--json');
  expect(report).toMatchObject({ baseSha: head, headSha: head, decision: 'allowed' });
});

test('path classifier is exact and known unsafe classes require validation without blocking it', () => {
  expect(classify(['docs/readme.md'])).toBe('docs-only');
  expect(classify(['AGENTS.md'])).toBe('governance-only');
  expect(classify(['tools/new-tool.js'])).toBe('code-local');
  expect(classify(['scripts/dev-delivery-v2-adapter.py'])).toBe('protected');
  expect(classify(['.github/workflows/coupon-harvest.yml'])).toBe('deploy');
  expect(classify(['scripts/unknown.sh'])).toBe('unknown');
  const base = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: root, encoding: 'utf8' }).trim();
  const protectedReport = run('ci-classify', '--base', base, '--head', 'HEAD', '--json');
  expect(protectedReport).toMatchObject({
    changedPathClass: 'protected',
    decision: 'operator-review',
    blockingReasons: [],
    fullValidationRequired: true,
    providerBuildDecision: 'operator-review',
  });
  const contextGuard = spawnSync('bash', ['scripts/dev-context-policy-guard.sh', '--json'], { cwd: root, encoding: 'utf8' });
  expect(contextGuard.status).toBe(0);
  expect(JSON.parse(contextGuard.stdout)).toMatchObject({ decision: 'operator-review', fullValidationRequired: true });
});

test('evidence rejects caller-supplied exit codes and requires authorized profile plus candidate provenance', () => {
  const noExitCode = fail('record', '--check', 'context-guard', '--profile', 'adapter-v1', '--exit-code', '0', '--json');
  expect(noExitCode.status).not.toBe(0);
  expect(noExitCode.stderr).toMatch(/unrecognized arguments: --exit-code/);
  const wrongProfile = fail('record', '--check', 'context-guard', '--profile', 'forged', '--json');
  expect(wrongProfile.status).not.toBe(0);
  expect(wrongProfile.stderr).toMatch(/evidence_profile_not_authorized/);
});
