#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if command -v python3 >/dev/null 2>&1 && [[ -f "$ROOT/scripts/workspace-hooks.py" ]]; then
  exec python3 -B "$ROOT/scripts/workspace-hooks.py" install "$@"
fi
printf '%s\n' '{"status":"unavailable","advisoryOnly":true,"writes":false,"reason":"Optional installer/Python missing; native Git works without hook installation."}'
