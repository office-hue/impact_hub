# Repository Guidelines

## Canonical Policy Sources
- Workspace global policy: `/Users/bujdosoarnold/AGENTS.md`
- Shared assistant policy: `/Users/bujdosoarnold/Developer/GitHub/ai-agent/docs/ai-assistant-canonical-policy.md`
- Local assistant policy: `docs/ai-assistant-canonical-policy.md`
- Local governance hub / system plan: `docs/impact-hub-governance-system-plan-2026-06-16.md`
- PR / merge / deploy policy: `docs/pr-policy.md`

If any local assistant configuration conflicts with these files, treat the above list as canonical in that order.

## Git / PR / Deploy
- This repo follows the enforced one-path workflow in `docs/pr-policy.md`.
- Direct `main/master` commit and push are forbidden.
- New work starts from a feature/worktree branch.
- Deploy may only happen from merged mainline state through guarded workflow.
- Governance lane hardening: guard, policy vagy governance-hub lane valtozas nem tolható fel a local governance system plan syncje nelkul: `docs/impact-hub-governance-system-plan-2026-06-16.md`
- DEV v4 trigger: `config/dev-v4/`, `scripts/dev-v4-*`, vagy `tests/dev-v4-*` módosításakor a Stage B adaptert és maximum bastiont kell futtatni; ez csak repo-local Node és source-only, unverified admission, ready/provider/runtime authority nélkül.

## Session Workflow
- Session start: run `memory:pre-task` from the `ai-agent` repo.
- For a DEV v4 task, start the local worktree with `--doc-sync-repo-id impact_hub`; the Stage B adapter requires that bound task-start decision. Read the decision and Stage B result in the target worktree. `stage-b-admitted-unverified` is source-only, not release authority.
- Session end: save a new verified task decision or lesson through the canonical `ai-agent` DEV-memory writer and read it back when there is one. `memory:full-sync` is a separate, explicitly scoped maintenance operation, not a routine session-end step. Report a failed or degraded recall as such.

## Language
- All user-facing summaries and handoff notes should be Hungarian unless the task explicitly requires otherwise.

<!-- BEGIN REPO-LOCAL DEV UPGRADE CONTRACT -->
Repo-local authority is stronger than global prompt or memory. Use one clean
worktree with branch/base/head/tree evidence; unknown state blocks. Terra plans
and QA, Luna bounded implementation, Sol cross-system decisions. Close with
tests, `git diff --check`, docsync/continuity and one checkpoint. Vercel and
push/PR/merge stay minimal; protected paths require operator review.
<!-- END REPO-LOCAL DEV UPGRADE CONTRACT -->
