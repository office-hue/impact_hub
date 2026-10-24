#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if command -v python3 >/dev/null 2>&1 && [[ -f "$ROOT/scripts/workspace-native.py" ]]; then
  exec python3 -B "$ROOT/scripts/workspace-native.py" start "$@"
fi
echo '{"status":"retired","advisoryOnly":true,"writes":false,"next":"Use git worktree add -b <branch> <explicit-path> <local-base>; no fetch or registry step required."}'
