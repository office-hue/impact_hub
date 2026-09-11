# DEV v4 Impact Hub Stage B

Stage B activates a native, repo-local adapter for the reviewed Stage A
contract. Admission is limited to local Node checks and remains
`stage-b-admitted-unverified`; it does not establish readiness or authority.
The Stage B verifier binds the live worktree capsule, task-start decision,
current branch, HEAD/tree, and immutable Stage A Git objects. A recorded
capsule base, when present, must name `origin/main` and be an ancestor/equal
of the current remote-tracking ref; this also permits a post-squash arbitrary
branch while rejecting a forged HEAD-as-base pre-merge capsule. The Stage A
verifier remains byte-identical to its Stage A blob.
Central/shared dependencies are evidence-only and missing capability remains
lane-specific unverified. Provider, build, deploy, VPS, runtime, secret, cron
and watchdog actions are outside this package.

Base: `5f592790aa2f69de69dee3b3c0ba5d43c5d9ef36`, tree
`c343d4126d60f0d50149815ae461ab6fead79dbb`. The central identity remains the
reviewed `ai-agent` repository id `1173292974`, merge
`94db78c66b21979c9511594344649a518a4d31d8`, tree
`6fd0f87b40b74e74abce72caf03a48280f7659ab`, operations digest
`229649232d28644a85321f43f0f7b266bdb8a05cc6d5329d8b40c84b154d43dd`.
