# Repository Guidelines

## Canonical Policy Sources
- Workspace global policy: `/Users/bujdosoarnold/AGENTS.md`
- Shared assistant policy: `/Users/bujdosoarnold/Developer/GitHub/ai-agent/docs/ai-assistant-canonical-policy.md`
- Local assistant policy: `docs/ai-assistant-canonical-policy.md`
- PR / merge / deploy policy: `docs/pr-policy.md`

If any local assistant configuration conflicts with these files, treat the above list as canonical in that order.

## Git / PR / Deploy
- This repo follows the enforced one-path workflow in `docs/pr-policy.md`.
- Direct `main/master` commit and push are forbidden.
- New work starts from a feature/worktree branch.
- Deploy may only happen from merged mainline state through guarded workflow.

## Session Workflow
- Session start: run `memory:pre-task` from the `ai-agent` repo.
- Session end: run `memory:v2:session-save` and `memory:full-sync` from the `ai-agent` repo.

## Language
- All user-facing summaries and handoff notes should be Hungarian unless the task explicitly requires otherwise.
