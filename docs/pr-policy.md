# Native Git source and release policy

The approved 2026-10-24 DEV retirement removes mandatory controller, capsule,
selector, Plan-ID, prescribed model routing, memory gate and PR-body admission.
Native Git remains usable without installing workspace support or hooks.

Use a dedicated branch/worktree and affected native project checks. State scope,
risk, validation and rollback in the PR. Documentation and continuity are review
guidance, not a mechanical source admission test. An optional checklist is not
proof of testing, permission, deployment or acceptance.

Optional commands:

- `python3 -B scripts/workspace.py doctor --repo .`
- `bash scripts/start-feature-worktree.sh feat/name --path /explicit/new/path --base HEAD`
- `bash scripts/install-hooks-all.sh --repo /explicit/repo` prepares only.
- Apply only after reviewing the exact target: `--apply --repo /explicit/repo --expect <beforeDigest>`.
- `bash scripts/safe-repo-audit.sh --strict --mode range --base <sha> --head <sha>`.
- `bash scripts/guarded-push.sh <native git push args>` checks Git's actual ref
  updates, including multiple refs/new branches/renames, without persistent
  hook/config writes. Exact known old DEV hooks are retired for that one push;
  unknown executable custom pre-push hooks remain in the chain.

Real secret/content findings fail. Missing optional checker evidence is reported
as unavailable; native hooks/wrapper continue with an advisory. Whitespace is
advice in optional hooks; explicit source audit reports its actual failure.
No automatic fetch, shared registry update or foreign memory write occurs.

Publishing, protected mainline integration, provider/deploy/runtime/host changes
still need authority for that concrete operation and its applicable product
verification/rollback. Remote branch protection is preserved. Recovery and
env/auth/runtime rules remain in docs/system-recovery-map.md and the local
env/auth/runtime adapter. Coupon harvesting and deployment are separate product
operations; their workflow and credentials are unchanged by this source change.

Hook rollback accepts only this target's backup and unchanged own installed
poststate; it preserves intervening custom edits. Source code can be reverted
through a reviewed ordinary Git revert after publication. No live installation,
commit, push or deployment is implied here.
