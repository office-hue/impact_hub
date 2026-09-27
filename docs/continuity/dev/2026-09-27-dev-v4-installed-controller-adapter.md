# Impact Hub DEV v4 installed-controller adapter — 2026-09-27

## Identity

- Branch: `fix/dev-v4-installed-controller-adapter-20260927`
- Base: target `origin/main` at `007556be909bfb3612435594ffd9dea9309fd585`
- Commits: `b0ebdf36cb601a7e1dffeb68beb3ad2238d1525c`, `964d940fc3e8a471e376cceafd8278e9aa535bb7`
- Current HEAD: `964d940fc3e8a471e376cceafd8278e9aa535bb7`
- Current tree: `264572ed762929c63150abb22c389d2394e603a7`
- Worktree: Air disposable adapter worktree; clean after the checkpoint

## Change and boundary

The target repo now carries the five base policy objects required by the installed
DEV v4 engine. `scripts/dev-v4-installed-controller-adapter.mjs` is a thin
target wrapper: it accepts only the target origin and the two repo selectors,
checks the retained installed engine descriptor, rejects candidate-only policy,
and forwards start to the installed controller. `status`, `resume`, and
`projection` remain read-only. A legacy Stage A marker is exposed as
`legacy-unverified` with current identity comparison; it is never rewritten or
promoted to v3 state.

No dependency, provider, product runtime, VPS, cron, or remote state changed.

## Evidence

- Adapter tests: `node --test tests/dev-v4-installed-controller-adapter.test.mjs` — 5/5 PASS.
- Installed CLI isolated smoke using a local bare origin with canonical GitHub URL:
  `start -> status -> resume -> context --refresh -> context --consume` — PASS.
  The retained engine was verified at digest
  `8487bcc2a112612c42a009afabd5cb8ae2eefc5dcd32801cdfb6b173adb87502`; memory
  returned `retrieved` with 8 results.
- JSON policy parse and `git diff --check` — PASS.
- Continuity guard local mode — `allowed`.
- Existing Stage A/B suite before fixture correction: 11/13 PASS. The two
  failing assertions were expected guard behavior, not an adapter regression:
  the private task-start marker still recorded the pre-commit HEAD, so the
  local result was `protected:capsule-head-mismatch`; the disposable clone's
  `origin/main` also predates the pinned Stage A commit, so the CI tuple was
  `protected:ci-pr-tuple-invalid`. The fixtures now assert those exact
  preconditions and still require `stage-b-admitted-unverified` when the
  marker/base evidence is current. No legacy adapter authority was widened.

## Next step

Review the two commits against the target's current `origin/main`. After merge,
repeat the installed CLI smoke against the actual remote main containing the
five policy objects. Do not treat this source checkpoint as release or runtime
activation authority.
