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
