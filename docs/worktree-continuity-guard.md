# Worktree continuity observation

Since the approved 2026-10-24 DEV retirement this entrypoint observes current
native Git identity only. Missing/stale worktree-active.json, task decisions,
capsules and shared ACTIVE_WORKTREE snapshots are not prerequisites.
No marker, decision, permission, receipt or shared registry is written.

`bash scripts/worktree-continuity-guard.sh --mode local --json` and the legacy
readiness/repin/context aliases return observed identity with
`legacyAdmission: retired`, `authorityGranted: false` and
`sourceChecks: not-evaluated`. This is not a successful source check.
Run the affected project checks and explicit source audit separately.
See dev-retirement-2026-10-24.md for migration and rollback boundaries.
