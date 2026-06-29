#!/usr/bin/env bash
set -euo pipefail

JSON=0
DOC_SYNC_LABEL=""
DOC_SYNC_REPO_ID=""
DOC_SYNC_PATH_PREFIX=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/worktree-task-start-guard.sh [--json] [--doc-sync-label <label>] [--doc-sync-repo-id <id>] [--doc-sync-path-prefix <prefix>]

Writes a repo-local task-start decision artifact for the impact_hub runtime starter lane.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      JSON=1
      shift
      ;;
    --doc-sync-label)
      DOC_SYNC_LABEL="${2:-}"
      [[ -n "$DOC_SYNC_LABEL" ]] || { echo "Missing value for --doc-sync-label" >&2; exit 1; }
      shift 2
      ;;
    --doc-sync-repo-id)
      DOC_SYNC_REPO_ID="${2:-}"
      [[ -n "$DOC_SYNC_REPO_ID" ]] || { echo "Missing value for --doc-sync-repo-id" >&2; exit 1; }
      shift 2
      ;;
    --doc-sync-path-prefix)
      DOC_SYNC_PATH_PREFIX="${2:-}"
      [[ -n "$DOC_SYNC_PATH_PREFIX" ]] || { echo "Missing value for --doc-sync-path-prefix" >&2; exit 1; }
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

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "ERROR: nem git repoban futsz." >&2
  exit 1
fi

cd "$REPO_ROOT"

MARKER_FILE="$(git rev-parse --git-path worktree-active.json 2>/dev/null || true)"
ARTIFACT_FILE="$(git rev-parse --git-path worktree-task-start-decision.json 2>/dev/null || true)"
COORD_ACTIVE_FILE=""
COORD_SNAPSHOT_FILE=""

COMMON_GIT_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [[ -n "$COMMON_GIT_DIR" ]]; then
  if [[ "$COMMON_GIT_DIR" != /* ]]; then
    COMMON_GIT_DIR="$(cd "$REPO_ROOT/$COMMON_GIT_DIR" && pwd -P)"
  fi
  PRIMARY_REPO_ROOT="$(cd "$COMMON_GIT_DIR/.." && pwd -P)"
  WORKSPACE_DIR="$(cd "$PRIMARY_REPO_ROOT/.." && pwd -P)"
  WT_BASE="$WORKSPACE_DIR/.worktrees"
  COORD_ACTIVE_FILE="$WT_BASE/ACTIVE_WORKTREE.md"
  COORD_SNAPSHOT_FILE="$WT_BASE/ACTIVE_WORKTREES.md"
fi

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

warn_if_missing() {
  local path="$1"
  local warning="$2"
  if [[ ! -e "$path" ]]; then
    WARNINGS+=("$warning")
  fi
}

require_file "docs/impact-hub-doc-sync-map-2026-06-23.md" "missing-local-doc-sync-map"
require_file "docs/impact-hub-governance-system-plan-2026-06-16.md" "missing-local-governance-plan"
require_file "docs/impact-hub-env-auth-runtime-guard-adapter-2026-06-17.md" "missing-local-runtime-adapter"
require_file "scripts/worktree-readiness-check.sh" "missing-worktree-readiness-check"
require_file "scripts/worktree-coordination-sync.sh" "missing-worktree-coordination-sync"
require_file "notes.md" "missing-notes"
require_file "system-status-snapshot.md" "missing-system-status-snapshot"
require_file "${MARKER_FILE:-/nonexistent}" "missing-worktree-active-marker"
warn_if_missing "${COORD_ACTIVE_FILE:-/nonexistent}" "missing-active-worktree-snapshot"
warn_if_missing "${COORD_SNAPSHOT_FILE:-/nonexistent}" "missing-active-worktrees-snapshot"

if [[ -f "${MARKER_FILE:-}" ]]; then
  MARKER_VALUES="$(python3 - <<'PY' "$MARKER_FILE"
import json
import sys

payload = json.loads(open(sys.argv[1], encoding="utf-8").read())
for key in ("doc_sync_label", "doc_sync_repo_id", "doc_sync_path_prefix", "branch", "path"):
    print(payload.get(key, ""))
PY
)"
  MARKER_DOC_SYNC_LABEL="$(printf '%s\n' "$MARKER_VALUES" | sed -n '1p')"
  MARKER_DOC_SYNC_REPO_ID="$(printf '%s\n' "$MARKER_VALUES" | sed -n '2p')"
  MARKER_DOC_SYNC_PATH_PREFIX="$(printf '%s\n' "$MARKER_VALUES" | sed -n '3p')"
  MARKER_BRANCH="$(printf '%s\n' "$MARKER_VALUES" | sed -n '4p')"
  MARKER_PATH="$(printf '%s\n' "$MARKER_VALUES" | sed -n '5p')"
else
  MARKER_DOC_SYNC_LABEL=""
  MARKER_DOC_SYNC_REPO_ID=""
  MARKER_DOC_SYNC_PATH_PREFIX=""
  MARKER_BRANCH=""
  MARKER_PATH=""
fi

EFFECTIVE_DOC_SYNC_LABEL="${DOC_SYNC_LABEL:-$MARKER_DOC_SYNC_LABEL}"
EFFECTIVE_DOC_SYNC_REPO_ID="${DOC_SYNC_REPO_ID:-$MARKER_DOC_SYNC_REPO_ID}"
EFFECTIVE_DOC_SYNC_PATH_PREFIX="${DOC_SYNC_PATH_PREFIX:-$MARKER_DOC_SYNC_PATH_PREFIX}"

if [[ -n "$DOC_SYNC_LABEL" && -n "$MARKER_DOC_SYNC_LABEL" && "$DOC_SYNC_LABEL" != "$MARKER_DOC_SYNC_LABEL" ]]; then
  BLOCKING_REASONS+=("doc-sync-label-mismatch")
fi
if [[ -n "$DOC_SYNC_REPO_ID" && -n "$MARKER_DOC_SYNC_REPO_ID" && "$DOC_SYNC_REPO_ID" != "$MARKER_DOC_SYNC_REPO_ID" ]]; then
  BLOCKING_REASONS+=("doc-sync-repo-id-mismatch")
fi
if [[ -n "$DOC_SYNC_PATH_PREFIX" && -n "$MARKER_DOC_SYNC_PATH_PREFIX" && "$DOC_SYNC_PATH_PREFIX" != "$MARKER_DOC_SYNC_PATH_PREFIX" ]]; then
  BLOCKING_REASONS+=("doc-sync-path-prefix-mismatch")
fi

if [[ -n "$EFFECTIVE_DOC_SYNC_PATH_PREFIX" ]]; then
  case "$EFFECTIVE_DOC_SYNC_PATH_PREFIX" in
    docs/*|docs)
      ;;
    *)
      WARNINGS+=("non-docs-path-prefix")
      ;;
  esac
fi

if ((${#BLOCKING_REASONS[@]})); then
  STATUS="blocked"
  DECISION="blocked"
elif ((${#WARNINGS[@]})); then
  STATUS="degraded"
  DECISION="degraded"
fi

mkdir -p "$(dirname "$ARTIFACT_FILE")"

reasons_blob=""
warnings_blob=""
if ((${#BLOCKING_REASONS[@]})); then
  reasons_blob="$(printf '%s\n' "${BLOCKING_REASONS[@]}")"
fi
if ((${#WARNINGS[@]})); then
  warnings_blob="$(printf '%s\n' "${WARNINGS[@]}")"
fi

PAYLOAD="$(python3 - <<'PY' \
  "$STATUS" "$DECISION" "$REPO_ROOT" "$ARTIFACT_FILE" "${MARKER_FILE:-}" "${COORD_ACTIVE_FILE:-}" "${COORD_SNAPSHOT_FILE:-}" \
  "$EFFECTIVE_DOC_SYNC_LABEL" "$EFFECTIVE_DOC_SYNC_REPO_ID" "$EFFECTIVE_DOC_SYNC_PATH_PREFIX" \
  "$MARKER_BRANCH" "$MARKER_PATH" "$reasons_blob" "$warnings_blob"
import json
import sys

(
    status,
    decision,
    repo_root,
    artifact_file,
    marker_file,
    coord_active_file,
    coord_snapshot_file,
    doc_sync_label,
    doc_sync_repo_id,
    doc_sync_path_prefix,
    marker_branch,
    marker_path,
    reasons_blob,
    warnings_blob,
) = sys.argv[1:15]

payload = {
    "status": status,
    "decision": decision,
    "repoRoot": repo_root,
    "artifactPath": artifact_file,
    "markerPath": marker_file or None,
    "coordinationActivePath": coord_active_file or None,
    "coordinationSnapshotPath": coord_snapshot_file or None,
    "docSyncLabel": doc_sync_label or None,
    "docSyncRepoId": doc_sync_repo_id or None,
    "docSyncPathPrefix": doc_sync_path_prefix or None,
    "currentBranch": marker_branch or None,
    "currentWorktree": marker_path or None,
    "blockingReasons": [line for line in reasons_blob.splitlines() if line],
    "warnings": [line for line in warnings_blob.splitlines() if line],
}

print(json.dumps(payload, ensure_ascii=True, indent=2))
PY
)"

printf '%s\n' "$PAYLOAD" > "$ARTIFACT_FILE"

if [[ "$JSON" -eq 1 ]]; then
  printf '%s\n' "$PAYLOAD"
  exit 0
fi

echo "[worktree-task-start-guard] status: $STATUS"
echo "[worktree-task-start-guard] decision: $DECISION"
echo "[worktree-task-start-guard] artifact: $ARTIFACT_FILE"
if [[ -n "$EFFECTIVE_DOC_SYNC_LABEL" ]]; then
  echo "[worktree-task-start-guard] doc_sync_label: $EFFECTIVE_DOC_SYNC_LABEL"
fi
if [[ -n "$EFFECTIVE_DOC_SYNC_REPO_ID" ]]; then
  echo "[worktree-task-start-guard] doc_sync_repo_id: $EFFECTIVE_DOC_SYNC_REPO_ID"
fi
if [[ -n "$EFFECTIVE_DOC_SYNC_PATH_PREFIX" ]]; then
  echo "[worktree-task-start-guard] doc_sync_path_prefix: $EFFECTIVE_DOC_SYNC_PATH_PREFIX"
fi
if ((${#BLOCKING_REASONS[@]})); then
  printf '[worktree-task-start-guard] blocking: %s\n' "${BLOCKING_REASONS[@]}"
fi
if ((${#WARNINGS[@]})); then
  printf '[worktree-task-start-guard] warning: %s\n' "${WARNINGS[@]}"
fi
