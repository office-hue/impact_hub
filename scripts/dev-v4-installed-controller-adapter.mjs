import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const TARGET_ORIGINS = new Set([
  'https://github.com/office-hue/impact_hub.git',
  'git@github.com:office-hue/impact_hub.git',
  'ssh://git@github.com/office-hue/impact_hub.git',
]);
const SELECTORS = new Set(['standard-source-brief', 'dev-governance-source']);
const READ_ONLY = new Set(['status', 'resume', 'projection']);

export function controllerPath(env = process.env) {
  return env.OFFICE_DEV_CONTROLLER || path.join(
    env.HOME || os.homedir(),
    'Library/Application Support/office-dev/bin/dev-v4-office-dev',
  );
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function assertTargetOrigin(repo, origin = execFileSync(
  'git', ['-C', repo, 'remote', 'get-url', 'origin'], { encoding: 'utf8' },
).trim()) {
  if (!TARGET_ORIGINS.has(origin)) throw new Error('target_origin_invalid');
  return origin;
}

export function assertTargetPolicy(repo, selector, engineDescriptor) {
  if (!SELECTORS.has(selector)) throw new Error('selector_invalid');
  const policyRoot = path.join(repo, 'config', 'dev-v4');
  const activation = readJson(path.join(policyRoot, 'activation-policy.v1.json'));
  const selectors = readJson(path.join(policyRoot, 'task-selectors.v1.json'));
  const lifecycle = readJson(path.join(policyRoot, 'lifecycle-contract.v1.json'));
  const delivery = readJson(path.join(repo, 'config', 'dev-delivery-v2-policy.json'));
  const selected = selectors.selectors?.[selector];
  if (!selected || selected.candidateAuthority === true) throw new Error('selector_candidate_only');
  if (activation.status !== 'active' || activation.candidateAuthority === true) {
    throw new Error('activation_policy_not_base_authority');
  }
  if (delivery.componentId !== 'dev.delivery.control-plane' ||
      !delivery.plan?.allowedModes?.includes('local') ||
      !delivery.plan?.allowedReleaseProfiles?.includes('source-only')) {
    throw new Error('delivery_policy_invalid');
  }
  if (!engineDescriptor || engineDescriptor.engineContractVersion !== lifecycle.engineContractVersion) {
    throw new Error('engine_contract_mismatch');
  }
  const retained = lifecycle.acceptedRetainedEngines || [];
  const matches = retained.some((entry) => (
    entry.sourceRepo === engineDescriptor.sourceRepo &&
    entry.sourceCommit === engineDescriptor.sourceCommit &&
    entry.digest === engineDescriptor.digest &&
    entry.engineContractVersion === engineDescriptor.engineContractVersion
  ));
  if (!matches) throw new Error('engine_not_retained_for_target');
  return { activation, selected, lifecycle, delivery };
}

export function buildArgs(repo, operation, options = {}) {
  if (READ_ONLY.has(operation)) {
    if (options.taskId || options.selector || options.branch || options.brief) {
      throw new Error('read_only_arguments_invalid');
    }
    return ['--repo', repo, operation];
  }
  if (operation !== 'start') throw new Error('operation_invalid');
  if (!options.taskId || !options.selector || !SELECTORS.has(options.selector)) {
    throw new Error('start_arguments_invalid');
  }
  const args = ['--repo', repo, 'start', '--task-id', options.taskId, '--selector', options.selector];
  if (options.branch) args.push('--branch', options.branch);
  if (options.brief) args.push('--brief', options.brief);
  return args;
}

export function legacyProjection(repo) {
  const marker = execFileSync('git', ['-C', repo, 'rev-parse', '--git-path', 'worktree-active.json'], { encoding: 'utf8' }).trim();
  if (!fs.existsSync(marker)) return null;
  const value = readJson(marker);
  if (value.schemaVersion !== 2 || typeof value.branch !== 'string' || typeof value.path !== 'string') {
    throw new Error('legacy_marker_invalid');
  }
  const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  return {
    status: 'legacy-unverified', writes: false, source: 'repo-local-stage-a',
    capsule: { schemaVersion: value.schemaVersion, branch: value.branch, path: value.path,
      baseCommit: value.baseCommit || null, recordedHead: value.head || null, recordedTree: value.tree || null,
      currentHead: head, currentTree: tree, identityCurrent: value.head === head && value.tree === tree },
  };
}

export function run(argv = process.argv.slice(2), env = process.env) {
  const [operation, ...rest] = argv;
  const repo = env.OFFICE_DEV_REPO || process.cwd();
  if (!operation) throw new Error('operation_required');
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (key === '--task-id' || key === '--selector' || key === '--branch' || key === '--brief') {
      options[{ '--task-id': 'taskId', '--selector': 'selector', '--branch': 'branch', '--brief': 'brief' }[key]] = rest[++i];
    } else if (key !== '--repo') {
      throw new Error('argument_invalid');
    } else {
      options.repo = rest[++i];
    }
  }
  const targetRepo = options.repo || repo;
  assertTargetOrigin(targetRepo);
  if (READ_ONLY.has(operation)) {
    const state = execFileSync('git', ['-C', targetRepo, 'rev-parse', '--git-path', 'dev-v4-lifecycle/state.json'], { encoding: 'utf8' }).trim();
    if (!fs.existsSync(state)) {
      const legacy = legacyProjection(targetRepo);
      if (legacy) { console.log(JSON.stringify(legacy)); return null; }
    }
  }
  const args = buildArgs(targetRepo, operation, options);
  const result = spawn(controllerPath(env), args, { stdio: 'inherit', env });
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { run(); } catch (error) { console.error(JSON.stringify({ status: 'blocked', error: error.message })); process.exitCode = 1; }
}
