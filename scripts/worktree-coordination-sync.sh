#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
ACTIVE_WT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)
      REPO_ROOT="${2:-}"
      shift 2
      ;;
    --active)
      ACTIVE_WT="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$REPO_ROOT" ]]; then
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "$REPO_ROOT" ]]; then
  echo "ERROR: --repo-root missing and not in git repo" >&2
  exit 1
fi

COMMON_GIT_DIR="$(git -C "$REPO_ROOT" rev-parse --git-common-dir 2>/dev/null || true)"
if [[ -z "$COMMON_GIT_DIR" ]]; then
  echo "ERROR: git common dir not resolvable for $REPO_ROOT" >&2
  exit 1
fi
if [[ "$COMMON_GIT_DIR" != /* ]]; then
  COMMON_GIT_DIR="$(cd "$REPO_ROOT/$COMMON_GIT_DIR" && pwd -P)"
fi

PRIMARY_REPO_ROOT="$(cd "$COMMON_GIT_DIR/.." && pwd -P)"
WORKSPACE_DIR="$(cd "$PRIMARY_REPO_ROOT/.." && pwd -P)"
WT_BASE="$WORKSPACE_DIR/.worktrees"
mkdir -p "$WT_BASE"

if [[ -z "$ACTIVE_WT" ]]; then
  ACTIVE_WT="$REPO_ROOT"
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ACTIVE_FILE="$WT_BASE/ACTIVE_WORKTREE.md"
SNAP_FILE="$WT_BASE/ACTIVE_WORKTREES.md"

safe_git_text() {
  local cwd="$1"
  shift
  git -C "$cwd" "$@" 2>/dev/null || true
}

safe_status_text() {
  local cwd="$1"
  safe_git_text "$cwd" status --short
}

safe_status_line_count() {
  local cwd="$1"
  safe_status_text "$cwd" | sed '/^$/d' | wc -l | tr -d ' '
}

worktree_is_accessible() {
  local cwd="$1"
  git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

emit_task_start_evidence() {
  local cwd="$1"
  local marker
  marker="$(git -C "$cwd" rev-parse --git-path worktree-active.json 2>/dev/null || true)"
  if [[ -z "$marker" || ! -f "$marker" ]]; then
    echo "task_start_marker: missing"
    return
  fi

  python3 - <<'PY' "$marker"
import json
import sys
from pathlib import Path

marker = Path(sys.argv[1])
try:
    payload = json.loads(marker.read_text(encoding="utf-8"))
except Exception:
    print("task_start_marker: unreadable")
    print(f"task_start_marker_path: {marker}")
    sys.exit(0)

def emit(key, value):
    if value in (None, "", []):
        return
    print(f"{key}: {value}")

print("task_start_marker: present")
emit("task_start_branch", payload.get("branch"))
emit("task_start_started_at", payload.get("started_at"))
emit("task_start_resume", payload.get("resume"))
emit("doc_sync_label", payload.get("doc_sync_label"))
emit("doc_sync_repo_id", payload.get("doc_sync_repo_id"))
emit("doc_sync_path_prefix", payload.get("doc_sync_path_prefix"))
emit("task_start_marker_path", marker)
PY
}

ACTIVE_BRANCH="$(safe_git_text "$ACTIVE_WT" branch --show-current)"
ACTIVE_HEAD="$(safe_git_text "$ACTIVE_WT" rev-parse --short HEAD)"
ACTIVE_STATUS="$(safe_status_line_count "$ACTIVE_WT")"

cat > "$ACTIVE_FILE" <<EOF
# ACTIVE WORKTREE

updated_utc: ${NOW}
path: ${ACTIVE_WT}
repo: ${PRIMARY_REPO_ROOT}
branch: ${ACTIVE_BRANCH:-unknown}
head: ${ACTIVE_HEAD:-unknown}
status_short_line_count: ${ACTIVE_STATUS:-unknown}
EOF

emit_task_start_evidence "$ACTIVE_WT" >> "$ACTIVE_FILE"

WT_PATHS=()
while IFS= read -r line; do
  WT_PATHS+=("${line#worktree }")
done < <(git -C "$REPO_ROOT" worktree list --porcelain | awk '/^worktree /{print $0}')

{
  echo "# ACTIVE WORKTREES SNAPSHOT"
  echo
  echo "updated_utc: $NOW"
  echo "repo: $PRIMARY_REPO_ROOT"
  echo "count: ${#WT_PATHS[@]}"
  echo

  DIRTY_TOTAL=0
  INVALID_TOTAL=0
  for WT in "${WT_PATHS[@]}"; do
    if ! worktree_is_accessible "$WT"; then
      INVALID_TOTAL=$((INVALID_TOTAL + 1))
      echo "## $WT"
      echo "branch: unknown"
      echo "head: unknown"
      echo "dirty: unknown"
      echo "status_short_line_count: unknown"
      echo "invalid_worktree: yes"
      echo "note: skipped because git cannot access this worktree path (likely prunable or missing)."
      echo
      continue
    fi

    BRANCH="$(safe_git_text "$WT" branch --show-current)"
    HEAD="$(safe_git_text "$WT" rev-parse --short HEAD)"
    STATUS_LINES="$(safe_status_line_count "$WT")"
    DIRTY="no"
    if [[ "$STATUS_LINES" != "0" ]]; then
      DIRTY="yes"
      DIRTY_TOTAL=$((DIRTY_TOTAL + 1))
    fi

    echo "## $WT"
    echo "branch: ${BRANCH:-unknown}"
    echo "head: ${HEAD:-unknown}"
    echo "dirty: $DIRTY"
    echo "status_short_line_count: $STATUS_LINES"
    echo "invalid_worktree: no"
    emit_task_start_evidence "$WT"

    if [[ "$STATUS_LINES" != "0" ]]; then
      echo "changed_files:"
      safe_status_text "$WT" | sed 's/^/  - /'
    fi
    echo
  done

  echo "summary_dirty_worktrees: $DIRTY_TOTAL"
  echo "summary_invalid_worktrees: $INVALID_TOTAL"
} > "$SNAP_FILE"

echo "[worktree-coordination-sync] wrote: $ACTIVE_FILE"
echo "[worktree-coordination-sync] wrote: $SNAP_FILE"
