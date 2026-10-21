# Hub DEV T1 — exact source plan and native recovery boundary

Status: reviewed local source candidate; native recovery explicitly approved
by Arnold on 2026-10-21, limited to the two local commits described below.

<!-- DEV-DELIVERY-V2-MANIFEST
{
  "schemaVersion": 3, "contractId": "dev-v4.plan",
  "planId": "dev-risk-scoped-hub-20261020", "repo": "impact_hub",
  "selectorId": "dev-governance-source",
  "identity": {
    "taskId": "dev-risk-scoped-hub-20261020", "branch": "dev/risk-scoped-hub-20261020",
    "codeBase": "15d8c1a380401a167c0f3e13e54b9b8ad5f21078",
    "policyCommit": "15d8c1a380401a167c0f3e13e54b9b8ad5f21078"
  },
  "decision": {"state": "approved", "summary": "Existing separate central DEV task: bounded Hub adapter source, not native-context override, publication or live authority."},
  "authorization": {"source": "task-request", "taskRequestDigest": "9eb6138c61619c713347eec89de66d36ddb8113c28757b2470cf62dda6d4548a"},
  "scope": {
    "changeImpact": "governance-only", "riskTier": "high", "releaseProfile": "source-only",
    "changeAllowlist": [
      "scripts/dev-v4-installed-controller-adapter.mjs",
      "tests/dev-v4-installed-controller-adapter.test.mjs",
      "tests/dev-v4-stage-b.test.mjs",
      "docs/dev-plans/dev-risk-scoped-hub-2026-10-20.md",
      "docs/continuity/dev/2026-10-20-dev-risk-scoped-hub.md",
      "docs/impact-hub-governance-system-plan-2026-06-16.md",
      "docs/impact-hub-doc-sync-map-2026-06-23.md",
      "docs/bastion-guard-status.md", "notes.md", "system-status-snapshot.md"
    ],
    "documentationTargets": [
      "docs/continuity/dev/2026-10-20-dev-risk-scoped-hub.md",
      "docs/impact-hub-governance-system-plan-2026-06-16.md",
      "docs/impact-hub-doc-sync-map-2026-06-23.md",
      "docs/bastion-guard-status.md", "notes.md", "system-status-snapshot.md"
    ]
  },
  "validation": {"profileId": "affected", "recipePolicyCommit": "15d8c1a380401a167c0f3e13e54b9b8ad5f21078"}
}
DEV-DELIVERY-V2-MANIFEST -->

## Goal, scope and acceptance

Fix real Hub adapter selection/recovery errors. Retain root v1, old pins,
native/Stage A protections, no product/provider/runtime/shared-hook changes.
Bootstrap was planning-only, treebc794c0bfa227f4ebdb332f028b6f3b588cdca5e.
SECRETARY actually rendered engine verified, writes:false, packet absent.
The initial projection required a committed plan. Anchor b598b0007775491ac3e6f42906a9c743afefc593
now exists; supported bind returned revision2/implementation-ready and source
requirements returned continue/missingFacts:[], memory-unavailable advisory.
The plan and continuity were explicitly staged by their two exact allowlisted
paths with staged-blob readback despite the existing /docs/* ignore rule.
No .gitignore change or broad force-add was used.
Parent: office-hue/ai-agent dev/risk-scoped-20261020 sourced329593dfd831c97dd3b505eb1d70cbae8f88df8;
master docs/dev-plans/dev-central-exclusive-write-surfaces-risk-scoped-20261020.md.
Notes7f191a4c and Factlens55f6ebd are separate role evidence, not Hub tests/grants.

## File-level implementation after native anchor and supported bind

1. scripts/dev-v4-installed-controller-adapter.mjs: preserve exported helper
   names where useful, all three canonical origin spellings and --brief FILE
   forwarding. Bound calls use the fixed dispatcher and actual own-state pin,
   never candidate policy/default or conflicting descriptor. Resolve real Git
   metadata; unsafe/orphan state is not unbound. Unbound start requires primary
   main and one local origin/main committed snapshot; choose exact accepted
   canonical descriptor, no retry/fallback. Controller fetch/revalidation is
   later, not an expected-base guarantee; a real start needs a new quiet window.
   Hub lifecycle lacks repoId/accepted capsuleVersion: validate activation
   repoId=impact_hub, exact tuple and top-level capsule3. New commands only bind
   --task-id/--plan-anchor and exact context --render. Strict duplicate-free
   argv, bounded output/time, Notes'16 safe native error codes, unknown errors
   sanitized. Scrub GIT_* then force/forward GIT_NO_REPLACE_OBJECTS=1. Remove
   arbitrary ambient executable/descriptor override semantics, no generic framework.
2. tests/dev-v4-installed-controller-adapter.test.mjs: replace real-target policy
   mutations and installed-default/host reads with private Git/argv fixtures.
   Cover bound pins, committed policy vs candidate/HEAD, replacements, exact
   descriptor, unsafe/orphan metadata, duplicate/unknown args, brief/origins,
   safe/unknown errors and read-only render. Scrub fixture GIT_*; private empty
   hooks, normal commits, pre-write metadata containment/hostile-env regression.
3. tests/dev-v4-stage-b.test.mjs: one import of the adapter test into existing
   CI Node entrypoint. This test is not immutable Stage A. No .github/ change
   (out of selector), pinned Stage A test/verifier, config, hash or hook edit.
   Baseline on the bound schema3 task was 8/9: the first test incorrectly
   assumed any protected local result meant stale legacy HEAD; the real
   result is ENOENT for absent worktree-active.json. Repair only this test:
   when either exact legacy file is actually absent outside CI, assert
   protected/authoritative:false/ready:false and that exact missing-file
   diagnostic. Do not generate markers, widen admission or call this a real
   Stage B pass. All other failures still fail; actual adapter exit is
   reported separately. Register the new suite afterward, then rerun once.
4. Six listed DocSync/continuity files: actual checks, failures, state/next and
   no false readiness. No new runtime module or UI; manual UI N/A.

## Diagnosed native hard boundary — not waived

Actual common pre-commit requires absent worktree-active.json. No safe Hub
standalone producer exists; its legacy starter writes shared coordination and
can run sibling memory writers. Actual common post-commit can asynchronously
run npm memory:capture/sync in another ai-agent worktree. Both must be resolved
before commit/bind. The approved per-command context exception resolved the
first local commit boundary without a shared-hook edit, manual capsule,
hook-path redirection, --no-verify or main override.

Explicit OPERATOR DECISION (2026-10-21: "engedélyezem, de különúton sos haladj"):
exactly two own-branch local
commits (plan anchor and reviewed source) with native context exception backed
by verified v3 identity, unchanged main/integrity checks, and isolated required-
tool execution without optional foreign npm memory writing. Implementation:
per-command IMPACT_POLICY_ALLOW_CONTEXT_MISMATCH=1, verified schema3 task
identity and fixed source pin; isolated PATH containing system tools and
only the existing rg binary, with npm verified absent. Native hooks remain
unchanged and run normally; the main guard and commit-msg check remain active.
No IMPACT_POLICY_ALLOW_MAIN_COMMIT, hook redirection or --no-verify. No push/merge,
provider/host/install grant follows either option. Do not execute the unsafe
legacy starter or fabricate Stage B capsule/decision/admission.

Local git-health-check reports WARN main behind origin/main by seven commits
and FAIL for two existing pre-push requirements (memory:gate and continuity
guard). These are not PASS and remain publication blockers. This approved
local-only recovery does not edit those shared hooks or chase main.

## Validation, operation sequence and rollback

Safe native route → docs anchor → supported same-selector bind/readback/source
requirements → code → Node22 private adapter suite and changed Stage B entrypoint,
applicable Stage B/maximum bastion, syntax/scope/diff checks and independent
five-axis review → corrected DocSync → native source checkpoint. Actual missing
legacy facts remain protected/unverified, never synthetic PASS. No unrelated
Jest/product/harvester/provider/host scan or dependency install. Available6/6.1
only; historical5.6 typed receipts are never invoked/faked. Two failed repairs
per identifier require diagnosis/short plan; original full-plan audits persist.

All three actual target path sets must be aligned ONCE in the planned protected
CENTRAL maintainer-targets declaration/parser/tests, not from this Hub lane.
Native publication still needs exact source/check/approval/CAS/provider proof;
four repo witnesses cover central S/P plus three T1 roles, not local commits.
Air engine-only stage/readback/canary+rollback, then Mini stage, precede separate
T2 root-v2/hook authority, fresh witnesses/grants and final target acceptance
Air then Mini. No old-pin migration/main chase. Rollback here: guarded source
revert only, not host/data rollback authority. Current end state: source-only.

## Source-candidate verification (2026-10-21)

Three-file implementation complete: fixed dispatcher/committed-base selection,
bound-pin delegation without candidate/default selection, normal bind and exact
read-only render, safe files/JSON/argv/Git environment and sanitized failures.
The existing Stage B test entrypoint imports the hermetic adapter suite.
Focused adapter59/59 on first run; combined entrypoint68/68 after the single
diagnosed Stage B expectation repair. Syntax and diff checks pass. Real new-
adapter SECRETARY render exited0, verified engine/writes:false/packet absent,
with lifecycle state bytes unchanged. Real Stage B remains protected; maximum
bastion is pass-unverified, never ready/provider authority.

Independent fresh-context architecture and five-axis code audit found no
confirmed functional/security defect. Managed security-diff-scan
fd3177ac-79d1-4086-ac9c-f4fab163712e completed with zero reportable findings;
its reviewed artifact hashes and limitations are in continuity. Timeout recovery
was not exercised; trusted predecessor enforcement and actual start/fetch are
not replaced by successful synthetic-dispatcher tests. Source candidate is not
published, merged, installed, activated or production-accepted. Next dependency:
protected central exact-path admission for the three target source sets.
