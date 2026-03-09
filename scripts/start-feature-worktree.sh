#!/usr/bin/env bash
set -euo pipefail

resolve_ai_agent_repo() {
  local repo_root="$1"
  local search="$repo_root"
  local parent=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if [[ "$(basename "$search")" == "ai-agent" && -f "$search/scripts/dev-memory.ts" ]]; then
      echo "$search"
      return 0
    fi
    if [[ -d "$search/ai-agent" && -f "$search/ai-agent/scripts/dev-memory.ts" ]]; then
      echo "$search/ai-agent"
      return 0
    fi
    for wt in "$search"/.worktrees/ai-agent*; do
      if [[ -d "$wt" && -f "$wt/scripts/dev-memory.ts" ]]; then
        echo "$wt"
        return 0
      fi
    done
    parent="$(cd "$search/.." && pwd)"
    [[ "$parent" == "$search" ]] && break
    search="$parent"
  done
  return 1
}

usage() {
  cat <<'EOF'
Usage:
  bash scripts/start-feature-worktree.sh <feature-branch>

Example:
  bash scripts/start-feature-worktree.sh feat/ops-policy-cleanup
EOF
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "ERROR: nem git repóban futsz." >&2
  exit 1
fi

cd "$REPO_ROOT"
FEATURE_BRANCH="$1"

if git show-ref --verify --quiet "refs/heads/${FEATURE_BRANCH}"; then
  echo "ERROR: local branch már létezik: ${FEATURE_BRANCH}" >&2
  exit 1
fi

if git ls-remote --exit-code --heads origin "$FEATURE_BRANCH" >/dev/null 2>&1; then
  echo "ERROR: remote branch már létezik origin-on: ${FEATURE_BRANCH}" >&2
  exit 1
fi

REPO_NAME="$(basename "$REPO_ROOT")"
WORKSPACE_DIR="$(cd "${REPO_ROOT}/.." && pwd)"
WT_BASE="${WORKSPACE_DIR}/.worktrees"
mkdir -p "$WT_BASE"

SANITIZED_BRANCH="${FEATURE_BRANCH//\//-}"
WT_DIR="${WT_BASE}/${REPO_NAME}-${SANITIZED_BRANCH}"

if [[ -e "$WT_DIR" ]]; then
  echo "ERROR: worktree path már létezik: $WT_DIR" >&2
  exit 1
fi

echo "[start-feature-worktree] fetch origin/main"
git fetch origin main --prune

echo "[start-feature-worktree] create: $WT_DIR"
git worktree add -b "$FEATURE_BRANCH" "$WT_DIR" origin/main

echo "[start-feature-worktree] kész"
echo "repo:   $REPO_NAME"
echo "branch: $FEATURE_BRANCH"
echo "path:   $WT_DIR"

AI_AGENT_REPO="$(resolve_ai_agent_repo "$REPO_ROOT" 2>/dev/null || true)"
if [[ -n "${AI_AGENT_REPO}" ]] && command -v npm >/dev/null 2>&1; then
  TASK_SEED="start-feature:${REPO_NAME}/${FEATURE_BRANCH}"
  npm --prefix "${AI_AGENT_REPO}" run -s memory:pre-task -- \
    --task "${TASK_SEED}" \
    --out "tmp/state/dev-memory/last-brief.json" \
    --limit 8 \
    --file-limit 6 >/dev/null 2>&1 || true

  npm --prefix "${AI_AGENT_REPO}" run -s memory:context-pack -- \
    --repo "${WT_DIR}" \
    --branch "${FEATURE_BRANCH}" \
    --task "${TASK_SEED}" \
    --limit 8 \
    --file-limit 6 >/dev/null 2>&1 || true

  echo "[start-feature-worktree] memory pre-task + context-pack: kész (fail-open)"
fi
