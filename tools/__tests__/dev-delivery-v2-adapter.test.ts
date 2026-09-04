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
  const realFixtureRoot = fs.realpathSync(fixtureRoot);
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'sentinel.txt'), 'immutable fixture');
    const before = fs.readFileSync(path.join(fixtureRoot, 'sentinel.txt'), 'utf8');
    const fixture = run('fixture', '--fixture-root', realFixtureRoot, '--json');
    expect(fixture).toMatchObject({ decision: 'pass', fixtureMode: 'offline', fixtureRoot: realFixtureRoot, fixtureRootKind: 'test-temp', networkContacted: false, mutationPerformed: false });
    expect(fs.readFileSync(path.join(fixtureRoot, 'sentinel.txt'), 'utf8')).toBe(before);
    expect(fail('fixture', '--json').status).not.toBe(0);
    expect(fail('fixture', '--fixture-root', root, '--json').stderr).toMatch(/fixture_root_outside_dedicated_perimeter/);
  } finally { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
});

test('fixture perimeter rejects foreign roots, symlinks and oversized input', () => {
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foreign-v2-fixture-'));
  const safeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-hub-v2-fixture-'));
  const link = path.join(os.tmpdir(), `impact-hub-v2-fixture-link-${process.pid}`);
  try {
    expect(fail('fixture', '--fixture-root', fs.realpathSync(foreignRoot), '--json').stderr).toMatch(/fixture_root_outside_dedicated_perimeter/);
    fs.symlinkSync(safeRoot, link);
    expect(fail('fixture', '--fixture-root', link, '--json').stderr).toMatch(/fixture_root_realpath_or_symlink_invalid/);
    fs.writeFileSync(path.join(safeRoot, 'oversized.bin'), Buffer.alloc(1024 * 1024 + 1));
    expect(fail('fixture', '--fixture-root', fs.realpathSync(safeRoot), '--json').stderr).toMatch(/fixture_file_size_limit_exceeded/);
  } finally {
    fs.rmSync(link, { force: true });
    fs.rmSync(foreignRoot, { recursive: true, force: true });
    fs.rmSync(safeRoot, { recursive: true, force: true });
  }
});

test('repo fixture is restricted to the exact dedicated root', () => {
  const dedicated = path.join(root, 'tools', 'fixtures', 'dev-delivery-v2');
  expect(run('fixture', '--fixture-root', dedicated, '--json')).toMatchObject({ decision: 'pass', fixtureRootKind: 'repo-dedicated' });
  expect(fail('fixture', '--fixture-root', path.join(root, 'tools', 'fixtures'), '--json').status).not.toBe(0);
});

test('foreign and sibling worktree roots are rejected even when valid git repositories', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-hub-v2-worktree-'));
  const primary = path.join(fixtureRoot, 'primary');
  const sibling = path.join(fixtureRoot, 'sibling');
  try {
    execFileSync('git', ['init', '-q', primary]);
    execFileSync('git', ['config', 'user.email', 'qa@example.invalid'], { cwd: primary });
    execFileSync('git', ['config', 'user.name', 'qa'], { cwd: primary });
    fs.writeFileSync(path.join(primary, 'tracked.txt'), 'fixture\n');
    execFileSync('git', ['add', 'tracked.txt'], { cwd: primary });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: primary });
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'fixture-sibling', sibling, 'HEAD'], { cwd: primary });

    expect(execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: sibling, encoding: 'utf8' }).trim()).toBe('true');
    expect(fs.readFileSync(path.join(sibling, '.git'), 'utf8')).toMatch(/^gitdir: /);
    const result = fail('inspect', '--repo-root', sibling, '--json');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/exact_current_worktree_root_required/);
  } finally {
    if (fs.existsSync(sibling)) execFileSync('git', ['worktree', 'remove', '--force', sibling], { cwd: primary });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
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
  expect(classify(['AGENTS.md'])).toBe('protected');
  expect(classify(['tools/new-tool.js'])).toBe('code-local');
  expect(classify(['scripts/dev-delivery-v2-adapter.py'])).toBe('protected');
  expect(classify(['tools/__tests__/dev-delivery-v2-adapter.test.ts'])).toBe('protected');
  expect(classify(['tests/dev-context-policy-guard.test.sh'])).toBe('protected');
  expect(classify(['scripts/safe-repo-audit.sh'])).toBe('protected');
  expect(classify(['docs/pr-policy.md'])).toBe('protected');
  expect(classify(['.codex/scripts/lib/guard-common.sh'])).toBe('protected');
  expect(classify(['ai-agent/tools/guard/story-guard-report.ts'])).toBe('protected');
  expect(classify(['.github/workflows/coupon-harvest.yml'])).toBe('protected');
  expect(classify(['tools/__tests__/delivery-v2-adapter.test.ts'])).toBe('code-local');
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

test('mutable policy cannot authorize a new evidence command', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-hub-v2-policy-'));
  const configRoot = path.join(fixtureRoot, 'config');
  fs.mkdirSync(configRoot);
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'dev-delivery-v2-impact-policy.json'), 'utf8'));
  policy.requiredChecks['jest-full'].command = ['bash', '-c', 'true'];
  fs.writeFileSync(path.join(configRoot, 'dev-delivery-v2-impact-policy.json'), JSON.stringify(policy));
  const source = [
    'import importlib.util,pathlib,sys',
    `s=importlib.util.spec_from_file_location('adapter', ${JSON.stringify(adapter)})`,
    'm=importlib.util.module_from_spec(s);s.loader.exec_module(m)',
    'm.policy(pathlib.Path(sys.argv[1]))',
  ].join(';');
  try {
    const result = spawnSync('python3', ['-c', source, fixtureRoot], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/impact_policy_executable_surface_mismatch/);
  } finally { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
});

test('evidence cleanliness snapshot exposes index, unstaged and unexpected-untracked state', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-hub-v2-cleanliness-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'qa@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'qa'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'clean\n');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'dirty\n');
  fs.writeFileSync(path.join(repo, 'unexpected.txt'), 'unexpected\n');
  const source = [
    'import importlib.util,json,pathlib,sys',
    `s=importlib.util.spec_from_file_location('adapter', ${JSON.stringify(adapter)})`,
    'm=importlib.util.module_from_spec(s);s.loader.exec_module(m)',
    'print(json.dumps(m.cleanliness_snapshot(pathlib.Path(sys.argv[1]))))',
  ].join(';');
  try {
    const snapshot = JSON.parse(execFileSync('python3', ['-c', source, repo], { encoding: 'utf8' }));
    expect(snapshot.indexTree).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.unstagedTrackedClean).toBe(false);
    expect(snapshot.unstagedTrackedPaths).toEqual(['tracked.txt']);
    expect(snapshot.unexpectedUntrackedClean).toBe(false);
    expect(snapshot.unexpectedUntrackedPaths).toEqual(['unexpected.txt']);
    expect(fs.readFileSync(adapter, 'utf8')).not.toMatch(/["']externalWritePerformed["']/);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('PR job is exact-diff bound and contains no local-only continuity or hook checks', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr-checklist-guard.yml'), 'utf8');
  expect(workflow).toMatch(/fetch-depth: 0/);
  expect(workflow).toMatch(/node-version: 22/);
  expect(workflow).toMatch(/npm ci --ignore-scripts/);
  expect(workflow).toMatch(/npm test -- --runInBand/);
  expect(workflow).toMatch(/--mode range --base "\$PR_BASE_SHA" --head "\$PR_HEAD_SHA"/);
  expect(workflow).toMatch(/git diff --check "\$PR_BASE_SHA\.\.\$PR_HEAD_SHA"/);
  expect(workflow).not.toMatch(/worktree-continuity-guard\.sh/);
  expect(workflow).not.toMatch(/git-health-check\.sh/);
  expect(workflow).not.toMatch(/safe-repo-audit\.sh --strict --mode local/);
});
