# Worktree coordination observation

The old automatic shared ACTIVE_WORKTREE.md / ACTIVE_WORKTREES.md writer is
retired. The compatibility command now observes only the requested/current
repository. It does not discover, mutate or reconcile sibling worktrees.
No controller, task-start artifact or capsule is needed.

Use native `git worktree list` when you explicitly need a local inventory.
Use explicit target paths for new worktrees. Source documentation, actual
checks and host operations remain separate observations, not authority.
See dev-retirement-2026-10-24.md.
