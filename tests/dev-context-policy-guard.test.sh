#!/usr/bin/env bash
set -euo pipefail
bash "$(dirname "$0")/../scripts/dev-context-policy-guard.sh" --json >/dev/null
echo 'dev-context-policy guard: PASS'
