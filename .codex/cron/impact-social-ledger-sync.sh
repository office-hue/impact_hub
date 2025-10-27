#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="${REPO_ROOT}/.codex/scripts/impact-social-ledger-sync.php"
STAGING_ENV="${REPO_ROOT}/impactshop-notes/.deploy.staging.env"
PROD_ENV="${REPO_ROOT}/impactshop-notes/.deploy.production.env"

[[ -f "$SCRIPT_PATH" ]] || { echo "❌ Ledger sync script missing: $SCRIPT_PATH" >&2; exit 1; }

usage() {
  cat <<'EOF'
Impact Social Ledger Sync
-------------------------
Runs the WP-CLI ledger backfill script on staging and/or production so the
[impact_social_ticker] shortcode stays fresh.

Options:
  --env=<staging|production|all>   Target environment(s). Default: all.
  --keep-tmp                      Leave the remote PHP script in /tmp (debug).
EOF
}

ENV_TARGET="all"
KEEP_TMP=0

for arg in "$@"; do
  case "$arg" in
    --env=*)
      ENV_TARGET="${arg#*=}"
      ;;
    --keep-tmp)
      KEEP_TMP=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage
      exit 1
      ;;
  esac
done

load_env() {
  local env_file="$1"
  local prefix="$2"
  [[ -f "$env_file" ]] || { echo "❌ Missing env file: $env_file" >&2; exit 1; }

  local ssh_host
  local wp_path
  ssh_host="$(grep -E '^SSH_HOST=' "$env_file" | head -n1 | cut -d\" -f2)"
  wp_path="$(grep -E '^REMOTE_WP_PATH=' "$env_file" | head -n1 | cut -d\" -f2)"

  [[ -n "$ssh_host" && -n "$wp_path" ]] || { echo "❌ Incomplete env file: $env_file" >&2; exit 1; }

  eval "${prefix}_SSH_HOST=\"${ssh_host}\""
  eval "${prefix}_WP_PATH=\"${wp_path}\""
}

run_remote() {
  local label="$1"
  local ssh_host="$2"
  local wp_path="$3"

  echo "🌐 ${label}: syncing ledger via ${ssh_host}:${wp_path}"

  local remote_tmp="/tmp/impact-social-ledger-sync.php"

  scp -q "$SCRIPT_PATH" "${ssh_host}:${remote_tmp}"
  ssh "$ssh_host" "cd '${wp_path}' && wp eval-file '${remote_tmp}'"
  if [[ "$KEEP_TMP" -eq 0 ]]; then
    ssh "$ssh_host" "rm -f '${remote_tmp}'"
  else
    echo "ℹ️  ${label}: left script at ${remote_tmp}"
  fi
}

TARGETS=()
case "$ENV_TARGET" in
  staging)
    TARGETS+=(staging)
    ;;
  production|prod)
    TARGETS+=(production)
    ;;
  all)
    TARGETS+=(staging production)
    ;;
  *)
    echo "❌ Unknown --env value: $ENV_TARGET" >&2
    exit 1
    ;;
esac

[[ ${#TARGETS[@]} -gt 0 ]] || exit 0

load_env "$STAGING_ENV" "STAGING"
load_env "$PROD_ENV" "PROD"

for target in "${TARGETS[@]}"; do
  case "$target" in
    staging)
      run_remote "Staging" "$STAGING_SSH_HOST" "$STAGING_WP_PATH"
      ;;
    production)
      run_remote "Production" "$PROD_SSH_HOST" "$PROD_WP_PATH"
      ;;
  esac
done

echo "✅ Impact Social ledger sync complete."
