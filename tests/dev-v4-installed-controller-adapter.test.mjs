import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assertTargetOrigin, assertTargetPolicy, buildArgs, controllerPath, installedEngineDescriptor, readJson } from '../scripts/dev-v4-installed-controller-adapter.mjs';

const adapter = fileURLToPath(new URL('../scripts/dev-v4-installed-controller-adapter.mjs', import.meta.url));
const start = ['start', '--task-id', 'fixture-task', '--selector', 'dev-governance-source', '--branch', 'dev/fixture-task'];
const accepted = { sourceRepo: 'office-hue/ai-agent', sourceCommit: '8'.repeat(40), digest: 'a'.repeat(64), engineContractVersion: 1 };
const descriptorValue = { schemaVersion: 1, ...accepted, capsuleSchemaVersion: 3 };
const origins = ['https://github.com/office-hue/impact_hub.git', 'git@github.com:office-hue/impact_hub.git', 'ssh://git@github.com/office-hue/impact_hub.git'];
function snapshot(dir) {
  return fs.readdirSync(dir).sort().flatMap(name => {
    const file = path.join(dir, name), stat = fs.lstatSync(file);
    return stat.isDirectory() ? [[file, stat.mode], ...snapshot(file)] : [[file, stat.mode, fs.readFileSync(file).toString('hex')]];
  });
}
function fixture(t, inherited = process.env) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hub-adapter-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, 'repo'), home = path.join(tmp, 'home');
  for (const dir of [root, home]) fs.mkdirSync(dir, { mode: 0o700 });
  const hooks = path.join(home, 'empty-hooks'); fs.mkdirSync(hooks, { mode: 0o700 });
  const clean = Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith('GIT_') && !['OFFICE_DEV_CONTROLLER', 'OFFICE_DEV_ENGINE_DESCRIPTOR', 'OFFICE_DEV_REPO'].includes(key)));
  const env = { ...clean, HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', OFFICE_DEV_REPO: root };
  function git(...args) {
    const result = spawnSync('/usr/bin/git', ['-C', root, ...args], { env, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  }
  git('init', '-b', 'main'); git('config', 'core.hooksPath', hooks); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'remote.origin.url', origins[0]);
  const policyDir = path.join(root, 'config/dev-v4'); fs.mkdirSync(policyDir, { recursive: true, mode: 0o700 });
  const life = { schemaVersion: 1, contractId: 'dev-v4.lifecycle', capsuleSchemaVersion: 3, engineContractVersion: 1, supportedEngineContractVersions: [1], acceptedRetainedEngines: [accepted], candidateAuthority: false };
  const policies = {
    'config/dev-v4/activation-policy.v1.json': { schemaVersion: 1, contractId: 'dev-v4.activation-policy', status: 'active', authority: 'base-git-object', repoId: 'impact_hub', candidateAuthority: false },
    'config/dev-v4/task-selectors.v1.json': { schemaVersion: 1, contractId: 'dev-v4.task-selectors', authority: 'base-git-object', candidateAuthority: false, exclusiveWriteSurfaces: [], selectors: {
      'standard-source-brief': { lane: 'standard', requiresPlanId: false, writeSurface: ['docs/'] },
      'dev-governance-source': { lane: 'protected', requiresPlanId: true, writeSurface: ['scripts/dev-v4-', 'tests/dev-v4-', 'docs/'] },
    } },
    'config/dev-v4/graded-delivery.v1.json': { schemaVersion: 1, contractId: 'dev-v4.graded-delivery', laneAuthority: 'base-owned-classifier', lanes: {} },
    'config/dev-delivery-v2-policy.json': { schemaVersion: 2, componentId: 'dev.delivery.control-plane', plan: { allowedModes: ['local'], allowedReleaseProfiles: ['source-only'] } },
    'config/dev-v4/lifecycle-contract.v1.json': life,
  };
  function write(relative, value) { fs.writeFileSync(path.join(root, relative), typeof value === 'string' ? value : JSON.stringify(value)); }
  for (const [relative, value] of Object.entries(policies)) write(relative, value);
  function commit(updateBase = true) { git('add', 'config'); git('commit', '-m', 'synthetic policy'); if (updateBase) git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD')); }
  commit();
  const data = path.join(home, 'Library/Application Support/office-dev');
  const descriptor = path.join(data, 'packages/dev-v4', accepted.digest, accepted.sourceCommit, 'files/engine-descriptor.json');
  fs.mkdirSync(path.dirname(descriptor), { recursive: true, mode: 0o700 }); fs.writeFileSync(descriptor, JSON.stringify(descriptorValue), { mode: 0o600 });
  const loader = path.join(data, 'bin/dev-v4-office-dev'); fs.mkdirSync(path.dirname(loader), { mode: 0o700 });
  function loaderBody(body = 'process.stdout.write(JSON.stringify({fixtureOnly:true,argv:process.argv.slice(2),noReplace:process.env.GIT_NO_REPLACE_OBJECTS}));') { fs.writeFileSync(loader, `#!${process.execPath}\n${body}\n`, { mode: 0o700 }); }
  loaderBody();
  const stateDir = path.join(root, '.git/dev-v4-lifecycle'), stateFile = path.join(stateDir, 'state.json');
  function bind() { fs.mkdirSync(stateDir, { mode: 0o700 }); fs.writeFileSync(stateFile, JSON.stringify({ schemaVersion: 3, repoId: 'impact_hub', engine: { sourceCommit: '7'.repeat(40), digest: 'b'.repeat(64) } }), { mode: 0o600 }); }
  function run(args, overrides = {}) { return spawnSync(process.execPath, [adapter, ...args], { env: { ...env, ...overrides }, encoding: 'utf8', timeout: 10000 }); }
  function argv(args, overrides) { const result = run(args, overrides); assert.equal(result.status, 0, result.stderr); const out = JSON.parse(result.stdout); assert.equal(out.fixtureOnly, true); assert.equal(out.noReplace, '1'); return out.argv; }
  function blocked(args, code, overrides) { const result = run(args, overrides); assert.equal(result.status, 1); assert.equal(result.stdout, ''); const out = JSON.parse(result.stderr); assert.equal(out.status, 'blocked'); if (code) assert.equal(out.error, code); assert.deepEqual(Object.keys(out).sort(), ['error', 'status']); assert.ok(!result.stderr.includes('SECRET')); assert.ok(!result.stderr.includes(tmp)); }
  return { root, home, env, data, git, write, policies, life, commit, descriptor, loader, loaderBody, bind, stateDir, stateFile, run, argv, blocked };
}

test('safe exported helpers retain useful contracts without installed defaults', t => {
  const f = fixture(t);
  assert.equal(controllerPath(f.env), f.loader);
  assert.deepEqual(installedEngineDescriptor(f.env, accepted), descriptorValue);
  assert.throws(() => installedEngineDescriptor(f.env), /accepted_engine_invalid/);
  assert.deepEqual(readJson(f.descriptor), descriptorValue);
  const bundle = assertTargetPolicy(f.root, 'standard-source-brief', descriptorValue, undefined, f.env);
  assert.equal(bundle.activation.repoId, 'impact_hub'); assert.equal(bundle.selected.requiresPlanId, false);
  assert.throws(() => assertTargetPolicy(f.root, 'standard-source-brief', { ...descriptorValue, sourceCommit: '9'.repeat(40) }, undefined, f.env), /engine_not_retained_for_target/);
  assert.deepEqual(buildArgs(f.root, 'status'), ['--repo', f.root, 'status']);
  assert.throws(() => buildArgs(f.root, 'resume', { selector: 'standard-source-brief' }), /operation_arguments_invalid/);
});
test('unbound start uses exact committed engine despite missing default and malformed candidate policy', t => {
  const f = fixture(t); f.write('config/dev-v4/lifecycle-contract.v1.json', 'SECRET invalid candidate');
  assert.equal(fs.existsSync(path.join(f.data, 'defaults')), false);
  assert.deepEqual(f.argv(start), ['--repo', f.root, '--engine-descriptor', f.descriptor, ...start]);
});
test('committed HEAD is not substituted for the one local origin/main snapshot', t => {
  const f = fixture(t); f.write('config/dev-v4/lifecycle-contract.v1.json', { ...f.life, acceptedRetainedEngines: [] }); f.commit(false);
  assert.deepEqual(f.argv(start), ['--repo', f.root, '--engine-descriptor', f.descriptor, ...start]);
});
test('bound pin and normal bind remain dispatcher-owned without candidate policy or descriptor', t => {
  const f = fixture(t); f.bind(); fs.unlinkSync(f.descriptor);
  for (const relative of Object.keys(f.policies)) fs.unlinkSync(path.join(f.root, relative));
  for (const args of [['status'], ['resume'], ['projection'], ['bind', '--task-id', 'fixture-task', '--plan-anchor', '1'.repeat(40)], start]) assert.deepEqual(f.argv(args), ['--repo', f.root, ...args]);
});
test('exact context render is read-only with bound and absent capsule', t => {
  const f = fixture(t), args = ['context', '--render'];
  assert.deepEqual(f.argv(args), ['--repo', f.root, ...args]); assert.equal(fs.existsSync(f.stateDir), false);
  f.bind(); const before = snapshot(f.root); assert.deepEqual(f.argv(args), ['--repo', f.root, ...args]); assert.deepEqual(snapshot(f.root), before);
});
test('all three existing canonical origin spellings and brief FILE forwarding are preserved', t => {
  const f = fixture(t), brief = path.join(f.home, 'brief.json'); fs.writeFileSync(brief, '{"fixtureOnly":true}', { mode: 0o600 });
  for (const origin of origins) {
    f.git('config', 'remote.origin.url', origin); assert.equal(assertTargetOrigin(f.root, origin), origin);
    const args = ['start', '--task-id', 'fixture-task', '--selector', 'standard-source-brief', '--brief', brief];
    assert.deepEqual(f.argv(args), ['--repo', f.root, '--engine-descriptor', f.descriptor, ...args]);
  }
});
for (const [name, args] of [
  ['duplicate selector', [...start, '--selector', 'standard-source-brief']], ['duplicate repo', ['status', '--repo', '/SECRET', '--repo', '/SECRET']],
  ['unknown option', [...start, '--engine-descriptor', '/SECRET']], ['unknown command', ['requirements']], ['missing value', ['bind', '--task-id']],
  ['invalid anchor', ['bind', '--task-id', 'fixture', '--plan-anchor', 'SECRET']], ['missing anchor', ['bind', '--task-id', 'fixture']],
  ['render operation', ['context', '--render', '--operation', 'source']], ['duplicate render', ['context', '--render', '--render']],
  ['context refresh', ['context', '--refresh']], ['extra status arguments', ['status', '--selector', 'standard-source-brief']],
  ['missing selector', ['start', '--task-id', 'fixture']], ['unknown selector', ['start', '--task-id', 'fixture', '--selector', 'maintenance-docs']],
]) test(`rejects ${name} before the successful fake dispatcher`, t => { const f = fixture(t); f.blocked(args); });
for (const kind of ['empty directory', 'journal only', 'malformed JSON', 'duplicate JSON', 'foreign repo', 'wrong schema', 'insecure file', 'insecure directory', 'symlink file', 'hardlink file', 'symlink directory']) {
  test(`unsafe/orphan ${kind} is never unbound`, t => {
    const f = fixture(t);
    if (kind === 'empty directory' || kind === 'journal only') { fs.mkdirSync(f.stateDir, { mode: 0o700 }); if (kind === 'journal only') fs.writeFileSync(path.join(f.stateDir, 'state.json.journal'), '{}'); }
    else {
      f.bind();
      if (kind === 'malformed JSON') fs.writeFileSync(f.stateFile, 'SECRET invalid');
      if (kind === 'duplicate JSON') fs.writeFileSync(f.stateFile, '{"schemaVersion":3,"schemaVersion":3}');
      if (kind === 'foreign repo') { const state = JSON.parse(fs.readFileSync(f.stateFile)); state.repoId = 'foreign'; fs.writeFileSync(f.stateFile, JSON.stringify(state)); }
      if (kind === 'wrong schema') fs.writeFileSync(f.stateFile, '{"schemaVersion":2}');
      if (kind === 'insecure file') fs.chmodSync(f.stateFile, 0o644);
      if (kind === 'insecure directory') fs.chmodSync(f.stateDir, 0o755);
      if (kind === 'hardlink file') fs.linkSync(f.stateFile, path.join(f.home, 'state-link'));
      if (kind === 'symlink file') { fs.renameSync(f.stateFile, path.join(f.home, 'state-target')); fs.symlinkSync(path.join(f.home, 'state-target'), f.stateFile); }
      if (kind === 'symlink directory') { fs.renameSync(f.stateDir, path.join(f.home, 'state-dir-target')); fs.symlinkSync(path.join(f.home, 'state-dir-target'), f.stateDir); }
    }
    f.blocked(start);
  });
}
for (const kind of ['missing', 'wrong commit', 'wrong digest', 'wrong capsule', 'symlink', 'hardlink', 'insecure', 'duplicate JSON', 'symlink ancestor']) {
  test(`rejects ${kind} descriptor without fallback`, t => {
    const f = fixture(t);
    if (kind === 'missing') fs.unlinkSync(f.descriptor);
    if (kind.startsWith('wrong ')) fs.writeFileSync(f.descriptor, JSON.stringify({ ...descriptorValue, [({ 'wrong commit': 'sourceCommit', 'wrong digest': 'digest', 'wrong capsule': 'capsuleSchemaVersion' })[kind]]: kind === 'wrong capsule' ? 2 : 'd'.repeat(kind === 'wrong commit' ? 40 : 64) }));
    if (kind === 'duplicate JSON') fs.writeFileSync(f.descriptor, '{"schemaVersion":1,"schemaVersion":1}');
    if (kind === 'insecure') fs.chmodSync(f.descriptor, 0o666);
    if (kind === 'hardlink') fs.linkSync(f.descriptor, path.join(f.home, 'descriptor-link'));
    if (kind === 'symlink') { fs.renameSync(f.descriptor, path.join(f.home, 'descriptor-target')); fs.symlinkSync(path.join(f.home, 'descriptor-target'), f.descriptor); }
    if (kind === 'symlink ancestor') { const dir = path.dirname(f.descriptor), dest = path.join(f.home, 'files-target'); fs.renameSync(dir, dest); fs.symlinkSync(dest, dir); }
    f.blocked(start);
  });
}
for (const [name, relative, mutation] of [
  ['ambiguous engines', 'config/dev-v4/lifecycle-contract.v1.json', value => ({ ...value, acceptedRetainedEngines: [accepted, accepted] })],
  ['candidate authority', 'config/dev-v4/activation-policy.v1.json', value => ({ ...value, candidateAuthority: true })],
  ['foreign identity', 'config/dev-v4/activation-policy.v1.json', value => ({ ...value, repoId: 'foreign' })],
  ['unknown selector', 'config/dev-v4/task-selectors.v1.json', value => ({ ...value, selectors: {} })],
  ['graded schema', 'config/dev-v4/graded-delivery.v1.json', value => ({ ...value, schemaVersion: 9 })],
  ['delivery schema', 'config/dev-delivery-v2-policy.json', value => ({ ...value, schemaVersion: 9 })],
]) test(`committed ${name} is rejected`, t => { const f = fixture(t); f.write(relative, mutation(f.policies[relative])); f.commit(); f.blocked(start); });
test('committed symlink and malformed policy blobs fail closed', t => {
  const f = fixture(t), relative = 'config/dev-v4/lifecycle-contract.v1.json';
  f.write(relative, 'SECRET invalid'); f.commit(); f.blocked(start);
  fs.unlinkSync(path.join(f.root, relative)); fs.symlinkSync('task-selectors.v1.json', path.join(f.root, relative)); f.commit(); f.blocked(start);
});
test('foreign and multiple origins, missing local base and non-main checkout fail closed', t => {
  const f = fixture(t); f.git('config', 'remote.origin.url', 'https://SECRET@example.invalid/repo'); f.blocked(['status'], 'target_origin_invalid');
  f.git('config', 'remote.origin.url', origins[0]); f.git('config', '--add', 'remote.origin.url', origins[1]); f.blocked(start, 'target_origin_invalid');
  f.git('config', '--unset-all', 'remote.origin.url'); f.git('config', 'remote.origin.url', origins[0]);
  f.git('update-ref', '-d', 'refs/remotes/origin/main'); f.blocked(start, 'controller_git_read_failed');
  f.git('update-ref', 'refs/remotes/origin/main', f.git('rev-parse', 'HEAD')); f.git('checkout', '-b', 'dev/not-primary'); f.blocked(start, 'start_requires_canonical_primary_main_checkout');
});
test('replacement blobs cannot substitute authority and no-replace is forced into the dispatcher', t => {
  const f = fixture(t), original = f.git('rev-parse', 'HEAD:config/dev-v4/lifecycle-contract.v1.json'), replacement = path.join(f.home, 'replacement.json');
  fs.writeFileSync(replacement, JSON.stringify({ ...f.life, acceptedRetainedEngines: [{ ...accepted, digest: 'd'.repeat(64) }] }));
  f.git('replace', original, f.git('hash-object', '-w', replacement));
  assert.equal(JSON.parse(f.git('cat-file', 'blob', original)).acceptedRetainedEngines[0].digest, 'd'.repeat(64));
  assert.deepEqual(f.argv(start, { GIT_NO_REPLACE_OBJECTS: '0' }), ['--repo', f.root, '--engine-descriptor', f.descriptor, ...start]);
});
test('ambient Git overrides cannot redirect fixture or linked metadata writes', t => {
  const foreign = fixture(t), before = snapshot(foreign.root), foreignGit = path.join(foreign.root, '.git');
  const hostile = { GIT_DIR: foreignGit, GIT_WORK_TREE: foreign.root, GIT_COMMON_DIR: foreignGit, GIT_INDEX_FILE: path.join(foreignGit, 'index'), GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.worktree', GIT_CONFIG_VALUE_0: foreign.root };
  const f = fixture(t, { ...process.env, ...hostile }), linked = path.join(path.dirname(f.root), 'linked');
  f.git('worktree', 'add', '-b', 'dev/linked', linked);
  f.blocked(start, 'start_requires_canonical_primary_main_checkout', { OFFICE_DEV_REPO: linked });
  // Make ambient process state genuinely hostile at this metadata seam too.
  const saved = new Map(Object.keys(hostile).map(key => [key, process.env[key]])); let gitDir;
  try { Object.assign(process.env, hostile); gitDir = f.git('-C', linked, 'rev-parse', '--absolute-git-dir'); }
  finally { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
  assert.equal(path.dirname(gitDir), path.join(f.root, '.git/worktrees')); assert.equal(fs.realpathSync(gitDir), gitDir);
  const stateDir = path.join(gitDir, 'dev-v4-lifecycle'); fs.mkdirSync(stateDir, { mode: 0o700 });
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({ schemaVersion: 3, repoId: 'impact_hub', engine: { sourceCommit: '7'.repeat(40), digest: 'b'.repeat(64) } }), { mode: 0o600 });
  assert.deepEqual(f.argv(['status'], { OFFICE_DEV_REPO: linked }), ['--repo', linked, 'status']);
  assert.deepEqual(snapshot(foreign.root), before);
});
for (const name of ['OFFICE_DEV_CONTROLLER', 'OFFICE_DEV_ENGINE_DESCRIPTOR']) test(`ambient ${name} cannot select executable or descriptor`, t => {
  const f = fixture(t); f.blocked(['status'], 'controller_override_forbidden', { [name]: '/SECRET' });
});
for (const [name, code] of [['stale policy', 'retained_engine_not_accepted_by_repository_policy'], ['existing branch', 'task_branch_already_exists_or_reserved'], ['bind identity', 'bound_plan_identity_mismatch']]) {
  test(`safe native ${name} survives without raw details`, t => {
    const f = fixture(t); f.loaderBody(`process.stderr.write(JSON.stringify({status:'blocked',error:${JSON.stringify(code)},details:'SECRET /private/secret'}));process.exit(1);`); f.blocked(start, code);
  });
}
for (const [name, body, error] of [
  ['raw success', 'process.stdout.write("SECRET /private/secret");', 'controller_json_invalid'],
  ['duplicate success', 'process.stdout.write("{\\"x\\":1,\\"x\\":2}");', 'controller_json_invalid'],
  ['raw error', 'process.stderr.write("SECRET /private/secret");process.exit(7);', 'controller_failed'],
  ['unknown JSON error', 'process.stderr.write(JSON.stringify({status:"blocked",error:"SECRET /private/secret"}));process.exit(1);', 'controller_failed'],
  ['duplicate error', 'process.stderr.write("{\\"status\\":\\"blocked\\",\\"error\\":\\"task_identity_mismatch\\",\\"error\\":\\"SECRET\\"}");process.exit(1);', 'controller_failed'],
]) test(`sanitizes ${name} output`, t => { const f = fixture(t); f.loaderBody(body); f.blocked(['status'], error); });

function continuityFixture(t) {
  const f = fixture(t), base = f.git('rev-parse', 'HEAD');
  f.git('checkout', '-b', 'dev/fixture-task');
  for (const file of ['docs/impact-hub-doc-sync-map-2026-06-23.md', 'docs/impact-hub-governance-system-plan-2026-06-16.md', 'notes.md', 'system-status-snapshot.md']) {
    fs.mkdirSync(path.dirname(path.join(f.root, file)), { recursive: true });
    fs.writeFileSync(path.join(f.root, file), 'Synthetic continuity document\n');
  }
  f.git('add', '.'); f.git('commit', '-m', 'synthetic task delta');
  const head = f.git('rev-parse', 'HEAD'), tree = f.git('rev-parse', 'HEAD^{tree}');
  const engine = { ...accepted, capsuleSchemaVersion: 3 };
  const state = { schemaVersion: 3, repoId: 'impact_hub', taskId: 'fixture-task', selectorId: 'dev-governance-source',
    policyState: 'implementation-ready', revision: 4, branch: 'dev/fixture-task', engine,
    base: { ref: 'origin/main', commit: base }, identity: { codeBase: base, policyCommit: base, integrationBase: base, planAnchorCommit: head, head, tree } };
  f.bind(); fs.writeFileSync(f.stateFile, JSON.stringify(state));
  const observation = { status: 'current', taskId: state.taskId, selectorId: state.selectorId, policyState: state.policyState,
    revision: state.revision, branch: state.branch, head, tree, dirty: false, identity: structuredClone(state.identity),
    engine: { state: 'verified', expected: engine }, writes: false };
  function respond(value = observation, prefix = '') {
    f.loaderBody(`${prefix}\nif (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify(['--repo', f.root, 'status']))}) process.exit(9); process.stdout.write(${JSON.stringify(JSON.stringify(value))});`);
  }
  function run(mode = 'push', options = {}) {
    const args = options.args ?? ['continuity', '--repo', f.root, '--mode', mode];
    const injected = { ...f.env, ...options.env };
    // Injection is a JS library call in this disposable subprocess, never a CLI flag.
    const source = `import os from 'node:os'; import {run} from ${JSON.stringify(new URL('../scripts/dev-v4-installed-controller-adapter.mjs', import.meta.url).href)};
      ${options.native ? `os.userInfo=()=>({homedir:${JSON.stringify(f.home)}});` : ''}
      try { process.exitCode=run(${JSON.stringify(args)}${options.native ? '' : `,${JSON.stringify(injected)}`}); }
      catch(error) {process.stderr.write(JSON.stringify({status:'blocked',error:error.message})+'\\n');process.exitCode=1;}`;
    return spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd: f.root, env: injected, encoding: 'utf8', timeout: 10000 });
  }
  function blocked(mode, code, options) {
    const result = run(mode, options); assert.equal(result.status, 1, result.stdout);
    assert.equal(result.stdout, ''); const value = JSON.parse(result.stderr); assert.equal(value.status, 'blocked');
    if (code) assert.equal(value.error, code); assert.ok(!result.stderr.includes('SECRET')); assert.ok(!result.stderr.includes(path.dirname(f.root)));
  }
  respond(); return { ...f, state, observation, respond, continuity: run, continuityBlocked: blocked };
}

test('continuity preserves a historical selector verified by installed status without widening start', t => {
  const f = continuityFixture(t);
  f.state.selectorId = f.observation.selectorId = 'historical-source-task';
  fs.writeFileSync(f.stateFile, JSON.stringify(f.state)); f.respond();
  const result = f.continuity();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).selectorId, 'historical-source-task');
  assert.throws(() => buildArgs(f.root, 'start', { taskId: 'fixture-task', selector: 'historical-source-task' }));
  f.state.selectorId = f.observation.selectorId = '';
  fs.writeFileSync(f.stateFile, JSON.stringify(f.state)); f.respond();
  f.continuityBlocked('push', 'continuity_identity_mismatch');
});

test('continuity observes installed v3 pins without legacy or lifecycle writes', t => {
  const f = continuityFixture(t), before = snapshot(f.root), result = f.continuity();
  assert.equal(result.status, 0, result.stderr); const value = JSON.parse(result.stdout);
  assert.equal(value.authority, 'installed-v3-continuity-only'); assert.equal(value.publicationAuthorized, false); assert.equal(value.writes, false);
  assert.deepEqual(value.lifecycle, f.state.identity); assert.notEqual(value.head, value.lifecycle.codeBase);
  assert.equal(value.selectorId, 'dev-governance-source'); assert.equal(fs.existsSync(path.join(f.root, '.git/worktree-active.json')), false);
  assert.deepEqual(snapshot(f.root), before);
});
for (const [label, mutate] of [
  ['stale status', o => o.status = 'stale'], ['recovery state', o => o.status = 'recovery'],
  ['pending handoff', o => o.sourceMergeHandoff = { recoveryRequired: true }],
  ['unverified engine', o => o.engine.state = 'unverified'], ['wrong pin', o => o.engine.expected.digest = 'd'.repeat(64)],
  ['wrong task', o => o.taskId = 'other'], ['wrong selector', o => o.selectorId = 'standard-source-brief'],
  ['wrong branch', o => o.branch = 'dev/other'], ['wrong head', o => o.head = '1'.repeat(40)],
  ['wrong tree', o => o.tree = '1'.repeat(40)], ['wrong base', o => o.identity.codeBase = o.head],
  ['wrong policy', o => o.identity.policyCommit = o.head], ['wrong anchor', o => o.identity.planAnchorCommit = null],
  ['wrong revision', o => o.revision++], ['write claim', o => o.writes = true], ['dirty mismatch', o => o.dirty = true],
]) test(`continuity refuses ${label}`, t => {
  const f = continuityFixture(t); mutate(f.observation); f.respond(); f.continuityBlocked('push', 'continuity_unverified');
});
for (const policyState of ['blocked', 'planning-only', 'stale', 'unknown']) test(`continuity rejects matching non-ready policy ${policyState}`, t => {
  const f = continuityFixture(t); f.state.policyState = policyState; f.observation.policyState = policyState;
  fs.writeFileSync(f.stateFile, JSON.stringify(f.state)); f.respond(); const before = fs.readFileSync(f.stateFile);
  for (const mode of ['local', 'push']) f.continuityBlocked(mode, 'continuity_policy_not_ready');
  assert.deepEqual(fs.readFileSync(f.stateFile), before);
});
test('continuity allows dirty local observation but requires clean push', t => {
  const f = continuityFixture(t); fs.writeFileSync(path.join(f.root, 'untracked'), 'fixture'); f.observation.dirty = true; f.respond();
  assert.equal(f.continuity('local').status, 0); f.continuityBlocked('push', 'continuity_dirty_push');
});
test('continuity rejects state mutation during installed observation', t => {
  const f = continuityFixture(t); f.respond(f.observation, `require('node:fs').appendFileSync(${JSON.stringify(f.stateFile)},' ');`);
  f.continuityBlocked('push', 'continuity_changed');
});
test('continuity preserves a compatible existing legacy marker', t => {
  const f = continuityFixture(t), file = path.join(f.root, '.git/worktree-active.json');
  const raw = JSON.stringify({ branch: f.state.branch, path: f.root, repo: 'impact_hub', selector: f.state.selectorId, base: f.state.base });
  fs.writeFileSync(file, raw, { mode: 0o600 }); assert.equal(f.continuity().status, 0); assert.equal(fs.readFileSync(file, 'utf8'), raw);
});
for (const kind of ['foreign branch', 'wrong base', 'wrong selector', 'symlink']) test(`continuity rejects ${kind} legacy marker`, t => {
  const f = continuityFixture(t), file = path.join(f.root, '.git/worktree-active.json');
  const marker = { branch: f.state.branch, path: f.root, repo: 'impact_hub', selector: f.state.selectorId, base: f.state.base };
  if (kind === 'foreign branch') marker.branch = 'dev/other';
  if (kind === 'wrong base') marker.base = { ref: 'origin/main', commit: f.state.identity.head };
  if (kind === 'wrong selector') marker.selector = 'standard-source-brief';
  if (kind === 'symlink') fs.symlinkSync(f.stateFile, file); else fs.writeFileSync(file, JSON.stringify(marker), { mode: 0o600 });
  const before = fs.lstatSync(file).isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file, 'utf8');
  f.continuityBlocked('push', kind === 'symlink' ? 'controller_file_unsafe_or_missing' : 'continuity_legacy_conflict');
  assert.equal(fs.lstatSync(file).isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file, 'utf8'), before);
});
test('continuity rejects absent and orphan v3 without legacy fallback', t => {
  const f = continuityFixture(t); fs.unlinkSync(f.stateFile); f.continuityBlocked('push', 'controller_file_unsafe_or_missing');
  fs.rmdirSync(f.stateDir); f.continuityBlocked('push', 'lifecycle_state_missing');
});
for (const args of [['continuity'], ['continuity', '--mode', 'release'], ['continuity', '--mode', 'push', '--mode', 'local'], ['continuity', '--mode', 'push', '--selector', 'dev-governance-source']]) test(`continuity rejects argv ${args.join(' ')}`, t => {
  const f = continuityFixture(t); f.continuityBlocked('push', undefined, { args });
});
test('continuity production invocation ignores caller HOME PATH and runtime injections', t => {
  const f = continuityFixture(t), foreignHome = path.join(f.home, 'foreign'); fs.mkdirSync(foreignHome);
  const checks = `if(process.env.HOME!==${JSON.stringify(f.home)}||process.env.PATH!=='/usr/bin:/bin:/usr/sbin:/sbin'||['NODE_OPTIONS','NODE_PATH','PYTHONPATH','PYTHONHOME','XDG_CONFIG_HOME','DYLD_INSERT_LIBRARIES'].some(key=>key in process.env))process.exit(9);`;
  f.respond(f.observation, checks);
  const result = f.continuity('push', { native: true, env: { HOME: foreignHome, PATH: foreignHome, NODE_OPTIONS: '', NODE_PATH: foreignHome, PYTHONPATH: foreignHome, PYTHONHOME: foreignHome, XDG_CONFIG_HOME: foreignHome, DYLD_INSERT_LIBRARIES: '' } });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).publicationAuthorized, false);
});
