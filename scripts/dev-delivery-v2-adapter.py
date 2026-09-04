#!/usr/bin/env python3
"""Repo-local, source-inert DEV delivery v2 adapter for impact_hub."""
import argparse, hashlib, json, os, stat, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

EXPECTED_DIGEST = "989dd16dd30bdebb07403c1b0f88ad9a182ea0dd167fc37674438b4bc8ef0194"
CLASSES = ("docs-only", "governance-only", "code-local", "protected", "deploy", "unknown")
PROTECTED = {"scripts/dev-delivery-v2-adapter.py", "scripts/dev-context-policy-guard.sh", "config/dev-delivery-v2-target-contract.json", "config/dev-delivery-v2-impact-policy.json", ".github/workflows/pr-checklist-guard.yml"}
GOVERNANCE_PREFIXES = ("docs/", "notes.md", "system-status-snapshot.md", "AGENTS.md", "PR-EXIT-CHECKLIST.md")
CODE_PREFIXES = ("tools/", "ai-agent/", "wp-content/")
DEPLOY_PREFIXES = ("scripts/shortcode_sync/", ".github/workflows/coupon-harvest.yml")

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

def classify(paths):
    if not paths: return "governance-only"
    if any(p in PROTECTED or p.startswith("tests/dev-delivery-v2-") for p in paths): return "protected"
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
    if git(root, "diff", "--name-only") or git(root, "ls-files", "--others", "--exclude-standard"):
        raise RuntimeError("freeze_requires_staged_clean_candidate")
    receipt = {"schemaVersion": 2, "kind": "candidate-freeze", "branch": git(root, "branch", "--show-current"), "baseSha": git(root, "rev-parse", "origin/main"), "headAtFreeze": git(root, "rev-parse", "HEAD"), "candidateTree": git(root, "write-tree"), "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "checks": []}
    write_private(state_dir(root) / "candidate-freeze.json", receipt)
    return receipt

def policy(root):
    return json.loads((root / "config/dev-delivery-v2-impact-policy.json").read_text())

def record(root, check, profile, fixture_root=None):
    spec = policy(root)["requiredChecks"].get(check)
    if not spec or spec["profile"] != profile: raise RuntimeError("evidence_profile_not_authorized")
    file = state_dir(root) / "candidate-freeze.json"
    value = json.loads(file.read_text())
    if any(c["id"] == check for c in value["checks"]): raise RuntimeError("duplicate_evidence_check")
    if git(root, "write-tree") != value["candidateTree"]: raise RuntimeError("candidate_tree_changed_before_evidence")
    command = spec["command"]
    if command == ["internal", "fixture"]:
        result = fixture(root, fixture_root)
        exit_code, observed = 0, result
    else:
        run = subprocess.run(command, cwd=root, text=True, capture_output=True)
        exit_code, observed = run.returncode, {"stdoutSha256": hashlib.sha256(run.stdout.encode()).hexdigest(), "stderrSha256": hashlib.sha256(run.stderr.encode()).hexdigest()}
    if git(root, "write-tree") != value["candidateTree"]: raise RuntimeError("candidate_tree_changed_during_evidence")
    value["checks"].append({"id": check, "profile": profile, "command": command, "exitCode": exit_code, "candidateTree": value["candidateTree"], "observed": observed, "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})
    write_private(file, value); return value

def close(root):
    file = state_dir(root) / "candidate-freeze.json"; value = json.loads(file.read_text())
    policy = json.loads((root / "config/dev-delivery-v2-impact-policy.json").read_text())
    seen = {c["id"]: c["exitCode"] for c in value["checks"]}
    missing = [c for c in policy["requiredChecks"] if seen.get(c) != 0]
    if missing: raise RuntimeError("required_evidence_missing:" + ",".join(missing))
    tree = git(root, "show", "-s", "--format=%T", "HEAD")
    if tree != value["candidateTree"]: raise RuntimeError("checkpoint_tree_does_not_match_candidate")
    closure = {"schemaVersion": 2, "kind": "checkpoint-closure", "candidateTree": value["candidateTree"], "checkpointCommit": git(root, "rev-parse", "HEAD"), "checkpointTree": tree, "externalWritePerformed": False}
    write_private(state_dir(root) / "checkpoint-closure.json", closure); return closure

def fixture(root, fixture_root):
    # This performs no subprocesses other than local hashing and writes nothing.
    if not fixture_root: raise RuntimeError("explicit_fixture_root_required")
    target = Path(fixture_root).resolve()
    if target == root or not target.is_dir(): raise RuntimeError("fixture_root_must_be_separate_existing_directory")
    c = contract(root)
    if c["repoRoot"]["networkAllowedInFixtureMode"] or c["repoRoot"]["mutationAllowedInFixtureMode"]: raise RuntimeError("fixture_boundary_widened")
    def snapshot():
        entries = []
        for item in sorted(target.rglob("*")):
            if item.is_file(): entries.append((str(item.relative_to(target)), hashlib.sha256(item.read_bytes()).hexdigest()))
        return hashlib.sha256(json.dumps(entries).encode()).hexdigest()
    before, after = snapshot(), snapshot()
    if before != after: raise RuntimeError("fixture_mutation_detected")
    return {"schemaVersion": 2, "decision": "pass", "fixtureMode": "offline", "fixtureRoot": str(target), "networkContacted": False, "mutationPerformed": False, "fixtureSnapshot": before}

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("command", choices=("inspect", "ci-classify", "freeze", "record", "close", "fixture")); parser.add_argument("--repo-root"); parser.add_argument("--base"); parser.add_argument("--head"); parser.add_argument("--check"); parser.add_argument("--profile"); parser.add_argument("--fixture-root"); parser.add_argument("--json", action="store_true")
    a = parser.parse_args(); root = production_root(a.repo_root)
    if a.command in ("inspect", "ci-classify"): out = report(root, a.base, a.head)
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
