#!/usr/bin/env bash
set -euo pipefail

# Team policy:
# - Every new clone/worktree bootstrap must run this installer once.
# - Command: bash scripts/install-hooks-all.sh

WORKSPACE_ROOT="${IMPACT_WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

install_hook() {
  local repo_dir="$1"
  local origin_env_var="$2"
  local default_origin="$3"
  local origin_mode="$4" # required|optional

  if ! git -C "${repo_dir}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[install-hooks-all] skip: nem git repo -> ${repo_dir}" >&2
    return 0
  fi

  local hook_dir="${repo_dir}/.git/hooks"
  mkdir -p "${hook_dir}"

  cat > "${hook_dir}/pre-push" <<HOOK
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="\$(git rev-parse --show-toplevel)"
SAFE_AUDIT_SCRIPT="\${REPO_ROOT}/scripts/safe-repo-audit.sh"
if [[ ! -x "\${SAFE_AUDIT_SCRIPT}" ]]; then
  SAFE_AUDIT_SCRIPT="\${REPO_ROOT}/../scripts/safe-repo-audit.sh"
fi

if [[ -x "\${SAFE_AUDIT_SCRIPT}" ]]; then
  "\${SAFE_AUDIT_SCRIPT}" --repo "\${REPO_ROOT}" --strict --mode push
else
  echo "[repo-guard] missing safe audit script (local/fallback)" >&2
  echo "[repo-guard] checked: \${REPO_ROOT}/scripts/safe-repo-audit.sh and \${REPO_ROOT}/../scripts/safe-repo-audit.sh" >&2
  exit 1
fi

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

  chmod +x "${hook_dir}/pre-push"
  echo "[install-hooks-all] OK: ${hook_dir}/pre-push"
}

install_hook "${WORKSPACE_ROOT}/impactshop-notes" "IMPACTSHOP_NOTES_EXPECTED_ORIGIN" "https://github.com/office-hue/impactshop-notes.git" "required"
install_hook "${WORKSPACE_ROOT}/impact_hub" "IMPACT_HUB_EXPECTED_ORIGIN" "https://github.com/office-hue/impact_hub.git" "required"
install_hook "${WORKSPACE_ROOT}/ai-agent" "AI_AGENT_EXPECTED_ORIGIN" "" "optional"

echo "[install-hooks-all] kész."
echo "[install-hooks-all] policy: új klón/worktree után kötelezően futtasd újra."
