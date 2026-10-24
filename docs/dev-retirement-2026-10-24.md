# Hub DEV retirement — source-only, 2026-10-24

Identity: dedicated clone `/Users/bujdosoarnold/.worktrees/impact_hub-dev-retirement-20261024`,
branch `dev/retirement-20261024`, base `571cdcd394f7d71743de151f79071c8f08668685`,
origin `https://github.com/office-hue/impact_hub.git`. The approved retirement
supersedes former DEV engine/capsule/selector/model/admission requirements.
This change does not migrate installed task state or activate a host/runtime.

## Source behavior

| Former entrypoint | Current behavior |
| --- | --- |
| v2 delivery, Stage A/B, installed controller | Explicit `retired`, `not-evaluated`, no writes/lifecycle/permit |
| continuity/readiness/context/repin/coordination | Read-only native identity; no marker, registry or sibling writes |
| start/task-start | Native worktree creation only with explicit new path/local base; no hidden fetch/memory |
| install-hooks-all | Read-only prepare/render; explicit own-target apply + reviewed digest + backup/CAS |
| safe-repo-audit | Native exact index/local/push/range content and whitespace checks; redacted findings |
| guarded-push | One native push with temporary exact-ref pre-push audit; executable custom hook retained |
| PR/CI | Actual source checks and affected product Jest; PR prose is advisory |

Existing files under `config/dev-v4/` and `config/dev-delivery-v2*.json` retain
historical pins only; `config/DEV-RETIRED.md` marks their superseded role.
Compatibility outputs never manufacture allowed/PASS/lifecycle readiness.
Native Git remains usable without Python, workspace helpers, an installed
controller, memory, capsule, selector, Plan-ID or hook installation.

## Preserved safety and affected checks

The predecessor audit had secret/private-key/token/env detection and procedural
documentation checks; it invoked no separate Hub product checker. Token/env
scanning remains, includes staged and untracked bytes and every outgoing commit,
merge-only content, renames and all native push ref updates. New refs use one
read-only advertisement of the actual native push URL, excluding reachable
advertised remote commit tips; no stale upstream cache, fetch or ref mutation.
Incomplete/missing remote evidence is unavailable, not an all-history fallback
or a PASS. An explicitly requested offline `--all-history` audit includes roots.
Values are never printed. Missing evidence is unavailable, never a fake PASS.
Explicit repo selection ignores caller GIT_DIR/GIT_WORK_TREE/GIT_COMMON_DIR
redirects while preserving GIT_INDEX_FILE for native partial-commit auditing.
Explicit strict audit exits 1 for real findings, 2 for unavailable evidence;
mixed findings/unavailability remain 1. Optional hooks convert unavailable and
whitespace-only results into honest advice; actual secret findings still block.

Tracked content behind an outside-worktree parent symlink is not read; local
audit reports the affected snapshot unavailable. Dependency identity is an
observation, not installed compatibility evidence. It includes lockfiles,
requirements/composer/local package inputs, uses the effective AGENTS override,
and does not parse a foreign dependency manifest through a linked directory.

The coupon extractor Jest remains the native product check. CI selects it for
product/package surfaces without any DEV selector or installed state. The
coupon-harvest workflow, actual coupon source/fixtures, WordPress, embedded
product sources, operational `.codex` files, package/lockfiles and deployment
scripts are unchanged. No npm install or product/provider/harvester operation
was run locally. Actual release/env/auth/recovery boundaries still apply.

## Installation and rollback boundary

No live hook, Git config, client config, host or sibling checkout was changed.
Tests create isolated temporary repos and local bare remotes only; their Git
commits/pushes are fixtures, not publication. The temporary guarded-push hook
directory is scoped to one Git invocation; existing persistent hooks/config
remain unchanged. Exact known legacy hook hashes may be retired; unknown custom
hooks are preserved and their failures remain failures.

Backups are private under the target Git metadata directory, not a potentially
tracked hooksPath: directories 0700, manifests 0600, owner/symlink validation.
Public prepare/apply reports omit private hook bytes, including base64 snapshots.
Installer rollback restores exact recorded bytes/modes and the old local
template, resuming only its own before/after mixed states on changed fields.
Identity/configuration and unrelated fields must remain exact; custom edits
refuse rollback overwrite. Linked checker/source directories are not executed.
Shared/external hook directories require the owner target
migration and are not written by this clone. Source rollback is a reviewed
ordinary revert after publication; no destructive reset or old engine repair.

## Verification and limits

Commands: `python3 -B tests/workspace-retirement.test.py`; native Node test files
`tests/dev-v4-{stage-a,stage-b,installed-controller-adapter,hook-compatibility}.test.mjs`;
`bash scripts/safe-repo-audit.sh --repo . --strict --mode local`; shell/Node/Python
syntax checks and `git diff --check`. Exact current counts are in notes and the
status snapshot. Product tree parity is checked against the base.

This is a source-only publication candidate. Actual commit/push/PR state is
established by a separate GitHub readback, not this document; merge/deploy is
outside this publication step. No provider link/config was found in this clone
or canonical Hub root. The accessible Vercel exact GitHub-repository-ID query
returned no projects; GitHub exposed no webhook/deployment/status connection.
The checked workflows contain PR validation and unchanged manual/scheduled
coupon harvesting, not a push deployment. This is not a universal proof of
provider absence. Existing live hooks on other
checkouts may still contain former gates until a separately scoped migration.
No full Jest claim: local dependencies were absent and product sources were
unchanged. CI source configuration is not an executed remote CI result. New
refs with unavailable remote proof have no complete outgoing-audit evidence;
optional native hooks warn rather than blocking on unavailable DEV support.
The read-only remote advertisement is bounded to 15 seconds and may race a
concurrent remote update; it is observation, not a lifecycle permit.
Pattern-based secret detection is
not proof that every possible secret format is absent.

Five-axis self-review: functionality has native source/secret/start/push
negative coverage; coherence uses retired notices consistently; security keeps
secret/custom-hook/scope boundaries; risk is bounded by source-only work and
backup/CAS; rollback refuses foreign drift. No identified concrete open P1/P2
in this source slice after the focused regressions; live acceptance remains a
separate operation.
