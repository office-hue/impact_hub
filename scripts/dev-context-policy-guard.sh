#!/usr/bin/env bash
set -euo pipefail
json=0
root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
while (($#)); do
  case "$1" in
    --json) json=1; shift ;;
    --repo-root) [[ $# -ge 2 ]] || exit 2; root="$2"; shift 2 ;;
    *) exit 2 ;;
  esac
done
python3 - "$root" "$json" <<'PY'
import json, os, re, subprocess, sys
from pathlib import Path
r=Path(sys.argv[1]).resolve(); output_json=sys.argv[2]=='1'; reasons=[]
def git(*a):
    result=subprocess.run(['git','-C',str(r),*a],capture_output=True,text=True)
    return result.stdout.strip() if result.returncode == 0 else ''
s=((r/'AGENTS.md').read_text(errors='replace') if (r/'AGENTS.md').is_file() else '').lower()
tokens=['begin repo-local dev upgrade contract','end repo-local dev upgrade contract','repo-local authority','global prompt','luna','terra','sol','worktree','checkpoint','vercel','git diff','--check']
reasons += ['missing:'+x for x in tokens if x not in s]
branch=git('branch','--show-current'); base=git('rev-parse','origin/main'); head=git('rev-parse','HEAD'); tree=git('show','-s','--format=%T','HEAD')
if not branch and os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('GITHUB_SHA')==head and re.fullmatch(r'[A-Za-z0-9._/-]+',os.environ.get('GITHUB_HEAD_REF','')):
    branch=os.environ['GITHUB_HEAD_REF']; event_path=Path(os.environ.get('GITHUB_EVENT_PATH',''))
    if event_path.is_file(): base=json.loads(event_path.read_text()).get('pull_request',{}).get('base',{}).get('sha') or base
if not branch: reasons.append('detached-head')
changed=git('diff','--name-only',f'{base}..{head}').splitlines() if base and head and base != head else []
allowed=('AGENTS.md','package.json','jest.config.cjs','notes.md','system-status-snapshot.md','.github/workflows/pr-checklist-guard.yml')
if all(p in allowed or p.startswith(('docs/','scripts/','tests/')) for p in changed): path_class='governance-only'; provider='not-configured'; decision='allowed'
elif any(p.startswith(('src/','public/','scripts/shortcode_sync/')) for p in changed): path_class='product'; provider='operator-review'; decision='operator-review'; reasons.append('product-path')
else: path_class='unknown'; provider='operator-review'; decision='blocked'; reasons.append('unknown-path-class')
if reasons and decision=='allowed': decision='blocked'
p={'schemaVersion':1,'repo':'impact_hub','authoritySource':'repo-local','branch':branch,'baseSha':base or None,'headSha':head or None,'treeSha':tree or None,'changedPathClass':path_class,'providerBuildDecision':provider,'evidenceReuseAllowed':not reasons,'decision':decision,'blockingReasons':reasons}
print(json.dumps(p,sort_keys=True) if output_json else f"[dev-context-policy] decision={decision}"); sys.exit(0 if decision=='allowed' else 1)
PY
