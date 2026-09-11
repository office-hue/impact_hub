# DEV v4 Impact Hub Stage A — inert bootstrap

Status: `approved-for-luna`, source-only, `activation-not-performed`

This package adds only a repo-local snapshot of the central contract, an
`impact_hub` capability snapshot, and read-only/static negative-proof checks.
The existing DEV v2 policy remains the authority. The verifier cannot emit
`ready`, cannot admit a lane, and cannot perform provider, host, runtime,
secret, scheduler, watchdog, build, deploy, or network actions.

Identity: branch `feat/dev-v4-bootstrap-stage-a-20260911`, plan ID
`dev-v4-impacthub-stage-a-20260911`, base `origin/main@631976dd35b3a774c9c4a3963d4b4311df2edbe4`.
The central snapshot pins `office-hue/ai-agent` repository ID `1173292974`,
merge `94db78c66b21979c9511594344649a518a4d31d8`, tree
`6fd0f87b40b74e74abce72caf03a48280f7659ab`, and operations package digest
`229649232d28644a85321f43f0f7b266bdb8a05cc6d5329d8b40c84b154d43dd`.

Acceptance is limited to focused Node tests, the static maximum bastion,
existing repo guards, DocSync/continuity, strict audit and diff check. Stage B
requires a fresh exact-main worktree and a separately authorized activation
change; this Stage A candidate is `valid-unverified` only.
