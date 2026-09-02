#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
python3 - "$root" <<'PY'
import sys,json
from pathlib import Path
r=Path(sys.argv[1]); s=((r/'AGENTS.md').read_text(errors='replace') if (r/'AGENTS.md').exists() else '').lower()
tokens=['repo-local authority','global prompt','Luna','Terra','Sol','worktree','checkpoint','Vercel']
bad=[]
if 'begin repo-local dev upgrade contract' not in s or 'end repo-local dev upgrade contract' not in s: bad.append('missing-local-policy')
bad += ['missing:'+x for x in tokens if x.lower() not in s]
p={'schemaVersion':1,'repo':'impact_hub','authoritySource':'repo-local','decision':'blocked' if bad else 'allowed','blockingReasons':bad}
print(json.dumps(p,sort_keys=True)); sys.exit(1 if bad else 0)
PY
