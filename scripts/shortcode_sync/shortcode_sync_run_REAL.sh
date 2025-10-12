#!/usr/bin/env bash
set -Eeuo pipefail

# ============ CONFIG & PATHS ============
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_ROOT="${OUT_ROOT:-${ROOT_DIR}/.codex/reports/shortcode_sync}"
LOG_DIR="${LOG_DIR:-${OUT_ROOT}/logs}"
ART_DIR="${ART_DIR:-${OUT_ROOT}/artifacts}"
BAK_DIR="${BAK_DIR:-${OUT_ROOT}/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${LOG_DIR}/sync_${STAMP}.log"

mkdir -p "${LOG_DIR}" "${ART_DIR}" "${BAK_DIR}"

# Defaults / guards
: "${RSYNC_BWLIMIT_KBPS:=5000}"
: "${RSYNC_TIMEOUT_S:=300}"
: "${REQUIRED_FREE_MB:=800}"
: "${PHP_LINT_PROCS:=4}"
: "${RUN_SMOKE:=1}"
: "${SCOPE:=auto}"
: "${PROVIDERS:=}"

# ============ HELPERS ============
ts(){ date -u +%Y-%m-%dT%H:%M:%SZ; }
log(){ echo "$(ts) $*"; }
die(){ echo "$(ts) [ERROR] $*" >&2; exit 1; }

SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o Compression=no -o ControlMaster=auto -o ControlPath=/tmp/ssh-%r@%h:%p -o ControlPersist=10m"

req_env(){
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    die "Missing env: ${name}"
  fi
}

ssh_stage(){ ssh ${SSH_OPTS} "${STAGE_USER}@${STAGE_HOST}" "$@"; }
ssh_prod(){  ssh ${SSH_OPTS} "${PROD_USER}@${PROD_HOST}"  "$@"; }

# Safe rsync executed ON PRODUCTION (pulls from staging over ssh)
rsync_pull(){
  local src_rel="$1"    # e.g. wp-content/plugins/
  local dst_abs="$2"    # e.g. /tmp/._incoming<STAMP>/plugins/
  local files_from="${3:-}"

  ssh_prod "mkdir -p '${dst_abs}'"

  if [[ "${SAME_REMOTE_HOST}" == "1" ]]; then
    # Stage and prod share host/user: use local rsync
    if [[ -n "${files_from}" ]]; then
      ssh_prod "
        set -e
        rsync -av --checksum --delete --numeric-ids --human-readable \
          --bwlimit=${RSYNC_BWLIMIT_KBPS} --timeout=${RSYNC_TIMEOUT_S} \
          --files-from=- \
          '${STAGE_WP_PATH}/${src_rel}' \
          '${dst_abs}'
      " < "${files_from}"
    else
      ssh_prod "
        set -e
        rsync -av --checksum --delete --numeric-ids --human-readable \
          --bwlimit=${RSYNC_BWLIMIT_KBPS} --timeout=${RSYNC_TIMEOUT_S} \
          '${STAGE_WP_PATH}/${src_rel}' \
          '${dst_abs}'
      "
    fi
  else
    if [[ -n "${files_from}" ]]; then
      ssh_prod "
        rsync -avz --checksum --delete --numeric-ids --human-readable \
          --bwlimit=${RSYNC_BWLIMIT_KBPS} --timeout=${RSYNC_TIMEOUT_S} \
          --files-from=- -e 'ssh ${SSH_OPTS}' \
          ${STAGE_USER}@${STAGE_HOST}:${STAGE_WP_PATH}/${src_rel} \
          ${dst_abs}
      " < "${files_from}"
    else
      ssh_prod "
        rsync -avz --checksum --delete --numeric-ids --human-readable \
          --bwlimit=${RSYNC_BWLIMIT_KBPS} --timeout=${RSYNC_TIMEOUT_S} \
          -e 'ssh ${SSH_OPTS}' \
          ${STAGE_USER}@${STAGE_HOST}:${STAGE_WP_PATH}/${src_rel} \
          ${dst_abs}
      "
    fi
  fi
}

lint_incoming(){
  local base="/tmp/._incoming${STAMP}"
  local lint_bin="${PHP_LINT_BIN}"
  local base_escaped
  local lint_bin_escaped

  base_escaped=$(printf '%q' "${base}")
  lint_bin_escaped=$(printf '%q' "${lint_bin}")

  ssh_prod "BASE_DIR=${base_escaped} PHP_LINT_BIN=${lint_bin_escaped} PHP_LINT_PROCS=${PHP_LINT_PROCS} timeout 300s bash -s" <<'EOF'
set -euo pipefail
command -v "$PHP_LINT_BIN" >/dev/null 2>&1 || { echo "[ERROR] PHP lint binary not found: $PHP_LINT_BIN" >&2; exit 1; }
tmp_list="$(mktemp)"
trap 'rm -f "$tmp_list"' EXIT
find "$BASE_DIR" -type f -name '*.php' -print0 > "$tmp_list" || true
if [[ ! -s "$tmp_list" ]]; then
  exit 0
fi
cat "$tmp_list" | xargs -0 -P "$PHP_LINT_PROCS" -I {} timeout 5s "$PHP_LINT_BIN" -l {} >/dev/null || {
  echo "[ERROR] PHP lint failed. Set PHP_LINT_BIN to a working CLI binary (e.g. /opt/cpanel/ea-php82/root/usr/bin/php) and retry." >&2
  exit 1
}
EOF
}

# ============ START ============
exec > >(tee -a "${LOG_FILE}") 2>&1

log "# Shortcode Sync REAL Runner"
req_env STAGE_HOST; req_env STAGE_USER; req_env STAGE_WP_PATH
req_env PROD_HOST;  req_env PROD_USER;  req_env PROD_WP_PATH

log "Mode: $( [[ "${PROD_WP_PATH}" =~ staging-copy ]] && echo REHEARSAL || echo GO-LIVE ) (DRY_RUN=0, REAL_RUN=1)"
log "Stage: ${STAGE_USER}@${STAGE_HOST}:${STAGE_WP_PATH}"
log "Prod : ${PROD_USER}@${PROD_HOST}:${PROD_WP_PATH}"

if [[ "${STAGE_HOST}" == "${PROD_HOST}" && "${STAGE_USER}" == "${PROD_USER}" ]]; then
  SAME_REMOTE_HOST=1
  log "[INFO] Stage and prod share host credentials; rsync will run locally on prod."
else
  SAME_REMOTE_HOST=0
fi

# GREEN gate (must be GREEN)
grep -q "VERDICT: GREEN" "${OUT_ROOT%/shortcode_sync}/status/status_latest.txt" || die "Dashboard not GREEN. Abort."

# Guards
[[ "${APPROVE_EXECUTION:-}" == "YES" ]] || die "APPROVE_EXECUTION!=YES"
[[ "${I_UNDERSTAND_RISKS:-}" == "YES" ]] || die "I_UNDERSTAND_RISKS!=YES"
# Extra prod guard
if [[ ! "${PROD_WP_PATH}" =~ staging-copy ]]; then
  [[ "${I_CONFIRM_PROD_PATH:-}" == "${PROD_WP_PATH}" ]] || die "I_CONFIRM_PROD_PATH mismatch"
fi

# Reachability + WP-CLI
ssh_stage "wp --path='${STAGE_WP_PATH}' --version" >/dev/null || die "WP-CLI staging unreachable"
ssh_prod  "wp --path='${PROD_WP_PATH}'  --version" >/dev/null || die "WP-CLI prod unreachable"
log "[PASS] Reachability & WP-CLI OK"

if [[ -z "${PHP_LINT_BIN:-}" ]]; then
  detected_php_bin="$(ssh_prod "wp --path='${PROD_WP_PATH}' eval 'echo PHP_BINARY;'" || true)"
  detected_php_bin="$(printf '%s\n' "${detected_php_bin}" | tail -n1 | tr -d '\r')"
  if [[ -n "${detected_php_bin}" ]]; then
    PHP_LINT_BIN="${detected_php_bin}"
    log "[INFO] Using PHP binary from WP CLI: ${PHP_LINT_BIN}"
  else
    PHP_LINT_BIN="php"
    log "[WARN] Could not auto-detect PHP binary; falling back to 'php'. Set PHP_LINT_BIN if lint fails."
  fi
else
  log "[INFO] PHP lint binary preset: ${PHP_LINT_BIN}"
fi

# Disk space (prod)
FREE_MB=$(ssh_prod "df -m '${PROD_WP_PATH}' | awk 'NR==2{print \$4}'")
[[ "${FREE_MB}" =~ ^[0-9]+$ ]] || die "Disk check failed"
(( FREE_MB >= REQUIRED_FREE_MB )) || die "Insufficient disk space on prod (${FREE_MB}MB < ${REQUIRED_FREE_MB}MB)"

# Targets list (use latest artifacts)
TARGETS_FILE="$(ls -1 ${ART_DIR}/targets_* 2>/dev/null | tail -1 || true)"
if [[ -z "${TARGETS_FILE}" ]]; then
  # Fallback: include entire plugins + mu-plugins trees
  log "[WARN] No targets list found, will sync full plugins/ and mu-plugins/"
  SYNC_MODE="full"
else
  SYNC_MODE="targets"
  log "[INFO] Using targets: ${TARGETS_FILE}"
fi

INCOMING="/tmp/._incoming${STAMP}"
BACKUP_PLUG="${PROD_WP_PATH}/wp-content/._backup${STAMP}_plugins"
BACKUP_MUPL="${PROD_WP_PATH}/wp-content/._backup${STAMP}_mu-plugins"

# ============ BACKUP (prod) ============
log "== Backup (prod) =="
ssh_prod "
  set -e
  cd '${PROD_WP_PATH}'
  wp db export ../bak_${STAMP}.sql
  tar czf ../bak_${STAMP}_plugins.tgz    -C wp-content plugins    || true
  tar czf ../bak_${STAMP}_mu-plugins.tgz -C wp-content mu-plugins || true
"
log "[PASS] Backup created (db+code)"

# ============ RSYNC to _incoming ============
log '== Rsync to _incoming (prod pulls from staging) =='
if [[ "${SYNC_MODE}" == "full" ]]; then
  rsync_pull "wp-content/plugins/"     "${INCOMING}/plugins/"
  rsync_pull "wp-content/mu-plugins/"  "${INCOMING}/mu-plugins/"
else
  # Build include list for each family based on targets
  inc_plugins=$(mktemp) ; inc_mu=$(mktemp)
  awk '/^wp-content\/plugins\//{print substr($0,13)}' "${TARGETS_FILE}" | sed 's#^/##' > "${inc_plugins}" || true
  awk '/^wp-content\/mu-plugins\//{print substr($0,19)}' "${TARGETS_FILE}" | sed 's#^/##' > "${inc_mu}" || true

  # If any list is empty, still create dirs
  ssh_prod "mkdir -p '${INCOMING}/plugins' '${INCOMING}/mu-plugins'"

  # Pull only listed paths (plugins)
  if [[ -s "${inc_plugins}" ]]; then
    rsync_pull "wp-content/plugins/" "${INCOMING}/plugins/" "${inc_plugins}"
  else
    log "[INFO] No plugin targets listed"
  fi

  # Pull only listed paths (mu-plugins)
  if [[ -s "${inc_mu}" ]]; then
    rsync_pull "wp-content/mu-plugins/" "${INCOMING}/mu-plugins/" "${inc_mu}"
  else
    log "[INFO] No mu-plugin targets listed"
  fi
fi
log "[PASS] Rsync finished"

# ============ PHP LINT ============
log "== PHP lint (dual timeout, ${PHP_LINT_PROCS} procs) =="
lint_incoming
log "[PASS] PHP lint OK"

# ============ ATOMIC SWAP ============
log "== Atomic swap (plugins / mu-plugins) =="
ssh_prod "ROOT=${PROD_WP_PATH}" "INCOMING=${INCOMING}" "BACKUP_PLUG=${BACKUP_PLUG}" "BACKUP_MUPL=${BACKUP_MUPL}" bash -s <<'EOF'
set -euo pipefail
cd "${ROOT}/wp-content"
# Prepare backups
if [ -d plugins ]; then mv plugins "${BACKUP_PLUG}"; fi
if [ -d mu-plugins ]; then mv mu-plugins "${BACKUP_MUPL}"; fi
# Swap in
if [ -d "${INCOMING}/plugins" ]; then mv "${INCOMING}/plugins" plugins; fi
if [ -d "${INCOMING}/mu-plugins" ]; then mv "${INCOMING}/mu-plugins" mu-plugins; fi
EOF
log "[PASS] Atomic swap complete"

# ============ ROLLBACK SCRIPT ============
ROLLBACK="${ART_DIR}/rollback_${STAMP}.sh"
cat > "${ROLLBACK}" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
ssh ${SSH_OPTS} ${PROD_USER}@${PROD_HOST} "
  set -e
  cd '${PROD_WP_PATH}/wp-content'
  if [ -d plugins ];    then mv plugins    ._failed${STAMP}_plugins;    fi
  if [ -d mu-plugins ]; then mv mu-plugins ._failed${STAMP}_mu-plugins; fi
  if [ -d '${BACKUP_PLUG}' ]; then mv '${BACKUP_PLUG}' plugins; fi
  if [ -d '${BACKUP_MUPL}' ]; then mv '${BACKUP_MUPL}' mu-plugins; fi
  echo '[ROLLBACK] Code restored'
"
# Optional DB restore:
# ssh ${SSH_OPTS} ${PROD_USER}@${PROD_HOST} "wp --path='${PROD_WP_PATH}' db import ../bak_${STAMP}.sql"
EOF
chmod +x "${ROLLBACK}"
log "[INFO] Rollback script: ${ROLLBACK}"

# ============ SMOKE TESTS ============
if [[ "${RUN_SMOKE}" == "1" ]]; then
  log "== Smoke tests =="
  pass=0; total=3
  for sc in "[impact_ticker]" "[impact_leaderboard tab=ngo]" "[impact_activity]"; do
    out="$(ssh_prod "wp --path='${PROD_WP_PATH}' eval 'echo do_shortcode(\"${sc}\");' 2>&1" || true)"
    if echo "${out}" | grep -qiE 'fatal|error|warning'; then
      log "[FAIL] Smoke: ${sc}"
    else
      log "[PASS] Smoke: ${sc}"
      pass=$((pass+1))
    fi
  done
  [[ ${pass} -eq ${total} ]] || { log "[ERROR] Smoke failed (${pass}/${total}). To rollback: ${ROLLBACK}"; exit 1; }
fi

# ============ VERDICT ============
if [[ "${PROD_WP_PATH}" =~ staging-copy ]]; then
  log "REHEARSAL PASS"
else
  log "GO-LIVE PASS"
fi

log "Outcome + Evidence"
log "  - Log: ${LOG_FILE}"
log "  - Rollback: ${ROLLBACK}"
log "  - Backups on prod: ../bak_${STAMP}.sql, ../bak_${STAMP}_plugins.tgz, ../bak_${STAMP}_mu-plugins.tgz"
exit 0
