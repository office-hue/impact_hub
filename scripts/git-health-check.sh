#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "[git-health-check] ERROR: nem git repóban futsz." >&2
  exit 1
fi

cd "$REPO_ROOT"
REPO_NAME="$(basename "$REPO_ROOT")"
WARN_COUNT=0
FAIL_COUNT=0

echo "[git-health-check] repo: $REPO_NAME"
echo "[git-health-check] branch: $(git branch --show-current 2>/dev/null || echo detached)"

if git show-ref --verify --quiet refs/heads/main && git show-ref --verify --quiet refs/remotes/origin/main; then
  counts="$(git rev-list --left-right --count main...origin/main)"
  ahead="${counts%%$'\t'*}"
  behind="${counts##*$'\t'}"
  echo "[git-health-check] main vs origin/main: ahead=$ahead behind=$behind"
  if [[ "$ahead" != "0" || "$behind" != "0" ]]; then
    echo "[git-health-check] WARN: local main nincs szinkronban origin/main-nel"
    WARN_COUNT=$((WARN_COUNT + 1))
  fi
else
  echo "[git-health-check] WARN: main vagy origin/main hiányzik"
  WARN_COUNT=$((WARN_COUNT + 1))
fi

gone_branches="$(git for-each-ref --format='%(refname:short)|%(upstream:track)' refs/heads | awk -F'|' '$2 ~ /\[gone\]/ {print $1}')"
if [[ -n "$gone_branches" ]]; then
  echo "[git-health-check] WARN: upstream [gone] ágak:"
  echo "$gone_branches" | sed 's/^/  - /'
  WARN_COUNT=$((WARN_COUNT + 1))
else
  echo "[git-health-check] OK: nincs [gone] ág"
fi

HOOK_PATH="$(git rev-parse --git-path hooks/pre-push)"
if [[ -x "$HOOK_PATH" ]]; then
  if rg -q -- '--strict --mode push' "$HOOK_PATH"; then
    echo "[git-health-check] OK: pre-push policy --strict --mode push"
  else
    echo "[git-health-check] FAIL: pre-push hookból hiányzik a --strict --mode push"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
else
  echo "[git-health-check] FAIL: hiányzó vagy nem futtatható pre-push hook: $HOOK_PATH"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [[ ! -x "$REPO_ROOT/scripts/safe-repo-audit.sh" ]]; then
  echo "[git-health-check] FAIL: hiányzó scripts/safe-repo-audit.sh"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "[git-health-check] OK: scripts/safe-repo-audit.sh elérhető"
fi

echo "[git-health-check] summary: WARN=$WARN_COUNT FAIL=$FAIL_COUNT"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi

exit 0
