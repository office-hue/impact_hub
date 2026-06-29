#!/usr/bin/env bash
set -euo pipefail

JSON=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/worktree-readiness-check.sh [--json]

Checks the minimum local readiness contract for the impact_hub worktree starter lane.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --json)
      JSON=1
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "ERROR: nem git repoban futsz." >&2
  exit 1
fi

cd "$REPO_ROOT"

STATUS="allowed"
DECISION="allowed"
REASONS=()
WARNINGS=()

require_file() {
  local path="$1"
  local reason="$2"
  if [[ ! -e "$path" ]]; then
    REASONS+=("$reason")
  fi
}

warn_if_missing() {
  local path="$1"
  local warning="$2"
  if [[ ! -e "$path" ]]; then
    WARNINGS+=("$warning")
  fi
}

require_cmd() {
  local cmd="$1"
  local reason="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    REASONS+=("$reason")
  fi
}

warn_cmd() {
  local cmd="$1"
  local warning="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    WARNINGS+=("$warning")
  fi
}

require_cmd "git" "missing-git"
require_cmd "python3" "missing-python3"
require_file "docs/impact-hub-doc-sync-map-2026-06-23.md" "missing-local-doc-sync-map"
require_file "docs/impact-hub-governance-system-plan-2026-06-16.md" "missing-local-governance-plan"
require_file "docs/impact-hub-env-auth-runtime-guard-adapter-2026-06-17.md" "missing-local-runtime-adapter"
require_file "scripts/safe-repo-audit.sh" "missing-safe-repo-audit"
require_file "scripts/git-health-check.sh" "missing-git-health-check"
require_file "scripts/start-feature-worktree.sh" "missing-start-feature-worktree"
require_file "scripts/worktree-task-start-guard.sh" "missing-worktree-task-start-guard"
require_file "scripts/worktree-coordination-sync.sh" "missing-worktree-coordination-sync"
require_file "notes.md" "missing-notes"
require_file "system-status-snapshot.md" "missing-system-status-snapshot"

HOOK_PRE_PUSH="$(git rev-parse --git-path hooks/pre-push 2>/dev/null || true)"
HOOK_PRE_COMMIT="$(git rev-parse --git-path hooks/pre-commit 2>/dev/null || true)"

if [[ -n "$HOOK_PRE_PUSH" && "$HOOK_PRE_PUSH" != /* ]]; then
  HOOK_PRE_PUSH="$REPO_ROOT/$HOOK_PRE_PUSH"
fi
if [[ -n "$HOOK_PRE_COMMIT" && "$HOOK_PRE_COMMIT" != /* ]]; then
  HOOK_PRE_COMMIT="$REPO_ROOT/$HOOK_PRE_COMMIT"
fi

warn_if_missing "${HOOK_PRE_PUSH:-}" "missing-pre-push-hook"
warn_if_missing "${HOOK_PRE_COMMIT:-}" "missing-pre-commit-hook"
warn_cmd "rg" "missing-rg"

if ((${#REASONS[@]})); then
  STATUS="blocked"
  DECISION="blocked"
elif ((${#WARNINGS[@]})); then
  STATUS="degraded"
  DECISION="degraded"
fi

if [[ "$JSON" -eq 1 ]]; then
  reasons_blob=""
  warnings_blob=""
  if ((${#REASONS[@]})); then
    reasons_blob="$(printf '%s\n' "${REASONS[@]}")"
  fi
  if ((${#WARNINGS[@]})); then
    warnings_blob="$(printf '%s\n' "${WARNINGS[@]}")"
  fi
  python3 - <<'PY' "$STATUS" "$DECISION" "$REPO_ROOT" "$reasons_blob" "$warnings_blob"
import json
import sys

status, decision, repo_root, reasons_blob, warnings_blob = sys.argv[1:6]
reasons = [line for line in reasons_blob.splitlines() if line]
warnings = [line for line in warnings_blob.splitlines() if line]

payload = {
    "status": status,
    "decision": decision,
    "repoRoot": repo_root,
    "blockingReasons": reasons,
    "warnings": warnings,
}
print(json.dumps(payload, ensure_ascii=True, indent=2))
PY
  exit 0
fi

echo "[worktree-readiness] status: $STATUS"
echo "[worktree-readiness] decision: $DECISION"

if ((${#REASONS[@]})); then
  printf '[worktree-readiness] blocking: %s\n' "${REASONS[@]}"
fi

if ((${#WARNINGS[@]})); then
  printf '[worktree-readiness] warning: %s\n' "${WARNINGS[@]}"
fi
