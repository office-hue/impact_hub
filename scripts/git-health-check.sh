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

BRANCH="$(git branch --show-current 2>/dev/null || echo detached)"
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  echo "[git-health-check] FAIL: main/master ágon vagy. Commit/push csak feature/worktree ágon mehet."
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

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

required_paths=(
  "scripts/start-feature-worktree.sh"
  "scripts/git-health-check.sh"
  "docs/pr-policy.md"
  ".github/pull_request_template.md"
  "PR-EXIT-CHECKLIST.md"
)

for rel in "${required_paths[@]}"; do
  if [[ ! -e "$REPO_ROOT/$rel" ]]; then
    echo "[git-health-check] FAIL: hiányzó kötelező policy fájl: $rel"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

PRE_COMMIT_HOOK="$(git rev-parse --git-path hooks/pre-commit)"
if [[ -x "$PRE_COMMIT_HOOK" ]]; then
  if rg -q -- 'IMPACT_POLICY_ALLOW_MAIN_COMMIT' "$PRE_COMMIT_HOOK"; then
    echo "[git-health-check] OK: pre-commit main-branch gate aktív"
  else
    echo "[git-health-check] FAIL: pre-commit hookból hiányzik a main branch gate"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
else
  echo "[git-health-check] FAIL: hiányzó vagy nem futtatható pre-commit hook: $PRE_COMMIT_HOOK"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

PRE_PUSH_HOOK="$(git rev-parse --git-path hooks/pre-push)"
if [[ -x "$PRE_PUSH_HOOK" ]]; then
  if rg -q -- '--strict --mode push' "$PRE_PUSH_HOOK"; then
    echo "[git-health-check] OK: pre-push strict audit aktív"
  else
    echo "[git-health-check] FAIL: pre-push hookból hiányzik a --strict --mode push"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  if rg -q -- 'IMPACT_POLICY_ALLOW_MAIN_PUSH' "$PRE_PUSH_HOOK"; then
    echo "[git-health-check] OK: pre-push main-branch gate aktív"
  else
    echo "[git-health-check] FAIL: pre-push hookból hiányzik a main push gate"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
else
  echo "[git-health-check] FAIL: hiányzó vagy nem futtatható pre-push hook: $PRE_PUSH_HOOK"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

SAFE_AUDIT_SCRIPT=""
search_dir="$REPO_ROOT"
for _ in 1 2 3 4 5 6; do
  candidate="$search_dir/scripts/safe-repo-audit.sh"
  if [[ -x "$candidate" ]]; then
    SAFE_AUDIT_SCRIPT="$candidate"
    break
  fi
  parent="$(cd "$search_dir/.." && pwd)"
  [[ "$parent" == "$search_dir" ]] && break
  search_dir="$parent"
done

if [[ -z "$SAFE_AUDIT_SCRIPT" ]]; then
  echo "[git-health-check] FAIL: nem található futtatható safe-repo-audit.sh"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "[git-health-check] OK: safe-repo-audit elérhető: $SAFE_AUDIT_SCRIPT"
fi

echo "[git-health-check] summary: WARN=$WARN_COUNT FAIL=$FAIL_COUNT"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi

exit 0
