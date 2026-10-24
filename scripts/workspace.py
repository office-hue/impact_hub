#!/usr/bin/env python3
"""Optional workspace assistance. Never an authorization or lifecycle controller.

context/doctor/prepare/resume do not write unless --install-deps is explicit.
Native Git and project commands remain usable independently of this program.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile

PHASES = ('start', 'planning', 'implementation', 'review', 'publication',
          'operations', 'clients-and-rollout')
SOURCE = Path(__file__).resolve().parent.parent
MANIFESTS = ('package.json', 'package-lock.json', 'npm-shrinkwrap.json',
             'pnpm-lock.yaml', 'yarn.lock', '.npmrc', '.yarnrc.yml',
             'pnpm-workspace.yaml', '.nvmrc', '.node-version', '.python-version',
             'pyproject.toml', 'uv.lock', 'poetry.lock', 'requirements.txt',
             'composer.json', 'composer.lock', 'Pipfile', 'Pipfile.lock',
             'setup.cfg', 'setup.py', '.pypirc', 'uv.toml')


def manifest(name):
    leaf = Path(name).name
    return leaf in MANIFESTS or (leaf.startswith('requirements') and leaf.endswith(('.txt', '.lock')))


def run(args, cwd=None, timeout=5):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True,
                          timeout=timeout, env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'})


def git(repo, *args):
    result = run(['git', '-C', str(repo), *args])
    if result.returncode:
        raise ValueError('Git read failed: ' + ' '.join(args[:2]))
    return result.stdout.rstrip('\n')


def identify(repo):
    root = Path(git(repo, 'rev-parse', '--show-toplevel')).resolve()
    head = git(root, 'rev-parse', '--verify', 'HEAD')
    branch = run(['git', '-C', str(root), 'symbolic-ref', '--quiet', '--short', 'HEAD'])
    return root, {'repo': str(root), 'head': head,
                  'branch': branch.stdout.strip() or '(detached)',
                  'tree': git(root, 'rev-parse', 'HEAD^{tree}')}


def runtime(name, args):
    executable = shutil.which(name)
    if not executable:
        return {'available': False}
    try:
        result = run([executable, *args], timeout=2)
        return {'available': result.returncode == 0, 'path': executable,
                'version': result.stdout.strip()[:300]}
    except (OSError, subprocess.TimeoutExpired):
        return {'available': False, 'path': executable}


def dependency_inventory(root):
    """An observation, NOT certification of installed dependencies.

    Hash tracked local package source, patches and config as well as lockfiles.
    Dirty tracked content is read from this worktree, never another checkout.
    Untracked build inputs are reported separately; no shared-tree reuse occurs.
    """
    runtimes = {'python': {'available': True, 'path': sys.executable,
                          'version': platform.python_version()},
                'node': runtime('node', ['-p', 'JSON.stringify({version:process.version,abi:process.versions.modules,platform:process.platform,arch:process.arch})'])}
    paths = git(root, 'ls-files', '-z').split('\0')
    inputs, local_roots, external = [], set(), []
    for name in filter(None, paths):
        p = root / name
        if p.name != 'package.json' or not p.is_file() or p.is_symlink() or not p.resolve().is_relative_to(root.resolve()):
            continue
        try:
            package = json.loads(p.read_text())
        except (OSError, ValueError):
            continue  # Its bytes still enter the identity below.
        for field in ('dependencies', 'devDependencies', 'optionalDependencies'):
            for value in package.get(field, {}).values():
                if isinstance(value, str) and value.startswith(('file:', 'link:')):
                    target = p.parent / value.split(':', 1)[1]
                    resolved = target.resolve()
                    if resolved.is_relative_to(root.resolve()):
                        local_roots.add(resolved.relative_to(root.resolve()).as_posix())
                    else:
                        external.append({'manifest': name, 'reference': value, 'status': 'not-read-outside-worktree'})

    def selected(name):
        return manifest(name) or name.startswith(('packages/', 'patches/')) or any(
            directory == '.' or name == directory or name.startswith(directory + '/') for directory in local_roots)

    for name in sorted(filter(None, paths)):
        p = root / name
        if selected(name):
            # No dereference of local dependency links into another checkout.
            if p.is_symlink():
                inputs.append([name, 'symlink', os.readlink(p)])
            elif not p.resolve().is_relative_to(root.resolve()):
                inputs.append([name, 'outside-worktree-not-read'])
            elif p.is_file():
                inputs.append([name, hashlib.sha256(p.read_bytes()).hexdigest()])
            else:
                inputs.append([name, 'missing'])
    unknown = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')
    untracked_inputs = [p for p in unknown if p and selected(p)]
    if (root / 'composer.json').is_file():
        runtimes['php'] = runtime('php', ['-r', 'echo PHP_VERSION;'])
        runtimes['composer'] = runtime('composer', ['--version', '--no-ansi'])
    identity = {'inputs': inputs, 'runtime': runtimes,
                'platform': platform.system(), 'architecture': platform.machine(),
                'python_abi': sys.implementation.cache_tag}
    return {'identity': hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest(),
            'runtimes': runtimes, 'input_count': len(inputs),
            'untracked_inputs': untracked_inputs,
            'external_local_dependencies': external,
            'node_modules_present': (root / 'node_modules').is_dir(),
            'node_modules_shared': (root / 'node_modules').is_symlink(),
            'venv_present': (root / '.venv').is_dir(),
            'installed_compatibility': 'not-verified',
            'cache_reuse': 'none; existing dependencies preserved'}


def context(root, phase):
    guide = SOURCE / 'docs/dev-guide' / (phase + '.md')
    result = []
    # AGENTS are instructions, not an authorization dependency. Nested files
    # remain the caller's responsibility for the actual files being changed.
    override = root / 'AGENTS.override.md'
    effective = override if override.is_file() and override.stat().st_size else root / 'AGENTS.md'
    for p in (effective, guide):
        if p.is_file() and not p.is_symlink():
            result.append({'path': str(p), 'text': p.read_text(encoding='utf-8')})
    return {'phase': phase, 'documents': result,
            'advisories': [] if guide.is_file() else ['Phase guide unavailable; use repository instructions directly.'],
            'nested_instructions': 'Read applicable nested AGENTS.md before editing their files.',
            'memory': {'status': 'not-queried', 'hint': 'Use Secretary / DEV-work memory; report cache/pending on remote failure.'}}


def install_dependencies(root):
    """Explicit, narrow npm installation. Other managers retain native paths.

    No shared cache or shared node_modules writes; npm lifecycle scripts require
    a separate native project command after source review.
    """
    modules = root / 'node_modules'
    if modules.exists() or modules.is_symlink():
        return {'status': 'unchanged', 'reason': 'Existing dependencies preserved; verify with affected project checks.'}
    if not (root / 'package-lock.json').is_file():
        return {'status': 'advisory', 'reason': 'No npm lockfile; use the project locked installer in this worktree.'}
    package = json.loads((root / 'package.json').read_text())
    if package.get('packageManager', 'npm').split('@')[0] != 'npm':
        return {'status': 'advisory', 'reason': 'Project declares another manager; use its locked installer.'}
    if not shutil.which('npm'):
        return {'status': 'advisory', 'reason': 'npm unavailable; select the runtime declared by the project.'}
    # npm ci can execute scripts from arbitrary dependencies; keep them disabled.
    # A fresh private cache is explicit rather than silently repairing shared data.
    with tempfile.TemporaryDirectory(prefix='office-workspace-npm-') as cache:
        command = ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache]
        result = subprocess.run(command, cwd=root)
    return {'status': 'installed-without-scripts' if result.returncode == 0 else 'failed',
            'exit_code': result.returncode,
            'reason': 'Run reviewed native build/install scripts if required. No shared cache modified.'}


def start(root, branch, destination, base):
    if not branch or not destination:
        raise ValueError('start needs --branch and --path')
    if run(['git', 'check-ref-format', '--branch', branch]).returncode:
        raise ValueError('Invalid branch name')
    target = Path(destination).expanduser().absolute()
    if target.exists() or target.is_symlink():
        raise ValueError('Destination already exists; use resume. Nothing overwritten.')
    expected = git(root, 'rev-parse', '--verify', base + '^{commit}')
    try:
        result = run(['git', '-C', str(root), 'worktree', 'add', '-b', branch, str(target), expected], timeout=60)
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        # Git may already have registered/checked out the worktree before a
        # post-checkout hook timed out. Do the same bounded readback, no retry.
        exit_code = None
    # post-checkout can fail AFTER worktree creation. Read back; never retry.
    observed = None
    try:
        actual_root, observed = identify(target)
        matching = actual_root == target.resolve() and observed['head'] == expected and observed['branch'] == branch
    except (ValueError, OSError, subprocess.TimeoutExpired):
        matching = False
    if matching:
        return {'status': 'created' if exit_code == 0 else 'created-with-hook-warning',
                'identity': observed, 'git_exit_code': exit_code,
                'advisories': [] if exit_code == 0 else ['Worktree exists at expected commit. Inspect post-checkout hook/timeout; do not repeat creation.']}
    return {'status': 'needs-inspection', 'git_exit_code': exit_code,
            'identity': observed, 'advisories': ['No retry performed. Inspect branch and worktree registration before recovery.']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'start', 'resume', 'context', 'doctor'])
    parser.add_argument('--repo', default='.')
    parser.add_argument('--phase', choices=PHASES, default='start')
    parser.add_argument('--branch')
    parser.add_argument('--path')
    parser.add_argument('--base', default='HEAD')
    parser.add_argument('--install-deps', action='store_true')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)
    try:
        if args.install_deps and args.command != 'prepare':
            raise ValueError('--install-deps is only valid with prepare')
        root, identity = identify(args.repo)
        result = {'schemaVersion': 1, 'advisoryOnly': True, 'authorityGranted': False,
                  'command': args.command, 'identity': identity,
                  'fallback': 'Use native Git and project commands directly; this helper is not a gate.'}
        if args.command == 'start':
            result.update(start(root, args.branch, args.path, args.base))
        elif args.command == 'context':
            result.update(context(root, args.phase))
        else:
            result['dependencies'] = dependency_inventory(root)
            result['status'] = 'observed'
            result['git_changes'] = git(root, 'status', '--porcelain=v1')
            if args.install_deps:
                result['installation'] = install_dependencies(root)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if result.get('status') == 'needs-inspection' or result.get('installation', {}).get('status') == 'failed' else 0
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(json.dumps({'status': 'unavailable', 'advisoryOnly': True, 'authorityGranted': False,
                          'reason': str(error), 'fallback': 'Use native Git/project commands. No permission was denied.'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
