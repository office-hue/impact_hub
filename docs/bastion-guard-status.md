# Bastion Guard Status

Status: source-ready, no external mutation
Last updated: 2026-09-04

## DEV delivery v2 corrective checkpoint

The `scripts/dev-delivery-v2-adapter.py` control is source-only. Its production
root is the exact invoking worktree root; sibling and foreign repositories are
rejected. Its fixture lane accepts only an explicit, separate temporary root,
does not contact the network or write to that root, and verifies a before/after
snapshot. Protected, deploy and unknown paths stay blocked until the PR workflow
runs the defined full-validation gate. Evidence is produced by policy-owned
command profiles and a frozen candidate tree, never a caller-supplied exit code.

No deploy, provider build, product data, cron, watchdog, VPS or credential state
was changed by this checkpoint.
