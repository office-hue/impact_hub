# DEV v4 Impact Hub context closure

Plan ID: `dev-v4-impact-hub-context-closure-20260917`
Status: approved bounded repo-local correction
Base: exact `origin/main` `4cadf15a2ca694fba92a993d39a5e911994e5133`, tree `168dc3babaddad2b48c563d724a23b45007ffb98`

## Scope

Close two verified local distribution gaps. The session rule currently requires `memory:full-sync` at every end, contrary to the bounded DEV recall and targeted memory-write contract. The worktree starter writes its readiness and task-start decision for the invoking worktree even after creating a different target worktree, and the marker's `repo_root` also points to the invoker. Stage B needs `--doc-sync-repo-id impact_hub` and a marker and decision bound to that target worktree.

Change only `AGENTS.md`, `scripts/worktree-task-start.sh`, this plan, the governance system plan, the required protected-lane `docs/bastion-guard-status.md`, and local continuity (`notes.md`, `system-status-snapshot.md`, `docs/continuity/dev/2026-09-17-dev-v4-impact-hub-context-closure.md`). The existing Stage B verifier, immutable central snapshot, provider and runtime paths stay unchanged. A separate exact-main worktree was created by the canonical task-start. Its private marker and decision are never hand-edited. No deployment or live release is in scope.

## Acceptance

Invoking the updated task-start from a different worktree with `--resume --doc-sync-repo-id impact_hub` must refresh the target worktree's private marker and decision, leave the invoking worktree's decision identity unchanged, and yield `stage-b-admitted-unverified` in the target. The target readiness and decision must be `allowed` with installed hooks. `AGENTS.md` must retain repo-local precedence and make full sync a separate, explicit maintenance step. No ready, provider, runtime, host or release authority is granted.

## Validation

Run `bash -n` on the starter, a functional cross-worktree resume/readback using the existing private capsule, `node scripts/dev-v4-stage-b-adapter.mjs`, focused Stage B tests, `git diff --check`, local governance/health checks and relevant PR policy gates. Reuse the unchanged Stage A/Stage B contract evidence only where commit/tree and environment binding permit. Record any absent dependency as untested, not PASS. Do not run a provider build or product workflow.

## Rollback

Revert this source commit through the normal PR route if the target decision binding regresses. Do not hand-edit private capsule, decision or memory database files. A failed starter stops the affected task; the prior source remains available at the base SHA. Any live operation requires its own permit.
