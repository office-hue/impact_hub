#!/usr/bin/env bash
# Shared utilities for cron/guard scripts (logging, Slack, sandbox fallback).
# Source this file from any guard script after defining ROOT (repo root).

if [[ -n "${IMPACT_GUARD_COMMON_SOURCED:-}" ]]; then
  return 0
fi
IMPACT_GUARD_COMMON_SOURCED=1

if [[ -z "${ROOT:-}" ]]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi

GUARD_LOG_DIR="${ROOT}/.codex/logs"
mkdir -p "${GUARD_LOG_DIR}"

guard__escape_osascript() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

guard_run_in_terminal_if_needed() {
  local script_path="$1"; shift || true

  if [[ "${GUARD_TERMINAL_FALLBACK:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "${IMPACT_DISABLE_GUARD_TERMINAL_FALLBACK:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "$OSTYPE" != darwin* ]]; then
    return 0
  fi
  if [[ -t 0 || -n "${TERM_PROGRAM:-}" || -n "${SSH_TTY:-}" ]]; then
    return 0
  fi
  if ! command -v osascript >/dev/null 2>&1; then
    return 0
  fi

  local cmd="cd '${ROOT}' && GUARD_TERMINAL_FALLBACK=1 $(printf '%q' "$script_path")"
  local arg
  for arg in "$@"; do
    cmd+=" $(printf '%q' "$arg")"
  done
  local escaped
  escaped="$(guard__escape_osascript "$cmd")"
  /usr/bin/osascript <<OSA >/dev/null 2>&1
do shell script "$escaped"
OSA
  exit 0
}

guard_log_event() {
  local guard="$1"
  local status="$2"
  local message="${3:-}"
  local log_file="${GUARD_LOG_DIR}/guard-events.log"
  printf '%s | %s | %s | %s\n' "$(date -Iseconds)" "$guard" "$status" "$message" >>"$log_file"
}

guard_json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  printf '%s' "$value"
}

guard_post_slack() {
  local guard="$1"
  local status="$2"
  local message="$3"
  local webhook="${IMPACT_GUARD_SLACK_WEBHOOK:-${SLACK_WEBHOOK_URL:-}}"
  if [[ -z "$webhook" ]]; then
    return 0
  fi
  local emoji=":white_check_mark:"
  if [[ "$status" != "OK" ]]; then
    emoji=":rotating_light:"
  fi
  local text="${emoji} *${guard}* — ${status}\n${message}"
  local payload
  payload=$(jq -n --arg text "$text" '{text:$text}' 2>/dev/null || true)
  if [[ -z "$payload" ]]; then
    payload="{\"text\":\"$(guard_json_escape "$text")\"}"
  fi
  curl -sS -X POST -H 'Content-Type: application/json' -d "$payload" "$webhook" >/dev/null 2>&1 || true
}

guard_result() {
  local guard="$1"
  local status="$2"
  local message="$3"
  guard_log_event "$guard" "$status" "$message"
  guard_post_slack "$guard" "$status" "$message"
}
