#!/usr/bin/env bash
set -euo pipefail

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
