# DEV v4 Stage B continuity

- Branch: current task-start capsule branch (not hardcoded; must be non-detached)
- Base: recorded `origin/main`; its commit must be an ancestor/equal of current `origin/main`
- Adapter: `scripts/dev-v4-stage-b-adapter.mjs`
- Decision: local Node only, `stage-b-admitted-unverified`
- Ready/provider/runtime/host authority: false
- Central/shared dependency: not required; missing capability remains unverified
- Next bounded action: reviewer validation and checkpoint; no push or deployment
