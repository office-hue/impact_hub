#!/usr/bin/env python3
"""Optional Hub observation/start/push support; no registry or lifecycle permits."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location('hub_' + name, ROOT / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True)
    if result.returncode:
        raise ValueError('Native Git observation unavailable: ' + ' '.join(args[:2]))
    return result.stdout.rstrip('\n')


def push(argv):
    """One native push, exact ref input, no persistent hook/config writes.

    Chain executable custom pre-push hooks unchanged. Exact retired/generated
    hooks are replaced for this command only. Native Git retains refspec,
    transport, non-fast-forward and remote branch-protection decisions.
    """
    repo = Path(git('.', 'rev-parse', '--show-toplevel')).resolve()
    helper_path = ROOT / 'workspace-hooks.py'
    if not helper_path.is_file():
        print('[guarded-push] advisory: optional source audit unavailable; native hooks remain active.', file=sys.stderr)
        return subprocess.run(['git', '-C', str(repo), 'push', *argv]).returncode
    checks = load('workspace-hooks')
    raw = git(repo, 'rev-parse', '--git-path', 'hooks/pre-push')
    hook = Path(raw) if Path(raw).is_absolute() else repo / raw
    custom = None
    if hook.is_file() and os.access(hook, os.X_OK):
        try:
            managed = checks.owned('pre-push', checks.file_state(hook))
        except (OSError, ValueError):
            managed = False
        if not managed:
            custom = hook.absolute()
    if '--no-verify' in argv:
        print('[guarded-push] advisory: explicit --no-verify requests no local audit; no check evidence.', file=sys.stderr)
    with tempfile.TemporaryDirectory(prefix='hub-native-push-') as directory:
        temp = Path(directory)
        refs = shlex.quote(str(temp / 'refs'))
        chain = (shlex.quote(str(custom)) + ' "$@" < ' + refs + '\nresult=$?\n[ "$result" -eq 0 ] || exit "$result"\n') if custom else ''
        image = ('#!/bin/sh\nset -u\ncat > ' + refs + '\n' + chain
                 + shlex.quote(sys.executable) + ' -B ' + shlex.quote(str(helper_path))
                 + ' audit --strict --optional-hook --mode push --stdin --remote-name "${1-}" --remote-url "${2-}" --repo ' + shlex.quote(str(repo))
                 + ' < ' + refs + '\nresult=$?\n'
                 + 'if [ "$result" -eq 2 ]; then\n'
                 + "  echo '[guarded-push] advisory: audit unavailable; no audit evidence. Native Git continues.' >&2\n"
                 + '  exit 0\nfi\nexit "$result"\n')
        local_hook = temp / 'pre-push'
        local_hook.write_text(image)
        local_hook.chmod(0o700)
        return subprocess.run(['git', '-C', str(repo), '-c', 'core.hooksPath=' + str(temp), 'push', *argv]).returncode


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] == 'push':
        try:
            return push(argv[1:])
        except (ValueError, OSError) as error:
            print(json.dumps({'status': 'unavailable', 'reason': str(error), 'sourceChecks': 'not-evaluated'}), file=sys.stderr)
            return 2
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('observe', 'start'))
    parser.add_argument('branch', nargs='?')
    parser.add_argument('--path')
    parser.add_argument('--base', default='HEAD')
    parser.add_argument('--head')
    parser.add_argument('--repo', '--repo-root', dest='repo', default='.')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--mode', choices=('local', 'push'), default='local')
    for option in ('doc-sync-label', 'doc-sync-repo-id', 'doc-sync-path-prefix', 'active'):
        parser.add_argument('--' + option)
    args = parser.parse_args(argv)
    try:
        native = load('workspace')
        repo, identity = native.identify(args.repo)
        report = {'schemaVersion': 1, 'status': 'observed', 'identity': identity,
                  'legacyAdmission': 'retired', 'authorityGranted': False,
                  'sourceChecks': 'not-evaluated', 'advisoryOnly': True, 'writes': False,
                  'next': 'Native Git and affected project checks work without DEV metadata.'}
        if args.command == 'start' and args.path and not args.resume:
            report.update(native.start(repo, args.branch, args.path, args.base))
            report['writes'] = report['status'] in ('created', 'created-with-hook-warning')
            if report['status'] == 'needs-inspection':
                report['writes'] = 'unknown; inspect native worktree registration'
        elif args.command == 'start' and not args.resume:
            report.update(status='retired', next='Use --path <explicit-new-worktree> --base <local-ref> with the branch, or native git worktree add. Nothing created; no implicit fetch.')
        print(json.dumps(report, ensure_ascii=False))
        return 1 if report['status'] == 'needs-inspection' else 0
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(json.dumps({'status': 'unavailable', 'advisoryOnly': True, 'authorityGranted': False,
                          'sourceChecks': 'not-evaluated', 'reason': str(error)}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
