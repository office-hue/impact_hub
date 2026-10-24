#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if ! command -v python3 >/dev/null 2>&1 || [[ ! -f "$ROOT/scripts/workspace-hooks.py" ]]; then
  echo '{"status":"unavailable","sourceChecks":"not-evaluated","direct":"Use reviewed workspace-hooks.py audit --strict with exact --base/--head."}' >&2
  exit 2
fi
exec python3 -B "$ROOT/scripts/workspace-hooks.py" audit "$@"
