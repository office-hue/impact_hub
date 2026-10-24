#!/usr/bin/env python3
"""Optional native source checks and reversible hook migration, using stdlib.

install prepares JSON without writes by default. Review it, then explicitly use
--apply --repo PATH --expect beforeDigest. Unknown custom hooks are preserved;
--replace HOOK=SHA256 identifies an exact reviewed file. No global config edits.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile

HOOKS = ('pre-commit', 'commit-msg', 'pre-push', 'post-commit', 'post-merge', 'post-checkout')
# Exact Hub hook renderer output at base 571cdcd3; unknown/custom hooks stay intact.
LEGACY = {
    'pre-commit': '103ce458573981fae211be70a64b8fdc078d163943f80606e49b283d24b816cb',
    'pre-push': 'bc60829a2892ddf6260043e795db31bb5bb13223605f560ae2e1dfa9208894cc',
    'commit-msg': '3038fd038639b9c1862fe8836ce4290860854a785a2e0c43b00b5e185c1ee2c0',
    'post-commit': '40afa6639fa81f5dc18b3d7eff32f0ae57dc33abfac6fb3c4aa4ae2d217af327',
    'post-merge': '7efed9d702f1756b436cef195d2c933df81712e5737b9bf8ef2c8eb5506aaab9',
    'post-checkout': 'e522eb6ab4d652db4f9a22c3e69434db4c27026aae3971d7ae06985308aad076',
}
OLD_TEMPLATE = '# type(scope): rövid összefoglaló\n#\n# Why:\n#\n# Memory-ID: none\n#\n# Rollback:\n#\n'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def git_environment():
    # --repo/-C is the explicit audit target, not caller Git indirection. Keep
    # GIT_INDEX_FILE: native partial commits intentionally audit that index.
    return {key: value for key, value in os.environ.items()
            if key not in ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR')}


def git(repo, *args, input=None, check=True):
    result = subprocess.run(['git', '-C', str(repo), *args], input=input, capture_output=True, env=git_environment())
    if check and result.returncode:
        raise ValueError('git operation unavailable: ' + ' '.join(args[:2]))
    return result


def repository(path):
    return Path(os.fsdecode(git(path, 'rev-parse', '--show-toplevel').stdout).strip()).resolve()


def file_state(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('unsafe non-regular or hardlinked file: ' + str(path))
    return {'data': base64.b64encode(path.read_bytes()).decode(), 'mode': stat.S_IMODE(info.st_mode)}


def desired_hook(name):
    if name not in ('pre-commit', 'pre-push'):
        return None
    command = 'audit --strict --optional-hook --mode staged' if name == 'pre-commit' else 'audit --strict --optional-hook --mode push --stdin --remote-name "${1-}" --remote-url "${2-}"'
    native = ('''  if ! git diff --cached --check; then
    echo '[source-check] advisory: native whitespace check found issues; review with git diff --cached --check.' >&2
  fi
''' if name == 'pre-commit' else '')
    direct = ('git diff --cached --check; bash scripts/safe-repo-audit.sh --strict --mode staged'
              if name == 'pre-commit' else
              'git diff --check <base> <head>; bash scripts/safe-repo-audit.sh --strict --mode push --base <verified-remote-sha> --head <local-sha>')
    text = '''#!/bin/sh
# ai-agent optional source hook v1; resolves only in the current worktree.
set -eu
repo=$(git rev-parse --show-toplevel)
cd "$repo"
helper="$repo/scripts/workspace-hooks.py"
if [ -L "$repo/scripts" ] || [ -L "$helper" ]; then
  echo '[source-check] integrity finding: linked checker/source directory; external code not executed.' >&2
  exit 1
fi
if [ ! -f "$helper" ] && [ -n "${HOME:-}" ]; then
  helper="$HOME/.local/share/office-workspace/current/scripts/workspace-hooks.py"
  if [ -L "$HOME/.local/share/office-workspace/current/scripts" ] || [ -L "$helper" ]; then
    echo '[source-check] integrity finding: linked installed checker/source directory; external code not executed.' >&2
    exit 1
  fi
fi
if ! command -v python3 >/dev/null 2>&1 || [ ! -f "$helper" ]; then
''' + native + '''
  echo '[source-check] advisory: optional checker/Python unavailable; no audit evidence produced. Native Git continues.' >&2
  echo '[source-check] Direct path: ''' + direct + '''' >&2
  exit 0
fi
set +e
python3 -B "$helper" ''' + command + ''' --repo "$repo"
result=$?
set -e
if [ "$result" -eq 2 ]; then
  echo '[source-check] advisory: optional audit unavailable; no successful audit evidence. Native Git continues.' >&2
  exit 0
fi
exit "$result"
'''
    return {'data': base64.b64encode(text.encode()).decode(), 'mode': 0o755}


def owned(name, value):
    if value is None or value == desired_hook(name):
        return True
    body = base64.b64decode(value['data'])
    return hashlib.sha256(body).hexdigest() == LEGACY[name]


def local_template(repo):
    result = git(repo, 'config', '--local', '--get-all', 'commit.template', check=False)
    if result.returncode not in (0, 1):
        raise ValueError('local commit.template unavailable')
    values = os.fsdecode(result.stdout).splitlines()
    if len(values) > 1:
        raise ValueError('multiple local commit.template values require review')
    return values[0] if values else None


def snapshot(repo, hook_dir):
    config = git(repo, 'config', '--get-all', 'core.hooksPath', check=False)
    if config.returncode not in (0, 1):
        raise ValueError('hooksPath configuration unavailable')
    identity = {'repo': str(repo), 'gitDirectory': str(git_directory(repo)),
                'hookDirectory': str(hook_dir), 'hooksPath': os.fsdecode(config.stdout).splitlines()}
    return {'identity': identity, 'hooks': {name: file_state(hook_dir / name) for name in HOOKS},
            'commitTemplate': local_template(repo)}


def hook_directory(repo):
    raw = os.fsdecode(git(repo, 'rev-parse', '--git-path', 'hooks').stdout).strip()
    path = Path(raw) if Path(raw).is_absolute() else repo / raw
    if path.is_symlink():
        raise ValueError('symlink hook directory requires manual review')
    # macOS /var and /tmp are system symlinks. Canonicalize ancestors; apply's
    # containment check still rejects a hooksPath routed outside this repo.
    return path.parent.resolve() / path.name


def git_directory(repo):
    raw = os.fsdecode(git(repo, 'rev-parse', '--absolute-git-dir').stdout).strip()
    directory = Path(raw).resolve(strict=True)
    info = directory.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o022:
        raise ValueError('Git metadata directory must be owned and not group/world writable')
    return directory


def private_directory(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('unsafe private Git backup directory: ' + str(path))


def backup_directory(repo):
    # A custom core.hooksPath may be tracked source. Never place private hook
    # bytes/base64 backups in that worktree, where git add -A could publish them.
    path = git_directory(repo) / 'workspace-hook-backups'
    private_directory(path)
    return path


def public_report(report):
    # Full hook bytes may include inline credentials. They belong only in the
    # private manifest, never stdout/tool logs, even when base64 encoded.
    return {key: value for key, value in report.items() if key not in ('before', 'after')}


def write_file(path, value):
    if value is None:
        if path.exists():
            path.unlink()
        return
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(base64.b64decode(value['data'], validate=True))
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), value['mode'])
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def set_template(repo, value):
    if value is None:
        result = git(repo, 'config', '--local', '--unset-all', 'commit.template', check=False)
        if result.returncode not in (0, 5):
            raise ValueError('cannot remove retired local commit template')
    else:
        git(repo, 'config', '--local', 'commit.template', value)


def install(args):
    if (args.apply or args.rollback) and args.repo is None:
        raise ValueError('apply/rollback requires explicit --repo')
    repo = repository(args.repo or '.')
    hook_dir = hook_directory(repo)
    before = snapshot(repo, hook_dir)
    if args.rollback:
        if repo not in hook_dir.parents:
            raise ValueError('shared/external hook directory requires its owner migration; no write performed')
        backup = Path(args.rollback)
        expected_root = backup_directory(repo)
        private_directory(backup)
        if backup.is_symlink() or backup.resolve().parent != expected_root.resolve():
            raise ValueError('rollback must name this target hook directory backup')
        manifest = backup / 'manifest.json'
        manifest_state = file_state(manifest)
        if manifest_state is None:
            raise ValueError('rollback manifest unavailable')
        manifest_info = manifest.lstat()
        if manifest_info.st_uid != os.getuid() or manifest_info.st_mode & 0o077:
            raise ValueError('rollback manifest must be private and owned')
        receipt = json.loads(manifest.read_text())
        if receipt.get('repo') != str(repo) or receipt.get('hookDirectory') != str(hook_dir):
            raise ValueError('rollback target mismatch')
        original, installed, changes = receipt['before'], receipt['after'], receipt['changedHooks']
        if digest(original) != receipt['beforeDigest'] or digest(installed) != receipt['afterDigest']:
            raise ValueError('rollback manifest digest mismatch')
        if (not isinstance(changes, list) or len(changes) != len(set(changes))
                or any(name not in HOOKS for name in changes)
                or set(changes) != {name for name in HOOKS if original['hooks'][name] != installed['hooks'][name]}):
            raise ValueError('invalid rollback hook set')
        if before['identity'] != installed['identity'] or original['identity'] != installed['identity']:
            raise ValueError('rollback identity/configuration drift; preserved')
        # Resume accepts only our own exact before/after state, and only on the
        # fields this installation changed. Foreign third states stop all work.
        for name in HOOKS:
            allowed = [original['hooks'][name], installed['hooks'][name]] if name in changes else [installed['hooks'][name]]
            if before['hooks'][name] not in allowed:
                raise ValueError('rollback CAS mismatch: ' + name + '; preserved')
        template_changed = original['commitTemplate'] != installed['commitTemplate']
        allowed_templates = [original['commitTemplate'], installed['commitTemplate']] if template_changed else [installed['commitTemplate']]
        if before['commitTemplate'] not in allowed_templates:
            raise ValueError('rollback template CAS mismatch; preserved')
        for name in changes:
            value = original['hooks'][name]
            if value is not None:
                base64.b64decode(value['data'], validate=True)
                if not isinstance(value['mode'], int) or not 0 <= value['mode'] <= 0o777:
                    raise ValueError('invalid rollback mode')
        for name in changes:
            current = file_state(hook_dir / name)
            if current == original['hooks'][name]:
                continue
            if current != installed['hooks'][name]:
                raise ValueError('rollback CAS mismatch: ' + name)
            write_file(hook_dir / name, original['hooks'][name])
        if template_changed and local_template(repo) != original['commitTemplate']:
            if local_template(repo) != installed['commitTemplate']:
                raise ValueError('rollback template CAS mismatch')
            set_template(repo, original['commitTemplate'])
        if snapshot(repo, hook_dir) != original:
            raise ValueError('rollback readback mismatch')
        print(json.dumps({'kind': 'hook-install', 'status': 'rolled-back', 'repo': str(repo), 'backup': str(backup)}))
        return 0
    replacements = {}
    for specification in args.replace:
        name, separator, sha = specification.partition('=')
        if not separator or name not in HOOKS or not re.fullmatch('[0-9a-f]{64}', sha):
            raise ValueError('--replace requires HOOK=exact-sha256')
        replacements[name] = sha
    after = json.loads(json.dumps(before))
    preserved = []
    for name, value in before['hooks'].items():
        approved = value is not None and hashlib.sha256(base64.b64decode(value['data'])).hexdigest() == replacements.get(name)
        if owned(name, value) or approved:
            after['hooks'][name] = desired_hook(name)
        else:
            preserved.append(name)
    template = before['commitTemplate']
    if template:
        source = Path(template)
        if not source.is_absolute():
            source = repo / source
        try:
            if not source.is_symlink() and source.name == '.gitmessage' and source.read_text() == OLD_TEMPLATE:
                after['commitTemplate'] = None
        except (OSError, UnicodeError):
            pass
    changes = [name for name in HOOKS if before['hooks'][name] != after['hooks'][name]]
    report = {'schemaVersion': 1, 'kind': 'hook-install', 'status': 'prepared', 'repo': str(repo),
              'hookDirectory': str(hook_dir), 'beforeDigest': digest(before), 'afterDigest': digest(after),
              'before': before, 'after': after, 'changedHooks': changes, 'preservedCustomHooks': preserved,
              'renderedHooks': {name: base64.b64decode(desired_hook(name)['data']).decode() for name in ('pre-commit', 'pre-push')},
              'inspection': {name: {'sha256': hashlib.sha256(base64.b64decode(value['data'])).hexdigest(), 'mode': value['mode'],
                                    'managed': owned(name, value)} for name, value in before['hooks'].items() if value is not None},
              'nativeGit': 'available without installing these optional hooks'}
    if args.check:
        report['status'] = 'current' if before == after and not preserved else 'changes-or-custom-review'
        print(json.dumps(public_report(report)))
        return 0 if before == after and not preserved else 1
    if not args.apply:
        print(json.dumps(public_report(report)))
        return 0
    if args.expect != report['beforeDigest']:
        raise ValueError('--apply requires --expect from a reviewed preparation')
    if repo not in hook_dir.parents:
        raise ValueError('shared/external hook directory requires its owner migration; no write performed')
    if before == after:
        report['status'] = 'unchanged'
        print(json.dumps(public_report(report)))
        return 0
    hook_dir.mkdir(parents=True, exist_ok=True)
    backup_root = backup_directory(repo)
    backup_root.mkdir(mode=0o700, exist_ok=True)
    private_directory(backup_root)
    backup = Path(tempfile.mkdtemp(prefix='migration-', dir=backup_root))
    report['backup'] = str(backup)
    write_file(backup / 'manifest.json', {'data': base64.b64encode((json.dumps(report, sort_keys=True) + '\n').encode()).decode(), 'mode': 0o600})
    if snapshot(repo, hook_dir) != before:
        raise ValueError('apply CAS mismatch: target changed after preparation; preserved')
    written = []
    template_written = False
    try:
        for name in changes:
            if file_state(hook_dir / name) != before['hooks'][name]:
                raise ValueError('apply CAS mismatch: ' + name)
            write_file(hook_dir / name, after['hooks'][name])
            written.append(name)
        if template != after['commitTemplate']:
            if local_template(repo) != template:
                raise ValueError('apply template CAS mismatch')
            set_template(repo, after['commitTemplate'])
            template_written = True
        if snapshot(repo, hook_dir) != after:
            raise ValueError('installation readback mismatch')
    except (OSError, ValueError) as error:
        # Restore only files we wrote that still equal our own poststate.
        # A concurrent/custom edit is always left for the owner to review.
        for name in reversed(written):
            if file_state(hook_dir / name) == after['hooks'][name]:
                write_file(hook_dir / name, before['hooks'][name])
        if template_written and local_template(repo) == after['commitTemplate']:
            set_template(repo, template)
        raise ValueError(str(error) + '; unchanged own writes restored; backup: ' + str(backup)) from error
    report['status'] = 'installed'
    print(json.dumps(public_report(report)))
    return 0


# Actual content findings only. Values are never printed.
TOKEN = re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----|(?<![A-Za-z0-9_])(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,})')
# Literal assignments/object properties, not quoted code constructing fixtures.
# Known credential prefixes are scanned anywhere with lexical boundaries above.
ASSIGNMENT = re.compile(r'''(?ix)(?:^|[,{]|\s--)\s*(?:(?:const|let|var|export)\s+)?(?P<quote>["']?)(?:[a-z0-9]+[_-])*(?:api[_-]?key|secret|token|password|passwd|client_secret|private_key|access_key)(?P=quote)\s*[:=]\s*["'](?P<value>[^"'\r\n]{12,})["']''')
ENV_KEY = re.compile(r'(?i)(?:^|_)(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CLIENT_SECRET|ACCESS_KEY|API_KEY|AUTH|CREDENTIAL|KEY)(?:_|$)')


def placeholder(value):
    value = value.strip().strip('"\'')
    return not value or bool(re.fullmatch(r'(?i)(?:example|sample|dummy|changeme|change_me|todo|test|none|null|your_[a-z0-9_]+|replace[_-].*|<[^>]*>|\$\{[^}]+\}|\[REDACTED(?:_[A-Z0-9_]+)?\])', value))


def secret_findings(path, data):
    result = []
    env = bool(re.search(r'(^|/)(?:\.env(?:$|\.)|\.deploy\..*\.env$)', path))
    for number, line in enumerate(data.decode('utf-8', errors='replace').splitlines(), 1):
        assigned = any(not placeholder(match['value']) for match in ASSIGNMENT.finditer(line))
        if TOKEN.search(line) or assigned:
            result.append({'kind': 'secret-like-content', 'path': path, 'line': number})
        elif env:
            assignment = re.match(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)', line)
            if assignment and ENV_KEY.search(assignment[1]) and not placeholder(assignment[2]):
                result.append({'kind': 'sensitive-env-value', 'path': path, 'line': number, 'key': assignment[1]})
    return result


def paths(repo, *args):
    return [os.fsdecode(item) for item in git(repo, *args).stdout.split(b'\0') if item]


def commit(repo, ref):
    if not ref or ref.startswith('-') or '\n' in ref or '\x00' in ref:
        raise ValueError('invalid commit ref')
    return git(repo, 'rev-parse', '--verify', ref + '^{commit}').stdout.decode().strip()


def push_pairs(repo, args):
    if args.stdin:
        pairs = []
        for line in sys.stdin:
            if not line.strip():
                continue
            fields = line.split()
            if len(fields) != 4 or not all(re.fullmatch(r'(?:[0-9a-f]{40}|[0-9a-f]{64})', fields[i]) for i in (1, 3)):
                raise ValueError('malformed pre-push ref input')
            local_ref, head, remote_ref, base = fields
            # Native Git may supply HEAD, an object ID or a revision expression
            # as local_ref. Only the separately validated object ID is used.
            if not remote_ref.startswith('refs/') or any(ord(character) < 32 for character in local_ref):
                raise ValueError('malformed pre-push ref name')
            if set(head) == {'0'}:
                continue
            pairs.append((None if set(base) == {'0'} else commit(repo, base), commit(repo, head)))
        return pairs
    head_ref = args.head or os.environ.get('SAFE_REPO_AUDIT_HEAD_SHA') or 'HEAD'
    base_ref = args.base or os.environ.get('SAFE_REPO_AUDIT_PUSH_BASE')
    if args.range:
        if args.head or args.base or args.range.count('..') != 1 or '...' in args.range:
            raise ValueError('--range requires BASE..HEAD, without --base/--head')
        base_ref, head_ref = args.range.split('..')
        if not base_ref or not head_ref:
            raise ValueError('--range requires both endpoints')
    head = commit(repo, head_ref)
    if base_ref and re.fullmatch(r'0{40}|0{64}', base_ref):
        base_ref = None
    elif base_ref:
        return [(commit(repo, base_ref), head)]
    # A local upstream cache is not proof of this push target's remote state.
    # New refs require explicit all-history or a same-target remote snapshot.
    return [(None, head)]


def remote_boundary(repo, remote_url):
    """One read-only advertisement, no fetch/ref mutation or stale cache trust.

    Missing advertised objects make the boundary incomplete, never an exact
    audit PASS. A verified empty remote really does have all history outgoing.
    """
    if not remote_url:
        return {'status': 'unavailable', 'reason': 'new ref requires --remote-url proof or explicit --all-history'}
    if '\n' in remote_url or '\x00' in remote_url:
        raise ValueError('invalid remote URL')
    try:
        result = subprocess.run(['git', '-C', str(repo), 'ls-remote', '--', remote_url],
                                capture_output=True, timeout=15,
                                env=dict(git_environment(), GIT_TERMINAL_PROMPT='0'))
    except subprocess.TimeoutExpired:
        return {'status': 'unavailable', 'reason': 'remote advertisement timed out; no outgoing-boundary evidence'}
    if result.returncode:
        return {'status': 'unavailable', 'reason': 'remote advertisement unavailable; no outgoing-boundary evidence'}
    exclusions, count = set(), 0
    for line in result.stdout.splitlines():
        fields = line.split(b'\t')
        if len(fields) != 2 or not re.fullmatch(rb'(?:[0-9a-f]{40}|[0-9a-f]{64})', fields[0]):
            return {'status': 'unavailable', 'reason': 'malformed remote advertisement'}
        oid, ref = fields[0].decode(), os.fsdecode(fields[1])
        if ref != 'HEAD' and not ref.startswith('refs/'):
            return {'status': 'unavailable', 'reason': 'malformed advertised ref'}
        count += 1
        kind = git(repo, 'cat-file', '-t', oid, check=False)
        if kind.returncode:
            return {'status': 'unavailable', 'reason': 'advertised remote object absent locally; boundary incomplete'}
        peeled_kind = git(repo, 'cat-file', '-t', oid + '^{}', check=False)
        if peeled_kind.returncode:
            return {'status': 'unavailable', 'reason': 'advertised tag target absent locally; boundary incomplete'}
        if peeled_kind.stdout.strip() == b'commit':
            exclusions.add(commit(repo, oid))
        elif peeled_kind.stdout.strip() not in (b'blob', b'tree'):
            return {'status': 'unavailable', 'reason': 'advertised object type unavailable'}
    return {'status': 'verified', 'exclusions': sorted(exclusions), 'advertisedRefs': count,
            'snapshotDigest': hashlib.sha256(result.stdout).hexdigest()}


# Hub's predecessor has no product checker subprocesses: source/secret checks
# remain here; affected coupon Jest stays in native CI, harvest/deploy separate.
PRODUCT_GUARDS = []


def audit(args):
    repo = repository(args.repo)
    if args.mode == 'range':
        if not args.base or not args.head:
            raise ValueError('--mode range requires --base and --head')
        args.mode = 'push'
    if args.mode != 'push' and (args.stdin or args.head or args.base or args.range or args.all_history or args.remote_url or args.remote_name):
        raise ValueError('push refs/range require --mode push')
    if args.stdin and (args.head or args.base or args.range):
        raise ValueError('--stdin cannot combine with push endpoints')
    if args.all_history and (args.range or (args.base and not re.fullmatch(r'0{40}|0{64}', args.base))):
        raise ValueError('--all-history cannot combine with a nonzero base/range')
    changed, samples, checks, findings, advisories, scope = set(), {}, [], [], [], []
    if args.mode == 'push':
        pairs = push_pairs(repo, args)
        boundary = None
        if any(base is None for base, _ in pairs):
            boundary = {'status': 'verified', 'exclusions': [], 'source': 'explicit-all-history'} if args.all_history else remote_boundary(repo, args.remote_url)
            checks.append({'name': 'remote-outgoing-boundary', **{key: value for key, value in boundary.items() if key != 'exclusions'}})
        active_head = git(repo, 'rev-parse', '--verify', 'HEAD', check=False).stdout.decode().strip()
        for base, head in pairs:
            exclusions = [base] if base else (boundary.get('exclusions', []) if boundary else [])
            scope.append({'base': base, 'head': head, 'history': 'outgoing-reachable-commits', 'excludedRemoteTips': exclusions})
            if base is None and boundary['status'] != 'verified':
                scope[-1]['status'] = 'unavailable'
                continue
            revisions = [head] + ['^' + excluded for excluded in exclusions]
            for revision in git(repo, 'rev-list', *revisions).stdout.decode().splitlines():
                names = paths(repo, 'diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', revision)
                changed.update(names)
                for name in names:
                    blob = git(repo, 'rev-parse', '--verify', revision + ':' + name, check=False)
                    if blob.returncode:
                        continue
                    oid = blob.stdout.decode().strip()
                    if (name, oid) not in samples:
                        item = git(repo, 'cat-file', 'blob', oid, check=False)
                        if item.returncode == 0:
                            samples[(name, oid)] = item.stdout
            empty = git(repo, 'hash-object', '-t', 'tree', '--stdin', input=b'').stdout.decode().strip()
            result = git(repo, 'diff', '--check', base or empty, head, check=False)
            checks.append({'name': 'git-diff-check', 'status': 'passed' if result.returncode == 0 else ('advisory' if args.optional_hook else 'failed'), 'head': head})
            if result.returncode:
                if args.optional_hook:
                    advisories.append('Native whitespace check found issues at ' + head + '; review git diff --check for this exact range.')
                else:
                    findings.append({'kind': 'git-diff-check', 'head': head})
        current_snapshot = all(head == active_head for _, head in pairs) and not git(repo, 'status', '--porcelain').stdout
    else:
        scope = [args.mode]
        if git(repo, 'ls-files', '--unmerged', '-z').stdout:
            checks.append({'name': 'index-content', 'status': 'unavailable', 'reason': 'unmerged index; resolve conflicts before exact source checking'})
        for cached in ([True] if args.mode == 'staged' else [True, False]):
            flags = ['--cached'] if cached else []
            names = paths(repo, 'diff', *flags, '--name-only', '--no-renames', '-z')
            changed.update(names)
            result = git(repo, 'diff', *flags, '--check', check=False)
            checks.append({'name': 'git-diff-check' + ('-staged' if cached else '-working'), 'status': 'passed' if result.returncode == 0 else ('advisory' if args.optional_hook else 'failed')})
            if result.returncode:
                if args.optional_hook:
                    advisories.append('Native whitespace check found issues; review git diff --cached --check or git diff --check.')
                else:
                    findings.append({'kind': 'git-diff-check'})
            for name in names:
                if cached:
                    item = git(repo, 'show', ':' + name, check=False)
                    if item.returncode == 0:
                        samples[(name, 'index')] = item.stdout
                else:
                    target = repo / name
                    if not target.resolve().is_relative_to(repo):
                        checks.append({'name': 'working-content', 'status': 'unavailable', 'path': name, 'reason': 'outside-worktree path not read'})
                        continue
                    if target.is_file() and not target.is_symlink():
                        samples[(name, 'working')] = target.read_bytes()
        if args.mode == 'local':
            for name in paths(repo, 'ls-files', '--others', '--exclude-standard', '-z'):
                changed.add(name)
                target = repo / name
                if not target.resolve().is_relative_to(repo):
                    checks.append({'name': 'untracked-content', 'status': 'unavailable', 'path': name, 'reason': 'outside-worktree path not read'})
                    continue
                if target.is_file() and not target.is_symlink():
                    samples[(name, 'untracked')] = target.read_bytes()
        current_snapshot = args.mode == 'local' or not git(repo, 'diff', '--name-only').stdout
    for (name, version), data in samples.items():
        for finding in secret_findings(name, data):
            finding['snapshot'] = version
            findings.append(finding)
    secret_failed = any(item['kind'] in ('secret-like-content', 'sensitive-env-value') for item in findings)
    incomplete = any(item['status'] == 'unavailable' for item in checks)
    checks.append({'name': 'secret-content-scan', 'status': 'failed' if secret_failed else ('unavailable' if incomplete else 'passed'), 'snapshots': len(samples)})
    if any(re.match(r'^(apps|src|scripts|services|config|packages|lib)/', name) for name in changed) and not any(name.startswith('docs/') for name in changed):
        advisories.append('Consider updating affected documentation; no task registry or plan ID is required.')
    if any(re.search(r'(^|/)(?:\.env(?:$|\.)|[^/]+\.(?:key|pem|p12|pfx)$)', name) for name in changed):
        advisories.append('Sensitive-looking path changed; content scanned without printing values.')
    failures = findings or any(item['status'] == 'failed' for item in checks)
    unavailable = any(item['status'] == 'unavailable' for item in checks)
    status = 'findings' if failures else ('unavailable' if unavailable else ('advisory' if advisories else 'checked'))
    print(json.dumps({'schemaVersion': 1, 'kind': 'source-audit', 'status': status, 'repo': str(repo), 'mode': args.mode, 'scope': scope,
                      'changedPaths': sorted(changed), 'checks': checks, 'findings': findings, 'advisories': advisories}))
    return (1 if failures else (2 if unavailable else 0)) if args.strict else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    installer = sub.add_parser('install', help='prepare optional hook migration; explicit apply/rollback only')
    installer.add_argument('--repo')
    action = installer.add_mutually_exclusive_group()
    action.add_argument('--prepare', action='store_true')
    action.add_argument('--apply', action='store_true')
    action.add_argument('--check', action='store_true')
    action.add_argument('--rollback')
    installer.add_argument('--expect', help='beforeDigest from reviewed preparation')
    installer.add_argument('--replace', action='append', default=[], help='reviewed custom hook HOOK=SHA256')
    scanner = sub.add_parser('audit', help='read-only native source/secret audit')
    scanner.add_argument('--repo', default='.')
    scanner.add_argument('--strict', action='store_true')
    scanner.add_argument('--optional-hook', action='store_true', help='native-hook whitespace advice; actual security findings still fail')
    scanner.add_argument('--mode', choices=('local', 'staged', 'push', 'range'), default='local')
    scanner.add_argument('--head')
    scanner.add_argument('--base')
    scanner.add_argument('--range')
    scanner.add_argument('--stdin', action='store_true', help='read all native pre-push ref updates')
    scanner.add_argument('--remote-name', help='native pre-push remote label (not an audit boundary)')
    scanner.add_argument('--remote-url', help='native pre-push actual target URL; read-only advertisement for new refs')
    scanner.add_argument('--all-history', action='store_true', help='explicit offline audit of all reachable history for zero/no base')
    args = parser.parse_args(argv)
    try:
        return install(args) if args.command == 'install' else audit(args)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({'kind': 'source-check', 'status': 'unavailable', 'reason': str(error)}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
