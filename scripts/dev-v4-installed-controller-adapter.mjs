import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TARGET_ORIGINS = new Set([
  'https://github.com/office-hue/impact_hub.git',
  'git@github.com:office-hue/impact_hub.git',
  'ssh://git@github.com/office-hue/impact_hub.git',
]);
const SELECTORS = new Set(['standard-source-brief', 'dev-governance-source']);
const READ_ONLY = new Set(['status', 'resume', 'projection']);
const LIMIT = 1024 * 1024;
const SAFE_NATIVE_ERRORS = new Set([
  'retained_engine_not_accepted_by_repository_policy', 'task_branch_already_exists_or_reserved',
  'start_requires_canonical_primary_main_checkout', 'start_requires_head_at_exact_main',
  'start_requires_clean_worktree', 'existing_state_refuse_start', 'origin_policy_repository_mismatch',
  'bind_requires_clean_worktree', 'task_identity_mismatch', 'bound_plan_identity_mismatch',
  'bound_plan_authority_mismatch', 'bound_plan_manifest_missing_or_ambiguous',
  'selector_transition_not_allowed', 'git_rev_parse_failed', 'lifecycle_state_missing', 'cannot_resume_uninitialized',
]);
class AdapterError extends Error {}
const reject = code => { throw new AdapterError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha40 = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const sha64 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const text = value => typeof value === 'string' && value.length > 0 && !value.startsWith('-') && !/[\x00-\x1f\x7f]/.test(value);

function json(raw, optional = false) {
  // Reject duplicate keys, including escaped duplicates, rather than last-key-wins authority.
  try {
    const parsed = JSON.parse(raw); let at = 0;
    const space = () => { while (at < raw.length && /\s/.test(raw[at])) at++; };
    function string() { const start = at++; while (at < raw.length) { if (raw[at++] === '\\') at++; else if (raw[at - 1] === '"') return JSON.parse(raw.slice(start, at)); } throw new Error(); }
    function value() {
      space();
      if (raw[at] === '{') {
        at++; space(); const keys = new Set(); if (raw[at] === '}') { at++; return; }
        do { space(); const key = string(); if (keys.has(key)) throw new Error(); keys.add(key); space(); at++; value(); space(); } while (raw[at++] === ',');
      } else if (raw[at] === '[') {
        at++; space(); if (raw[at] === ']') { at++; return; } do { value(); space(); } while (raw[at++] === ',');
      } else if (raw[at] === '"') string();
      else while (at < raw.length && !/[\s,\]}]/.test(raw[at])) at++;
    }
    value(); if (!object(parsed)) throw new Error(); return parsed;
  } catch { if (optional) return null; reject('controller_json_invalid'); }
}
function regular(file, privateFile = false, executable = false) {
  let fd;
  try {
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.uid !== process.getuid() ||
        (before.mode & (privateFile ? 0o077 : 0o022)) || (executable && !(before.mode & 0o111)) || before.size > LIMIT) throw new Error();
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(fd); if (before.dev !== opened.dev || before.ino !== opened.ino) throw new Error();
    const raw = fs.readFileSync(fd, 'utf8'), after = fs.fstatSync(fd), named = fs.lstatSync(file);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || named.dev !== opened.dev || named.ino !== opened.ino) throw new Error();
    return raw;
  } catch { reject('controller_file_unsafe_or_missing'); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function canonicalDirectory(dir) {
  try { if (fs.realpathSync(dir) !== dir || !fs.lstatSync(dir).isDirectory()) throw new Error(); }
  catch { reject('controller_directory_unsafe'); }
}
function noOverrides(env) {
  if (Object.hasOwn(env, 'OFFICE_DEV_CONTROLLER') || Object.hasOwn(env, 'OFFICE_DEV_ENGINE_DESCRIPTOR')) reject('controller_override_forbidden');
}
const dataRoot = env => path.resolve(env.HOME || os.homedir(), 'Library/Application Support/office-dev');
function installedPath(file, env) {
  const root = dataRoot(env); canonicalDirectory(root);
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (dir !== root && !dir.startsWith(root + path.sep)) reject('controller_directory_unsafe');
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o022)) reject('controller_directory_unsafe');
    if (dir === root) break;
  }
}
function childEnvironment(env) {
  return { ...Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' };
}
function git(repo, args, env) {
  const result = spawnSync('/usr/bin/git', ['-c', 'core.fsmonitor=false', '-C', repo, ...args],
    { encoding: 'utf8', env: childEnvironment(env), timeout: 3000, maxBuffer: LIMIT });
  if (result.error || result.status !== 0) reject('controller_git_read_failed');
  return result.stdout.trim();
}
function committedJson(repo, base, relative, env) {
  const row = git(repo, ['ls-tree', base, '--', relative], env), match = /^100644 blob ([0-9a-f]{40})\t([^\n]+)$/.exec(row);
  if (!match || match[2] !== relative) reject('controller_policy_blob_invalid');
  return json(git(repo, ['cat-file', 'blob', match[1]], env));
}
function acceptedEngine(accepted) {
  if (!object(accepted) || accepted.sourceRepo !== 'office-hue/ai-agent' || !sha40(accepted.sourceCommit) || !sha64(accepted.digest) ||
      accepted.engineContractVersion !== 1 || (Object.hasOwn(accepted, 'capsuleSchemaVersion') && accepted.capsuleSchemaVersion !== 3)) reject('accepted_engine_invalid');
  return accepted;
}
function descriptorMatches(bundle, descriptor) {
  const accepted = acceptedEngine(bundle.lifecycle.acceptedRetainedEngines[0]);
  if (!object(descriptor) || descriptor.schemaVersion !== 1 || descriptor.capsuleSchemaVersion !== bundle.lifecycle.capsuleSchemaVersion ||
      ['sourceRepo', 'sourceCommit', 'digest', 'engineContractVersion'].some(key => descriptor[key] !== accepted[key])) reject('engine_not_retained_for_target');
}
function policyBundle(repo, selector, base, env) {
  if (!SELECTORS.has(selector)) reject('selector_invalid');
  if (!sha40(base)) reject('controller_base_invalid');
  const read = relative => committedJson(repo, base, relative, env);
  const activation = read('config/dev-v4/activation-policy.v1.json'), selectors = read('config/dev-v4/task-selectors.v1.json');
  const graded = read('config/dev-v4/graded-delivery.v1.json'), delivery = read('config/dev-delivery-v2-policy.json');
  const lifecycle = read('config/dev-v4/lifecycle-contract.v1.json');
  if (activation.schemaVersion !== 1 || activation.contractId !== 'dev-v4.activation-policy' || activation.repoId !== 'impact_hub' ||
      activation.status !== 'active' || activation.authority !== 'base-git-object' || activation.candidateAuthority !== false) reject('activation_policy_not_base_authority');
  if (selectors.schemaVersion !== 1 || selectors.contractId !== 'dev-v4.task-selectors' || selectors.authority !== 'base-git-object' ||
      selectors.candidateAuthority !== false || !object(selectors.selectors) || !Object.hasOwn(selectors.selectors, selector) || !Array.isArray(selectors.exclusiveWriteSurfaces)) reject('selector_policy_invalid');
  const selected = selectors.selectors[selector];
  if (!object(selected) || !['maintenance', 'standard', 'protected'].includes(selected.lane) || typeof selected.requiresPlanId !== 'boolean' ||
      !Array.isArray(selected.writeSurface) || selected.candidateAuthority === true) reject('selector_candidate_only');
  if (lifecycle.schemaVersion !== 1 || lifecycle.contractId !== 'dev-v4.lifecycle' || lifecycle.candidateAuthority !== false ||
      lifecycle.engineContractVersion !== 1 || lifecycle.capsuleSchemaVersion !== 3 || lifecycle.supportedEngineContractVersions?.length !== 1 ||
      lifecycle.supportedEngineContractVersions[0] !== 1 || lifecycle.acceptedRetainedEngines?.length !== 1) reject('engine_contract_mismatch');
  acceptedEngine(lifecycle.acceptedRetainedEngines[0]);
  if (graded.schemaVersion !== 1 || graded.contractId !== 'dev-v4.graded-delivery' || graded.laneAuthority !== 'base-owned-classifier' || !object(graded.lanes) ||
      delivery.schemaVersion !== 2 || delivery.componentId !== 'dev.delivery.control-plane' || !delivery.plan?.allowedModes?.includes('local') ||
      !delivery.plan?.allowedReleaseProfiles?.includes('source-only')) reject('delivery_policy_invalid');
  return { activation, selected, lifecycle, delivery, selectors, graded };
}

export function controllerPath(env = process.env) {
  noOverrides(env);
  return path.join(dataRoot(env), 'bin/dev-v4-office-dev');
}

export function readJson(file) {
  return json(regular(file));
}

export function installedEngineDescriptor(env = process.env, accepted) {
  noOverrides(env); acceptedEngine(accepted);
  const descriptor = path.join(dataRoot(env), 'packages/dev-v4', accepted.digest, accepted.sourceCommit, 'files/engine-descriptor.json');
  installedPath(descriptor, env);
  return readJson(descriptor);
}

export function assertTargetOrigin(repo, origin, env = process.env) {
  if (origin === undefined) {
    origin = git(repo, ['config', '--local', '--get-all', 'remote.origin.url'], env);
    if (!TARGET_ORIGINS.has(git(repo, ['remote', 'get-url', '--all', 'origin'], env))) reject('target_origin_invalid');
  }
  if (!TARGET_ORIGINS.has(origin)) reject('target_origin_invalid');
  return origin;
}

export function assertTargetPolicy(repo, selector, engineDescriptor, base, env = process.env) {
  base ??= git(repo, ['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'], env);
  const bundle = policyBundle(repo, selector, base, env); descriptorMatches(bundle, engineDescriptor); return bundle;
}

export function buildArgs(repo, operation, options = {}) {
  const keys = {
    start: ['taskId', 'selector', 'branch', 'brief'], bind: ['taskId', 'planAnchor'], context: ['render'],
    status: [], resume: [], projection: [],
  };
  if (!Object.hasOwn(keys, operation) || !object(options) || Object.keys(options).some(key => !keys[operation].includes(key))) reject('operation_arguments_invalid');
  if (READ_ONLY.has(operation)) {
    return ['--repo', repo, operation];
  }
  if (operation === 'context') {
    if (options.render !== true) reject('context_arguments_invalid');
    return ['--repo', repo, 'context', '--render'];
  }
  if (!text(options.taskId)) reject('task_id_invalid');
  if (operation === 'bind') {
    if (!sha40(options.planAnchor)) reject('plan_anchor_invalid');
    return ['--repo', repo, 'bind', '--task-id', options.taskId, '--plan-anchor', options.planAnchor];
  }
  if (!SELECTORS.has(options.selector)) reject('start_arguments_invalid');
  if (Object.hasOwn(options, 'branch') && (!text(options.branch) || !/^[A-Za-z0-9._/-]{1,160}$/.test(options.branch) ||
      options.branch.split('/').some(part => ['', '.', '..'].includes(part)) || ['main', 'master'].includes(options.branch))) reject('branch_invalid');
  if (Object.hasOwn(options, 'brief') && !text(options.brief)) reject('brief_argument_invalid');
  const args = ['--repo', repo, 'start', '--task-id', options.taskId, '--selector', options.selector];
  if (options.branch) args.push('--branch', options.branch);
  if (options.brief) args.push('--brief', options.brief);
  return args;
}

function bound(repo, env) {
  const gitDir = git(repo, ['rev-parse', '--absolute-git-dir'], env); canonicalDirectory(gitDir);
  const dir = path.join(gitDir, 'dev-v4-lifecycle'); let stat;
  try { stat = fs.lstatSync(dir); } catch (error) { if (error.code === 'ENOENT') return false; reject('lifecycle_state_unsafe'); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) reject('lifecycle_state_unsafe');
  const state = json(regular(path.join(dir, 'state.json'), true));
  if (state.schemaVersion !== 3 || state.repoId !== 'impact_hub' || !object(state.engine) || !sha40(state.engine.sourceCommit) || !sha64(state.engine.digest)) reject('lifecycle_state_invalid');
  return true;
}

export function run(argv = process.argv.slice(2), env = process.env) {
  const [operation, ...rest] = argv;
  noOverrides(env);
  const options = {}, seen = new Set(); let repo = env.OFFICE_DEV_REPO || process.cwd();
  const names = { '--task-id': 'taskId', '--selector': 'selector', '--branch': 'branch', '--brief': 'brief', '--plan-anchor': 'planAnchor' };
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (seen.has(key)) reject('argument_duplicate'); seen.add(key);
    if (key === '--render') { options.render = true; continue; }
    if (key !== '--repo' && !Object.hasOwn(names, key)) reject('argument_invalid');
    const value = rest[++i]; if (!text(value)) reject('argument_value_invalid');
    if (key === '--repo') repo = value; else options[names[key]] = value;
  }
  repo = path.resolve(repo); canonicalDirectory(repo);
  const args = buildArgs(repo, operation, options);
  if (git(repo, ['rev-parse', '--show-toplevel'], env) !== repo) reject('exact_repository_root_required');
  assertTargetOrigin(repo, undefined, env);
  const hasBoundTask = bound(repo, env);
  if (operation === 'start' && !hasBoundTask) {
    if (git(repo, ['rev-parse', '--absolute-git-dir'], env) !== path.resolve(repo, git(repo, ['rev-parse', '--git-common-dir'], env)) ||
        git(repo, ['symbolic-ref', '--quiet', 'HEAD'], env) !== 'refs/heads/main') reject('start_requires_canonical_primary_main_checkout');
    // One local snapshot; the native controller later fetches and revalidates before creating state.
    const base = git(repo, ['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'], env);
    const bundle = policyBundle(repo, options.selector, base, env), accepted = bundle.lifecycle.acceptedRetainedEngines[0];
    descriptorMatches(bundle, installedEngineDescriptor(env, accepted));
    const descriptor = path.join(dataRoot(env), 'packages/dev-v4', accepted.digest, accepted.sourceCommit, 'files/engine-descriptor.json');
    args.splice(2, 0, '--engine-descriptor', descriptor);
  }
  const loader = controllerPath(env); installedPath(loader, env); regular(loader, false, true);
  const result = spawnSync(loader, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: childEnvironment(env), timeout: 15000, maxBuffer: LIMIT });
  if (result.error) reject('controller_unavailable');
  if (result.status !== 0) {
    const output = json(result.stderr || result.stdout || '', true);
    process.stderr.write(JSON.stringify({ status: 'blocked', error: output?.status === 'blocked' && SAFE_NATIVE_ERRORS.has(output.error) ? output.error : 'controller_failed' }) + '\n');
    return 1;
  }
  process.stdout.write(JSON.stringify(json(result.stdout || '')) + '\n'); return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = run(); } catch (error) {
    process.stderr.write(JSON.stringify({ status: 'blocked', error: error instanceof AdapterError ? error.message : 'controller_adapter_failed' }) + '\n'); process.exitCode = 1;
  }
}
