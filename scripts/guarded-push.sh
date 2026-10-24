#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if command -v python3 >/dev/null 2>&1 && [[ -f "$ROOT/scripts/workspace-native.py" ]]; then
  exec python3 -B "$ROOT/scripts/workspace-native.py" push "$@"
fi
echo '[guarded-push] advisory: optional helper unavailable; no audit evidence. Native Git and its existing hooks continue.' >&2
exec git push "$@"
