# Impact Hub repository guidance

## Current source workflow — 2026-10-24

The explicitly approved DEV retirement replaces the former one-path DEV
engine/capsule/selector/model/admission requirements. Native Git, project checks,
and an isolated branch/worktree are sufficient for source work. No installed
controller, Plan-ID, task registry, memory packet, or hook installation is required.
Old files under config/dev-v4 and config/dev-delivery-v2* are historical inputs,
not current authorization or automatic execution policy.

Use the current user instructions and the local domain sources:
docs/ai-assistant-canonical-policy.md, docs/pr-policy.md,
docs/impact-hub-governance-system-plan-2026-06-16.md,
docs/system-recovery-map.md and the env/auth/runtime adapter.
Read applicable nested instructions for changed files.

## Actual boundaries

Write only in the assigned worktree; preserve other people's changes and useful
custom hooks. Do not print or commit secrets. Run affected native tests; report
failed/unavailable checks honestly. Missing optional DEV tools are advisory.
Do not infer push, main integration, deploy, provider, host, secrets, cron or
watchdog authority from local success. Remote branch protection remains in force.
A source-ready candidate is not merged, installed, deployed or production accepted.

Optional helpers: scripts/workspace.py, scripts/workspace-hooks.py and
scripts/guarded-push.sh. Hook installation defaults to read-only preparation;
explicit target + reviewed beforeDigest, backup/CAS and bounded rollback are
required for apply. No global Git settings or sibling checkout discovery.

## Continuity and language

Keep meaningful recovery/guard changes traceable in docs, notes.md and
system-status-snapshot.md; use the local DOCSYNC map. These records support
review and do not turn an unrelated documentation gap into a Git blocker.
Memory is optional; use the canonical service explicitly and report unavailable
recall without fabricating a receipt. No automatic foreign memory writes.
User-facing summaries and handoffs are Hungarian unless requested otherwise.

Current implementation/rollback: docs/dev-retirement-2026-10-24.md.
