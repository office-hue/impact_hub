#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if command -v python3 >/dev/null 2>&1 && [[ -f "$ROOT/scripts/workspace-native.py" ]]; then
  exec python3 -B "$ROOT/scripts/workspace-native.py" observe "$@"
fi
printf '%s\n' '{"status":"retired","advisoryOnly":true,"authorityGranted":false,"writes":false,"checks":"not-evaluated","reason":"DEV registry/controller is retired. Use native Git."}'
