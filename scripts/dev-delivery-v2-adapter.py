#!/usr/bin/env python3
"""Repo-local, source-inert DEV delivery v2 adapter for impact_hub."""
import argparse, hashlib, json, os, stat, subprocess, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path

EXPECTED_DIGEST = "989dd16dd30bdebb07403c1b0f88ad9a182ea0dd167fc37674438b4bc8ef0194"
CLASSES = ("docs-only", "governance-only", "code-local", "protected", "deploy", "unknown")
PROTECTED = {
    ".github/pull_request_template.md",
    ".gitignore",
    "AGENTS.md",
    "PR-EXIT-CHECKLIST.md",
    "config/dev-delivery-v2-impact-policy.json",
    "config/dev-delivery-v2-target-contract.json",
    "docs/ai-assistant-canonical-policy.md",
    "docs/impact-hub-governance-system-plan-2026-06-16.md",
    "docs/pr-policy.md",
    "jest.config.cjs",
    "package-lock.json",
    "package.json",
    "scripts/dev-context-policy-guard.sh",
    "scripts/dev-delivery-v2-adapter.py",
    "scripts/git-health-check.sh",
    "scripts/guarded-push.sh",
    "scripts/install-hooks-all.sh",
    "scripts/safe-repo-audit.sh",
    "scripts/worktree-continuity-guard.sh",
    "scripts/worktree-readiness-check.sh",
    "tests/dev-context-policy-guard.test.sh",
}
GOVERNANCE_PREFIXES = ("docs/", "notes.md", "system-status-snapshot.md", "AGENTS.md", "PR-EXIT-CHECKLIST.md")
CODE_PREFIXES = ("tools/", "ai-agent/", "wp-content/")
DEPLOY_PREFIXES = ("scripts/shortcode_sync/",)
DEDICATED_FIXTURE = "tools/fixtures/dev-delivery-v2"
TEMP_FIXTURE_PREFIX = "impact-hub-v2-fixture-"
MAX_FIXTURE_FILES = 128
MAX_FIXTURE_FILE_BYTES = 1024 * 1024
MAX_FIXTURE_TOTAL_BYTES = 4 * 1024 * 1024

# Security-relevant evidence execution is code-owned.  The tracked policy is a
# reviewable mirror, not an executable source of new commands or profiles.
REQUIRED_CHECKS = {
    "context-guard": {"profile": "adapter-v1", "command": ("bash", "scripts/dev-context-policy-guard.sh", "--json")},
    "adapter-fixtures": {"profile": "adapter-v1", "command": ("internal", "fixture")},
    "jest-full": {"profile": "adapter-v1", "command": ("npm", "test", "--", "--runInBand")},
    "readiness": {"profile": "adapter-v1", "command": ("bash", "scripts/worktree-readiness-check.sh", "--json")},
    "continuity": {"profile": "adapter-v1", "command": ("bash", "scripts/worktree-continuity-guard.sh", "--mode", "local", "--json")},
    "git-health": {"profile": "adapter-v1", "command": ("bash", "scripts/git-health-check.sh")},
    "safe-audit": {"profile": "adapter-v1", "command": ("bash", "scripts/safe-repo-audit.sh", "--strict", "--mode", "push")},
    "diff-check": {"profile": "adapter-v1", "command": ("internal", "candidate-diff-check")},
}

def git(root, *args, required=True):
    run = subprocess.run(["git", "-C", str(root), *args], text=True, capture_output=True)
    if required and run.returncode:
        raise RuntimeError("git_failed:" + (run.stderr.strip() or " ".join(args)))
    return run.stdout.strip()

def production_root(value):
    current = Path(git(Path.cwd(), "rev-parse", "--show-toplevel")).resolve()
    root = Path(value).resolve() if value else current
    actual = Path(git(root, "rev-parse", "--show-toplevel")).resolve()
    # --repo-root is a binding, not a way to select another checkout.  This
    # blocks sibling worktrees and foreign full repositories alike.
    if root != current or actual != current:
        raise RuntimeError("exact_current_worktree_root_required")
    return current

def contract(root):
    data = (root / "config/dev-delivery-v2-target-contract.json").read_bytes()
    if hashlib.sha256(data).hexdigest() != EXPECTED_DIGEST:
        raise RuntimeError("target_contract_digest_mismatch")
    value = json.loads(data)
    if value.get("centralRuntimeDependency") is not False or value.get("authority") != "repo-local":
        raise RuntimeError("target_contract_authority_invalid")
    return value

def commit_exists(root, sha):
    return bool(sha) and subprocess.run(["git", "-C", str(root), "cat-file", "-e", f"{sha}^{{commit}}"], capture_output=True).returncode == 0

def changed_paths(root, base, head):
    if not base or not head:
        raise RuntimeError("base_and_head_required")
    if not commit_exists(root, base) or not commit_exists(root, head):
        raise RuntimeError("base_or_head_commit_unavailable")
    if base == head:
        return []
    return [p for p in git(root, "diff", "--name-only", f"{base}..{head}").splitlines() if p]

def is_protected_path(path):
    parts = tuple(part.lower() for part in Path(path).parts)
    name = parts[-1] if parts else ""
    return (
        path in PROTECTED
        or path.startswith(".github/workflows/")
        or path.startswith("config/dev-delivery-v2-")
        or path.startswith("tests/dev-delivery-v2-")
        or path.startswith("tools/__tests__/dev-delivery-v2-")
        or path.startswith("config/dev-v4/")
        or path.startswith("scripts/dev-v4-")
        or path.startswith("tests/dev-v4-")
        or path.startswith("docs/dev-plans/DEV-V4-")
        or path.startswith("docs/continuity/dev/2026-09-11-dev-v4-")
        or "guard" in parts
        or "guards" in parts
        or "policy" in name
        or "-guard" in name
        or name.startswith("guard-")
    )

def classify(paths):
    if not paths: return "governance-only"
    if any(is_protected_path(p) for p in paths): return "protected"
    if any(p.startswith(DEPLOY_PREFIXES) for p in paths): return "deploy"
    if any(p.startswith(CODE_PREFIXES) for p in paths): return "code-local"
    if all(p.startswith(GOVERNANCE_PREFIXES) or p in ("package.json", "jest.config.cjs", "scripts/dev-context-policy-guard.sh") for p in paths):
        return "docs-only" if all(p.startswith("docs/") or p in ("notes.md", "system-status-snapshot.md") for p in paths) else "governance-only"
    return "unknown"

def report(root, base=None, head=None):
    contract(root)
    base = base or git(root, "rev-parse", "origin/main", required=False)
    head = head or git(root, "rev-parse", "HEAD")
    paths = changed_paths(root, base, head) if base else []
    klass = classify(paths)
    reasons = []
    if not base: reasons.append("origin-main-unavailable")
    if klass == "unknown": reasons.append("unknown-path-class")
    provider = "not-affected" if klass in ("docs-only", "governance-only") else "operator-review"
    decision = "blocked" if reasons else ("operator-review" if klass in ("protected", "deploy") else "allowed")
    return {"schemaVersion": 2, "repo": "impact_hub", "authoritySource": "repo-local", "branch": git(root, "branch", "--show-current") or None, "baseSha": base or None, "headSha": head, "treeSha": git(root, "show", "-s", "--format=%T", head), "changedPathClass": klass, "changedPaths": paths, "providerBuildDecision": provider, "evidenceReuseAllowed": klass in ("docs-only", "governance-only"), "decision": decision, "blockingReasons": reasons, "expensiveStepsRequired": klass not in ("docs-only", "governance-only"), "fullValidationRequired": klass in ("protected", "deploy", "unknown"), "automaticProductDeployAuthority": False}

def state_dir(root):
    raw = git(root, "rev-parse", "--git-path", "dev-delivery-v2")
    target = (root / raw).resolve() if not Path(raw).is_absolute() else Path(raw)
    target.mkdir(mode=0o700, parents=True, exist_ok=True); os.chmod(target, 0o700)
    mode = stat.S_IMODE(target.stat().st_mode)
    if mode != 0o700: raise RuntimeError("private_state_directory_posture_invalid")
    return target

def write_private(file, value):
    tmp = file.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, sort_keys=True, indent=2) + "\n")
    os.chmod(tmp, 0o600); os.replace(tmp, file); os.chmod(file, 0o600)

def freeze(root):
    contract(root)
    cleanliness = cleanliness_snapshot(root)
    assert_cleanliness(cleanliness, cleanliness["indexTree"], "freeze")
    receipt = {"schemaVersion": 2, "kind": "candidate-freeze", "branch": git(root, "branch", "--show-current"), "baseSha": git(root, "rev-parse", "origin/main"), "headAtFreeze": git(root, "rev-parse", "HEAD"), "candidateTree": cleanliness["indexTree"], "cleanlinessAtFreeze": cleanliness, "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "checks": []}
    write_private(state_dir(root) / "candidate-freeze.json", receipt)
    return receipt

def policy(root):
    value = json.loads((root / "config/dev-delivery-v2-impact-policy.json").read_text())
    expected = {key: {"profile": spec["profile"], "command": list(spec["command"])} for key, spec in REQUIRED_CHECKS.items()}
    if value.get("contractSha256") != EXPECTED_DIGEST or value.get("requiredChecks") != expected:
        raise RuntimeError("impact_policy_executable_surface_mismatch")
    return value

def cleanliness_snapshot(root):
    unstaged = [p for p in git(root, "diff", "--name-only", "--no-ext-diff").splitlines() if p]
    untracked = [p for p in git(root, "ls-files", "--others", "--exclude-standard").splitlines() if p]
    return {
        "indexTree": git(root, "write-tree"),
        "unstagedTrackedPaths": unstaged,
        "unexpectedUntrackedPaths": untracked,
        "unstagedTrackedClean": not unstaged,
        "unexpectedUntrackedClean": not untracked,
    }

def assert_cleanliness(value, candidate_tree, phase):
    if value["indexTree"] != candidate_tree:
        raise RuntimeError(f"candidate_tree_changed_{phase}")
    if not value["unstagedTrackedClean"]:
        raise RuntimeError(f"unstaged_tracked_changes_{phase}")
    if not value["unexpectedUntrackedClean"]:
        raise RuntimeError(f"unexpected_untracked_files_{phase}")

def record(root, check, profile, fixture_root=None):
    policy(root)
    spec = REQUIRED_CHECKS.get(check)
    if not spec or spec["profile"] != profile: raise RuntimeError("evidence_profile_not_authorized")
    file = state_dir(root) / "candidate-freeze.json"
    value = json.loads(file.read_text())
    if any(c["id"] == check for c in value["checks"]): raise RuntimeError("duplicate_evidence_check")
    before = cleanliness_snapshot(root)
    assert_cleanliness(before, value["candidateTree"], "before_evidence")
    command = spec["command"]
    if command == ("internal", "fixture"):
        result = fixture(root, fixture_root)
        exit_code, observed = 0, result
    elif command == ("internal", "candidate-diff-check"):
        run = subprocess.run(["git", "-C", str(root), "diff", "--check", f"{value['baseSha']}..HEAD"], text=True, capture_output=True)
        exit_code, observed = run.returncode, {"range": f"{value['baseSha']}..HEAD", "stdoutSha256": hashlib.sha256(run.stdout.encode()).hexdigest(), "stderrSha256": hashlib.sha256(run.stderr.encode()).hexdigest()}
    else:
        run = subprocess.run(list(command), cwd=root, text=True, capture_output=True)
        exit_code, observed = run.returncode, {"stdoutSha256": hashlib.sha256(run.stdout.encode()).hexdigest(), "stderrSha256": hashlib.sha256(run.stderr.encode()).hexdigest()}
    after = cleanliness_snapshot(root)
    assert_cleanliness(after, value["candidateTree"], "after_evidence")
    value["checks"].append({"id": check, "profile": profile, "command": list(command), "exitCode": exit_code, "candidateTree": value["candidateTree"], "cleanliness": {"before": before, "after": after}, "observed": observed, "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})
    write_private(file, value); return value

def close(root):
    file = state_dir(root) / "candidate-freeze.json"; value = json.loads(file.read_text())
    policy(root)
    seen = {c["id"]: c["exitCode"] for c in value["checks"]}
    missing = [c for c in REQUIRED_CHECKS if seen.get(c) != 0]
    if missing: raise RuntimeError("required_evidence_missing:" + ",".join(missing))
    cleanliness = cleanliness_snapshot(root)
    assert_cleanliness(cleanliness, value["candidateTree"], "at_closure")
    tree = git(root, "show", "-s", "--format=%T", "HEAD")
    if tree != value["candidateTree"]: raise RuntimeError("checkpoint_tree_does_not_match_candidate")
    closure = {"schemaVersion": 2, "kind": "checkpoint-closure", "candidateTree": value["candidateTree"], "checkpointCommit": git(root, "rev-parse", "HEAD"), "checkpointTree": tree, "cleanlinessAtClosure": cleanliness, "externalWriteAttestation": "not-collected"}
    write_private(state_dir(root) / "checkpoint-closure.json", closure); return closure

def fixture(root, fixture_root):
    if not fixture_root: raise RuntimeError("explicit_fixture_root_required")
    requested = Path(os.path.abspath(fixture_root))
    try:
        target = requested.resolve(strict=True)
    except (FileNotFoundError, RuntimeError):
        raise RuntimeError("fixture_root_must_be_existing_directory")
    if requested != target or requested.is_symlink() or not target.is_dir():
        raise RuntimeError("fixture_root_realpath_or_symlink_invalid")
    dedicated = (root / DEDICATED_FIXTURE).resolve(strict=True)
    temp_parent = Path(tempfile.gettempdir()).resolve(strict=True)
    is_dedicated = target == dedicated
    is_test_temp = target.parent == temp_parent and target.name.startswith(TEMP_FIXTURE_PREFIX)
    if not is_dedicated and not is_test_temp:
        raise RuntimeError("fixture_root_outside_dedicated_perimeter")
    root_stat = target.lstat()
    if root_stat.st_uid != os.getuid() or (is_test_temp and stat.S_IMODE(root_stat.st_mode) != 0o700) or root_stat.st_mode & 0o022:
        raise RuntimeError("fixture_root_owner_or_mode_invalid")
    c = contract(root)
    if c["repoRoot"]["networkAllowedInFixtureMode"] or c["repoRoot"]["mutationAllowedInFixtureMode"]: raise RuntimeError("fixture_boundary_widened")
    def snapshot():
        entries = []
        total = 0
        for item in sorted(target.rglob("*")):
            item_stat = item.lstat()
            if stat.S_ISLNK(item_stat.st_mode): raise RuntimeError("fixture_symlink_forbidden")
            if item_stat.st_uid != os.getuid() or item_stat.st_mode & 0o022: raise RuntimeError("fixture_entry_owner_or_mode_invalid")
            if stat.S_ISDIR(item_stat.st_mode): continue
            if not stat.S_ISREG(item_stat.st_mode): raise RuntimeError("fixture_special_file_forbidden")
            if item_stat.st_size > MAX_FIXTURE_FILE_BYTES: raise RuntimeError("fixture_file_size_limit_exceeded")
            total += item_stat.st_size
            if total > MAX_FIXTURE_TOTAL_BYTES: raise RuntimeError("fixture_total_size_limit_exceeded")
            if len(entries) >= MAX_FIXTURE_FILES: raise RuntimeError("fixture_file_count_limit_exceeded")
            flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
            fd = os.open(item, flags)
            try:
                opened_stat = os.fstat(fd)
                if not stat.S_ISREG(opened_stat.st_mode) or opened_stat.st_uid != item_stat.st_uid or opened_stat.st_size != item_stat.st_size:
                    raise RuntimeError("fixture_entry_changed_during_open")
                with os.fdopen(fd, "rb") as stream:
                    hasher = hashlib.sha256()
                    while chunk := stream.read(65536):
                        hasher.update(chunk)
                    digest = hasher.hexdigest()
            except Exception:
                try: os.close(fd)
                except OSError: pass
                raise
            entries.append((str(item.relative_to(target)), item_stat.st_size, digest))
        return hashlib.sha256(json.dumps(entries).encode()).hexdigest()
    before, after = snapshot(), snapshot()
    if before != after: raise RuntimeError("fixture_mutation_detected")
    return {"schemaVersion": 2, "decision": "pass", "fixtureMode": "offline", "fixtureRoot": str(target), "fixtureRootKind": "repo-dedicated" if is_dedicated else "test-temp", "networkContacted": False, "mutationPerformed": False, "fixtureSnapshot": before}

def ci_validate(root, base, head):
    if not base or not head: raise RuntimeError("ci_validation_requires_event_base_and_head")
    result = report(root, base, head)
    diff = subprocess.run(["git", "-C", str(root), "diff", "--check", f"{base}..{head}"], text=True, capture_output=True)
    if diff.returncode: raise RuntimeError("event_diff_check_failed")
    control_changed = any(is_protected_path(p) for p in result["changedPaths"])
    continuity = {"docs/bastion-guard-status.md", "docs/impact-hub-governance-system-plan-2026-06-16.md", "notes.md", "system-status-snapshot.md"}
    missing = sorted(continuity.difference(result["changedPaths"])) if control_changed else []
    if missing: raise RuntimeError("control_change_continuity_missing:" + ",".join(missing))
    return {"schemaVersion": 2, "decision": "pass", "baseSha": base, "headSha": head, "treeSha": result["treeSha"], "changedPathClass": result["changedPathClass"], "diffRange": f"{base}..{head}", "diffCheck": "pass", "bastionRequired": control_changed, "bastionUpdated": not control_changed or "docs/bastion-guard-status.md" in result["changedPaths"], "continuityPaths": sorted(continuity.intersection(result["changedPaths"]))}

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("command", choices=("inspect", "ci-classify", "ci-validate", "freeze", "record", "close", "fixture")); parser.add_argument("--repo-root"); parser.add_argument("--base"); parser.add_argument("--head"); parser.add_argument("--check"); parser.add_argument("--profile"); parser.add_argument("--fixture-root"); parser.add_argument("--json", action="store_true")
    a = parser.parse_args(); root = production_root(a.repo_root)
    if a.command in ("inspect", "ci-classify"): out = report(root, a.base, a.head)
    elif a.command == "ci-validate": out = ci_validate(root, a.base, a.head)
    elif a.command == "freeze": out = freeze(root)
    elif a.command == "record":
        if not a.check or not a.profile: raise RuntimeError("record_requires_check_and_profile")
        out = record(root, a.check, a.profile, a.fixture_root)
    elif a.command == "close": out = close(root)
    else: out = fixture(root, a.fixture_root)
    print(json.dumps(out, sort_keys=True))
    if a.command in ("inspect", "ci-classify") and out["decision"] == "blocked": sys.exit(1)
if __name__ == "__main__":
    try: main()
    except Exception as exc:
        print("[dev-delivery-v2-adapter] BLOCKED " + str(exc), file=sys.stderr); sys.exit(1)
