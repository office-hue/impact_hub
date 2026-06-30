#!/usr/bin/env bash
set -euo pipefail

JSON=0
MODE="local"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/worktree-continuity-guard.sh [--json] [--mode local|push]

Validates that the current impact_hub worktree has live task-start and
coordination evidence before commit/push continuity lanes rely on it.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      JSON=1
      shift
      ;;
    --mode)
      MODE="${2:-}"
      [[ -n "$MODE" ]] || { echo "Missing value for --mode" >&2; exit 1; }
      shift 2
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$MODE" != "local" && "$MODE" != "push" ]]; then
  echo "ERROR: --mode must be local or push (got: $MODE)" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "ERROR: nem git repoban futsz." >&2
  exit 1
fi

cd "$REPO_ROOT"

MARKER_FILE="$(git rev-parse --git-path worktree-active.json 2>/dev/null || true)"
ARTIFACT_FILE="$(git rev-parse --git-path worktree-task-start-decision.json 2>/dev/null || true)"

COMMON_GIT_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [[ -n "$COMMON_GIT_DIR" && "$COMMON_GIT_DIR" != /* ]]; then
  COMMON_GIT_DIR="$(cd "$REPO_ROOT/$COMMON_GIT_DIR" && pwd -P)"
fi
PRIMARY_REPO_ROOT="$(cd "$COMMON_GIT_DIR/.." && pwd -P)"
WORKSPACE_DIR="$(cd "$PRIMARY_REPO_ROOT/.." && pwd -P)"
WT_BASE="$WORKSPACE_DIR/.worktrees"
ACTIVE_FILE="$WT_BASE/ACTIVE_WORKTREE.md"
SNAP_FILE="$WT_BASE/ACTIVE_WORKTREES.md"

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
CURRENT_PATH="$REPO_ROOT"

STATUS="allowed"
DECISION="allowed"
BLOCKING_REASONS=()
WARNINGS=()

require_file() {
  local path="$1"
  local reason="$2"
  if [[ ! -e "$path" ]]; then
    BLOCKING_REASONS+=("$reason")
  fi
}

require_file "docs/impact-hub-doc-sync-map-2026-06-23.md" "missing-local-doc-sync-map"
require_file "docs/impact-hub-governance-system-plan-2026-06-16.md" "missing-local-governance-plan"
require_file "scripts/worktree-task-start.sh" "missing-worktree-task-start"
require_file "scripts/worktree-task-start-guard.sh" "missing-worktree-task-start-guard"
require_file "scripts/worktree-coordination-sync.sh" "missing-worktree-coordination-sync"
require_file "${MARKER_FILE:-/nonexistent}" "missing-worktree-active-marker"
require_file "${ARTIFACT_FILE:-/nonexistent}" "missing-task-start-decision-artifact"
require_file "$ACTIVE_FILE" "missing-active-worktree-snapshot"
require_file "$SNAP_FILE" "missing-active-worktrees-snapshot"
require_file "notes.md" "missing-notes"
require_file "system-status-snapshot.md" "missing-system-status-snapshot"

reasons_blob=""
warnings_blob=""
python_payload=""

if ((${#BLOCKING_REASONS[@]} == 0)); then
  python_payload="$(python3 - <<'PY' \
    "$MARKER_FILE" "$ARTIFACT_FILE" "$ACTIVE_FILE" "$SNAP_FILE" "$CURRENT_BRANCH" "$CURRENT_PATH" "$MODE"
import json
import sys
from pathlib import Path

marker_path = Path(sys.argv[1])
artifact_path = Path(sys.argv[2])
active_path = Path(sys.argv[3])
snapshot_path = Path(sys.argv[4])
current_branch = sys.argv[5]
current_path = sys.argv[6]
mode = sys.argv[7]

blocking = []
warnings = []

def load_json(path: Path, kind: str):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        blocking.append(f"unreadable-{kind}")
        return {}

marker = load_json(marker_path, "worktree-active-marker")
artifact = load_json(artifact_path, "task-start-decision-artifact")

marker_branch = marker.get("branch") or ""
marker_repo_path = marker.get("path") or ""
if marker_branch != current_branch:
    blocking.append("marker-branch-mismatch")
if marker_repo_path != current_path:
    blocking.append("marker-path-mismatch")

artifact_branch = artifact.get("currentBranch") or ""
artifact_worktree = artifact.get("currentWorktree") or ""
artifact_decision = artifact.get("decision") or ""
artifact_status = artifact.get("status") or ""
if artifact_branch != current_branch:
    blocking.append("decision-branch-mismatch")
if artifact_worktree != current_path:
    blocking.append("decision-worktree-mismatch")
if artifact_decision == "blocked" or artifact_status == "blocked":
    blocking.append("task-start-decision-blocked")
elif artifact_decision == "degraded" or artifact_status == "degraded":
    warnings.append("task-start-decision-degraded")

if not artifact.get("docSyncLabel"):
    warnings.append("missing-doc-sync-label")
if not artifact.get("docSyncRepoId"):
    warnings.append("missing-doc-sync-repo-id")
if not artifact.get("docSyncPathPrefix"):
    warnings.append("missing-doc-sync-path-prefix")

active_text = active_path.read_text(encoding="utf-8")
if f"path: {current_path}" not in active_text:
    blocking.append("active-worktree-path-mismatch")
if f"branch: {current_branch}" not in active_text:
    blocking.append("active-worktree-branch-mismatch")
if "task_start_decision: present" not in active_text:
    blocking.append("active-worktree-missing-decision-evidence")
if "task_start_decision_status:" not in active_text:
    blocking.append("active-worktree-missing-decision-status")
if "task_start_decision_value:" not in active_text:
    blocking.append("active-worktree-missing-decision-value")

snapshot_text = snapshot_path.read_text(encoding="utf-8")
section_header = f"## {current_path}"
if section_header not in snapshot_text:
    blocking.append("active-worktrees-missing-current-section")
else:
    current_section = snapshot_text.split(section_header, 1)[1]
    if "\n## " in current_section:
        current_section = current_section.split("\n## ", 1)[0]
    if f"branch: {current_branch}" not in current_section:
        blocking.append("active-worktrees-branch-mismatch")
    if "task_start_decision: present" not in current_section:
        blocking.append("active-worktrees-missing-decision-evidence")
    if "task_start_decision_status:" not in current_section:
        blocking.append("active-worktrees-missing-decision-status")
    if "task_start_decision_value:" not in current_section:
        blocking.append("active-worktrees-missing-decision-value")

if mode == "push" and "status_short_line_count:" not in active_text:
    warnings.append("active-worktree-missing-status-count")

status = "allowed"
decision = "allowed"
if blocking:
    status = "blocked"
    decision = "blocked"
elif warnings:
    status = "degraded"
    decision = "degraded"

payload = {
    "status": status,
    "decision": decision,
    "mode": mode,
    "repoRoot": current_path,
    "currentBranch": current_branch,
    "markerPath": str(marker_path),
    "artifactPath": str(artifact_path),
    "coordinationActivePath": str(active_path),
    "coordinationSnapshotPath": str(snapshot_path),
    "blockingReasons": blocking,
    "warnings": warnings,
}
print(json.dumps(payload, ensure_ascii=True, indent=2))
PY
)"
fi

if [[ -n "$python_payload" ]]; then
  reasons_blob="$(python3 - <<'PY' "$python_payload"
import json, sys
payload = json.loads(sys.argv[1])
for item in payload.get("blockingReasons", []):
    print(item)
PY
)"
  warnings_blob="$(python3 - <<'PY' "$python_payload"
import json, sys
payload = json.loads(sys.argv[1])
for item in payload.get("warnings", []):
    print(item)
PY
)"
fi

if [[ -n "$reasons_blob" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && BLOCKING_REASONS+=("$line")
  done <<< "$reasons_blob"
fi
if [[ -n "$warnings_blob" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && WARNINGS+=("$line")
  done <<< "$warnings_blob"
fi

if ((${#BLOCKING_REASONS[@]})); then
  STATUS="blocked"
  DECISION="blocked"
elif ((${#WARNINGS[@]})); then
  STATUS="degraded"
  DECISION="degraded"
fi

payload="$(python3 - <<'PY' \
  "$STATUS" "$DECISION" "$MODE" "$REPO_ROOT" "$CURRENT_BRANCH" "${MARKER_FILE:-}" "${ARTIFACT_FILE:-}" "$ACTIVE_FILE" "$SNAP_FILE" \
  "$(printf '%s\n' "${BLOCKING_REASONS[@]-}")" "$(printf '%s\n' "${WARNINGS[@]-}")"
import json
import sys

(
    status,
    decision,
    mode,
    repo_root,
    current_branch,
    marker_path,
    artifact_path,
    active_path,
    snapshot_path,
    reasons_blob,
    warnings_blob,
) = sys.argv[1:12]

payload = {
    "status": status,
    "decision": decision,
    "mode": mode,
    "repoRoot": repo_root,
    "currentBranch": current_branch or None,
    "markerPath": marker_path or None,
    "artifactPath": artifact_path or None,
    "coordinationActivePath": active_path or None,
    "coordinationSnapshotPath": snapshot_path or None,
    "blockingReasons": [line for line in reasons_blob.splitlines() if line],
    "warnings": [line for line in warnings_blob.splitlines() if line],
}
print(json.dumps(payload, ensure_ascii=True, indent=2))
PY
)"

if [[ "$JSON" -eq 1 ]]; then
  printf '%s\n' "$payload"
else
  echo "[worktree-continuity-guard] mode: $MODE"
  echo "[worktree-continuity-guard] status: $STATUS"
  echo "[worktree-continuity-guard] decision: $DECISION"
  echo "[worktree-continuity-guard] marker: ${MARKER_FILE:-unavailable}"
  echo "[worktree-continuity-guard] artifact: ${ARTIFACT_FILE:-unavailable}"
  echo "[worktree-continuity-guard] active_snapshot: $ACTIVE_FILE"
  echo "[worktree-continuity-guard] workspace_snapshot: $SNAP_FILE"
  if ((${#BLOCKING_REASONS[@]})); then
    printf '[worktree-continuity-guard] blocking: %s\n' "${BLOCKING_REASONS[@]}"
  fi
  if ((${#WARNINGS[@]})); then
    printf '[worktree-continuity-guard] warning: %s\n' "${WARNINGS[@]}"
  fi
fi

if [[ "$STATUS" == "blocked" ]]; then
  exit 1
fi

exit 0
