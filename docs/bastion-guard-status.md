# Bastion Guard Status

Status: corrective checkpoint candidate, no external mutation
Last updated: 2026-09-04

## DEV delivery v2 corrective checkpoint

The `scripts/dev-delivery-v2-adapter.py` control is source-only. Its production
root is the exact invoking worktree root; sibling and foreign repositories are
rejected. Its fixture lane accepts only an explicit, separate temporary root,
does not contact the network or write to that root, and verifies a before/after
snapshot. Protected and deploy paths remain `operator-review` and must run the
defined full-validation gate; unknown paths stay fail-closed. The validation
lane uses the tracked lockfile and disables dependency lifecycle scripts.
Evidence is produced by policy-owned command profiles and a frozen candidate
tree, never a caller-supplied exit code.

No deploy, provider build, product data, cron, watchdog, VPS or credential state
was changed by this checkpoint.

## DEV v4 Impact Hub Stage B

The native adapter is source-only and local-Node-only. It validates the Stage A
identity and returns only `stage-b-admitted-unverified`; readiness and all
external mutation authority remain false. Stage B stays in the DEV v2 protected
lane. No provider, build, deploy, VPS, runtime, secret, cron, watchdog or
shared-dependency mutation occurred.

The Stage A verifier remains at its exact Stage A blob; Stage B root, capsule,
central-snapshot and file-pin checks are isolated in the Stage B adapter.

## DEV delivery v2 QA2 hardening

The adapter, its real `tools/__tests__/dev-delivery-v2-*` suite, policy and
contract, guard entrypoints, PR policy anchors and every GitHub workflow are in
the protected/full-validation class. The executable evidence allowlist is now
hardcoded in the adapter; the JSON policy must match it exactly and cannot add
a command or profile by itself. Every recorded check captures and enforces the
index tree, unstaged tracked state and unexpected-untracked state both before
and after execution; closure repeats the same checks and records no unverified
task-wide external-write boolean.

Fixture reads are restricted to `tools/fixtures/dev-delivery-v2` or a
same-owner, mode-0700, direct system-temp test root with the exact fixture name
prefix. Root and entry realpaths, owners, modes and file types are checked;
symlinks, foreign roots and bounded-size violations fail closed.

The required PR job uses the event base/head SHAs, full history, canonical Node
22 and `npm ci --ignore-scripts`. Its protected lane runs the full Jest suite,
negative/fixture adapter checks, the bastion/continuity check, exact-range safe
audit and exact-range `git diff --check`. It does not depend on local continuity
snapshots, installed hooks, local-main health or a clean-worktree audit.
## DEV v4 Impact Hub Stage A correction receipt

The inert Stage A snapshots and read-only verifier remain under DEV v2
authority. The follow-up classifier correction places `config/dev-v4/`,
`scripts/dev-v4-*`, `tests/dev-v4-*` and related Stage A documentation in the
`protected` class, so CI returns `operator-review` with mandatory validation
instead of `unknown-path-class`. No `ready` state, activation, provider,
build, deploy, VPS, runtime, secret, cron or watchdog authority was added.

## 2026-09-17 DEV v4 target-worktree context correction

The repo-local starter now writes its marker, readiness decision and
coordination snapshot for the target worktree even when another checkout calls
it. A cross-worktree `--resume --doc-sync-repo-id impact_hub` verified that the
invoking checkout's decision hash stayed unchanged while the target's marker
and decision matched its own root; Stage B returned only
`stage-b-admitted-unverified`. The obsolete routine session-end full-sync rule
was removed. This protected control change still needs the PR's full-validation
lane and grants no provider, host, runtime or release authority.

The first PR #50 run passed full Jest and then stopped at `ci-pr-tuple-invalid`:
the native Stage B CI gate still required the one-time Stage A activation SHA
as every future PR base. The corrected gate binds the authenticated event's
`main` base and exact head to the checkout, with Stage A ancestry through the
base; negative repo/ref/SHA/ancestry fixtures preserve fail-closed behavior.
No Stage A pin or source-only capability bit changes. Final CI readback is
required before calling this correction merged.

## 2026-09-27 installed-controller adapter continuity

The Impact Hub target now carries the DEV v4 policy bundle and a thin
installed-controller adapter. It validates the canonical origin, retained
engine digest and non-candidate policy before forwarding `start`; `status` and
`resume` remain read-only. A legacy marker is forwarded as the controller's
`blocked:unsupported_legacy_marker` result. Stage A/B validation is 13/13,
adapter execution-path validation is 7/7, and the isolated installed CLI
start/status/resume/context smoke passed.

This is source-only evidence. No provider, build, deploy, VPS, runtime, cron,
secret, dependency or product-data mutation occurred. If the candidate is not
accepted, revert the policy and adapter source commits as one reviewed change;
no runtime apply or live rollback is involved.
