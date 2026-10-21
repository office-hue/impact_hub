#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "${REPO_ROOT}" ]] || exit 1

SAFE_AUDIT="${REPO_ROOT}/scripts/safe-repo-audit.sh"
WORKTREE_CONTINUITY_GUARD="${REPO_ROOT}/scripts/worktree-continuity-guard.sh"
NAMESPACE="$(git rev-parse --git-path dev-v4-lifecycle)"
if [[ -e "$NAMESPACE" || -L "$NAMESPACE" ]]; then
  WORKTREE_CONTINUITY_GUARD="${REPO_ROOT}/scripts/dev-v4-installed-controller-adapter.mjs"
fi

# One repository, one audit base resolver. Never discover sibling worktrees or
# invoke their memory writers. Optional Secretary context grants no authority.
for required in "$SAFE_AUDIT" "$WORKTREE_CONTINUITY_GUARD"; do
  if [[ ! -f "$required" || -L "$required" ]]; then
    echo "[guarded-push] Required repo-local guard missing or symlinked: $required" >&2
    exit 1
  fi
done

# Check shell guards even if their executable bit is absent. A real denial
# remains a denial: no legacy fallback or optional-service waiver follows it.
if [[ -e "$NAMESPACE" || -L "$NAMESPACE" ]]; then
  /usr/local/libexec/ai-agent-shared-node/node/bin/node "$WORKTREE_CONTINUITY_GUARD" continuity --repo "$REPO_ROOT" --mode push
else
  /bin/bash "$WORKTREE_CONTINUITY_GUARD" --mode push
fi
/bin/bash "$SAFE_AUDIT" --repo "$REPO_ROOT" --strict --mode push

echo '[guarded-push] Optional memory sync is not a publication gate; native Git hooks remain active.' >&2
exec git -C "$REPO_ROOT" push "$@"
