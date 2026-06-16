# Impact Hub Governance System Plan

Datum: 2026-06-16
Statusz: canonical local governance hub
Scope: rovid, repo-helyi belepesi pont az `impact_hub` governance, review, continuity es deploy/guard szabalyaihoz.

## Cel

Ez a dokumentum nem uj policy-t vezet be. A celja az, hogy egyetlen helyi rendszertervi/guidance pontban osszefogja azokat a mar ervenyes anchorokat, amelyek alapjan az `impact_hub` repo-ban a munka, review, continuity, guard es recovery rendje kovetheto.

## Canonical Anchors

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

## Recommended Reading Order

1. `AGENTS.md`
2. `docs/pr-policy.md`
3. `PR-EXIT-CHECKLIST.md`
4. `docs/system-recovery-map.md`
5. `system-status-snapshot.md`
6. `notes.md`

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

## Push Gate

1. a governance, guard es policy lane valtozasai push elott fail-closed local system-plan sync gate alatt allnak;
2. ez azt jelenti, hogy a `docs/impact-hub-governance-system-plan-2026-06-16.md` frissitese a helyi DEV folyamat resze.

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
