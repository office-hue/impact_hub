# Impact Hub Governance System Plan

Datum: 2026-06-16
Statusz: canonical local governance hub
Scope: rovid, repo-helyi belepesi pont az `impact_hub` governance, review, continuity es deploy/guard szabalyaihoz.

## Cel

Ez a dokumentum nem uj policy-t vezet be. A celja az, hogy egyetlen helyi rendszertervi/guidance pontban osszefogja azokat a mar ervenyes anchorokat, amelyek alapjan az `impact_hub` repo-ban a munka, review, continuity, guard es recovery rendje kovetheto.

## 2026-06-24 Runtime starter note

- A repo megkapta a helyi runtime starter minimumot is: `scripts/worktree-task-start.sh` es `scripts/worktree-readiness-check.sh`.
- Ez tudatosan N1 szelet: marker + readiness + local starter reuse, de meg nem teljes drift/coordination enforcement.
- A helyi governance truth innentol nem csak docs entrypointot, hanem egy rovid, repo-helyi worktree-start belepot is tartalmaz.

## 2026-06-29 Runtime N2 note

- A helyi runtime starter lane most mar kulon task-start decision/helper reteget is kapott: `scripts/worktree-task-start-guard.sh`.
- A starter lane a marker + readiness + task-start guard utan frissiti a koordinacios snapshotot, igy a per-worktree `worktree-task-start-decision.json` artifact nem csak letrejon, hanem a workspace-szintu riportba is visszaemelkedik.
- Ez meg mindig nem teljes hook-level continuity enforcement, de mar reviewer-visible evidence-et ad a doc-sync label/repo/path scope-rol es a blocked/degraded/allowed dontesrol.

## 2026-06-30 Runtime H4 note

- A helyi runtime lane most mar hook-szintu continuity enforcementet is kapott: `scripts/worktree-continuity-guard.sh`.
- A `scripts/install-hooks-all.sh` innentol a pre-push hookba is bekoti ezt a continuity guardot, a `scripts/guarded-push.sh` pedig ugyanazt a lane-t adja `git wpush` wrapperen keresztul.
- Ez a H4 szelet tudatosan meg kulonvalasztja a helyi continuity/guard truthot a kesobbi kozponti H5 writebacktol.

## Canonical Anchors

1. `docs/impact-hub-doc-sync-map-2026-06-23.md`
1. `AGENTS.md`
   - repo-szintu policy-sorrend, worktree discipline, nyelv es session workflow minimum
2. `docs/pr-policy.md`
   - a kotelezo one-path workflow commit/push/PR/deploy kapukkal
3. `PR-EXIT-CHECKLIST.md`
   - a merge elotti kotelezo kilepesi feltetelek rovid ellenorzolistaja
4. `docs/ai-assistant-canonical-policy.md`
   - helyi AI-asszisztens policy-anchor ehhez a repohoz
5. `docs/system-recovery-map.md`
   - backup, guard, recovery es rendszerterkep source of truth
6. `system-status-snapshot.md`
   - a repo aktualis allapot- es valtozasnaploja
7. `notes.md`
   - session-szintu dontes-, kockazat- es handover naplo
8. `docs/impact-hub-env-auth-runtime-guard-adapter-2026-06-17.md`
   - a local env/auth/runtime guard adapter konkret helyi szerzodese

## Recommended Reading Order

1. `AGENTS.md`
2. `docs/impact-hub-doc-sync-map-2026-06-23.md`
3. `docs/pr-policy.md`
4. `PR-EXIT-CHECKLIST.md`
5. `docs/system-recovery-map.md`
6. `system-status-snapshot.md`
7. `notes.md`

## Operating Model

1. Smallest reviewable slice first
   - egyszerre egy szuk, jol auditalhato szelet menjen
2. One-path workflow
   - nem trivialis munka dedikalt feature/worktree alapon tortenik
   - merge es deploy a helyi policy szerint guardolt
3. Fail-closed infra and deploy thinking
   - guard, recovery vagy deploy-lane valtozasnal mindig rollback/recovery tisztasag kell
4. Continuity by default
   - valos allapotvaltozas eseten a docs + `system-status-snapshot.md` + `notes.md` egyutt frissul
5. Env/auth/runtime adapter discipline
   - recovery, deploy es operatori auth lane csak a helyi adapter-szerzodes szerint tekintheto `allowed` allapotunak

## Push Gate

1. a governance, guard es policy lane valtozasai push elott fail-closed local system-plan sync gate alatt allnak;
2. ez azt jelenti, hogy a `docs/impact-hub-governance-system-plan-2026-06-16.md` frissitese a helyi DEV folyamat resze.
3. env/auth/runtime lane valtozasnal a `docs/impact-hub-env-auth-runtime-guard-adapter-2026-06-17.md` is kotelezo continuity anchor.

## Decision Rules

### Docs-only slice

Docs-only szelet a helyes valasztas, ha:

- a kovetkezo lepes governance, review, continuity vagy source-of-truth hianyossagot zar
- runtime vagy deploy-lane touch nem kotelezo
- a kovetkezo implementacios kor ettol egyertelmubb es biztonsagosabb lesz

### Runtime / guard / deploy slice

Ilyen szeletnel kotelezo:

- a relevans guard vagy recovery referencia beazonositasa
- rollback vagy restore ut rogzites
- focused validation vagy smoke evidence
- continuity update a valos allapot szerint

## Scope Boundary

Ez a hub helyi entrypoint, nem valtja ki:

- a workspace-global policy-t
- a shared `ai-agent` policyt
- a reszletes guard/recovery runbookokat
- a feature-specifikus termekdokumentumokat

## Natural Next Use

Ez a dokumentum arra valo, hogy a kovetkezo helyi munkaknal legyen egy rovid, biztos belepesi pont:

- uj docs vagy governance szelet inditasakor
- PR/review elott
- guard vagy deploy-lane erintese elott
- handover es continuity ellenorzeshez
- env/auth/runtime vagy recovery drift vizsgalatakor
# 2026-09-02 DEV upgrade

The repo-local context policy guard is authoritative over global prompts. It is
wired into the existing PR checklist job; governance-only changes do not run
the coupon harvester, provider jobs or deployment.

## 2026-09-04 DEV delivery v2 adapter

- `config/dev-delivery-v2-target-contract.json` a central contract repo-local,
  SHA-256-ellenorzott snapshotja; futasideju central fuggoseg nincs.
- `scripts/dev-delivery-v2-adapter.py` exact-current-worktree-root ellenorzest,
  fail-closed impact classificationt, privat Git-metadata evidence-et,
  candidate index-tree freeze-t es checkpoint-tree paritast ad.
- A provider default `operator-review`, az automatikus termekdeploy tiltott. A
  coupon-harvester workflow valtozatlanul csak heti/manual triggerrel aktiv.
- A meglevo `PR Checklist Guard` job strukturalt `not-affected` utat hasznalhat
  csak ismert docs/governance osztalyra; protected, deploy es unknown valtozas
  a PR-esemeny base/head SHA-hoz kotott, tenyleges teljes validaciot igenyel.
- A `--repo-root` csak az eppen futtato worktree sajat rootja lehet. A fixture
  kulon, explicit ideiglenes rootot kovetel, annak valtozatlansagat hasheli, es
  offline/mutacio-mentes marad.
- Evidence-et a hivo exit-code-ja helyett az adapter altal inditott,
  policyban allowlistelt profile/parancs, valamint a valtozatlan candidate tree
  igazol. A protected/deploy/unknown besorolas evidence nelkul `blocked`.
