#!/usr/bin/env python3
"""Isolated repos only: no installed/global hooks or shared DEV state touched."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'scripts/workspace-hooks.py'
spec = importlib.util.spec_from_file_location('workspace_hooks', HELPER)
hooks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hooks)


class Retirement(unittest.TestCase):
    def test_credential_names_and_fixture_expressions_are_not_secrets(self):
        self.assertEqual(hooks.secret_findings('doc.md', b'dev-risk-scoped-registration-long-name\nlegal-ask-faithfulness-validator-suite\n'), [])
        self.assertTrue(hooks.secret_findings('code.py', ('value = "' + 'sk-proj-' + 'A' * 32 + '"').encode()))
        self.assertEqual(hooks.secret_findings('test.py', b"self.write('.env.example', 'API_KEY=' + self.token() + '\\n')"), [])

    def test_actual_literal_and_later_secret_cannot_hide_behind_placeholder(self):
        opaque = b'opaque-' + b'long-value-123456'
        self.assertTrue(hooks.secret_findings('config.json', b'{"api_key": "' + opaque + b'"}'))
        self.assertTrue(hooks.secret_findings('config.js', b'const OPENAI_API_KEY = "' + opaque + b'";'))
        self.assertEqual(hooks.secret_findings('test.js', b"{ token: '[REDACTED_TOKEN]', keep: 42 }"), [])
        self.assertTrue(hooks.secret_findings('config.json', b'{"token": "[REDACTED_TOKEN]", "secret": "' + opaque + b'"}'))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='workspace-hooks-test-')
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / 'repo'
        self.repo.mkdir()
        self.env = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull,
                        GIT_AUTHOR_NAME='Fixture', GIT_AUTHOR_EMAIL='fixture@example.invalid',
                        GIT_COMMITTER_NAME='Fixture', GIT_COMMITTER_EMAIL='fixture@example.invalid')
        for key in list(self.env):
            if key.startswith(('GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_', 'SAFE_REPO_AUDIT_')) or key in ('GIT_CONFIG_COUNT', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'):
                self.env.pop(key)
        self.run_cmd('git', 'init', '-q')
        self.write('readme.md', 'fixture\n')
        self.commit()

    def run_cmd(self, *args, input=None, ok=True, env=None):
        result = subprocess.run(args, cwd=self.repo, env=env or self.env, text=True, input=input, capture_output=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return result

    def write(self, relative, text):
        path = self.repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def commit(self, message='fixture'):
        self.run_cmd('git', 'add', '-A')
        self.run_cmd('git', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', message)
        return self.run_cmd('git', 'rev-parse', 'HEAD').stdout.strip()

    def invoke(self, command, *args, input=None, ok=True, env=None):
        return self.run_cmd(sys.executable, '-B', str(HELPER), command, '--repo', str(self.repo), *args, input=input, ok=ok, env=env)

    def prepare(self):
        return json.loads(self.invoke('install').stdout)

    def hook_state(self):
        with mock.patch.dict(os.environ, self.env, clear=True):
            return hooks.snapshot(self.repo.resolve(), hooks.hook_directory(self.repo.resolve()))

    def apply(self, prepared=None, *extra):
        prepared = prepared or self.prepare()
        return json.loads(self.invoke('install', '--apply', '--expect', prepared['beforeDigest'], *extra).stdout)

    def scan(self, *args, input=None, ok=True, env=None):
        result = self.invoke('audit', '--strict', *args, input=input, ok=ok, env=env)
        return result, json.loads(result.stdout) if result.stdout else None

    def token(self):
        return 'ghp_' + 'A' * 36

    def test_prepare_is_read_only_and_default_wrapper_does_not_install(self):
        before = self.run_cmd('git', 'status', '--porcelain').stdout
        first = self.prepare()
        second = self.prepare()
        self.assertEqual(first, second)
        self.assertEqual(first['status'], 'prepared')
        self.assertNotIn('before', first)
        self.assertNotIn('after', first)
        self.assertFalse((self.repo / '.git/hooks/pre-commit').exists())
        self.assertFalse((self.repo / '.git/hooks/.workspace-hook-backups').exists())
        self.assertFalse((self.repo / '.git/workspace-hook-backups').exists())
        self.assertEqual(before, self.run_cmd('git', 'status', '--porcelain').stdout)
        self.run_cmd('bash', str(ROOT / 'scripts/install-hooks-all.sh'), '--repo', str(self.repo))
        self.assertFalse((self.repo / '.git/hooks/pre-commit').exists())

    def test_apply_needs_explicit_expected_state_and_roundtrip_restores_bytes_modes(self):
        self.assertNotEqual(self.invoke('install', '--apply', ok=False).returncode, 0)
        before = self.prepare()
        original_state = self.hook_state()
        installed = self.apply(before)
        self.assertEqual(installed['status'], 'installed')
        for name in hooks.HOOKS:
            target = self.repo / '.git/hooks' / name
            self.assertEqual(target.exists(), name in ('pre-commit', 'pre-push'))
            if target.exists():
                self.assertEqual(target.stat().st_mode & 0o777, 0o755)
                self.assertNotIn('lifecycle', target.read_text())
        self.invoke('install', '--rollback', installed['backup'])
        self.assertEqual(self.hook_state(), original_state)

    def test_apply_and_rollback_refuse_concurrent_custom_change(self):
        before = self.prepare()
        custom = self.write('.git/hooks/pre-commit', '#!/bin/sh\necho custom\n')
        self.assertNotEqual(self.invoke('install', '--apply', '--expect', before['beforeDigest'], ok=False).returncode, 0)
        self.assertIn('custom', custom.read_text())
        custom.unlink()
        installed = self.apply()
        custom.write_text('#!/bin/sh\necho changed later\n')
        self.assertNotEqual(self.invoke('install', '--rollback', installed['backup'], ok=False).returncode, 0)
        self.assertIn('changed later', custom.read_text())

    def test_unknown_custom_hooks_preserved_until_exact_review(self):
        custom = self.write('.git/hooks/post-checkout', '#!/bin/sh\necho keep-custom\n')
        custom.chmod(0o751)
        prepared = self.prepare()
        self.assertEqual(prepared['preservedCustomHooks'], ['post-checkout'])
        preserved_install = self.apply(prepared)
        self.assertIn('keep-custom', custom.read_text())
        self.invoke('install', '--rollback', preserved_install['backup'])
        sha = hashlib.sha256(custom.read_bytes()).hexdigest()
        installed = self.apply(prepared, '--replace', 'post-checkout=' + sha)
        self.assertFalse(custom.exists())
        self.invoke('install', '--rollback', installed['backup'])
        self.assertEqual(custom.stat().st_mode & 0o777, 0o751)
        self.assertIn('keep-custom', custom.read_text())

    def test_symlink_and_external_hook_directory_not_mutated(self):
        external = Path(self.temp.name) / 'external'
        external.mkdir()
        self.run_cmd('git', 'config', 'core.hooksPath', str(external))
        prepared = self.prepare()
        self.assertNotEqual(self.invoke('install', '--apply', '--expect', prepared['beforeDigest'], ok=False).returncode, 0)
        self.assertEqual(list(external.iterdir()), [])
        self.run_cmd('git', 'config', '--unset', 'core.hooksPath')
        target = self.repo / '.git/hooks/pre-commit'
        target.symlink_to(self.repo / 'readme.md')
        self.assertNotEqual(self.invoke('install', ok=False).returncode, 0)
        self.assertTrue(target.is_symlink())

    def test_old_sibling_template_unset_without_writing_sibling_and_restored(self):
        sibling = Path(self.temp.name) / 'sibling'
        sibling.mkdir()
        template = sibling / '.gitmessage'
        template.write_text(hooks.OLD_TEMPLATE)
        self.run_cmd('git', 'config', 'commit.template', str(template))
        installed = self.apply()
        self.assertNotEqual(self.run_cmd('git', 'config', '--get', 'commit.template', ok=False).returncode, 0)
        self.assertEqual(template.read_text(), hooks.OLD_TEMPLATE)
        self.invoke('install', '--rollback', installed['backup'])
        self.assertEqual(self.run_cmd('git', 'config', '--get', 'commit.template').stdout.strip(), str(template))

    def test_custom_template_unchanged_and_no_template_created(self):
        self.write('my-template.txt', 'My useful custom format\n')
        self.run_cmd('git', 'config', 'commit.template', 'my-template.txt')
        self.apply()
        self.assertEqual(self.run_cmd('git', 'config', '--get', 'commit.template').stdout.strip(), 'my-template.txt')
        self.assertFalse((self.repo / '.gitmessage').exists())


    def test_index_secret_detected_even_when_worktree_scrubbed(self):
        self.write('src/settings.txt', self.token() + '\n')
        self.run_cmd('git', 'add', 'src/settings.txt')
        self.write('src/settings.txt', 'scrubbed\n')
        result, report = self.scan('--mode', 'staged', ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['findings'][0]['snapshot'], 'index')
        self.assertNotIn(self.token(), result.stdout + result.stderr)

    def test_explicit_repo_cannot_be_redirected_to_clean_foreign_git_environment(self):
        self.write('secret.txt', self.token() + '\n')
        self.run_cmd('git', 'add', 'secret.txt')
        alternate = Path(self.temp.name) / 'alternate-repo'
        alternate.mkdir()
        self.run_cmd('git', '-C', str(alternate), 'init', '-q')
        environment = dict(self.env, GIT_DIR=str(alternate / '.git'), GIT_WORK_TREE=str(alternate),
                           GIT_COMMON_DIR=str(alternate / '.git'))
        result, report = self.scan('--mode', 'staged', env=environment, ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['repo'], str(self.repo.resolve()))
        self.assertTrue(any(item['path'] == 'secret.txt' for item in report['findings']))
        self.assertNotIn(self.token(), result.stdout + result.stderr)

    def test_native_alternate_index_remains_the_audited_commit_source(self):
        alternate_index = Path(self.temp.name) / 'partial-commit-index'
        environment = dict(self.env, GIT_INDEX_FILE=str(alternate_index))
        self.run_cmd('git', 'read-tree', 'HEAD', env=environment)
        self.write('partial-secret.txt', self.token() + '\n')
        self.run_cmd('git', 'add', 'partial-secret.txt', env=environment)
        result, report = self.scan('--mode', 'staged', env=environment, ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertTrue(any(item['path'] == 'partial-secret.txt' for item in report['findings']))
        result, report = self.scan('--mode', 'staged')
        self.assertEqual(report['findings'], [])

    def test_local_untracked_and_unstaged_secrets_detected_redacted(self):
        self.write('readme.md', self.token() + '\n')
        self.write('.env', 'API_KEY=fixture-long-sensitive-value\n')
        result, report = self.scan(ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertTrue(any(item['kind'] == 'sensitive-env-value' for item in report['findings']))
        self.assertNotIn('fixture-long-sensitive-value', result.stdout + result.stderr)
        self.assertNotIn(self.token(), result.stdout + result.stderr)

    def test_real_secret_in_example_file_is_not_ignored(self):
        self.write('.env.example', 'API_KEY=' + self.token() + '\n')
        result, report = self.scan(ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertTrue(report['findings'])

    def test_native_whitespace_failure_remains_real_and_docs_are_advisory(self):
        self.write('src/feature.txt', 'feature\n')
        result, report = self.scan()
        self.assertEqual(report['status'], 'advisory')
        self.assertEqual(report['findings'], [])
        self.write('readme.md', 'trailing whitespace  \n')
        result, report = self.scan(ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn('git-diff-check', [item['kind'] for item in report['findings']])

    def test_newbranch_scans_root_and_removed_intermediate_secret(self):
        self.write('secret-history.txt', self.token() + '\n')
        secret_head = self.commit()
        self.write('secret-history.txt', 'scrubbed\n')
        head = self.commit()
        result, report = self.scan('--mode', 'push', '--head', head, '--base', '0' * 40, '--all-history', ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertIsNone(report['scope'][0]['base'])
        self.assertTrue(report['findings'])
        result, report = self.scan('--mode', 'push', '--range', secret_head + '..' + head)
        self.assertEqual(report['findings'], [])

    def test_push_ref_input_scans_all_refs_including_non_head(self):
        base = self.run_cmd('git', 'rev-parse', 'HEAD').stdout.strip()
        self.write('leak.txt', self.token() + '\n')
        bad = self.commit()
        self.run_cmd('git', 'checkout', '--detach', base)
        self.write('clean.txt', 'clean\n')
        good = self.commit()
        input = f'refs/heads/good {good} refs/heads/good {base}\nrefs/heads/bad {bad} refs/heads/bad {base}\n'
        result, report = self.scan('--mode', 'push', '--stdin', input=input, ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(len(report['scope']), 2)
        self.assertIn('leak.txt', report['changedPaths'])

    def test_rename_scans_destination_and_weird_filenames(self):
        self.write('old.txt', self.token() + '\n')
        base = self.commit()
        self.run_cmd('git', 'mv', 'old.txt', 'renamed\nfile.txt')
        head = self.commit()
        result, report = self.scan('--mode', 'push', '--range', base + '..' + head, ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn('renamed\nfile.txt', report['changedPaths'])

    def test_deletion_ref_no_content_and_malformed_refs_fail(self):
        head = self.run_cmd('git', 'rev-parse', 'HEAD').stdout.strip()
        result, report = self.scan('--mode', 'push', '--stdin', input=f'(delete) {"0" * 40} refs/heads/old {head}\n')
        self.assertEqual(report['scope'], [])
        for malformed in ('junk\n', 'refs/heads/a bad refs/heads/a bad\n'):
            self.assertNotEqual(self.scan('--mode', 'push', '--stdin', input=malformed, ok=False)[0].returncode, 0)

    def test_argument_errors_never_claim_pass(self):
        for arguments in (('--repo',), ('--mode',), ('--mode', 'strange'), ('--mode', 'push', '--range', 'HEAD...HEAD'), ('--mode', 'push', '--base', 'missing-ref'), ('--mode', 'local', '--head', 'HEAD')):
            result = self.run_cmd('bash', str(ROOT / 'scripts/safe-repo-audit.sh'), '--strict', '--repo', str(self.repo), *arguments, ok=False)
            self.assertNotEqual(result.returncode, 0, arguments)
            self.assertNotIn('PASS', result.stdout + result.stderr)


    def test_native_commit_works_without_capsule_or_helper_install(self):
        self.write('new-feature.txt', 'feature\n')
        self.run_cmd('git', 'add', '.')
        self.run_cmd('git', 'commit', '-qm', 'native commit with no registry')

    def test_opt_in_hook_uses_current_index_and_missing_checker_is_advisory(self):
        installed = self.apply()
        hook = self.repo / '.git/hooks/pre-commit'
        empty_home = Path(self.temp.name) / 'empty-home'
        empty_home.mkdir()
        missing_env = dict(self.env, HOME=str(empty_home))
        result = self.run_cmd('sh', str(hook), env=missing_env)
        self.assertEqual(result.returncode, 0)
        self.assertIn('unavailable', result.stderr)
        self.assertIn('no audit evidence', result.stderr)
        self.write('old-ref.txt', 'native old-ref content\n')
        self.run_cmd('git', 'add', 'old-ref.txt')
        self.run_cmd('git', 'commit', '-qm', 'old ref without optional helper', env=missing_env)
        shutil.copyfile(HELPER, self.repo / 'workspace-hooks-copy.py')
        (self.repo / 'scripts').mkdir(exist_ok=True)
        shutil.copyfile(HELPER, self.repo / 'scripts/workspace-hooks.py')
        self.write('leak.txt', self.token() + '\n')
        self.run_cmd('git', 'add', 'leak.txt')
        result = self.run_cmd('sh', str(hook), ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(self.token(), result.stdout + result.stderr)
        self.invoke('install', '--rollback', installed['backup'])

    def test_pr_checklist_is_advisory_without_any_dev_policy(self):
        if not shutil.which('node'):
            self.skipTest('Node unavailable')
        result = self.run_cmd('node', str(ROOT / 'scripts/dev-v4-installed-controller-adapter.mjs'))
        report = json.loads(result.stdout)
        self.assertEqual(report['status'], 'retired')
        self.assertEqual(report['sourceChecks'], 'not-evaluated')
        self.assertNotIn('decision', report)

    def test_failed_partial_apply_restores_only_its_own_writes(self):
        before = self.prepare()
        original_state = self.hook_state()
        original = hooks.write_file
        failed = []

        def fail_once(path, value):
            if path.name == 'pre-push' and not failed:
                failed.append(True)
                raise OSError('injected isolated fixture failure')
            return original(path, value)

        args = hooks.argparse.Namespace(repo=str(self.repo), apply=True, rollback=None, check=False,
                                        replace=[], expect=before['beforeDigest'])
        with mock.patch.dict(os.environ, self.env, clear=True), mock.patch.object(hooks, 'write_file', side_effect=fail_once):
            with self.assertRaisesRegex(ValueError, 'own writes restored'):
                hooks.install(args)
        self.assertEqual(self.hook_state(), original_state)

    def test_merge_only_secret_is_not_missed(self):
        base = self.run_cmd('git', 'rev-parse', 'HEAD').stdout.strip()
        self.run_cmd('git', 'checkout', '-qb', 'feature')
        self.write('feature.txt', 'feature\n')
        self.commit()
        self.run_cmd('git', 'checkout', '-qb', 'other', base)
        self.write('other.txt', 'other\n')
        self.commit()
        self.run_cmd('git', 'merge', '--no-ff', '--no-commit', 'feature')
        self.write('merge-only.txt', self.token() + '\n')
        head = self.commit('merge fixture')
        result, report = self.scan('--mode', 'push', '--range', base + '..' + head, ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertTrue(any(item['path'] == 'merge-only.txt' for item in report['findings'] if 'path' in item))


    def test_valid_head_expression_native_push_input_is_accepted(self):
        base = self.run_cmd('git', 'rev-parse', 'HEAD').stdout.strip()
        self.write('native.txt', 'native\n')
        head = self.commit()
        result, report = self.scan('--mode', 'push', '--stdin', input=f'HEAD {head} refs/heads/native {base}\n')
        self.assertEqual(report['findings'], [])

    def test_native_compatibility_does_not_read_or_repair_old_registry(self):
        marker = self.write('.git/worktree-active.json', '{"status":"blocked","branch":"other"}')
        state = self.write('.git/dev-v4-lifecycle/state.json', 'broken old controller state')
        before = (marker.read_bytes(), state.read_bytes())
        for script in ('worktree-continuity-guard.sh', 'worktree-readiness-check.sh', 'worktree-task-start-guard.sh',
                       'worktree-coordination-sync.sh', 'dev-context-policy-guard.sh', 'git-health-check.sh', 'worktree-repin-current.sh'):
            result = self.run_cmd('bash', str(ROOT / 'scripts' / script), '--json')
            value = json.loads(result.stdout)
            self.assertEqual(value['legacyAdmission'], 'retired')
            self.assertEqual(value['writes'], False)
            self.assertEqual(value['sourceChecks'], 'not-evaluated')
            self.assertNotIn('decision', value)
        self.assertEqual((marker.read_bytes(), state.read_bytes()), before)

    def test_native_start_needs_explicit_path_and_no_hidden_fetch(self):
        starter = str(ROOT / 'scripts/worktree-task-start.sh')
        value = json.loads(self.run_cmd('bash', starter, 'native-feature').stdout)
        self.assertEqual(value['status'], 'retired')
        self.assertNotEqual(self.run_cmd('git', 'show-ref', '--verify', 'refs/heads/native-feature', ok=False).returncode, 0)
        target = Path(self.temp.name).resolve() / 'new-worktree'
        value = json.loads(self.run_cmd('bash', starter, 'native-feature', '--path', str(target), '--base', 'HEAD').stdout)
        self.assertEqual(value['status'], 'created')
        self.assertTrue(value['writes'])
        self.assertFalse((target / '.git/worktree-active.json').exists())
        self.assertNotEqual(self.run_cmd('git', 'config', '--get', 'remote.origin.url', ok=False).returncode, 0)

    def test_native_ci_mapping_keeps_product_checks_and_exact_endpoints(self):
        spec = importlib.util.spec_from_file_location('hub_ci', ROOT / 'scripts/workspace-ci.py')
        ci = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ci)
        for name in ('tools/coupon-harvester.ts', 'tools/__tests__/extract.test.ts', 'package-lock.json', 'wp-content/mu-plugins/product.php', 'ai-agent/product.ts'):
            self.assertTrue(ci.product_tests([name]), name)
        for name in ('docs/guide.md', 'AGENTS.md', 'scripts/dev-v4-stage-b-adapter.mjs', 'tools/__tests__/dev-delivery-v2-adapter.test.ts'):
            self.assertFalse(ci.product_tests([name]), name)
        missing = self.run_cmd(sys.executable, '-B', str(ROOT / 'scripts/workspace-ci.py'), '--base', 'missing-ref', '--head', 'HEAD', ok=False)
        self.assertNotEqual(missing.returncode, 0)
        self.assertNotIn('PASS', missing.stdout)

    def make_remote(self):
        remote = Path(self.temp.name).resolve() / 'remote.git'
        self.run_cmd('git', 'init', '--bare', '-q', str(remote))
        self.run_cmd('git', 'push', str(remote), 'HEAD:refs/heads/main')
        return remote

    def test_guarded_push_exact_multi_refs_and_remote_rename_blocks_secrets(self):
        remote = self.make_remote()
        base = self.run_cmd('git', 'rev-parse', 'HEAD').stdout.strip()
        self.write('actual-secret.txt', self.token() + '\n')
        bad = self.commit()
        self.run_cmd('git', 'branch', 'bad-local', bad)
        self.run_cmd('git', 'checkout', '--detach', base)
        self.write('clean.txt', 'clean\n')
        self.commit()
        result = self.run_cmd('bash', str(ROOT / 'scripts/guarded-push.sh'), str(remote),
                              'HEAD:refs/heads/renamed-clean', 'refs/heads/bad-local:refs/heads/renamed-bad', ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('secret-like-content', result.stdout)
        self.assertEqual(result.stdout.count('remote-outgoing-boundary'), 1)
        self.assertNotIn(self.token(), result.stdout + result.stderr)
        for ref in ('refs/heads/renamed-clean', 'refs/heads/renamed-bad'):
            self.assertNotEqual(self.run_cmd('git', '--git-dir', str(remote), 'show-ref', '--verify', ref, ok=False).returncode, 0)

    def historical_secret_remote(self):
        self.write('revoked-history.txt', self.token() + '\n')
        self.commit()
        self.write('revoked-history.txt', 'revoked and removed\n')
        self.commit()
        return self.make_remote()

    def test_newbranch_excludes_verified_remote_history_and_uses_actual_renamed_url(self):
        remote = self.historical_secret_remote()
        renamed = remote.with_name('renamed-target.git')
        remote.rename(renamed)
        self.run_cmd('git', 'remote', 'add', 'misleading-old-name', str(remote))
        self.write('clean-feature.txt', 'clean feature\n')
        head = self.commit()
        result = self.run_cmd('bash', str(ROOT / 'scripts/guarded-push.sh'), str(renamed), 'HEAD:refs/heads/clean-new')
        self.assertNotIn('secret-like-content', result.stdout)
        self.assertIn('remote-outgoing-boundary', result.stdout)
        self.assertEqual(self.run_cmd('git', '--git-dir', str(renamed), 'rev-parse', 'refs/heads/clean-new').stdout.strip(), head)
        self.write('new-leak.txt', self.token() + '\n')
        self.commit()
        result = self.run_cmd('bash', str(ROOT / 'scripts/guarded-push.sh'), str(renamed), 'HEAD:refs/heads/actual-new-leak', ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('secret-like-content', result.stdout)
        self.assertNotEqual(self.run_cmd('git', '--git-dir', str(renamed), 'show-ref', '--verify', 'refs/heads/actual-new-leak', ok=False).returncode, 0)

    def test_installed_native_hook_passes_actual_remote_target_for_newbranch(self):
        remote = self.historical_secret_remote()
        (self.repo / 'scripts').mkdir()
        shutil.copyfile(HELPER, self.repo / 'scripts/workspace-hooks.py')
        self.write('.git/info/exclude', 'scripts/workspace-hooks.py\n')
        self.write('native-clean-feature.txt', 'native clean feature\n')
        self.commit()
        self.apply()
        result = self.run_cmd('git', 'push', str(remote), 'HEAD:refs/heads/native-new')
        self.assertNotIn('secret-like-content', result.stdout)
        self.assertIn('remote-outgoing-boundary', result.stdout)

    def test_newbranch_missing_proof_is_unavailable_not_pass_and_optional_hook_advisory(self):
        head = self.run_cmd('git', 'rev-parse', 'HEAD').stdout.strip()
        refs = f'HEAD {head} refs/heads/new {"0" * 40}\n'
        result, report = self.scan('--mode', 'push', '--stdin', input=refs, ok=False)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(report['status'], 'unavailable')
        self.assertFalse(any(check['status'] == 'passed' for check in report['checks']))
        (self.repo / 'scripts').mkdir()
        shutil.copyfile(HELPER, self.repo / 'scripts/workspace-hooks.py')
        self.apply()
        result = self.run_cmd('sh', str(self.repo / '.git/hooks/pre-push'), 'actual-name', str(self.repo / 'missing-remote'), input=refs)
        self.assertIn('no successful audit evidence', result.stderr)
        self.assertIn('"status": "unavailable"', result.stdout)

    def test_incomplete_advertisement_never_fetches_or_masks_existing_ref_secret(self):
        remote = self.make_remote()
        missing = self.run_cmd('git', '--git-dir', str(remote), 'hash-object', '-w', '--stdin', input='remote-only object\n').stdout.strip()
        self.run_cmd('git', '--git-dir', str(remote), 'update-ref', 'refs/tags/remote-only', missing)
        base = self.run_cmd('git', 'rev-parse', 'HEAD').stdout.strip()
        self.write('outgoing-secret.txt', self.token() + '\n')
        bad = self.commit()
        before = self.run_cmd('git', 'show-ref').stdout
        refs = f'HEAD {bad} refs/heads/new {"0" * 40}\n'
        result, report = self.scan('--mode', 'push', '--stdin', '--remote-url', str(remote), input=refs, ok=False)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(report['status'], 'unavailable')
        self.assertEqual(before, self.run_cmd('git', 'show-ref').stdout)
        self.assertNotEqual(self.run_cmd('git', 'cat-file', '-e', missing, ok=False).returncode, 0)
        refs += f'HEAD {bad} refs/heads/existing {base}\n'
        result, report = self.scan('--mode', 'push', '--stdin', '--remote-url', str(remote), input=refs, ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['status'], 'findings')
        self.assertTrue(any(check['status'] == 'unavailable' for check in report['checks']))
        self.assertTrue(any(item['kind'] == 'secret-like-content' for item in report['findings']))

    def test_guarded_push_preserves_custom_hook_and_git_configuration(self):
        remote = self.make_remote()
        sentinel = Path(self.temp.name).resolve() / 'custom-refs'
        original = self.write('.git/hooks/pre-push', '#!/bin/sh\ncat > ' + str(sentinel) + '\nexit 0\n')
        original.chmod(0o755)
        before = original.read_bytes()
        self.write('clean.txt', 'clean\n')
        head = self.commit()
        self.run_cmd('bash', str(ROOT / 'scripts/guarded-push.sh'), str(remote), 'HEAD:refs/heads/renamed')
        self.assertIn('refs/heads/renamed', sentinel.read_text())
        self.assertEqual(original.read_bytes(), before)
        self.assertEqual(self.run_cmd('git', '--git-dir', str(remote), 'rev-parse', 'refs/heads/renamed').stdout.strip(), head)
        self.assertNotEqual(self.run_cmd('git', 'config', '--get', 'core.hooksPath', ok=False).returncode, 0)
        original.write_text('#!/bin/sh\nexit 9\n')
        self.write('more.txt', 'another clean file\n')
        self.commit()
        result = self.run_cmd('bash', str(ROOT / 'scripts/guarded-push.sh'), str(remote), 'HEAD:refs/heads/renamed', ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.run_cmd('git', '--git-dir', str(remote), 'rev-parse', 'refs/heads/renamed').stdout.strip(), head)

    def test_legacy_hook_hashes_are_exact_and_custom_suffix_is_not_owned(self):
        baseline = '571cdcd394f7d71743de151f79071c8f08668685'
        old = Path(self.temp.name).resolve() / 'legacy/scripts'
        old.mkdir(parents=True)
        for name in ('dev-v4-target-hooks.mjs', 'dev-v4-installed-controller-adapter.mjs', 'safe-repo-audit.sh'):
            result = self.run_cmd('git', '-C', str(ROOT), 'show', baseline + ':scripts/' + name, ok=False)
            if result.returncode:
                self.skipTest('optional historical renderer fixture unavailable in this checkout')
            (old / name).write_text(result.stdout)
        module_url = (old / 'dev-v4-target-hooks.mjs').as_uri()
        program = 'import {renderHookImages} from ' + json.dumps(module_url) + '; console.log(JSON.stringify(renderHookImages()));'
        images = json.loads(self.run_cmd('node', '--input-type=module', '-e', program).stdout)['changes']
        for name, image in images.items():
            value = {'data': image['bytes'], 'mode': image['mode']}
            self.assertTrue(hooks.owned(name, value), name)
            value['data'] = base64.b64encode(base64.b64decode(value['data']) + b'\n# user custom suffix\n').decode()
            self.assertFalse(hooks.owned(name, value), name)

    def test_workspace_dependency_inputs_and_effective_override(self):
        spec = importlib.util.spec_from_file_location('hub_workspace', ROOT / 'scripts/workspace.py')
        workspace = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(workspace)
        self.write('requirements-dev.txt', 'one\n')
        self.write('composer.lock', '{}\n')
        self.write('package.json', json.dumps({'dependencies': {'local': 'file:./custom/local'}}))
        self.write('custom/local/index.js', 'first\n')
        self.run_cmd('git', 'add', '.')
        first = workspace.dependency_inventory(self.repo)
        self.write('custom/local/index.js', 'second\n')
        self.assertNotEqual(first['identity'], workspace.dependency_inventory(self.repo)['identity'])
        self.write('AGENTS.md', 'ordinary repo rules\n')
        self.write('AGENTS.override.md', 'effective override rules\n')
        with mock.patch.object(workspace, 'SOURCE', self.repo):
            documents = workspace.context(self.repo, 'start')['documents']
        self.assertEqual([item['text'] for item in documents], ['effective override rules\n'])

    def test_dependency_manifest_under_linked_parent_is_not_read(self):
        spec = importlib.util.spec_from_file_location('hub_workspace', ROOT / 'scripts/workspace.py')
        workspace = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(workspace)
        source = self.write('local/package.json', '{"dependencies":{}}')
        self.run_cmd('git', 'add', '.')
        source.unlink()
        source.parent.rmdir()
        outside = Path(self.temp.name).resolve() / 'outside'
        outside.mkdir()
        (outside / 'package.json').write_text('{"dependencies":{"foreign":"file:./never-read"}}')
        (self.repo / 'local').symlink_to(outside, target_is_directory=True)
        original = Path.read_text
        read_outside = []

        def guarded(path, *args, **kwargs):
            if path.resolve().is_relative_to(outside):
                read_outside.append(str(path))
                raise AssertionError('foreign manifest was read')
            return original(path, *args, **kwargs)

        with mock.patch.object(Path, 'read_text', guarded):
            value = workspace.dependency_inventory(self.repo)
        self.assertEqual(read_outside, [])
        self.assertEqual(value['installed_compatibility'], 'not-verified')

    def test_tracked_custom_hooks_path_cannot_publish_private_hook_backups(self):
        self.run_cmd('git', 'config', 'core.hooksPath', '.githooks')
        original = self.write('.githooks/pre-commit', '#!/bin/sh\n# custom private content\n')
        original.chmod(0o755)
        self.commit()
        prepared = self.prepare()
        installed = self.apply(prepared)
        backup = Path(installed['backup'])
        self.assertEqual(backup.parent, self.repo.resolve() / '.git/workspace-hook-backups')
        self.assertFalse((self.repo / '.githooks/.workspace-hook-backups').exists())
        untracked = self.run_cmd('git', 'ls-files', '--others', '--exclude-standard').stdout
        self.assertNotIn('manifest.json', untracked)
        self.assertNotIn('workspace-hook-backups', untracked)
        self.invoke('install', '--rollback', str(backup))
        self.assertIn('custom private content', original.read_text())

    def test_private_hook_bytes_never_appear_in_public_report(self):
        secret = self.token()
        custom = self.write('.git/hooks/pre-commit', '#!/bin/sh\n# inline credential ' + secret + '\n')
        custom.chmod(0o755)
        prepared = self.invoke('install')
        before = json.loads(prepared.stdout)
        result = self.invoke('install', '--apply', '--expect', before['beforeDigest'])
        public = prepared.stdout + result.stdout
        self.assertNotIn(secret, public)
        self.assertNotIn(base64.b64encode(custom.read_bytes()).decode(), public)
        self.assertNotIn('before', json.loads(result.stdout))
        receipt = json.loads((Path(json.loads(result.stdout)['backup']) / 'manifest.json').read_text())
        self.assertIn(secret.encode(), base64.b64decode(receipt['before']['hooks']['pre-commit']['data']))

    def test_private_backup_directory_rejects_symlink_permissions_and_foreign_owner(self):
        destination = self.repo / '.git/workspace-hook-backups'
        external = Path(self.temp.name).resolve() / 'external-backups'
        external.mkdir()
        destination.symlink_to(external, target_is_directory=True)
        self.assertNotEqual(self.invoke('install', '--apply', '--expect', self.prepare()['beforeDigest'], ok=False).returncode, 0)
        self.assertFalse((self.repo / '.git/hooks/pre-commit').exists())
        self.assertEqual(list(external.iterdir()), [])
        destination.unlink()
        destination.mkdir(mode=0o755)
        destination.chmod(0o755)
        self.assertNotEqual(self.invoke('install', '--apply', '--expect', self.prepare()['beforeDigest'], ok=False).returncode, 0)
        self.assertFalse((self.repo / '.git/hooks/pre-commit').exists())
        with mock.patch.object(hooks.os, 'getuid', return_value=os.getuid() + 1):
            with self.assertRaisesRegex(ValueError, 'owned'):
                hooks.git_directory(self.repo)

    def interrupt_rollback(self, installed):
        original = hooks.write_file
        count = []

        def fail_second(path, value):
            count.append(path)
            if len(count) == 2:
                raise OSError('fixture rollback interruption')
            return original(path, value)

        args = hooks.argparse.Namespace(repo=str(self.repo), apply=False, rollback=installed['backup'], check=False, replace=[], expect=None)
        with mock.patch.dict(os.environ, self.env, clear=True), mock.patch.object(hooks, 'write_file', side_effect=fail_second):
            with self.assertRaises(OSError):
                hooks.install(args)

    def test_interrupted_rollback_resumes_own_mixed_state(self):
        original_state = self.hook_state()
        installed = self.apply()
        self.interrupt_rollback(installed)
        self.assertFalse((self.repo / '.git/hooks/pre-commit').exists())
        self.assertTrue((self.repo / '.git/hooks/pre-push').exists())
        self.invoke('install', '--rollback', installed['backup'])
        self.assertEqual(self.hook_state(), original_state)

    def test_interrupted_rollback_foreign_third_state_and_config_are_preserved(self):
        installed = self.apply()
        self.interrupt_rollback(installed)
        target = self.write('.git/hooks/pre-push', '#!/bin/sh\n# foreign change\n')
        self.assertNotEqual(self.invoke('install', '--rollback', installed['backup'], ok=False).returncode, 0)
        self.assertIn('foreign change', target.read_text())
        self.assertFalse((self.repo / '.git/hooks/pre-commit').exists())
        target.unlink()
        self.run_cmd('git', 'config', 'core.hooksPath', '.git/hooks')
        self.assertNotEqual(self.invoke('install', '--rollback', installed['backup'], ok=False).returncode, 0)

    def test_linked_current_checker_and_source_directory_never_execute(self):
        self.apply()
        hook = self.repo / '.git/hooks/pre-commit'
        outside = Path(self.temp.name).resolve() / 'outside-code'
        outside.mkdir()
        sentinel = outside / 'executed'
        program = outside / 'workspace-hooks.py'
        program.write_text('from pathlib import Path\nPath(' + repr(str(sentinel)) + ').write_text("executed")\n')
        scripts = self.repo / 'scripts'
        scripts.mkdir()
        checker = scripts / 'workspace-hooks.py'
        checker.symlink_to(program)
        result = self.run_cmd('sh', str(hook), ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertFalse(sentinel.exists())
        checker.unlink()
        scripts.rmdir()
        scripts.symlink_to(outside, target_is_directory=True)
        result = self.run_cmd('sh', str(hook), ok=False)
        self.assertEqual(result.returncode, 1)
        self.assertFalse(sentinel.exists())

    def test_rollback_template_interruption_resumes_after_hook_restoration(self):
        template = self.write('.gitmessage', hooks.OLD_TEMPLATE)
        self.run_cmd('git', 'config', 'commit.template', str(template))
        original_state = self.hook_state()
        installed = self.apply()
        args = hooks.argparse.Namespace(repo=str(self.repo), apply=False, rollback=installed['backup'], check=False, replace=[], expect=None)
        with mock.patch.dict(os.environ, self.env, clear=True), mock.patch.object(hooks, 'set_template', side_effect=OSError('template fixture interruption')):
            with self.assertRaises(OSError):
                hooks.install(args)
        self.assertFalse((self.repo / '.git/hooks/pre-commit').exists())
        self.assertFalse((self.repo / '.git/hooks/pre-push').exists())
        self.invoke('install', '--rollback', installed['backup'])
        self.assertEqual(self.hook_state(), original_state)

    def test_rollback_unmodified_hook_foreign_drift_blocks_before_any_restore(self):
        installed = self.apply()
        before = self.hook_state()
        custom = self.write('.git/hooks/post-commit', '#!/bin/sh\n# unrelated custom hook\n')
        self.assertNotEqual(self.invoke('install', '--rollback', installed['backup'], ok=False).returncode, 0)
        after = self.hook_state()
        self.assertEqual(after['hooks']['pre-commit'], before['hooks']['pre-commit'])
        self.assertEqual(after['hooks']['pre-push'], before['hooks']['pre-push'])
        self.assertIn('unrelated custom hook', custom.read_text())



if __name__ == '__main__':
    unittest.main()
