#!/usr/bin/env bash
set -euo pipefail

# Enforced one-path policy:
# - Commit/push only from feature/worktree branches.
# - Direct main/master commit/push is blocked by hooks.
# - Install after every new clone/worktree: bash scripts/install-hooks-all.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

detect_workspace_root() {
  local dir="$SCRIPT_DIR"
  local candidate=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    candidate="$(cd "$dir/.." && pwd)"
    if [[ -d "$candidate/impact_hub" && -d "$candidate/impactshop-notes" && -d "$candidate/ai-agent" ]]; then
      echo "$candidate"
      return 0
    fi
    [[ "$candidate" == "$dir" ]] && break
    dir="$candidate"
  done
  echo "${IMPACT_WORKSPACE_ROOT:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
}

WORKSPACE_ROOT="$(detect_workspace_root)"

install_hook() {
  local repo_dir="$1"
  local origin_env_var="$2"
  local default_origin="$3"
  local origin_mode="$4" # required|optional

  if ! git -C "${repo_dir}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[install-hooks-all] skip: nem git repo -> ${repo_dir}" >&2
    return 0
  fi

  local hook_dir
  hook_dir="$(git -C "${repo_dir}" rev-parse --git-path hooks)"
  if [[ "${hook_dir}" != /* ]]; then
    hook_dir="${repo_dir}/${hook_dir}"
  fi
  mkdir -p "${hook_dir}"

  cat > "${hook_dir}/pre-commit" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${IMPACT_POLICY_ALLOW_MAIN_COMMIT:-0}" == "1" ]]; then
  exit 0
fi

BRANCH="$(git branch --show-current 2>/dev/null || echo detached)"
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  echo "[repo-guard] Blocked commit on protected branch: $BRANCH" >&2
  echo "[repo-guard] Use feature/worktree flow:" >&2
  echo "[repo-guard]   bash scripts/start-feature-worktree.sh <feature-branch>" >&2
  echo "[repo-guard] Emergency bypass (approval required): IMPACT_POLICY_ALLOW_MAIN_COMMIT=1" >&2
  exit 1
fi
HOOK

  cat > "${hook_dir}/pre-push" <<HOOK
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="\$(git rev-parse --show-toplevel)"
BRANCH="\$(git branch --show-current 2>/dev/null || echo detached)"

if [[ "\${IMPACT_POLICY_ALLOW_MAIN_PUSH:-0}" != "1" ]]; then
  if [[ "\$BRANCH" == "main" || "\$BRANCH" == "master" ]]; then
    echo "[repo-guard] Blocked push from protected branch: \$BRANCH" >&2
    echo "[repo-guard] Use feature/worktree flow:" >&2
    echo "[repo-guard]   bash scripts/start-feature-worktree.sh <feature-branch>" >&2
    echo "[repo-guard] Emergency bypass (approval required): IMPACT_POLICY_ALLOW_MAIN_PUSH=1" >&2
    exit 1
  fi

  while read -r local_ref local_sha remote_ref remote_sha; do
    [[ -z "\${local_ref:-}" ]] && continue
    if [[ "\$local_ref" == "refs/heads/main" || "\$remote_ref" == "refs/heads/main" || "\$local_ref" == "refs/heads/master" || "\$remote_ref" == "refs/heads/master" ]]; then
      echo "[repo-guard] Blocked direct push to main/master." >&2
      echo "[repo-guard] Open PR from feature/worktree branch instead." >&2
      exit 1
    fi
  done
fi

required_paths=(
  "scripts/start-feature-worktree.sh"
  "scripts/git-health-check.sh"
  "docs/pr-policy.md"
  ".github/pull_request_template.md"
  "PR-EXIT-CHECKLIST.md"
)
missing=0
for rel in "\${required_paths[@]}"; do
  if [[ ! -e "\$REPO_ROOT/\$rel" ]]; then
    echo "[repo-guard] Missing required policy file: \$rel" >&2
    missing=1
  fi
done
if [[ "\$missing" -ne 0 ]]; then
  exit 1
fi

SAFE_AUDIT_SCRIPT=""
search_dir="\$REPO_ROOT"
for _ in 1 2 3 4 5 6; do
  candidate="\$search_dir/scripts/safe-repo-audit.sh"
  if [[ -x "\$candidate" ]]; then
    SAFE_AUDIT_SCRIPT="\$candidate"
    break
  fi
  parent="\$(cd "\$search_dir/.." && pwd)"
  [[ "\$parent" == "\$search_dir" ]] && break
  search_dir="\$parent"
done

if [[ -z "\$SAFE_AUDIT_SCRIPT" ]]; then
  echo "[repo-guard] missing safe audit script (searched upwards from: \$REPO_ROOT)" >&2
  exit 1
fi

"\${SAFE_AUDIT_SCRIPT}" --repo "\${REPO_ROOT}" --strict --mode push

expected_origin="\${${origin_env_var}:-${default_origin}}"
actual_origin="\$(git remote get-url origin 2>/dev/null || true)"
HOOK

  if [[ "${origin_mode}" == "optional" ]]; then
    cat >> "${hook_dir}/pre-push" <<'HOOK'
if [[ -n "${expected_origin}" ]]; then
  if [[ "${actual_origin}" != "${expected_origin}" ]]; then
    echo "[repo-guard] Blocked push: origin mismatch" >&2
    echo "[repo-guard] expected: ${expected_origin}" >&2
    echo "[repo-guard] actual:   ${actual_origin}" >&2
    exit 1
  fi
else
  echo "[repo-guard] origin check skipped (expected origin nincs beállítva)"
fi
HOOK
  else
    cat >> "${hook_dir}/pre-push" <<'HOOK'
if [[ "${actual_origin}" != "${expected_origin}" ]]; then
  echo "[repo-guard] Blocked push: origin mismatch" >&2
  echo "[repo-guard] expected: ${expected_origin}" >&2
  echo "[repo-guard] actual:   ${actual_origin}" >&2
  exit 1
fi
HOOK
  fi

  chmod +x "${hook_dir}/pre-commit" "${hook_dir}/pre-push"
  echo "[install-hooks-all] OK: ${hook_dir}/pre-commit"
  echo "[install-hooks-all] OK: ${hook_dir}/pre-push"
}

install_hook "${WORKSPACE_ROOT}/impactshop-notes" "IMPACTSHOP_NOTES_EXPECTED_ORIGIN" "https://github.com/office-hue/impactshop-notes.git" "required"
install_hook "${WORKSPACE_ROOT}/impact_hub" "IMPACT_HUB_EXPECTED_ORIGIN" "https://github.com/office-hue/impact_hub.git" "required"
install_hook "${WORKSPACE_ROOT}/ai-agent" "AI_AGENT_EXPECTED_ORIGIN" "" "optional"

echo "[install-hooks-all] kész."
echo "[install-hooks-all] enforced one-path policy aktív (commit/push/PR/deploy flow)."
echo "[install-hooks-all] policy: új klón/worktree után kötelezően futtasd újra."
