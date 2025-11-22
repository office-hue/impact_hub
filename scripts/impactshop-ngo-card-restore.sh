#!/usr/bin/env bash
# One-click emergency restore for ImpactShop NGO Card runtime/share template.
set -euo pipefail

PROD_APP=${PROD_APP:-"$HOME/app"}
STAGING_APP=${STAGING_APP:-"$HOME/app-staging"}
RELEASES=${RELEASES:-"$HOME/releases"}
BACKUPS=${BACKUPS:-"$HOME/codex-backups"}
TARGET_DIR=${TARGET_DIR:-"$PROD_APP/wp-content/mu-plugins"}
LOGDIR=${LOGDIR:-"$HOME/impactshop-ops"}
JOURNAL_OPTION=${JOURNAL_OPTION:-"impact_journal"}
SLACK_WEBHOOK=${SLACK_WEBHOOK:-""}
MAIL_RECIPIENT=${MAIL_RECIPIENT:-""} # optional

CANDIDATE_FILE="impactshop-ngo-card.php"

LOG_PREFIX="[impactshop-ngo-card-restore]"
RESTORE_SOURCE=""
RESTORE_SECONDS=0
RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
RUN_LOG=""
TMPDIR=""
FAILURE_REPORTED=0

log() {
  local msg="${LOG_PREFIX} $*"
  echo "$msg"
  if [[ -n "${RUN_LOG:-}" ]]; then
    echo "$msg" >> "$RUN_LOG"
  fi
}

cleanup_tmp() {
  if [[ -n "${TMPDIR:-}" && -d "${TMPDIR:-}" ]]; then
    rm -rf -- "$TMPDIR"
  fi
}
trap cleanup_tmp EXIT

failure_context() {
  if [[ $FAILURE_REPORTED -eq 1 ]]; then
    return
  fi
  FAILURE_REPORTED=1
  echo "RESTORE FAILED -- context dump" >&2
  if [[ -d "$TARGET_DIR" ]]; then
    find "$TARGET_DIR" -maxdepth 1 -name "impactshop-ngo-card.php.bak*" -ls 2>/dev/null || true
  fi
  ls -1dt "$RELEASES"/* 2>/dev/null | head -5 || true
  ls -1t "$BACKUPS"/wp-content-*.tgz 2>/dev/null | head -2 || true
}

failure_handler() {
  local exit_code=$?
  failure_context
  exit "$exit_code"
}
trap failure_handler ERR

ensure_command() {
  local cmd=$1
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "Required command not found: $cmd"
    exit 1
  fi
}

wp_cli() {
  wp --path="$PROD_APP" "$@"
}

restore_from_local_bak() {
  local candidate="$TARGET_DIR/$CANDIDATE_FILE"
  local prev
  prev=$(ls -1t "${candidate}".bak* 2>/dev/null | head -1 || true)
  if [[ -n "${prev:-}" ]]; then
    cp -p -- "$prev" "$candidate"
    RESTORE_SOURCE="bak"
    log "Restored ${candidate} from local bak: $prev"
    return 0
  fi
  return 1
}

restore_from_previous_release() {
  local prev_release
  prev_release=$(ls -1dt "$RELEASES"/* 2>/dev/null | sed -n '2p' || true)
  if [[ -z "${prev_release:-}" ]]; then
    return 1
  fi
  local src="$prev_release/wp-content/mu-plugins/$CANDIDATE_FILE"
  if [[ -f "$src" ]]; then
    cp -p -- "$src" "$TARGET_DIR/$CANDIDATE_FILE"
    RESTORE_SOURCE="release"
    log "Restored from previous release: $src"
    return 0
  fi
  return 1
}

restore_from_tarball() {
  local tarball
  tarball=$(ls -1t "$BACKUPS"/wp-content-*.tgz 2>/dev/null | head -1 || true)
  if [[ -z "${tarball:-}" ]]; then
    return 1
  fi
  TMPDIR="$(mktemp -d)"
  tar -xzf "$tarball" -C "$TMPDIR" "wp-content/mu-plugins/$CANDIDATE_FILE" 2>/dev/null || true
  local src="$TMPDIR/wp-content/mu-plugins/$CANDIDATE_FILE"
  if [[ -f "$src" ]]; then
    cp -p -- "$src" "$TARGET_DIR/$CANDIDATE_FILE"
    RESTORE_SOURCE="tarball"
    log "Restored from tarball: $tarball"
    return 0
  fi
  return 1
}

restore_from_staging() {
  local src="$STAGING_APP/wp-content/mu-plugins/$CANDIDATE_FILE"
  if [[ -f "$src" ]]; then
    cp -p -- "$src" "$TARGET_DIR/$CANDIDATE_FILE"
    RESTORE_SOURCE="staging"
    log "Restored from staging: $src"
    return 0
  fi
  return 1
}

attempt_restore() {
  restore_from_local_bak && return 0
  restore_from_previous_release && return 0
  restore_from_tarball && return 0
  restore_from_staging && return 0
  return 1
}

main() {
  ensure_command php
  ensure_command wp
  ensure_command curl
  mkdir -p "$LOGDIR"
  RUN_LOG="$LOGDIR/ngo-card-restore-$RUN_ID.log"
  touch "$RUN_LOG"

  wp_cli maintenance-mode activate || true

  if [[ -f "$TARGET_DIR/$CANDIDATE_FILE" ]]; then
    cp -p -- "$TARGET_DIR/$CANDIDATE_FILE" "$TARGET_DIR/${CANDIDATE_FILE}.bak$(date +%s)"
  fi

  attempt_restore || { log "No restore source succeeded."; exit 1; }

  php -l "$TARGET_DIR/$CANDIDATE_FILE"
  if command -v md5sum >/dev/null 2>&1; then
    md5sum "$TARGET_DIR/$CANDIDATE_FILE" | tee -a "$RUN_LOG"
  elif command -v md5 >/dev/null 2>&1; then
    md5 "$TARGET_DIR/$CANDIDATE_FILE" | tee -a "$RUN_LOG"
  fi

  wp_cli cache flush || true
  wp_cli rewrite flush --hard || true
  wp_cli transient delete --all || true

  SHARE_ENDPOINT="https://app.sharity.hu/wp-json/impact/v1/ngo-card/bator-tabor-alapitvany"
  if ! curl -s --max-time 10 "$SHARE_ENDPOINT" | jq '.slug' >/dev/null 2>&1; then
    log "Share endpoint health check failed."
    exit 1
  fi

  wp_cli maintenance-mode deactivate || true
  RESTORE_SECONDS=$SECONDS

  append_changes "$(date -u +%FT%TZ) | NGO_CARD_RESTORE_COMPLETE | source=${RESTORE_SOURCE:-unknown} duration=${RESTORE_SECONDS}s"

  JOURNAL_OPTION="$JOURNAL_OPTION" \
  RESTORE_SOURCE_ENV="${RESTORE_SOURCE:-unknown}" \
  RESTORE_SECONDS_ENV="$RESTORE_SECONDS" \
  wp_cli eval '
$opt = getenv("JOURNAL_OPTION") ?: "impact_journal";
$entries = get_option($opt);
if (!is_array($entries)) {
  $entries = [];
}
$entries[] = [
  "ts" => gmdate("c"),
  "action" => "ngo_card_restore",
  "source" => getenv("RESTORE_SOURCE_ENV") ?: "unknown",
  "seconds" => (int) (getenv("RESTORE_SECONDS_ENV") ?: 0),
];
if (count($entries) > 20) {
  $entries = array_slice($entries, -20);
}
update_option($opt, $entries, false);
echo "Journal updated\n";
' >> "$RUN_LOG" 2>&1 || true

wp_cli eval '
$data = [
  "timestamp" => gmdate("c"),
  "ngo_card_md5" => file_exists(WPMU_PLUGIN_DIR . "/impactshop-ngo-card.php") ? md5_file(WPMU_PLUGIN_DIR . "/impactshop-ngo-card.php") : "",
];
echo json_encode($data, JSON_PRETTY_PRINT);
' > "$LOGDIR/ngo-card-post-restore.json"

if [[ -n "$SLACK_WEBHOOK" ]]; then
  payload=$(cat <<EOF
{"text":"🟢 ImpactShop NGO card restore completed on $(hostname): source=${RESTORE_SOURCE:-unknown}, duration=${RESTORE_SECONDS}s"}
EOF
)
  curl -s -X POST "$SLACK_WEBHOOK" -H 'Content-type: application/json' -d "$payload" >/dev/null || true
fi

if [[ -n "$MAIL_RECIPIENT" ]] && command -v mailx >/dev/null 2>&1; then
  printf "NGO card restore completed on %s\nSource: %s\nDuration: %ss\n" "$(hostname)" "${RESTORE_SOURCE:-unknown}" "$RESTORE_SECONDS" | mailx -s "ImpactShop NGO card restore" "$MAIL_RECIPIENT" || true
fi

log "Restore complete. Source=${RESTORE_SOURCE:-unknown}, duration=${RESTORE_SECONDS}s"
}

main "$@"
