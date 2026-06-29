#!/usr/bin/env bash
set -euo pipefail

RESUME=0
FEATURE_BRANCH=""
DOC_SYNC_LABEL=""
DOC_SYNC_REPO_ID=""
DOC_SYNC_PATH_PREFIX=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/worktree-task-start.sh <feature-branch> [--resume] [--doc-sync-label <label>] [--doc-sync-repo-id <id>] [--doc-sync-path-prefix <prefix>]

Options:
  --resume                    Reuse an existing branch/worktree instead of failing
  --doc-sync-label <label>    Optional logical doc-sync scope label
  --doc-sync-repo-id <id>     Optional doc-sync repo scope
  --doc-sync-path-prefix <p>  Optional doc-sync path family
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help|help)
      usage
      exit 0
      ;;
  esac
done

ARGS=("$@")
for ((i=0; i<${#ARGS[@]}; i++)); do
  arg="${ARGS[$i]}"
  case "$arg" in
    --resume)
      RESUME=1
      ;;
    --doc-sync-label)
      DOC_SYNC_LABEL="${ARGS[$((i + 1))]:-}"
      [[ -n "$DOC_SYNC_LABEL" ]] || { echo "Missing value for --doc-sync-label" >&2; exit 1; }
      i=$((i + 1))
      ;;
    --doc-sync-repo-id)
      DOC_SYNC_REPO_ID="${ARGS[$((i + 1))]:-}"
      [[ -n "$DOC_SYNC_REPO_ID" ]] || { echo "Missing value for --doc-sync-repo-id" >&2; exit 1; }
      i=$((i + 1))
      ;;
    --doc-sync-path-prefix)
      DOC_SYNC_PATH_PREFIX="${ARGS[$((i + 1))]:-}"
      [[ -n "$DOC_SYNC_PATH_PREFIX" ]] || { echo "Missing value for --doc-sync-path-prefix" >&2; exit 1; }
      i=$((i + 1))
      ;;
    -*)
      echo "Unknown flag: $arg" >&2
      exit 1
      ;;
    *)
      if [[ -z "$FEATURE_BRANCH" ]]; then
        FEATURE_BRANCH="$arg"
      else
        echo "Unexpected positional argument: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$FEATURE_BRANCH" ]]; then
  usage
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "ERROR: nem git repoban futsz." >&2
  exit 1
fi

cd "$REPO_ROOT"

COMMON_GIT_DIR="$(git rev-parse --git-common-dir)"
if [[ "$COMMON_GIT_DIR" != /* ]]; then
  COMMON_GIT_DIR="$(cd "$REPO_ROOT/$COMMON_GIT_DIR" && pwd)"
fi
PRIMARY_REPO_ROOT="$(cd "$COMMON_GIT_DIR/.." && pwd)"
WORKSPACE_DIR="$(cd "${PRIMARY_REPO_ROOT}/.." && pwd)"
WT_BASE="${WORKSPACE_DIR}/.worktrees"
mkdir -p "$WT_BASE"

REPO_NAME="$(basename "$PRIMARY_REPO_ROOT")"
SANITIZED_BRANCH="${FEATURE_BRANCH//\//-}"
WT_DIR="${WT_BASE}/${REPO_NAME}-${SANITIZED_BRANCH}"

resolve_existing_worktree_path() {
  local feature_branch="$1"
  python3 - <<'PY' "$feature_branch"
import subprocess
import sys

feature_branch = sys.argv[1]
current_path = None

out = subprocess.run(
    ["git", "worktree", "list", "--porcelain"],
    capture_output=True,
    text=True,
    check=True,
).stdout.splitlines()

branch = None
for line in out:
    if line.startswith("worktree "):
        current_path = line.split(" ", 1)[1]
        branch = None
    elif line.startswith("branch "):
        branch = line.split(" ", 1)[1].removeprefix("refs/heads/")
        if branch == feature_branch:
            print(current_path)
            sys.exit(0)

sys.exit(1)
PY
}

BRANCH_LOCAL=0
BRANCH_REMOTE=0
WT_EXISTS=0

if git show-ref --verify --quiet "refs/heads/${FEATURE_BRANCH}" 2>/dev/null; then
  BRANCH_LOCAL=1
fi
if git ls-remote --exit-code --heads origin "$FEATURE_BRANCH" >/dev/null 2>&1; then
  BRANCH_REMOTE=1
fi
if [[ -e "$WT_DIR" ]]; then
  WT_EXISTS=1
fi

ALREADY_EXISTS=$((BRANCH_LOCAL + BRANCH_REMOTE + WT_EXISTS))

if [[ "$ALREADY_EXISTS" -gt 0 ]]; then
  EXISTING_WT_DIR="$(resolve_existing_worktree_path "$FEATURE_BRANCH" 2>/dev/null || true)"
  if [[ -n "$EXISTING_WT_DIR" ]]; then
    WT_DIR="$EXISTING_WT_DIR"
  elif [[ "$(git branch --show-current)" == "$FEATURE_BRANCH" ]]; then
    WT_DIR="$REPO_ROOT"
  fi
  if [[ "$RESUME" -eq 0 ]]; then
    echo "ERROR: Worktree/branch mar letezik: ${FEATURE_BRANCH}" >&2
    echo "  local branch:  ${BRANCH_LOCAL}" >&2
    echo "  remote branch: ${BRANCH_REMOTE}" >&2
    echo "  path exists:   ${WT_EXISTS} (${WT_DIR})" >&2
    echo "" >&2
    echo "Meglevo worktree folytatasahoz:" >&2
    echo "  bash scripts/worktree-task-start.sh ${FEATURE_BRANCH} --resume" >&2
    exit 1
  fi
  echo "[worktree-task-start] --resume: meglevo worktree ujrafelhasznalasa"
else
  echo "[worktree-task-start] create worktree via local starter"
  bash "$REPO_ROOT/scripts/start-feature-worktree.sh" "$FEATURE_BRANCH"
fi

MARKER_FILE="$(git -C "$WT_DIR" rev-parse --git-path worktree-active.json 2>/dev/null || true)"
if [[ -n "$MARKER_FILE" ]]; then
  mkdir -p "$(dirname "$MARKER_FILE")"
fi

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [[ -n "$MARKER_FILE" ]]; then
  python3 - <<'PY' \
    "$MARKER_FILE" "$FEATURE_BRANCH" "$WT_DIR" "$REPO_NAME" "$REPO_ROOT" "$STARTED_AT" "$RESUME" \
    "$DOC_SYNC_LABEL" "$DOC_SYNC_REPO_ID" "$DOC_SYNC_PATH_PREFIX"
import json
import sys

(
    marker_file,
    feature_branch,
    wt_dir,
    repo_name,
    repo_root,
    started_at,
    resume,
    doc_sync_label,
    doc_sync_repo_id,
    doc_sync_path_prefix,
) = sys.argv[1:11]

payload = {
    "branch": feature_branch,
    "path": wt_dir,
    "repo": repo_name,
    "repo_root": repo_root,
    "started_at": started_at,
    "resume": resume == "1",
}
if doc_sync_label:
    payload["doc_sync_label"] = doc_sync_label
if doc_sync_repo_id:
    payload["doc_sync_repo_id"] = doc_sync_repo_id
if doc_sync_path_prefix:
    payload["doc_sync_path_prefix"] = doc_sync_path_prefix

with open(marker_file, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=True, indent=2)
    handle.write("\n")
PY
fi

echo "[worktree-task-start] repo:   $REPO_NAME"
echo "[worktree-task-start] branch: $FEATURE_BRANCH"
echo "[worktree-task-start] path:   $WT_DIR"
echo "[worktree-task-start] marker: ${MARKER_FILE:-unavailable}"

COORD_SCRIPT="$REPO_ROOT/scripts/worktree-coordination-sync.sh"
if [[ -x "$COORD_SCRIPT" || -f "$COORD_SCRIPT" ]]; then
  if bash "$COORD_SCRIPT" --repo-root "$REPO_ROOT" --active "$WT_DIR" >/dev/null 2>&1; then
    echo "[worktree-task-start] coordination snapshot frissitve"
  else
    echo "[worktree-task-start] ERROR: coordination snapshot failed" >&2
    exit 1
  fi
fi

echo "[worktree-task-start] readiness:"
bash "$REPO_ROOT/scripts/worktree-readiness-check.sh"

echo "[worktree-task-start] task-start guard:"
bash "$REPO_ROOT/scripts/worktree-task-start-guard.sh" \
  ${DOC_SYNC_LABEL:+--doc-sync-label "$DOC_SYNC_LABEL"} \
  ${DOC_SYNC_REPO_ID:+--doc-sync-repo-id "$DOC_SYNC_REPO_ID"} \
  ${DOC_SYNC_PATH_PREFIX:+--doc-sync-path-prefix "$DOC_SYNC_PATH_PREFIX"}

echo "[worktree-task-start] next:"
echo "  cd \"$WT_DIR\""
