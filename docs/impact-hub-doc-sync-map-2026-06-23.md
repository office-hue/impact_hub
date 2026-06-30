# Impact-Hub Doc Sync Map

Datum: 2026-06-23
Statusz: canonical local doc-sync map
RepoId: `impact_hub`
CanonicalMapPath: `docs/impact-hub-doc-sync-map-2026-06-23.md`
RootHubPath: `../ai-agent/DOC-SYNC-HUB.md`
OwnerRepo: `ai-agent`
LastVerifiedAt: `2026-06-30T08:45:00Z`
RegistryStatus: `partial`

## Cel

Ez a fajl az `impact_hub` repo egyetlen helyi canonical doc-sync mapje.

A szerepe az, hogy egy helyrol legyen feloldhato:

1. a local governance es one-path workflow truth;
2. a recovery/deploy/guard lane helyi rendszertavi truthja;
3. az env/auth/runtime adapter;
4. a coupon/ops workflowk fo doku-anchorai;
5. a kotelezo continuity celpontok.

## Repo Scope

Ez a map az `impact_hub` repora ervenyes.

Elsodleges helyi temak:

1. local governance control plane
2. recovery / deploy / guard lane
3. env/auth/runtime adapter
4. coupon harvester workflow lane
5. badge / product-adjacent doc lane

## Status Taxonomy

Ez a helyi map a kozos minimum statuszokat hasznalja:

1. `merged`
2. `partial`
3. `docs-only`
4. `drift-risk`
5. `unknown`

## Canonical Topic Map

| Topic | Master doc | Implementation truth | QA / audit truth | Runtime / guard evidence | Continuity target | Status | Notes |
|---|---|---|---|---|---|---|---|
| Local governance control plane | `docs/impact-hub-governance-system-plan-2026-06-16.md` | `AGENTS.md`, `docs/pr-policy.md`, `PR-EXIT-CHECKLIST.md`, `docs/ai-assistant-canonical-policy.md`, `scripts/worktree-task-start.sh`, `scripts/worktree-task-start-guard.sh`, `scripts/worktree-readiness-check.sh`, `scripts/worktree-coordination-sync.sh`, `scripts/worktree-continuity-guard.sh`, `scripts/guarded-push.sh` | helyi governance sync enforcement a `notes.md` es `system-status-snapshot.md` alapjan, `docs/worktree-coordination-sync.md`, `docs/worktree-continuity-guard.md` | `scripts/git-health-check.sh`, helyi pre-push path, `bash scripts/worktree-readiness-check.sh --json`, `bash scripts/worktree-task-start-guard.sh --json`, `bash scripts/worktree-continuity-guard.sh --json --mode push`, workspace `.worktrees/ACTIVE_WORKTREE.md`, workspace `.worktrees/ACTIVE_WORKTREES.md`, per-worktree `worktree-task-start-decision.json` | `notes.md`, `system-status-snapshot.md` | `partial` | A helyi governance minimum mar nem csak starter + koordinacios truthot hordoz, hanem a hook-szintu continuity enforcementet is. A kozponti H5 writeback ettol meg kulon szelet marad. |
| Recovery / deploy / guard lane | `docs/system-recovery-map.md` | recovery/deploy operativ workflowk, `scripts/git-health-check.sh` | a recovery mapben hivatkozott verify lepesek | `~/bin/impactall`, `scripts/git-health-check.sh` | `notes.md`, `system-status-snapshot.md` | `partial` | A runtime truth itt erosen operatori es recovery-kozpontu, ezert drift-riskesebb mint a tiszta docs lane-ek. |
| Env / auth / runtime adapter | `docs/impact-hub-env-auth-runtime-guard-adapter-2026-06-17.md` | local operatori shell/env, guard auth lane, `docs/system-recovery-map.md` | adapter sajat focused validation blokkja | `scripts/git-health-check.sh`, `~/bin/impactall` | `notes.md`, `system-status-snapshot.md` | `merged` | A helyi adapter mar megvan, most canonical mapben is feloldhato. |
| Coupon harvester workflow lane | `docs/coupon-harvester-workflow.md` | kapcsolodo workflow scriptjei es CI lane-jei | `docs/coupon-harvester-timeout-2026-03-23.md` | CI timeout / runtime bounded lane evidence | `system-status-snapshot.md` | `partial` | Ez a lane a repo egyik konkret workflow-truthja, es runtime bound jellegu. |
| Badge / product-adjacent doc lane | `docs/impactshop-badge-system.md` | a kapcsolodo repo-helyi workflow vagy tartalmi artifact | helyi docs review / manual audit | docs-only evidence | `notes.md` | `docs-only` | Jelenleg inkabb dokumentacios truth, mint futasideju guard lane. |

## Continuity Targets

Helyi continuity truthok:

1. `notes.md`
2. `system-status-snapshot.md`

## Drift-Risk Notes

1. Az `impact_hub` recovery es guard truthja reszben operatori parancsokra es kulso health entrypointokra tamaszkodik, ezert a docs es a runtime evidence kulon driftelhet.
2. A repo helyi governance minimuma mar megvolt, de eddig nem volt contract-kompatibilis local canonical map.
3. A kozponti root hub az `ai-agent` oldalon el, ezert a helyi mapnek explicit modon oda kell visszamutatnia.
4. A coupon harvester lane es a recovery lane kulon runtime-sajatos logikakat hordoznak, ezert fokozottan erdemes kesobb topic-szintu child mapet adni nekik.

## Natural Next Step

Innen a kovetkezo legkisebb hasznos szelet:

1. a kozponti `ai-agent` H5 writeback, hogy a merge-elt helyi H4 continuity truth az all-repo rollout matrixba is visszakeruljon;
2. kesobbi kulon korben a default-activation vagy finomabb topic/path preset follow-up;
3. ha a recovery/deploy lane tovabb no, kulon child map a `docs/system-recovery-map.md` ala.
