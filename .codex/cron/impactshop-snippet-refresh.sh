#!/usr/bin/env bash
set -euo pipefail

# Impact Shop static snippet refresher
# -----------------------------------
# Regenerates the public-facing HTML snippets (shop donation cards and NGO
# leaderboard) via the existing Python generators. Intended to be called from
# cron once or a few times per day so the embeds stay in sync with the latest
# CSV/API data without manual intervention.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
GUARD_NAME="snippet-refresh"
source "$REPO_ROOT/.codex/scripts/lib/guard-common.sh"
guard_run_in_terminal_if_needed "$0" "$@"
cd "$REPO_ROOT"

PYTHON_BIN="${IMPACT_PYTHON_BIN:-python3}"

TARGETS=(
  "scripts/generate_shop_donation_cards.py::impactshop-notes/shop-donation-cards.html"
  "scripts/generate_ngo_leaderboard.py::impactshop-notes/ngo-leaderboard.html"
)

run_generator() {
  local script_path="$1"
  local output_path="$2"
  local label="$3"

  if [[ ! -f "$script_path" ]]; then
    echo "❌ ${label}: hiányzik a generáló script (${script_path})" >&2
    return 1
  fi

  local tmp_file=
  if [[ -f "$output_path" ]]; then
    tmp_file="$(mktemp)"
    cp "$output_path" "$tmp_file"
  fi

  echo "🔄 ${label}: frissítés folyamatban (${script_path})"
  if ! "$PYTHON_BIN" "$script_path"; then
    echo "⚠️  ${label}: a generator hibával tért vissza" >&2
    [[ -n "$tmp_file" ]] && rm -f "$tmp_file"
    return 1
  fi

  if [[ -n "$tmp_file" ]]; then
    if cmp -s "$tmp_file" "$output_path"; then
      echo "ℹ️  ${label}: nincs változás a kimenetben (${output_path})"
    else
      echo "✅ ${label}: frissített kimenet (${output_path})"
    fi
    rm -f "$tmp_file"
  else
    echo "✅ ${label}: új kimenet létrehozva (${output_path})"
  fi
}

overall_status=0
declare -a FAILED_TARGETS=()

for pair in "${TARGETS[@]}"; do
  script_path="${pair%%::*}"
  output_path="${pair#*::}"
  label="$(basename "$output_path")"
  if ! run_generator "$script_path" "$output_path" "$label"; then
    overall_status=1
    FAILED_TARGETS+=("$label")
  fi
done

if (( overall_status == 0 )); then
  guard_result "$GUARD_NAME" "OK" "Generators refreshed: ${#TARGETS[@]}"
else
  guard_result "$GUARD_NAME" "FAIL" "Hibás generátorok: ${FAILED_TARGETS[*]}"
fi

exit "$overall_status"
