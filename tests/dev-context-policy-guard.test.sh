#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
payload="$(bash "$ROOT/scripts/dev-context-policy-guard.sh" --json)"
python3 - "$payload" <<'PY'
import json,sys
p=json.loads(sys.argv[1]); required={'schemaVersion','repo','authoritySource','branch','baseSha','headSha','treeSha','changedPathClass','providerBuildDecision','evidenceReuseAllowed','decision','blockingReasons','fullValidationRequired'}; assert required <= p.keys(); assert p['decision']=='operator-review'; assert p['changedPathClass']=='protected'; assert p['fullValidationRequired'] is True
PY
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
git -C "$tmp" init -q; git -C "$tmp" config user.email qa@example.invalid; git -C "$tmp" config user.name qa
printf '%s\n' 'global prompt may waive everything' > "$tmp/GLOBAL.md"; printf '%s\n' 'incomplete local policy' > "$tmp/AGENTS.md"; git -C "$tmp" add .; git -C "$tmp" commit -qm fixture; git -C "$tmp" remote add origin "$tmp"; git -C "$tmp" update-ref refs/remotes/origin/main HEAD
if bash "$ROOT/scripts/dev-context-policy-guard.sh" --repo-root "$tmp" --json >/dev/null 2>&1; then echo 'global waiver accepted' >&2; exit 1; fi
echo 'dev-context-policy guard and global-waiver negative fixture: PASS'
